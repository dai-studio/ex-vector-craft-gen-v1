import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BLUR_END, BLUR_MAX_PX, BLUR_START } from '../config';

/**
 * One-sided distance blur: sharp before BLUR_START, ramping to BLUR_MAX_PX at BLUR_END.
 * 12-tap Poisson disc, weighted by each sample's own blur so crisp foreground
 * doesn't smear into the background.
 */
const DistanceBlurShader = {
  name: 'DistanceBlurShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    tanHalfFov: { value: new THREE.Vector2(1, 1) },
    texel: { value: new THREE.Vector2(1, 1) },
    blurStart: { value: BLUR_START },
    blurEnd: { value: BLUR_END },
    maxRadius: { value: BLUR_MAX_PX },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform vec2 tanHalfFov;
    uniform vec2 texel;
    uniform float blurStart;
    uniform float blurEnd;
    uniform float maxRadius;
    varying vec2 vUv;

    const vec2 POISSON[12] = vec2[](
      vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696,  0.457),
      vec2(-0.203,  0.621), vec2( 0.962, -0.195), vec2( 0.473, -0.480),
      vec2( 0.519,  0.767), vec2( 0.185, -0.893), vec2( 0.507,  0.064),
      vec2( 0.896,  0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598)
    );

    float blurAmount(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      if (d >= 1.0) return 1.0; // sky
      float viewZ = perspectiveDepthToViewZ(d, cameraNear, cameraFar);
      vec3 ray = vec3((uv * 2.0 - 1.0) * tanHalfFov, 1.0);
      float dist = -viewZ * length(ray);
      return smoothstep(blurStart, blurEnd, dist);
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      float k = blurAmount(vUv);
      if (k < 0.002) { gl_FragColor = base; return; }
      vec2 radius = k * maxRadius * texel;
      vec3 acc = base.rgb;
      float wsum = 1.0;
      for (int i = 0; i < 12; i++) {
        vec2 suv = clamp(vUv + POISSON[i] * radius, vec2(0.0), vec2(1.0));
        float w = blurAmount(suv);
        acc += texture2D(tDiffuse, suv).rgb * w;
        wsum += w;
      }
      gl_FragColor = vec4(acc / wsum, base.a);
    }
  `,
};

/** ShaderPass that feeds the read buffer's depth texture to the shader each frame. */
class DistanceBlurPass extends ShaderPass {
  constructor(private readonly camera: THREE.PerspectiveCamera) {
    super(DistanceBlurShader);
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
    const u = this.uniforms as typeof DistanceBlurShader.uniforms;
    u.tDepth.value = readBuffer.depthTexture;
    u.cameraNear.value = this.camera.near;
    u.cameraFar.value = this.camera.far;
    const ty = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    u.tanHalfFov.value.set(ty * this.camera.aspect, ty);
    u.texel.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}

export class PostProcessing {
  readonly composer: EffectComposer;
  private readonly blurPass: DistanceBlurPass;
  private scale = 1;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(size.x, size.y),
    });
    this.composer = new EffectComposer(renderer, target);
    // The composer clones the target, and DepthTexture.clone() shares its GL source, so the
    // blur pass would sample the depth texture attached to the buffer it writes (a feedback
    // loop → INVALID_OPERATION, black frame). Give the second buffer its own depth texture.
    this.composer.renderTarget2.depthTexture?.dispose();
    this.composer.renderTarget2.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.composer.addPass(new RenderPass(scene, camera));
    this.blurPass = new DistanceBlurPass(camera);
    this.composer.addPass(this.blurPass);
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  /** Blur radius is in drawing-buffer pixels, so scale it with pixel ratio and resolution. */
  resize(): void {
    const pr = this.renderer.getPixelRatio() * this.scale;
    this.composer.setPixelRatio(pr);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    (this.blurPass.uniforms as typeof DistanceBlurShader.uniforms).maxRadius.value = BLUR_MAX_PX * pr;
  }

  /** Halves the composer resolution (used by the adaptive-performance fallback). */
  reduceResolution(): boolean {
    if (this.scale <= 0.5) return false;
    this.scale = 0.5;
    this.resize();
    return true;
  }

  get resolutionScale(): number {
    return this.scale;
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}

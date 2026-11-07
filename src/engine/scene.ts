import * as THREE from 'three';
import { FOG_FAR, FOG_NEAR, UNDERWATER_FOG_FAR, UNDERWATER_FOG_NEAR } from '../config';

const SKY = new THREE.Color(0x9cc8ef);
const UNDERWATER = new THREE.Color(0x1f6a78);

export class SceneSky {
  readonly scene = new THREE.Scene();
  readonly fog: THREE.Fog;
  private underwater = false;

  constructor() {
    this.scene.background = SKY.clone();
    this.fog = new THREE.Fog(SKY.clone(), FOG_NEAR, FOG_FAR);
    this.scene.fog = this.fog;
  }

  get isUnderwater(): boolean {
    return this.underwater;
  }

  /** Switches to dense blue-green fog while the camera eye is inside water. */
  setUnderwater(on: boolean): void {
    if (on === this.underwater) return;
    this.underwater = on;
    const colour = on ? UNDERWATER : SKY;
    this.fog.color.copy(colour);
    (this.scene.background as THREE.Color).copy(colour);
    this.fog.near = on ? UNDERWATER_FOG_NEAR : FOG_NEAR;
    this.fog.far = on ? UNDERWATER_FOG_FAR : FOG_FAR;
  }
}

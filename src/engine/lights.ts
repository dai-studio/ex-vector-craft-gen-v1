import * as THREE from 'three';

/** Hemisphere for ambient sky/ground tint, directional for the sun. Per-face shade is baked into vertex colours. */
export function addLights(scene: THREE.Scene): void {
  const hemi = new THREE.HemisphereLight(0xdcefff, 0x8a7f6a, 2.2);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff4e0, 1.3);
  sun.position.set(0.45, 1, 0.3);
  scene.add(sun);
}

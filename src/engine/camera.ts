import * as THREE from 'three';

export const EYE_HEIGHT = 1.6;

export function createCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.rotation.order = 'YXZ';
  return camera;
}

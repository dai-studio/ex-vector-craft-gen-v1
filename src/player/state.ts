import * as THREE from 'three';

/** Runtime player state. `position` is the feet centre (bottom-centre of the AABB). */
export interface PlayerState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  onGround: boolean;
  inWater: boolean;
  selectedSlot: number;
  flying: boolean;
}

export function createPlayerState(): PlayerState {
  return {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    onGround: false,
    inWater: false,
    selectedSlot: 0,
    flying: false,
  };
}

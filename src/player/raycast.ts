import * as THREE from 'three';
import { BlockId } from '../world/blocks';

export interface RayHit {
  x: number;
  y: number;
  z: number;
  /** Face normal of the hit face. */
  nx: number;
  ny: number;
  nz: number;
  id: number;
}

export type BlockGetter = (x: number, y: number, z: number) => number;

/**
 * Amanatides & Woo voxel traversal. Passes through AIR and WATER and stops at
 * the first other block within `maxDist`.
 */
export function raycastVoxels(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, getBlock: BlockGetter): RayHit | null {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;
  const stepZ = dir.z > 0 ? 1 : -1;

  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

  const frac = (v: number, step: number) => (step > 0 ? Math.floor(v) + 1 - v : v - Math.floor(v));
  let tMaxX = dir.x !== 0 ? frac(origin.x, stepX) * tDeltaX : Infinity;
  let tMaxY = dir.y !== 0 ? frac(origin.y, stepY) * tDeltaY : Infinity;
  let tMaxZ = dir.z !== 0 ? frac(origin.z, stepZ) * tDeltaZ : Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  while (t <= maxDist) {
    const id = getBlock(x, y, z);
    if (id !== BlockId.AIR && id !== BlockId.WATER) return { x, y, z, nx, ny, nz, id };

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0; ny = 0; nz = -stepZ;
    }
  }
  return null;
}

/** Wireframe box drawn around the targeted block. */
export function createSelectionBox(): THREE.LineSegments {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
  const mat = new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55, fog: false });
  const box = new THREE.LineSegments(geo, mat);
  box.visible = false;
  box.renderOrder = 3;
  return box;
}

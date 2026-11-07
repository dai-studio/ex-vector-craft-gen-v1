import type { Mesh } from 'three';
import { CHUNK_HEIGHT, CHUNK_SIZE } from '../config';

export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;

/** index = x + z*16 + y*256 */
export function voxelIndex(x: number, y: number, z: number): number {
  return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export interface ChunkMeshes {
  opaque: Mesh | null;
  cutout: Mesh | null;
  water: Mesh | null;
}

/** 16 x 64 x 16 voxel column. */
export class Chunk {
  readonly blocks = new Uint8Array(CHUNK_VOLUME);
  readonly meshes: ChunkMeshes = { opaque: null, cutout: null, water: null };
  dirty = true;

  constructor(
    readonly cx: number,
    readonly cz: number,
  ) {}

  get key(): string {
    return chunkKey(this.cx, this.cz);
  }

  /** Local coordinates; out-of-range y reads as air. */
  get(x: number, y: number, z: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return 0;
    return this.blocks[voxelIndex(x, y, z)] ?? 0;
  }

  set(x: number, y: number, z: number, id: number): void {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    this.blocks[voxelIndex(x, y, z)] = id;
  }
}

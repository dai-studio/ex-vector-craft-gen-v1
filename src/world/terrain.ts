import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL } from '../config';
import { BlockId } from './blocks';
import type { Chunk } from './chunk';

/** Integer hash of a world column → [0, 1). */
function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const TREE_CHANCE = 0.011;
const TREE_RADIUS = 2; // leaf blob reach, so neighbours' trees can spill into this chunk

/** Deterministic terrain from a seed. */
export class TerrainGenerator {
  private readonly noise = new ImprovedNoise();
  private readonly ox: number;
  private readonly oz: number;
  private readonly oy: number;

  constructor(readonly seed: number) {
    // ImprovedNoise has a fixed permutation, so the seed picks where we sample.
    this.ox = hash2(seed, 1, 7) * 10000;
    this.oz = hash2(seed, 2, 7) * 10000;
    this.oy = hash2(seed, 3, 7) * 100;
  }

  /** Surface height (y of the top solid block) at a world column. */
  heightAt(x: number, z: number): number {
    let amp = 1;
    let freq = 1 / 90;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < 4; o++) {
      sum += amp * this.noise.noise((x + this.ox) * freq, this.oy, (z + this.oz) * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    const n = sum / norm; // ~[-0.7, 0.7]
    const h = 20 + Math.round(n * 26 + 4);
    return Math.max(1, Math.min(CHUNK_HEIGHT - 10, h));
  }

  private isTreeAt(x: number, z: number, h: number): boolean {
    // Never on sand (within 2 of sea level) or underwater.
    if (h <= SEA_LEVEL + 2) return false;
    return hash2(x, z, this.seed) < TREE_CHANCE;
  }

  generate(chunk: Chunk): void {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const h = this.heightAt(baseX + lx, baseZ + lz);
        const beach = h <= SEA_LEVEL + 2; // near or under water → sand
        for (let y = 0; y <= Math.max(h, SEA_LEVEL); y++) {
          let id: number;
          if (y > h) id = BlockId.WATER;
          else if (y === h) id = beach ? BlockId.SAND : BlockId.GRASS;
          else if (y >= h - 3) id = beach ? BlockId.SAND : BlockId.DIRT;
          else id = BlockId.STONE;
          chunk.set(lx, y, lz, id);
        }
      }
    }

    // Trees, including ones rooted in neighbouring columns whose leaves reach in.
    for (let wz = baseZ - TREE_RADIUS; wz < baseZ + CHUNK_SIZE + TREE_RADIUS; wz++) {
      for (let wx = baseX - TREE_RADIUS; wx < baseX + CHUNK_SIZE + TREE_RADIUS; wx++) {
        const h = this.heightAt(wx, wz);
        if (!this.isTreeAt(wx, wz, h)) continue;
        this.placeTree(chunk, wx - baseX, h + 1, wz - baseZ, 4 + Math.floor(hash2(wz, wx, this.seed + 1) * 2));
      }
    }
  }

  private placeTree(chunk: Chunk, tx: number, ty: number, tz: number, trunk: number): void {
    const inside = (x: number, z: number) => x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE;
    const top = ty + trunk - 1;

    // Leaf blob: two wide layers, then two narrow ones.
    for (let y = top - 1; y <= top + 2; y++) {
      const r = y <= top ? 2 : 1;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          // Trim the corners so the blob reads round.
          if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          if (y === top + 2 && Math.abs(dx) + Math.abs(dz) > 1) continue;
          const x = tx + dx;
          const z = tz + dz;
          if (!inside(x, z)) continue;
          if (chunk.get(x, y, z) === BlockId.AIR) chunk.set(x, y, z, BlockId.LEAVES);
        }
      }
    }

    if (inside(tx, tz)) {
      for (let y = ty; y <= top; y++) chunk.set(tx, y, tz, BlockId.WOOD);
    }
  }
}

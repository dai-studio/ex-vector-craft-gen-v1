import * as THREE from 'three';
import { CHUNK_HEIGHT, CHUNK_SIZE } from '../config';
import { BLOCKS, BlockId, IS_SOLID, IS_TRANSPARENT, type BlockTiles } from './blocks';
import type { Atlas } from './atlas';
import type { Chunk } from './chunk';

/**
 * Builds one BufferGeometry per render layer for a chunk, emitting only faces
 * whose neighbour lets them be seen (including across chunk borders).
 */

const S = CHUNK_SIZE;
const H = CHUNK_HEIGHT;
const P = S + 2; // padded width
const WATER_DROP = 0.1;

/** Value used for voxels in chunks that aren't loaded yet: behaves like stone so no border faces are drawn. */
const UNLOADED = BlockId.STONE;

interface FaceDef {
  dir: [number, number, number];
  /** bl, br, tr, tl corners (unit cube), counter-clockwise from outside. */
  corners: [number, number, number][];
  tile: keyof BlockTiles;
  shade: number;
}

const FACES: FaceDef[] = [
  { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], tile: 'side', shade: 0.8 },
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], tile: 'side', shade: 0.8 },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], tile: 'top', shade: 1.0 },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], tile: 'bottom', shade: 0.6 },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], tile: 'side', shade: 0.8 },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], tile: 'side', shade: 0.8 },
];

class LayerBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  indices: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  build(): THREE.BufferGeometry | null {
    if (this.indices.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    const idx = this.vertexCount > 65535 ? new Uint32Array(this.indices) : new Uint16Array(this.indices);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

export interface ChunkNeighbours {
  px?: Chunk | undefined;
  nx?: Chunk | undefined;
  pz?: Chunk | undefined;
  nz?: Chunk | undefined;
  /** Diagonals aren't needed for face culling. */
}

/** Copies the chunk plus a 1-voxel border from neighbours into an (S+2) x H x (S+2) array. */
function buildPadded(chunk: Chunk, n: ChunkNeighbours): Uint8Array {
  const out = new Uint8Array(P * P * H).fill(UNLOADED);
  const at = (x: number, y: number, z: number) => x + 1 + (z + 1) * P + y * P * P;
  const src = chunk.blocks;
  for (let y = 0; y < H; y++) {
    for (let z = 0; z < S; z++) {
      const row = z * S + y * S * S;
      const dst = at(0, y, z);
      out.set(src.subarray(row, row + S), dst);
    }
  }
  for (let y = 0; y < H; y++) {
    for (let i = 0; i < S; i++) {
      if (n.nx) out[at(-1, y, i)] = n.nx.get(S - 1, y, i);
      if (n.px) out[at(S, y, i)] = n.px.get(0, y, i);
      if (n.nz) out[at(i, y, -1)] = n.nz.get(i, y, S - 1);
      if (n.pz) out[at(i, y, S)] = n.pz.get(i, y, 0);
    }
  }
  return out;
}

export interface ChunkGeometries {
  opaque: THREE.BufferGeometry | null;
  cutout: THREE.BufferGeometry | null;
  water: THREE.BufferGeometry | null;
  triangles: number;
}

export function meshChunk(chunk: Chunk, neighbours: ChunkNeighbours, atlas: Atlas): ChunkGeometries {
  const vox = buildPadded(chunk, neighbours);
  const PP = P * P;
  const get = (x: number, y: number, z: number): number => {
    if (y < 0) return UNLOADED;
    if (y >= H) return BlockId.AIR;
    return vox[x + 1 + (z + 1) * P + y * PP] ?? UNLOADED;
  };

  const opaque = new LayerBuilder();
  const cutout = new LayerBuilder();
  const water = new LayerBuilder();

  for (let y = 0; y < H; y++) {
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const id = get(x, y, z);
        if (id === BlockId.AIR) continue;
        const block = BLOCKS[id];
        if (!block) continue;

        const isWater = id === BlockId.WATER;
        const surface = isWater && get(x, y + 1, z) !== BlockId.WATER;
        const layer = isWater ? water : block.transparent ? cutout : opaque;

        for (const face of FACES) {
          const [dx, dy, dz] = face.dir;
          const nid = get(x + dx, y + dy, z + dz);

          if (isWater) {
            // Culled against other water and solid blocks. The lowered top
            // stays visible under transparent solids like glass/leaves.
            if (nid === BlockId.WATER) continue;
            if (IS_SOLID[nid] && !(dy === 1 && IS_TRANSPARENT[nid])) continue;
          } else if (block.transparent) {
            if (nid === id || !IS_TRANSPARENT[nid]) continue;
          } else if (!IS_TRANSPARENT[nid]) {
            continue;
          }

          const uv = atlas.uv(block.tiles[face.tile]);
          const base = layer.vertexCount;
          for (let c = 0; c < 4; c++) {
            const corner = face.corners[c]!;
            let cy = corner[1];
            if (surface && cy === 1) cy = 1 - WATER_DROP;
            layer.positions.push(x + corner[0], y + cy, z + corner[2]);
            layer.normals.push(dx, dy, dz);
            layer.colors.push(face.shade, face.shade, face.shade);
          }
          // Side faces of a lowered water block shrink their texture to match.
          const vTop = surface && dy === 0 ? uv.v0 + (uv.v1 - uv.v0) * (1 - WATER_DROP) : uv.v1;
          layer.uvs.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, vTop, uv.u0, vTop);
          layer.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  const triangles = (opaque.indices.length + cutout.indices.length + water.indices.length) / 3;
  return { opaque: opaque.build(), cutout: cutout.build(), water: water.build(), triangles };
}

export interface ChunkMaterials {
  opaque: THREE.Material;
  cutout: THREE.Material;
  water: THREE.Material;
}

export function createChunkMaterials(atlas: Atlas): ChunkMaterials {
  const opaque = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, fog: true });
  const cutout = new THREE.MeshLambertMaterial({
    map: atlas.texture,
    vertexColors: true,
    fog: true,
    transparent: true,
    alphaTest: 0.05,
  });
  const water = new THREE.MeshLambertMaterial({
    map: atlas.texture,
    vertexColors: true,
    fog: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return { opaque, cutout, water };
}

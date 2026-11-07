import * as THREE from 'three';
import { CHUNK_HEIGHT, CHUNK_SIZE, MAX_GEN_PER_FRAME, MAX_REMESH_PER_FRAME, RENDER_DISTANCE } from '../config';
import { events } from '../events';
import type { Atlas } from './atlas';
import { BlockId } from './blocks';
import { Chunk, chunkKey } from './chunk';
import { createChunkMaterials, meshChunk, type ChunkMaterials } from './mesher';
import type { TerrainGenerator } from './terrain';

/** Supplies saved player edits so they can be re-applied whenever a chunk is generated. */
export interface EditSource {
  editsForChunk(cx: number, cz: number): Iterable<readonly [x: number, y: number, z: number, id: number]>;
}

const UNLOAD_DISTANCE = RENDER_DISTANCE + 1; // hysteresis so chunks don't thrash at the border

function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

export class ChunkManager {
  readonly group = new THREE.Group();
  private readonly chunks = new Map<string, Chunk>();
  private readonly materials: ChunkMaterials;
  private centerCx = 0;
  private centerCz = 0;

  constructor(
    private readonly terrain: TerrainGenerator,
    private readonly atlas: Atlas,
    private readonly edits: EditSource,
  ) {
    this.materials = createChunkMaterials(atlas);
    this.group.name = 'chunks';
    events.on('BlockChanged', ({ x, y, z }) => this.markDirtyAround(x, y, z));
  }

  get loadedCount(): number {
    return this.chunks.size;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  isLoaded(x: number, z: number): boolean {
    return this.chunks.has(chunkKey(floorDiv(x, CHUNK_SIZE), floorDiv(z, CHUNK_SIZE)));
  }

  /** World-space block lookup. Unloaded chunks read as `unloaded` (stone by default, so nothing falls through). */
  getBlock(x: number, y: number, z: number, unloaded: number = BlockId.STONE): number {
    if (y < 0) return BlockId.STONE;
    if (y >= CHUNK_HEIGHT) return BlockId.AIR;
    const chunk = this.chunks.get(chunkKey(floorDiv(x, CHUNK_SIZE), floorDiv(z, CHUNK_SIZE)));
    if (!chunk) return unloaded;
    return chunk.get(mod(x, CHUNK_SIZE), y, mod(z, CHUNK_SIZE));
  }

  /** Sets a block and returns the old id, or null if the chunk isn't loaded / y out of range. */
  setBlock(x: number, y: number, z: number, id: number): number | null {
    if (y < 0 || y >= CHUNK_HEIGHT) return null;
    const chunk = this.chunks.get(chunkKey(floorDiv(x, CHUNK_SIZE), floorDiv(z, CHUNK_SIZE)));
    if (!chunk) return null;
    const lx = mod(x, CHUNK_SIZE);
    const lz = mod(z, CHUNK_SIZE);
    const old = chunk.get(lx, y, lz);
    chunk.set(lx, y, lz, id);
    return old;
  }

  /** Owning chunk dirty, plus the neighbour if the block sits on a border. */
  private markDirtyAround(x: number, _y: number, z: number): void {
    const cx = floorDiv(x, CHUNK_SIZE);
    const cz = floorDiv(z, CHUNK_SIZE);
    const lx = mod(x, CHUNK_SIZE);
    const lz = mod(z, CHUNK_SIZE);
    this.markDirty(cx, cz);
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
  }

  private markDirty(cx: number, cz: number): void {
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c) c.dirty = true;
  }

  private generateChunk(cx: number, cz: number): Chunk {
    const chunk = new Chunk(cx, cz);
    this.terrain.generate(chunk);
    for (const [x, y, z, id] of this.edits.editsForChunk(cx, cz)) {
      chunk.set(mod(x, CHUNK_SIZE), y, mod(z, CHUNK_SIZE), id);
    }
    this.chunks.set(chunk.key, chunk);
    // Neighbours treated this side as unloaded until now; their border faces need rebuilding.
    this.markDirty(cx + 1, cz);
    this.markDirty(cx - 1, cz);
    this.markDirty(cx, cz + 1);
    this.markDirty(cx, cz - 1);
    return chunk;
  }

  private hasAllNeighbours(c: Chunk): boolean {
    return (
      this.chunks.has(chunkKey(c.cx + 1, c.cz)) &&
      this.chunks.has(chunkKey(c.cx - 1, c.cz)) &&
      this.chunks.has(chunkKey(c.cx, c.cz + 1)) &&
      this.chunks.has(chunkKey(c.cx, c.cz - 1))
    );
  }

  private remesh(c: Chunk): void {
    const geo = meshChunk(
      c,
      {
        px: this.getChunk(c.cx + 1, c.cz),
        nx: this.getChunk(c.cx - 1, c.cz),
        pz: this.getChunk(c.cx, c.cz + 1),
        nz: this.getChunk(c.cx, c.cz - 1),
      },
      this.atlas,
    );
    this.setLayer(c, 'opaque', geo.opaque, 0);
    this.setLayer(c, 'cutout', geo.cutout, 1);
    this.setLayer(c, 'water', geo.water, 2);
    c.dirty = false;
  }

  private setLayer(c: Chunk, layer: 'opaque' | 'cutout' | 'water', geo: THREE.BufferGeometry | null, order: number): void {
    const existing = c.meshes[layer];
    if (existing) {
      existing.geometry.dispose();
      if (geo) {
        existing.geometry = geo;
        return;
      }
      this.group.remove(existing);
      c.meshes[layer] = null;
      return;
    }
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, this.materials[layer]);
    mesh.position.set(c.cx * CHUNK_SIZE, 0, c.cz * CHUNK_SIZE);
    mesh.renderOrder = order;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);
    c.meshes[layer] = mesh;
  }

  private disposeChunk(c: Chunk): void {
    for (const layer of ['opaque', 'cutout', 'water'] as const) {
      const m = c.meshes[layer];
      if (m) {
        m.geometry.dispose();
        this.group.remove(m);
        c.meshes[layer] = null;
      }
    }
    this.chunks.delete(c.key);
  }

  /** Chunk coords within RENDER_DISTANCE that aren't loaded, nearest first. */
  private missingChunks(): [number, number][] {
    const out: [number, number, number][] = [];
    const R = RENDER_DISTANCE;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const cx = this.centerCx + dx;
        const cz = this.centerCz + dz;
        if (!this.chunks.has(chunkKey(cx, cz))) out.push([cx, cz, dx * dx + dz * dz]);
      }
    }
    out.sort((a, b) => a[2] - b[2]);
    return out.map(([cx, cz]) => [cx, cz]);
  }

  private setCenter(x: number, z: number): void {
    this.centerCx = floorDiv(Math.floor(x), CHUNK_SIZE);
    this.centerCz = floorDiv(Math.floor(z), CHUNK_SIZE);
  }

  /** Synchronously loads and meshes everything around a point (used at startup). */
  preload(x: number, z: number): void {
    this.setCenter(x, z);
    for (const [cx, cz] of this.missingChunks()) this.generateChunk(cx, cz);
    for (const c of this.chunks.values()) if (c.dirty && this.hasAllNeighbours(c)) this.remesh(c);
  }

  /** Per-frame streaming: generate, unload and remesh within the frame budget. */
  update(x: number, z: number): void {
    this.setCenter(x, z);

    const missing = this.missingChunks();
    for (let i = 0; i < Math.min(MAX_GEN_PER_FRAME, missing.length); i++) {
      const m = missing[i]!;
      this.generateChunk(m[0], m[1]);
    }

    for (const c of [...this.chunks.values()]) {
      if (Math.abs(c.cx - this.centerCx) > UNLOAD_DISTANCE || Math.abs(c.cz - this.centerCz) > UNLOAD_DISTANCE) {
        this.disposeChunk(c);
      }
    }

    const dirty: [Chunk, number][] = [];
    for (const c of this.chunks.values()) {
      if (!c.dirty || !this.hasAllNeighbours(c)) continue;
      const dx = c.cx - this.centerCx;
      const dz = c.cz - this.centerCz;
      dirty.push([c, dx * dx + dz * dz]);
    }
    dirty.sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < Math.min(MAX_REMESH_PER_FRAME, dirty.length); i++) this.remesh(dirty[i]![0]);
  }

  /** Top-most block that isn't air or water at a column, or -1. */
  surfaceY(x: number, z: number): number {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const id = this.getBlock(x, y, z, BlockId.AIR);
      if (id !== BlockId.AIR && id !== BlockId.WATER) return y;
    }
    return -1;
  }
}

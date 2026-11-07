import * as THREE from 'three';
import { REACH } from '../config';
import { events } from '../events';
import { BlockId, HOTBAR, IS_SOLID } from '../world/blocks';
import type { ChunkManager } from '../world/chunkManager';
import { Physics } from './physics';
import { createSelectionBox, raycastVoxels, type RayHit } from './raycast';
import type { PlayerState } from './state';

const dir = new THREE.Vector3();

/** Raycasts from the camera, drives the selection box and applies break/place clicks. */
export class BlockInteraction {
  readonly selection = createSelectionBox();
  private hit: RayHit | null = null;

  constructor(
    private readonly world: ChunkManager,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly player: PlayerState,
  ) {}

  get target(): RayHit | null {
    return this.hit;
  }

  update(clicks: readonly (0 | 2)[]): void {
    this.camera.getWorldDirection(dir);
    const getBlock = (x: number, y: number, z: number) => this.world.getBlock(x, y, z, BlockId.AIR);
    this.hit = raycastVoxels(this.camera.position, dir, REACH, getBlock);

    for (const button of clicks) {
      if (!this.hit) break;
      if (button === 0) this.breakBlock(this.hit);
      else this.placeBlock(this.hit);
      this.hit = raycastVoxels(this.camera.position, dir, REACH, getBlock);
    }

    if (this.hit) {
      this.selection.position.set(this.hit.x + 0.5, this.hit.y + 0.5, this.hit.z + 0.5);
      this.selection.visible = true;
    } else {
      this.selection.visible = false;
    }
  }

  /** Static water: a broken block next to water stays air. */
  private breakBlock(h: RayHit): void {
    this.apply(h.x, h.y, h.z, BlockId.AIR);
  }

  private placeBlock(h: RayHit): void {
    const x = h.x + h.nx;
    const y = h.y + h.ny;
    const z = h.z + h.nz;
    const current = this.world.getBlock(x, y, z, BlockId.STONE);
    if (current !== BlockId.AIR && current !== BlockId.WATER) return; // placing replaces water
    const id = HOTBAR[this.player.selectedSlot] ?? BlockId.STONE;
    if (id === current) return;
    if (IS_SOLID[id] && Physics.intersectsCell(this.player.position, x, y, z)) return;
    this.apply(x, y, z, id);
  }

  private apply(x: number, y: number, z: number, id: number): void {
    const oldId = this.world.setBlock(x, y, z, id);
    if (oldId === null || oldId === id) return;
    events.emit('BlockChanged', { x, y, z, oldId, newId: id });
  }
}

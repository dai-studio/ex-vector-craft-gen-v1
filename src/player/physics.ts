import * as THREE from 'three';
import { BlockId, IS_SOLID } from '../world/blocks';
import type { PlayerState } from './state';

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
const HALF = PLAYER_WIDTH / 2;
const EPS = 1e-4;

const STEP = 1 / 120; // fixed timestep
const MAX_AXIS_MOVE = 0.45; // < 0.5 block per sub-step, to avoid tunnelling

const GRAVITY = -30;
const JUMP_VELOCITY = 9;
const WALK_SPEED = 4.3;
const SPRINT_SPEED = 5.6;

const WATER_GRAVITY = -6;
const WATER_MAX_SINK = -3;
const WATER_SPEED_FACTOR = 0.6;
const WATER_SWIM_UP = 3;
const WATER_DRAG = 3; // per second, exponential
const WATER_LEDGE_HOP = 8.5;

const FLY_SPEED = 10;
const FLY_VERTICAL = 8;

export interface BlockQuery {
  getBlock(x: number, y: number, z: number): number;
}

export interface MoveIntent {
  forward: number;
  strafe: number;
  jump: boolean;
  shift: boolean;
  yaw: number;
}

const wish = new THREE.Vector3();

export class Physics {
  private accumulator = 0;
  private collidedHorizontally = false;

  constructor(private readonly world: BlockQuery) {}

  /** True when any voxel overlapping the player AABB satisfies `pred`. */
  private overlaps(p: THREE.Vector3, pred: (id: number) => boolean): boolean {
    const x0 = Math.floor(p.x - HALF + EPS);
    const x1 = Math.floor(p.x + HALF - EPS);
    const y0 = Math.floor(p.y + EPS);
    const y1 = Math.floor(p.y + PLAYER_HEIGHT - EPS);
    const z0 = Math.floor(p.z - HALF + EPS);
    const z1 = Math.floor(p.z + HALF - EPS);
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) if (pred(this.world.getBlock(x, y, z))) return true;
    return false;
  }

  /** Does the unit cell at (x,y,z) intersect the player's AABB? */
  static intersectsCell(p: THREE.Vector3, x: number, y: number, z: number): boolean {
    return (
      p.x + HALF > x && p.x - HALF < x + 1 &&
      p.y + PLAYER_HEIGHT > y && p.y < y + 1 &&
      p.z + HALF > z && p.z - HALF < z + 1
    );
  }

  /** Moves along one axis and pushes back out of solid voxels. Returns true on collision. */
  private moveAxis(s: PlayerState, axis: 'x' | 'y' | 'z', d: number): boolean {
    if (d === 0) return false;
    const p = s.position;
    p[axis] += d;

    const x0 = Math.floor(p.x - HALF + EPS);
    const x1 = Math.floor(p.x + HALF - EPS);
    const y0 = Math.floor(p.y + EPS);
    const y1 = Math.floor(p.y + PLAYER_HEIGHT - EPS);
    const z0 = Math.floor(p.z - HALF + EPS);
    const z1 = Math.floor(p.z + HALF - EPS);

    let hit = false;
    let limit = d > 0 ? Infinity : -Infinity;
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (!IS_SOLID[this.world.getBlock(x, y, z)]) continue;
          hit = true;
          const cell = axis === 'x' ? x : axis === 'y' ? y : z;
          limit = d > 0 ? Math.min(limit, cell) : Math.max(limit, cell + 1);
        }
      }
    }
    if (!hit) return false;

    if (axis === 'y') {
      p.y = d > 0 ? limit - PLAYER_HEIGHT - EPS : limit + EPS;
      if (d < 0) s.onGround = true;
    } else {
      p[axis] = d > 0 ? limit - HALF - EPS : limit + HALF + EPS;
    }
    s.velocity[axis] = 0;
    return true;
  }

  private integrate(s: PlayerState, intent: MoveIntent, dt: number): void {
    const v = s.velocity;
    s.inWater = this.overlaps(s.position, (id) => id === BlockId.WATER);

    // Wish direction relative to camera yaw.
    const sin = Math.sin(intent.yaw);
    const cos = Math.cos(intent.yaw);
    wish.set(-sin * intent.forward + cos * intent.strafe, 0, -cos * intent.forward - sin * intent.strafe);
    if (wish.lengthSq() > 1) wish.normalize();

    if (s.flying) {
      const t = wish.multiplyScalar(FLY_SPEED);
      const ty = (intent.jump ? FLY_VERTICAL : 0) - (intent.shift ? FLY_VERTICAL : 0);
      const k = 1 - Math.exp(-10 * dt); // damps to zero when no keys are held
      v.x += (t.x - v.x) * k;
      v.z += (t.z - v.z) * k;
      v.y += (ty - v.y) * k;
    } else if (s.inWater) {
      const speed = WALK_SPEED * WATER_SPEED_FACTOR;
      const k = 1 - Math.exp(-8 * dt);
      v.x += (wish.x * speed - v.x) * k;
      v.z += (wish.z * speed - v.z) * k;
      v.y += WATER_GRAVITY * dt;
      v.y *= Math.exp(-WATER_DRAG * dt);
      if (intent.jump) {
        // Swim up; pushing against a shore gives a hop so a 1-block ledge can be climbed.
        if (this.collidedHorizontally && v.y < WATER_LEDGE_HOP) v.y = WATER_LEDGE_HOP;
        else v.y = Math.max(v.y, WATER_SWIM_UP);
      }
      if (v.y < WATER_MAX_SINK) v.y = WATER_MAX_SINK;
    } else {
      const speed = intent.shift ? SPRINT_SPEED : WALK_SPEED;
      const k = 1 - Math.exp(-(s.onGround ? 18 : 5) * dt);
      v.x += (wish.x * speed - v.x) * k;
      v.z += (wish.z * speed - v.z) * k;
      v.y += GRAVITY * dt;
      if (intent.jump && s.onGround) v.y = JUMP_VELOCITY;
    }

    // Sub-step so no axis moves more than MAX_AXIS_MOVE at once.
    const maxD = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt;
    const n = Math.max(1, Math.ceil(maxD / MAX_AXIS_MOVE));
    const h = dt / n;
    s.onGround = false;
    this.collidedHorizontally = false;
    for (let i = 0; i < n; i++) {
      if (this.moveAxis(s, 'x', v.x * h)) this.collidedHorizontally = true;
      if (this.moveAxis(s, 'z', v.z * h)) this.collidedHorizontally = true;
      this.moveAxis(s, 'y', v.y * h);
    }
  }

  /** Advances the simulation by dt using a fixed internal timestep. */
  update(s: PlayerState, intent: MoveIntent, dt: number): void {
    this.accumulator += dt;
    while (this.accumulator >= STEP) {
      this.integrate(s, intent, STEP);
      this.accumulator -= STEP;
    }
  }
}

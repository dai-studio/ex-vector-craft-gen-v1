import * as THREE from 'three';
import { TILE_COUNT, Tile } from './blocks';

/**
 * Texture atlas painted at runtime. Every tile is a subtle gradient of the
 * block's base colour (no per-pixel noise), so blocks feel soft.
 */

export const TILE_PX = 32;
const PAD = 2;
const CELL = TILE_PX + PAD * 2;
const COLS = TILE_COUNT;
const WIDTH = CELL * COLS;
const HEIGHT = CELL;

type Ctx = CanvasRenderingContext2D;

/** Small deterministic hash so each tile gets a stable hue tweak / direction. */
function seeded(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%, ${a})`;
}

interface Base {
  h: number;
  s: number;
  l: number;
}

/** Linear gradient lighter at the top edge, darker toward the bottom (direction jittered by seed). */
function linearTile(ctx: Ctx, x: number, y: number, b: Base, seed: number, spread = 9): void {
  const r = seeded(seed);
  const hue = b.h + (r - 0.5) * 6;
  const tilt = (seeded(seed + 1) - 0.5) * TILE_PX * 0.6;
  const g = ctx.createLinearGradient(x + TILE_PX / 2 - tilt, y, x + TILE_PX / 2 + tilt, y + TILE_PX);
  g.addColorStop(0, hsl(hue, b.s, b.l + spread * 0.6));
  g.addColorStop(0.55, hsl(hue, b.s, b.l));
  g.addColorStop(1, hsl(hue, b.s, b.l - spread * 0.5));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, TILE_PX, TILE_PX);
}

/** Soft radial falloff used for top faces. */
function radialTile(ctx: Ctx, x: number, y: number, b: Base, seed: number, spread = 8): void {
  const r = seeded(seed);
  const hue = b.h + (r - 0.5) * 6;
  const ox = (seeded(seed + 2) - 0.5) * 8;
  const oy = (seeded(seed + 3) - 0.5) * 8;
  const cx = x + TILE_PX / 2 + ox;
  const cy = y + TILE_PX / 2 + oy;
  const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, TILE_PX * 0.78);
  g.addColorStop(0, hsl(hue, b.s, b.l + spread * 0.55));
  g.addColorStop(1, hsl(hue, b.s, b.l - spread * 0.5));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, TILE_PX, TILE_PX);
}

function paintTile(ctx: Ctx, tile: Tile, x: number, y: number): void {
  switch (tile) {
    case Tile.GRASS_TOP:
      radialTile(ctx, x, y, { h: 102, s: 42, l: 50 }, tile);
      break;
    case Tile.GRASS_SIDE: {
      // Dirt body with a soft green band fading down from the top edge.
      linearTile(ctx, x, y, { h: 28, s: 34, l: 42 }, tile);
      const g = ctx.createLinearGradient(x, y, x, y + TILE_PX);
      g.addColorStop(0, hsl(100, 42, 52, 1));
      g.addColorStop(0.22, hsl(100, 40, 47, 0.95));
      g.addColorStop(0.42, hsl(90, 36, 44, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, TILE_PX, TILE_PX);
      break;
    }
    case Tile.DIRT:
      linearTile(ctx, x, y, { h: 28, s: 34, l: 42 }, tile);
      break;
    case Tile.STONE:
      linearTile(ctx, x, y, { h: 215, s: 6, l: 56 }, tile, 10);
      break;
    case Tile.SAND:
      linearTile(ctx, x, y, { h: 46, s: 52, l: 76 }, tile, 7);
      break;
    case Tile.WOOD_SIDE: {
      // Horizontal gradient across the bark: darker edges, lighter centre.
      const g = ctx.createLinearGradient(x, y, x + TILE_PX, y);
      g.addColorStop(0, hsl(27, 36, 27));
      g.addColorStop(0.5, hsl(28, 36, 37));
      g.addColorStop(1, hsl(27, 36, 26));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, TILE_PX, TILE_PX);
      break;
    }
    case Tile.WOOD_TOP: {
      const cx = x + TILE_PX / 2;
      const cy = y + TILE_PX / 2;
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, TILE_PX * 0.72);
      g.addColorStop(0, hsl(36, 44, 62));
      g.addColorStop(0.6, hsl(33, 40, 50));
      g.addColorStop(1, hsl(28, 36, 32));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, TILE_PX, TILE_PX);
      break;
    }
    case Tile.LEAVES:
      radialTile(ctx, x, y, { h: 118, s: 40, l: 36 }, tile, 12);
      break;
    case Tile.PLANKS:
      linearTile(ctx, x, y, { h: 34, s: 44, l: 56 }, tile, 10);
      break;
    case Tile.GLASS: {
      // Pale, mostly transparent gradient with a lighter rim.
      ctx.clearRect(x, y, TILE_PX, TILE_PX);
      const g = ctx.createLinearGradient(x, y, x + TILE_PX, y + TILE_PX);
      g.addColorStop(0, hsl(195, 60, 92, 0.32));
      g.addColorStop(1, hsl(200, 50, 82, 0.16));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, TILE_PX, TILE_PX);
      ctx.strokeStyle = hsl(195, 70, 97, 0.85);
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, TILE_PX - 2, TILE_PX - 2);
      break;
    }
    case Tile.WATER: {
      // Soft blue-to-teal, drawn opaque (opacity comes from the material).
      const g = ctx.createLinearGradient(x, y, x + TILE_PX, y + TILE_PX);
      g.addColorStop(0, hsl(205, 70, 55));
      g.addColorStop(1, hsl(178, 58, 46));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, TILE_PX, TILE_PX);
      break;
    }
  }
}

/** Copies the tile's outer pixels into the padding so filtering never samples a neighbour. */
function extrudeEdges(ctx: Ctx, x: number, y: number): void {
  const c = ctx.canvas;
  const T = TILE_PX;
  ctx.drawImage(c, x, y, T, 1, x, y - PAD, T, PAD); // top
  ctx.drawImage(c, x, y + T - 1, T, 1, x, y + T, T, PAD); // bottom
  ctx.drawImage(c, x, y - PAD, 1, T + PAD * 2, x - PAD, y - PAD, PAD, T + PAD * 2); // left
  ctx.drawImage(c, x + T - 1, y - PAD, 1, T + PAD * 2, x + T, y - PAD, PAD, T + PAD * 2); // right
}

export interface UVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export class Atlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private readonly uvs: UVRect[] = [];
  private readonly dataUrls = new Map<Tile, string>();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');

    for (let t = 0; t < TILE_COUNT; t++) {
      const x = t * CELL + PAD;
      const y = PAD;
      paintTile(ctx, t as Tile, x, y);
      extrudeEdges(ctx, x, y);
      // UVs inset half a texel. CanvasTexture flips Y, so v = 1 - y/H.
      this.uvs.push({
        u0: (x + 0.5) / WIDTH,
        u1: (x + TILE_PX - 0.5) / WIDTH,
        v0: 1 - (y + TILE_PX - 0.5) / HEIGHT,
        v1: 1 - (y + 0.5) / HEIGHT,
      });
    }

    const tex = new THREE.CanvasTexture(this.canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.texture = tex;
  }

  uv(tile: number): UVRect {
    const r = this.uvs[tile];
    if (!r) throw new Error(`Unknown tile ${tile}`);
    return r;
  }

  /** PNG of a single tile, for the hotbar. */
  tileDataURL(tile: Tile): string {
    const cached = this.dataUrls.get(tile);
    if (cached) return cached;
    const c = document.createElement('canvas');
    c.width = TILE_PX;
    c.height = TILE_PX;
    c.getContext('2d')?.drawImage(this.canvas, tile * CELL + PAD, PAD, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
    const url = c.toDataURL();
    this.dataUrls.set(tile, url);
    return url;
  }
}

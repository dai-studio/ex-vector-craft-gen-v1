/** Block registry. IDs are stored in chunk voxel arrays, so never renumber them. */

export const BlockId = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WOOD: 5,
  LEAVES: 6,
  PLANKS: 7,
  GLASS: 8,
  WATER: 9,
} as const;
export type BlockId = (typeof BlockId)[keyof typeof BlockId];

/** Atlas tile indices. */
export const Tile = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WOOD_SIDE: 5,
  WOOD_TOP: 6,
  LEAVES: 7,
  PLANKS: 8,
  GLASS: 9,
  WATER: 10,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];
export const TILE_COUNT = 11;

export interface BlockTiles {
  top: Tile;
  side: Tile;
  bottom: Tile;
}

export interface BlockType {
  id: BlockId;
  name: string;
  tiles: BlockTiles;
  /** Neighbouring faces are drawn through it. */
  transparent: boolean;
  /** Collides with the player. */
  solid: boolean;
  liquid: boolean;
}

const all = (t: Tile): BlockTiles => ({ top: t, side: t, bottom: t });

export const BLOCKS: readonly BlockType[] = [
  { id: BlockId.AIR, name: 'Air', tiles: all(Tile.DIRT), transparent: true, solid: false, liquid: false },
  { id: BlockId.GRASS, name: 'Grass', tiles: { top: Tile.GRASS_TOP, side: Tile.GRASS_SIDE, bottom: Tile.DIRT }, transparent: false, solid: true, liquid: false },
  { id: BlockId.DIRT, name: 'Dirt', tiles: all(Tile.DIRT), transparent: false, solid: true, liquid: false },
  { id: BlockId.STONE, name: 'Stone', tiles: all(Tile.STONE), transparent: false, solid: true, liquid: false },
  { id: BlockId.SAND, name: 'Sand', tiles: all(Tile.SAND), transparent: false, solid: true, liquid: false },
  { id: BlockId.WOOD, name: 'Wood', tiles: { top: Tile.WOOD_TOP, side: Tile.WOOD_SIDE, bottom: Tile.WOOD_TOP }, transparent: false, solid: true, liquid: false },
  { id: BlockId.LEAVES, name: 'Leaves', tiles: all(Tile.LEAVES), transparent: true, solid: true, liquid: false },
  { id: BlockId.PLANKS, name: 'Planks', tiles: all(Tile.PLANKS), transparent: false, solid: true, liquid: false },
  { id: BlockId.GLASS, name: 'Glass', tiles: all(Tile.GLASS), transparent: true, solid: true, liquid: false },
  { id: BlockId.WATER, name: 'Water', tiles: all(Tile.WATER), transparent: true, solid: false, liquid: true },
];

const AIR_BLOCK = BLOCKS[0]!;

export function blockType(id: number): BlockType {
  return BLOCKS[id] ?? AIR_BLOCK;
}

// Flat lookup tables for hot loops (mesher, physics, raycast).
export const IS_SOLID = new Uint8Array(256);
export const IS_TRANSPARENT = new Uint8Array(256).fill(1);
for (const b of BLOCKS) {
  IS_SOLID[b.id] = b.solid ? 1 : 0;
  IS_TRANSPARENT[b.id] = b.transparent ? 1 : 0;
}

/** Hotbar order (slots 1-9). */
export const HOTBAR: readonly BlockId[] = [
  BlockId.GRASS,
  BlockId.DIRT,
  BlockId.STONE,
  BlockId.SAND,
  BlockId.WOOD,
  BlockId.LEAVES,
  BlockId.PLANKS,
  BlockId.GLASS,
  BlockId.WATER,
];

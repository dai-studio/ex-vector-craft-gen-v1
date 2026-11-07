/** Single source of truth for engine constants. Import by name everywhere. */

export const RENDER_DISTANCE = 4; // chunks, radius around the player
export const CHUNK_SIZE = 16; // x/z
export const CHUNK_HEIGHT = 64; // y
export const SEA_LEVEL = 22; // water fills air at y <= SEA_LEVEL
export const MAX_GEN_PER_FRAME = 1;
export const MAX_REMESH_PER_FRAME = 2;
export const REACH = 6; // blocks
export const MAX_DT = 0.05; // seconds

// Sight distance / fog
export const FOG_FAR = (RENDER_DISTANCE - 0.5) * CHUNK_SIZE; // 56: fully fogged before loaded edge
export const FOG_NEAR = FOG_FAR * 0.45; // ~25
export const UNDERWATER_FOG_NEAR = 1;
export const UNDERWATER_FOG_FAR = 14;

// Distance blur
export const POST_BLUR_ENABLED = true;
export const BLUR_START = 12; // blocks; sharp before this
export const BLUR_END = FOG_FAR; // maximum blur reached here
export const BLUR_MAX_PX = 6; // blur radius at BLUR_END (scaled by pixel ratio)

export const SAVE_KEY = 'vectorcraft-save';

/** Saved state: only player edits (never generated terrain), the seed and the player. */
export interface SaveData {
  version: 1;
  seed: number;
  /** 'x,y,z' → block id */
  edits: Record<string, number>;
  player: {
    position: [number, number, number];
    yaw: number;
    pitch: number;
    flying: boolean;
    selectedSlot: number;
  } | null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Parses untrusted JSON into SaveData, dropping anything malformed. */
export function parseSave(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<SaveData>;
    if (!d || !isNum(d.seed)) return null;
    const edits: Record<string, number> = {};
    if (d.edits && typeof d.edits === 'object') {
      for (const [k, v] of Object.entries(d.edits)) {
        if (isNum(v) && /^-?\d+,-?\d+,-?\d+$/.test(k)) edits[k] = v;
      }
    }
    const p = d.player;
    const player =
      p && Array.isArray(p.position) && p.position.length === 3 && p.position.every(isNum) && isNum(p.yaw) && isNum(p.pitch)
        ? {
            position: p.position as [number, number, number],
            yaw: p.yaw,
            pitch: p.pitch,
            flying: Boolean(p.flying),
            selectedSlot: isNum(p.selectedSlot) ? p.selectedSlot : 0,
          }
        : null;
    return { version: 1, seed: d.seed, edits, player };
  } catch {
    return null;
  }
}

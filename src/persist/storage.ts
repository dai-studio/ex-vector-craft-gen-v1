import { CHUNK_SIZE, SAVE_KEY } from '../config';
import { events } from '../events';
import type { EditSource } from '../world/chunkManager';
import { parseSave, type SaveData } from './saveData';

type Edit = readonly [x: number, y: number, z: number, id: number];

const DEBOUNCE_MS = 1000;

/** localStorage-backed save with a debounced (1s) writer. Edits are indexed by chunk for fast re-application. */
export class SaveStore implements EditSource {
  readonly seed: number;
  player: SaveData['player'];
  private readonly byChunk = new Map<string, Map<string, Edit>>();
  private timer = 0;
  /** Function the store calls to snapshot the live player just before writing. */
  playerSnapshot: (() => SaveData['player']) | null = null;

  constructor() {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch {
      /* storage blocked: play without saving */
    }
    const save = parseSave(raw);
    this.seed = save?.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.player = save?.player ?? null;
    if (save) {
      for (const [k, id] of Object.entries(save.edits)) {
        const [x, y, z] = k.split(',').map(Number) as [number, number, number];
        this.record(x, y, z, id);
      }
    }
    events.on('BlockChanged', ({ x, y, z, newId }) => {
      this.record(x, y, z, newId);
      this.scheduleSave();
    });
    const flush = () => this.saveNow();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  private record(x: number, y: number, z: number, id: number): void {
    const ck = `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
    let m = this.byChunk.get(ck);
    if (!m) {
      m = new Map();
      this.byChunk.set(ck, m);
    }
    m.set(`${x},${y},${z}`, [x, y, z, id]);
  }

  editsForChunk(cx: number, cz: number): Iterable<Edit> {
    return this.byChunk.get(`${cx},${cz}`)?.values() ?? [];
  }

  get editCount(): number {
    let n = 0;
    for (const m of this.byChunk.values()) n += m.size;
    return n;
  }

  scheduleSave(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.saveNow(), DEBOUNCE_MS);
  }

  saveNow(): void {
    window.clearTimeout(this.timer);
    if (this.playerSnapshot) this.player = this.playerSnapshot();
    const edits: Record<string, number> = {};
    for (const m of this.byChunk.values()) for (const [k, e] of m) edits[k] = e[3];
    const data: SaveData = { version: 1, seed: this.seed, edits, player: this.player };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* quota or blocked storage: ignore */
    }
  }
}

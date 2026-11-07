import { events } from '../events';

export type Action = 'toggleFly' | 'toggleDebug' | 'toggleBlur';

/**
 * Tracks held keys and queues discrete actions (clicks, toggles, slot picks)
 * so the game loop consumes each exactly once.
 */
export class Input {
  private readonly keys = new Set<string>();
  private locked = false;
  private clicks: (0 | 2)[] = [];
  private actions: Action[] = [];
  private wheel = 0;
  private slot: number | null = null;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
    target.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    events.on('PointerLockChange', ({ locked }) => {
      this.locked = locked;
      if (!locked) {
        this.keys.clear();
        this.clicks = [];
      }
    });
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // Debug/blur toggles work even while paused.
    if (e.code === 'F3') {
      e.preventDefault();
      if (!e.repeat) this.actions.push('toggleDebug');
      return;
    }
    if (e.code === 'F4') {
      e.preventDefault();
      if (!e.repeat) this.actions.push('toggleBlur');
      return;
    }
    if (!this.locked) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    this.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyF') this.actions.push('toggleFly');
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m) this.slot = Number(m[1]) - 1;
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!this.locked) return;
    if (e.button === 0 || e.button === 2) this.clicks.push(e.button);
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.locked) return;
    e.preventDefault();
    this.wheel += Math.sign(e.deltaY);
  };

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  get forward(): number {
    return (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0) - (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0);
  }

  get strafe(): number {
    return (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
  }

  get jump(): boolean {
    return this.isDown('Space');
  }

  get shift(): boolean {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }

  consumeClicks(): (0 | 2)[] {
    const c = this.clicks;
    this.clicks = [];
    return c;
  }

  consumeActions(): Action[] {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  consumeSlot(): number | null {
    const s = this.slot;
    this.slot = null;
    return s;
  }
}

/** Lightweight typed EventTarget bus: event names map to typed payloads. */

export interface GameEvents {
  BlockChanged: { x: number; y: number; z: number; oldId: number; newId: number };
  PointerLockChange: { locked: boolean };
}

type Name = keyof GameEvents;
type Handler<K extends Name> = (payload: GameEvents[K]) => void;

class EventBus {
  private readonly target = new EventTarget();
  private readonly wrapped = new Map<Function, EventListener>();

  on<K extends Name>(name: K, handler: Handler<K>): () => void {
    const listener: EventListener = (e) => handler((e as CustomEvent<GameEvents[K]>).detail);
    this.wrapped.set(handler, listener);
    this.target.addEventListener(name, listener);
    return () => this.off(name, handler);
  }

  off<K extends Name>(name: K, handler: Handler<K>): void {
    const listener = this.wrapped.get(handler);
    if (!listener) return;
    this.target.removeEventListener(name, listener);
    this.wrapped.delete(handler);
  }

  emit<K extends Name>(name: K, payload: GameEvents[K]): void {
    this.target.dispatchEvent(new CustomEvent(name, { detail: payload }));
  }
}

export const events = new EventBus();

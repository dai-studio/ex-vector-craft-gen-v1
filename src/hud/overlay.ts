import { events } from '../events';

/** Start / pause overlay, visible whenever pointer lock is not active. */
export function bindOverlay(overlay: HTMLElement): void {
  const title = overlay.querySelector<HTMLElement>('.click');
  let started = false;
  events.on('PointerLockChange', ({ locked }) => {
    overlay.classList.toggle('hidden', locked);
    if (locked) started = true;
    if (title) title.textContent = started ? 'Paused · click to resume' : 'Click to play';
  });
}

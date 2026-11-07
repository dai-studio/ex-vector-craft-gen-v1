import type * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { events } from '../events';

/** Locks the pointer on overlay/canvas click; Esc unlocks (browser default) and pauses. */
export function createControls(camera: THREE.PerspectiveCamera, overlay: HTMLElement, canvas: HTMLElement): PointerLockControls {
  const controls = new PointerLockControls(camera, document.body);
  const lock = () => {
    if (!controls.isLocked) controls.lock();
  };
  overlay.addEventListener('click', lock);
  canvas.addEventListener('click', lock);
  controls.addEventListener('lock', () => events.emit('PointerLockChange', { locked: true }));
  controls.addEventListener('unlock', () => events.emit('PointerLockChange', { locked: false }));
  return controls;
}

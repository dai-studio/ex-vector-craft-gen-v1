import type { Atlas } from '../world/atlas';
import { HOTBAR, blockType } from '../world/blocks';

/** 9 slots rendered from atlas tiles; highlights the selected slot and briefly shows its name. */
export class Hotbar {
  private readonly slots: HTMLDivElement[] = [];
  private readonly label: HTMLDivElement;
  private labelTimer = 0;

  constructor(root: HTMLElement, atlas: Atlas) {
    HOTBAR.forEach((id, i) => {
      const b = blockType(id);
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.title = b.name;
      const img = document.createElement('img');
      img.src = atlas.tileDataURL(b.tiles.side);
      img.alt = b.name;
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(i + 1);
      slot.append(img, num);
      root.append(slot);
      this.slots.push(slot);
    });
    this.label = document.createElement('div');
    this.label.id = 'hotbar-label';
    this.label.style.opacity = '0';
    document.body.append(this.label);
  }

  select(index: number): void {
    this.slots.forEach((s, i) => s.classList.toggle('selected', i === index));
    const id = HOTBAR[index];
    if (id === undefined) return;
    this.label.textContent = blockType(id).name;
    this.label.style.opacity = '1';
    window.clearTimeout(this.labelTimer);
    this.labelTimer = window.setTimeout(() => (this.label.style.opacity = '0'), 1200);
  }
}

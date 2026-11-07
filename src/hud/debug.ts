/** F3 debug panel. */
export interface DebugInfo {
  fps: number;
  x: number;
  y: number;
  z: number;
  cx: number;
  cz: number;
  chunks: number;
  triangles: number;
  calls: number;
  inWater: boolean;
  flying: boolean;
  blur: string;
  target: string;
}

export class DebugPanel {
  private visible = false;
  private acc = 0;

  constructor(private readonly el: HTMLElement) {}

  get isVisible(): boolean {
    return this.visible;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.classList.toggle('hidden', !this.visible);
  }

  /** Refreshes ~8 times a second to keep DOM work negligible. */
  update(dt: number, info: () => DebugInfo): void {
    if (!this.visible) return;
    this.acc += dt;
    if (this.acc < 0.125) return;
    this.acc = 0;
    const d = info();
    this.el.textContent = [
      `Vector Craft`,
      `FPS        ${d.fps.toFixed(0)}`,
      `XYZ        ${d.x.toFixed(2)} / ${d.y.toFixed(2)} / ${d.z.toFixed(2)}`,
      `Chunk      ${d.cx}, ${d.cz}`,
      `Loaded     ${d.chunks} chunks`,
      `Triangles  ${d.triangles.toLocaleString()}  (${d.calls} draws)`,
      `In water   ${d.inWater ? 'yes' : 'no'}`,
      `Flying     ${d.flying ? 'yes' : 'no'}`,
      `Blur       ${d.blur}`,
      `Target     ${d.target}`,
    ].join('\n');
  }
}

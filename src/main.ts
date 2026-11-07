import './style.css';
import * as THREE from 'three';
import { CHUNK_SIZE, MAX_DT, POST_BLUR_ENABLED, SEA_LEVEL } from './config';
import { createCamera, EYE_HEIGHT } from './engine/camera';
import { addLights } from './engine/lights';
import { PostProcessing } from './engine/postprocessing';
import { createRenderer } from './engine/renderer';
import { SceneSky } from './engine/scene';
import { DebugPanel } from './hud/debug';
import { Hotbar } from './hud/hotbar';
import { bindOverlay } from './hud/overlay';
import { SaveStore } from './persist/storage';
import { createControls } from './player/controls';
import { Input } from './player/input';
import { BlockInteraction } from './player/interact';
import { Physics } from './player/physics';
import { createPlayerState } from './player/state';
import { Atlas } from './world/atlas';
import { BlockId, HOTBAR, blockType } from './world/blocks';
import { ChunkManager } from './world/chunkManager';
import { TerrainGenerator } from './world/terrain';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing from index.html`);
  return el;
}

// ---------------------------------------------------------------- Init
const store = new SaveStore();
const atlas = new Atlas();
const terrain = new TerrainGenerator(store.seed);

const renderer = createRenderer();
renderer.info.autoReset = false;
const sky = new SceneSky();
const scene = sky.scene;
const camera = createCamera();
addLights(scene);

const world = new ChunkManager(terrain, atlas, store);
scene.add(world.group);

const player = createPlayerState();
const physics = new Physics({ getBlock: (x, y, z) => world.getBlock(x, y, z) });
const interaction = new BlockInteraction(world, camera, player);
scene.add(interaction.selection);

const overlay = $('overlay');
const input = new Input(renderer.domElement);
const controls = createControls(camera, overlay, renderer.domElement);
bindOverlay(overlay);
const hotbar = new Hotbar($('hotbar'), atlas);
const debug = new DebugPanel($('debug'));

let post: PostProcessing | null = POST_BLUR_ENABLED ? new PostProcessing(renderer, scene, camera) : null;
let blurOn = post !== null;

/** First dry column near the origin, found from the heightmap alone. */
function findSpawn(): [number, number] {
  for (let r = 0; r < 256; r += 4) {
    for (let a = 0; a < Math.max(1, r * 2); a++) {
      const t = (a / Math.max(1, r * 2)) * Math.PI * 2;
      const x = Math.round(Math.cos(t) * r) + 0.5;
      const z = Math.round(Math.sin(t) * r) + 0.5;
      if (terrain.heightAt(Math.floor(x), Math.floor(z)) > SEA_LEVEL + 2) return [x, z];
    }
  }
  return [0.5, 0.5];
}

if (store.player) {
  const [x, y, z] = store.player.position;
  world.preload(x, z);
  player.position.set(x, y, z);
  player.flying = store.player.flying;
  player.selectedSlot = Math.min(Math.max(0, Math.floor(store.player.selectedSlot)), HOTBAR.length - 1);
  camera.rotation.set(store.player.pitch, store.player.yaw, 0, 'YXZ');
} else {
  const [x, z] = findSpawn();
  world.preload(x, z);
  player.position.set(x, world.surfaceY(Math.floor(x), Math.floor(z)) + 1, z);
}
hotbar.select(player.selectedSlot);
camera.position.set(player.position.x, player.position.y + EYE_HEIGHT, player.position.z);

store.playerSnapshot = () => ({
  position: [player.position.x, player.position.y, player.position.z],
  yaw: camera.rotation.y,
  pitch: camera.rotation.x,
  flying: player.flying,
  selectedSlot: player.selectedSlot,
});
// Player position is saved periodically, edits are saved on change (debounced).
window.setInterval(() => store.saveNow(), 5000);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  post?.resize();
});

// ---------------------------------------------------------------- Helpers
function setBlur(on: boolean): void {
  if (on && !post) post = new PostProcessing(renderer, scene, camera);
  blurOn = on;
}

function cameraInWater(): boolean {
  const p = camera.position;
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  const z = Math.floor(p.z);
  if (world.getBlock(x, y, z, BlockId.AIR) !== BlockId.WATER) return false;
  // The surface block's top is drawn 0.1 lower.
  return world.getBlock(x, y + 1, z, BlockId.AIR) === BlockId.WATER || p.y - y < 0.9;
}

// Adaptive fallback: if FPS stays under 50 for 3s with blur on, halve its resolution, then turn it off.
let fpsFrames = 0;
let fpsTime = 0;
let fps = 60;
let slowSeconds = 0;
function trackFps(dtRaw: number): void {
  fpsFrames++;
  fpsTime += dtRaw;
  if (fpsTime < 1) return;
  fps = fpsFrames / fpsTime;
  fpsFrames = 0;
  fpsTime = 0;
  // Only judge performance during active play, not on the start/pause screen.
  if (!blurOn || !post || !controls.isLocked || document.visibilityState !== 'visible') {
    slowSeconds = 0;
    return;
  }
  slowSeconds = fps < 50 ? slowSeconds + 1 : 0;
  if (slowSeconds >= 3) {
    slowSeconds = 0;
    if (!post.reduceResolution()) {
      blurOn = false;
      console.info('[vector-craft] distance blur disabled to hold frame rate');
    } else {
      console.info('[vector-craft] distance blur at half resolution to hold frame rate');
    }
  }
}

// ---------------------------------------------------------------- Game loop
let last = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(raw, MAX_DT);
  trackFps(raw);

  for (const a of input.consumeActions()) {
    if (a === 'toggleDebug') debug.toggle();
    else if (a === 'toggleBlur') setBlur(!blurOn);
    else if (a === 'toggleFly') {
      player.flying = !player.flying;
      player.velocity.y = 0;
    }
  }

  if (controls.isLocked) {
    // Read input
    const slot = input.consumeSlot();
    const wheel = input.consumeWheel();
    if (slot !== null || wheel !== 0) {
      const n = HOTBAR.length;
      player.selectedSlot = slot ?? (((player.selectedSlot + wheel) % n) + n) % n;
      hotbar.select(player.selectedSlot);
    }

    // Step physics
    physics.update(
      player,
      { forward: input.forward, strafe: input.strafe, jump: input.jump, shift: input.shift, yaw: camera.rotation.y },
      dt,
    );
    camera.position.set(player.position.x, player.position.y + EYE_HEIGHT, player.position.z);

    // Raycast & interact
    interaction.update(input.consumeClicks());

    // Stream chunks
    world.update(player.position.x, player.position.z);
  }

  // Render (info is reset manually so the composer's extra passes don't hide scene stats)
  renderer.info.reset();
  sky.setUnderwater(cameraInWater());
  if (blurOn && post) post.render(dt);
  else renderer.render(scene, camera);

  debug.update(raw, () => {
    const t = interaction.target;
    return {
      fps,
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      cx: Math.floor(player.position.x / CHUNK_SIZE),
      cz: Math.floor(player.position.z / CHUNK_SIZE),
      chunks: world.loadedCount,
      triangles: renderer.info.render.triangles,
      calls: renderer.info.render.calls,
      inWater: player.inWater,
      flying: player.flying,
      blur: blurOn && post ? (post.resolutionScale < 1 ? 'on (half res)' : 'on') : 'off',
      target: t ? `${blockType(t.id).name} @ ${t.x}, ${t.y}, ${t.z}` : '-',
    };
  });
}

requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  // Handy for poking at the game from the console during development.
  Object.assign(window, {
    vc: { THREE, world, player, camera, store, renderer, interaction, sky, get post() { return post; } },
  });
}

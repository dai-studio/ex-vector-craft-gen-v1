# Vector Craft

A browser-based voxel sandbox built with Three.js, Vite and TypeScript. Walk, swim and fly through
procedurally generated terrain that streams in 16×16 chunks, break blocks and place new ones.
All blocks use soft gradient textures, and distant terrain gets fog plus a depth-based blur.

Architecture lives in `design.dai`, the build plan in `plan.dai` and the execution log in `progress.dai`.

## Run

```sh
npm ci
npm run dev     # dev server with HMR → http://localhost:5173
npm start       # type-check, build to dist/, then preview → http://localhost:4173
```

`npm run build` runs `tsc --noEmit` (strict) and then `vite build`. The output in `dist/` is a static
site with three.js bundled, so it makes no external requests. Serve it over HTTP, since `file://` won't work.

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look |
| Space | Jump / ascend (flying) / swim up |
| Shift | Sprint / descend (flying) |
| F | Toggle flying |
| 1–9, wheel | Select hotbar block |
| Left click | Break block |
| Right click | Place block |
| F3 | Debug panel |
| F4 | Distance blur on/off |
| Esc | Pause |

Edits, the world seed and the player's position save to `localStorage['vectorcraft-save']`.
To start a fresh world, run `localStorage.removeItem('vectorcraft-save')` in the console and reload.

## Layout

```
index.html            entry + HUD markup
src/main.ts           init + per-frame game loop
src/config.ts         tuning constants (single source of truth)
src/events.ts         typed event bus (BlockChanged, PointerLockChange)
src/style.css         HUD styles
src/engine/           renderer, scene/fog, camera, lights, distance-blur post-processing
src/world/            blocks, chunk, gradient atlas, terrain, chunk manager, mesher
src/player/           input, pointer lock, physics, voxel raycast, block interaction, state
src/hud/              hotbar, overlay, debug panel
src/persist/          save model + debounced localStorage store
```

In dev builds the game is exposed as `window.vc` for poking at it from the console.

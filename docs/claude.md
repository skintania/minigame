# Project: Skintania Games

Multiplayer minigame platform (Poker + UNO) with private rooms. Players create/join rooms via 6-digit code, play turn-based games synced via polling against a Cloudflare Workers API backend.

## Tech Stack

- **Frontend:** Vanilla JS ES modules, Vite bundler, no framework
- **Styling:** Pure CSS with CSS variables (dark glassmorphism theme)
- **Backend:** Cloudflare Worker + D1 (separate repo: `minigame.skintania-api`)
- **Deployment:** GitHub Pages via `npm run build` → `dist/`, base path `/minigame/`

## Commands

```bash
npm run dev      # dev server → http://localhost:5173/minigame/
npm run build    # production build → dist/
npm run preview  # preview build locally
```

## Three-Page Structure

| HTML file | Entry script | Purpose |
|-----------|-------------|---------|
| `index.html` | `src/pages/login.js` | Auth, create/join room |
| `lobby.html` | `src/pages/lobby.js` | Waiting room (unused path — room now lives in game.html) |
| `game.html` | `src/pages/game.js` | Active game board + waiting phase |

Navigation is plain `window.location.href` assignments — no router.

## State Model

One global `state` object in `src/state.js`, persisted to `localStorage` (`sk_session`).

Key fields: `sessionId`, `username`, `matchId`, `gameId`, `roomCode`, `isHost`, `role`, `gameState`, `poll` (active interval ID), `pendingWild` (UNO color pick).

`cfg.url` = API base URL, stored separately in `sk_url`.

## Polling Architecture

No WebSockets. Two polling loops run during gameplay:

- **Game state poll** — `state.poll` interval, every 2.2s → `GET /games/{id}/state` → `render()`
- **Room heartbeat** — every 15s → `GET /rooms/{code}` → detect host transfer, update spectator list

A `fetching` boolean guard prevents overlapping requests.

## Game Plugin System

Each game lives in `src/games/{name}/` and exports:

```js
{ init(), render(meta, mine), animateAllinRunout?(meta, prevCount) }
```

Registered by `gameId` string in `src/games/registry.js`. `game.js` delegates rendering and action binding to the active plugin. Actions fire a `game:move` custom event on `document` so `game.js` can react without tight coupling.

## Render Pipeline (Active Game)

```
poll fires → api.getState() → state.gameState updated
  → render() in views/game.js
    → if waiting phase: updateWaitingPanel()
    → if active: registry[gameId].render(meta, mine)
    → if between-rounds: show overlay, tick countdown
    → if winner: showWinner()
```

## Room Phases

```
waiting → (host starts) → active (preflop/flop/turn/river for poker)
  → between-rounds → (host starts next) → active → ...
  → winner (game over)
```

## Seat Layout (Poker)

Up to 7 opponents positioned around an oval table via `data-seat` CSS attribute. The local player always sits at the bottom. `SEAT_MAP` in `poker/render.js` maps opponent count to seat positions.

## Card & Avatar Assets

Served from the Worker's R2 bucket:
- Poker cards: `{url}/assets/cards/standard-deck/{rank}-{suit}.svg`
- UNO cards: `{url}/assets/cards/uno-deck/{card}.svg`
- Avatars: `{url}/assets/avatars/{sessionId}.svg`

All `<img>` tags have `onerror` fallbacks to CSS-rendered alternatives.

## CSS Architecture

- `base.css` — CSS variables, dark theme, glassmorphism (`.glass`), ambient glow blobs
- `components.css` — buttons, inputs, toasts, modals, overlays, turn pill
- `layout.css` — login/home/lobby page grids
- `games/poker.css` — table oval, seat positions, chip animations, action bar
- `games/uno.css` — card hand layout, color states, mini opponent cards

## Backend API Summary

All calls go through `src/api/client.js`. Non-2xx throws `Error(d.error)`.

| Category | Endpoints |
|----------|----------|
| Auth | `POST /auth` |
| Rooms | `POST /rooms/create`, `POST /rooms/join`, `GET /rooms/{code}`, `PATCH /rooms/{code}/settings`, `PATCH /rooms/{code}/role`, `DELETE /rooms/{code}/leave`, `DELETE /rooms/{code}/players/{id}` |
| Games | `GET /games/{id}/state`, `POST /games/{id}/move` |

See `api.md` for full spec.

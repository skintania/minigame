# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # install dependencies (vite only)
npm run dev       # local dev server at http://localhost:5173/minigame/
npm run build     # production build → dist/
npm run preview   # preview production build locally
```

No test suite configured. Deploys automatically to GitHub Pages on push to `main`. The base path is `/minigame/` (set in `vite.config.js`).

## Architecture

Vanilla JS ES modules, no framework. Three separate HTML entry points built by Vite:

```
index.html  → src/pages/login.js    Auth screen
lobby.html  → src/pages/lobby.js    Game select, matchmaking, room creation
game.html   → src/pages/game.js     Active game board
```

Each page script calls `loadSession()`, redirects if unauthenticated, then mounts its view.

### Navigation

Transitions are `window.location.href` assignments — no client-side router. `src/router.js`'s `showView()` only toggles CSS classes within a single page and is largely unused now.

### State (`src/state.js`)

Single global `state` object persisted to `localStorage` (`sk_session`) via `saveSession()` / `loadSession()`. Key fields: `sessionId`, `username`, `matchId`, `gameId`, `roomCode`, `isHost`, `gameState`, `poll` (the active `setInterval` handle).

`cfg.url` holds the Worker base URL — configurable from the login screen, defaults to the production worker.

### API client (`src/api/client.js`)

Thin fetch wrapper. All calls go through `request(method, path, body)` which throws `Error(d.error)` on non-2xx. Named methods on the `api` object map 1:1 to backend endpoints. See `api.md` for the full spec.

### Game system (`src/games/`)

Each game implements:

```js
export default {
  init()              // bind action buttons once on page load
  render(meta, mine)  // redraw board from state metadata; mine = it's your turn
}
```

Registered by `gameId` string in `src/games/registry.js`. Each game lives in `src/games/{name}/` with three files: `index.js`, `actions.js`, `render.js`.

Actions call `api.move(...)` then dispatch `new CustomEvent('game:move', { detail: res })` on `document`. `game.js` listens for this and calls `handleMoveResult`.

### Lobby polling

`state.poll` holds the active `setInterval`. Always clear via `stopLobbyPoll()` before navigating away. Two modes:

- **Room poll** — `GET /rooms/:code` every 2.2s until `playerCount >= 2`, then switches to start poll.
- **Start poll** — POSTs `{ type: "start" }` every 2.2s. The host succeeds and redirects. Non-creators get `"Only the room creator can start the game"` — handled by polling `getState` until `phase !== 'waiting'` then redirecting.

### Poker card format

API returns cards as `"K-spades"`, `"10-hearts"` (rank `-` suit name). R2 asset filenames use **lowercase rank**: `k-spades.svg`, `a-hearts.svg`. The renderer in `src/games/poker/render.js` calls `rank.toLowerCase()` before building the asset URL.

`"hidden"` cards (opponent hands before showdown) render as `.p-card.back`. Every `<img>` has an `onerror` fallback that renders a CSS card if the R2 asset is missing.

### CSS

`src/styles/base.css` — design tokens (dark theme, pink/blue gradient, CSS variables). Retheme here.
`src/styles/components.css` — buttons, inputs, pills.
`src/styles/layout.css` — page grids and panels.
`src/styles/games/` — per-game overrides.

`.glass` class applies the glassmorphism card effect used throughout.

## Backend

API source is in a separate repo (`minigame.skintania-api`, Cloudflare Worker + D1). `api.md` in this folder is a copy of the API reference. The production URL is `https://minigame-skintania-api.skintania143.workers.dev`.

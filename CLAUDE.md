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
lobby.html  → src/pages/lobby.js    Waiting room (legacy; room waiting phase lives in game.html)
game.html   → src/pages/game.js     Active game board + waiting phase
```

Navigation is plain `window.location.href` — no client-side router.

### State (`src/state.js`)

Single global `state` object persisted to `localStorage` (`sk_session`) via `saveSession()` / `loadSession()`. Key fields: `sessionId`, `username`, `matchId`, `gameId`, `roomCode`, `isHost`, `role`, `gameState`, `poll` (active `setInterval` handle), `pendingWild` (UNO color pick).

`cfg.url` holds the Worker base URL — configurable from the login screen.

### API client (`src/api/client.js`)

Thin fetch wrapper. Throws `Error(d.error)` on non-2xx. Game actions use explicit per-action endpoints — there is no generic `move` method.

| Category | Endpoints |
|----------|-----------|
| Auth | `POST /auth` |
| Rooms | `POST /rooms/create`, `POST /rooms/join`, `GET /rooms/{code}`, `PATCH /rooms/{code}/settings`, `PATCH /rooms/{code}/role`, `DELETE /rooms/{code}/leave`, `DELETE /rooms/{code}/players/{id}` |
| Game state | `GET /games/{gid}/{matchId}/state?sessionId=` |
| Poker actions | `POST /games/poker/{matchId}/start\|fold\|check\|call\|bet\|next-round` |
| UNO actions | `POST /games/uno/{matchId}/start\|play\|draw` |

**Unified Game Response** — every game state and action endpoint returns a flat object:
```
{ players, metadata, playerNames, spectatorNames, hostId, myRole,
  matchStatus, isMyTurn, betweenRoundsRemainingSec?, status, message }
```
`myRole`, `hostId`, `isMyTurn`, `spectatorNames` come from the server — do **not** compute these on the frontend. See `api.md` for the full spec.

### Game system (`src/games/`)

Each game implements:

```js
export default {
  init()              // bind action buttons once on page load
  render(meta, mine)  // redraw board from state metadata; mine = isMyTurn
}
```

Registered by `gameId` string in `src/games/registry.js`. Actions call the relevant `api.poker*` / `api.uno*` method then dispatch `new CustomEvent('game:move', { detail: res })` on `document`. `game.js` listens and calls `handleMoveResult`.

### Polling

`state.poll` holds the active `setInterval`. Always clear via `stopPoll()` before navigating away.

- **Game state poll** — 2.2s, `GET /games/{gid}/{matchId}/state` → `render()`
- **Room heartbeat** — 15s, `GET /rooms/{code}` → update `roomData` (members list, settings)

A `fetching` boolean guard prevents overlapping requests.

### Render pipeline

```
poll fires → api.getState() → state.gameState = res → applyServerState(res)
  → render() in views/game.js
    → matchStatus=waiting   → updateWaitingPanel()
    → phase=between-rounds  → render board (cards revealed), showBetweenRounds() already open
    → active                → registry[gameId].render(meta, isMyTurn)
    → handWinner/winner     → stopPoll() → showHandResult() / showWinner()
```

### Poker card format

API returns cards as Unicode suit symbols: `A♠`, `10♥`. The renderer in `src/games/poker/render.js` maps `♠→spades`, `♥→hearts`, `♦→diamonds`, `♣→clubs` for R2 asset paths. CSS fallback renders if the SVG is missing.

`"hidden"` cards (opponent hands before showdown) render as `.p-card.back`.

### CSS

`src/styles/base.css` — design tokens (dark theme, pink/blue gradient, CSS variables). Retheme here.
`src/styles/components.css` — buttons, inputs, pills, overlays.
`src/styles/layout.css` — page grids and panels.
`src/styles/games/` — per-game overrides.

`.glass` applies the glassmorphism card effect used throughout.

## Backend

API source is in a separate repo (`minigame.skintania-api`, Cloudflare Worker + D1). `api.md` in this folder is a copy of the API reference. The production URL is `https://minigame-skintania-api.skintania143.workers.dev`.

## Docs Maintenance

The `docs/` folder contains three reference files for future Claude sessions:

- `docs/route.md` — file dependency tree, call chains, polling summary
- `docs/docs-src.md` — per-file JS documentation
- `docs/docs-ui.md` — per-file CSS/HTML/config documentation

**After any major change, update the relevant docs files.** A major change includes:
- Adding or removing a source file
- Adding a new game or game action
- Changing the state shape (`state.js`)
- Adding/removing API endpoints or changing how they're called
- Changing navigation flow (new pages, redirects)
- Adding new polling loops or timers
- Significant refactor of a view or game module
- New CSS components or layout patterns

Update only the files affected by the change. Keep each doc file under 300 lines.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dev dependencies (only vite)
npm run dev        # Start dev server
npm run build      # Build for production (outputs to dist/)
npm run preview    # Preview the production build locally
```

Deployment is automated via GitHub Actions on push to main: it runs `npm install && npm run build` and publishes `dist/` to GitHub Pages.

## Architecture

**Skintania Games** is a turn-based multiplayer minigame platform (Poker, UNO) — a multi-page frontend SPA backed by a Cloudflare Workers REST API.

### Multi-Page Setup

Three HTML entry points (`index.html` → login, `lobby.html` → matchmaking, `game.html` → active game), each bundled separately by Vite. The Vite config in [vite.config.js](vite.config.js) defines all three as rollup inputs.

### State Management

[src/state.js](src/state.js) is the single source of truth for all runtime data: `sessionId`, `username`, `matchId`, `gameId`, `roomCode`, `gameState`, and the polling interval handle. State is persisted to and reloaded from `localStorage` on every update, so sessions survive page refreshes.

### API Client

All HTTP calls go through [src/api/client.js](src/api/client.js). The base URL is read from `localStorage` key `sk_url`, defaulting to the production Cloudflare Worker URL. Read [api.md](api.md) before working with any backend endpoints — it is the authoritative API spec.

### Game Loop (Polling)

[src/views/game.js](src/views/game.js) starts a 2.2-second polling interval on page load that calls `GET /games/:gameId/state`, updates `state.gameState`, and calls the active game's `render(meta, mine)` function. The loop stops when `metadata.winner` is set.

### Game Registry Pattern

Each game (poker, uno) is a module under [src/games/](src/games/) with three files:
- `index.js` — calls `init()` to bind UI event listeners once on page load
- `actions.js` — functions that POST moves to the API, then dispatch `document.dispatchEvent(new CustomEvent('game:move', { detail: res }))` to hand off results
- `render.js` — `render(meta, mine)` redraws the entire board from the latest state snapshot

[src/games/registry.js](src/games/registry.js) maps `gameId` strings (`"poker"`, `"uno"`) to their modules. Add new games here.

### Adding a New Game

1. Create `src/games/<name>/{index,actions,render}.js` following the poker/uno structure.
2. Register it in `src/games/registry.js`.
3. Add game-specific CSS in `src/styles/games/<name>.css` and import it.

### CSS Architecture

Styles are split into [src/styles/base.css](src/styles/base.css) (design tokens and CSS variables — pink/blue gradient, dark glass theme), [src/styles/components.css](src/styles/components.css) (buttons, inputs), [src/styles/layout.css](src/styles/layout.css) (page grids and panels), and per-game files in [src/styles/games/](src/styles/games/). Modify tokens in `base.css` to retheme the whole app.

### Card Assets

Card SVG images are served from the Cloudflare R2 bucket at `{apiUrl}/assets/cards/<filename>` where filenames follow the pattern `a_spade.svg`, `k_heart.svg`, etc. The API returns card codes like `A-spades`; convert using the helper in [src/games/poker/render.js](src/games/poker/render.js). The client falls back to CSS-drawn cards if the asset returns a 4xx.

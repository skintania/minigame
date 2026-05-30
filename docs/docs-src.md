# Source File Reference (JS)

Per-file documentation for all JavaScript source files.

---

## `src/state.js`

Global state singleton + localStorage persistence.

**Exports:**
- `state` — mutable object: `{ sessionId, username, matchId, gameId, roomCode, isHost, role, hostId, gameState, poll, waiting, pendingWild }`
- `cfg` — getter/setter object for API base URL (`sk_url` in localStorage)
- `saveSession()` — serialize `state` → `localStorage('sk_session')`
- `loadSession()` — deserialize `sk_session` → `state`
- `clearGameState()` — zero out game fields (matchId, gameId, gameState, etc.)

**Notes:** `state.poll` holds the active `setInterval` ID. Always clear via `stopPoll()` before navigating away. `hostId` is NOT persisted — fetched fresh from room heartbeat.

---

## `src/api/client.js`

Thin fetch wrapper around the Cloudflare Worker API.

**Exports:** `api` object with:

| Method | HTTP | Path |
|--------|------|------|
| `auth(username)` | POST | `/auth` |
| `resume(sessionId)` | POST | `/auth` |
| `join(sid, gid)` | POST | `/lobby/join` |
| `createRoom(sid, gid, opts)` | POST | `/rooms/create` |
| `joinRoom(sid, code)` | POST | `/rooms/join` |
| `getRoomStatus(code, sid)` | GET | `/rooms/{code}` |
| `switchRole(code, sid, role)` | PATCH | `/rooms/{code}/role` |
| `patchSettings(code, sid, settings)` | PATCH | `/rooms/{code}/settings` |
| `leaveRoom(code, sid)` | DELETE | `/rooms/{code}/leave` |
| `kickPlayer(code, sid, targetId)` | DELETE | `/rooms/{code}/players/{targetId}` |
| `getState(gid, mid, sid)` | GET | `/games/{gid}/{mid}/state` |
| `pokerStart(mid, sid)` | POST | `/games/poker/{mid}/start` |
| `pokerNextRound(mid, sid)` | POST | `/games/poker/{mid}/next-round` |
| `pokerFold(mid, sid)` | POST | `/games/poker/{mid}/fold` |
| `pokerCheck(mid, sid)` | POST | `/games/poker/{mid}/check` |
| `pokerCall(mid, sid)` | POST | `/games/poker/{mid}/call` |
| `pokerBet(mid, sid, amount)` | POST | `/games/poker/{mid}/bet` |
| `unoStart(mid, sid)` | POST | `/games/uno/{mid}/start` |
| `unoPlay(mid, sid, card, color?)` | POST | `/games/uno/{mid}/play` |
| `unoDraw(mid, sid)` | POST | `/games/uno/{mid}/draw` |

All calls use `cfg.url` as base. Non-2xx responses throw `Error(d.error)`.

**Unified Game Response** — `GET /games/{gid}/{mid}/state` returns the full state. All action endpoints (`fold`, `bet`, `play`, etc.) return `{ "ok": true }` only — always follow with `api.getState()` to refresh state after any action.

State shape: `{ players, metadata, playerNames, spectatorNames, hostId, myRole, matchStatus, isMyTurn, turnRemainingSec?, showdownRemainingSec?, betweenRoundsRemainingSec?, playerStates? }`

Top-level timer fields (NOT in metadata): `turnRemainingSec`, `showdownRemainingSec`, `betweenRoundsRemainingSec`.

---

## `src/router.js`

Single utility: `showView(id)` — hides all `.view` elements, shows the one with matching ID. Largely unused since navigation now uses `window.location.href`.

---

## `src/main.js`

Bootstrap entry point (unused in current 3-page setup — each page has its own entry). Historically called init functions for all views. Now each `src/pages/*.js` handles its own init.

---

## `src/pages/login.js`

Entry point for `index.html`. Calls `initLogin()` from `src/views/login.js`. No logic here.

---

## `src/pages/lobby.js`

Entry point for `lobby.html`. Calls `loadSession()`, guards for `sessionId` + `roomCode`, then calls `initLobby()` from `src/views/lobby.js`.

---

## `src/pages/game.js`

Entry point for `game.html`. Calls `loadSession()`, guards for `sessionId` + (`matchId` or `roomCode`), then calls `registry[gameId].init()` for all games, then `initGame()` + `enterGame()` from `src/views/game.js`.

---

## `src/views/login.js`

Auth screen and home screen logic.

**Exports:** `initLogin()`

**Key functions:**
- `doLogin()` — validate input → `api.auth()` → `saveSession()` → `goHome()`
- `goHome()` — show `#view-home`, optionally auto-resume active match
- `doCreateRoom(gameId)` — `api.createRoom()` → set state → navigate `game.html`
- `doJoinRoom()` — validate 6-digit code → `api.joinRoom('spectator')` → navigate `game.html`
- `toggleConfig()` — show/hide Worker URL input

**Auto-resume:** On `initLogin()`, if `state.sessionId` exists, calls `api.resume()` to find active matches and offers rejoin.

---

## `src/views/lobby.js`

Waiting room UI (lobby.html). Polls room + game state, manages host controls.

**Exports:** `initLobby()`

**Timers:**
- `heartbeat` — 15s, calls `pollRoom()` → `api.getRoomStatus()`
- `stateTimer` — 4s, calls `pollGameState()` → `api.getState()` (for player names)

**Key functions:**
- `applyRoomData(room)` — update counts, rebuild player list, show/hide host settings
- `renderPlayerList()` — rebuild DOM list, adds kick buttons for host
- `joinTable()` / `leaveTable()` — `api.switchRole()` → re-poll
- `startRound()` — `api.move({type:'start'})`
- `patchSetting(key, val)` — debounced (800ms) → `api.patchSettings()`
- `kickPlayer(targetId)` — `api.kickPlayer()` → re-poll

---

## `src/views/game.js`

Main game orchestrator (~700 lines). Manages polling, rendering dispatch, overlays.

**Exports:** `initGame()`, `enterGame()`, `render()`, `stopPoll()`

**`initGame()`** — binds overlay button listeners (back to room, end game, next round, switch role). Runs once on page load.

**`enterGame()`** — starts `state.poll` (2.2s game state) and `roomHeartbeatInterval` (15s room status).

**`render()`** — main dispatch based on `state.gameState`:
- `matchStatus === 'waiting'` → `updateWaitingPanel()`
- `meta.phase === 'showdown'` → `updateShowdownBar()` + board render; poll continues
- `meta.phase === 'between-rounds'` → `showBetweenRounds()` once + board render; poll continues
- active phase → `registry[gameId].render(meta, isMyTurn)` + turn timer
- `meta.winner` detected → `stopPoll()` → `onHandEnd()` (game-over only)

**Showdown phase:** poll keeps running. `updateShowdownBar()` opens `#showdown-bar` once with winner name, `showdownRemainingSec` local countdown, and "Skip" button for host. Host "Skip" and normal "Start Next Round" both call `hostNextRound()` → `api.pokerNextRound`. `round-complete` and `handWinner` no longer stop the poll.

**Server-authoritative helpers (replaces client-side tracking):**
- `amHost()` — reads `state.gameState.hostId === state.sessionId`; falls back to `state.isHost` before first poll
- `curRole()` — reads `state.gameState.myRole`; falls back to `state.role`
- `applyServerState(gs)` — called after every state update; detects elimination (`myRole` changed to `'spectator'`), syncs host button visibility

**Key functions:**
- `pollRoomHeartbeat()` — updates `roomData` for `members[]`/settings; syncs host from room response when game state hasn't arrived yet
- `updateWaitingPanel()` — render waiting-phase UI (player list, chips, join/start/settings)
- `updateSpectatorPanel()` — reads `state.gameState.spectatorNames` directly; no client-side deduplication needed
- `updateShowdownBar(meta)` / `hideShowdownBar()` — open/close `#showdown-bar` pill; starts 1s countdown from `state.gameState.showdownRemainingSec` (top-level) on first open
- `showBetweenRounds(meta)` — open `#between-rounds-overlay`; start countdown from `state.gameState.betweenRoundsRemainingSec` (top-level); stored in `localBetweenRoundsRemaining`
- `showHandResult(meta)` — game-over only: brief hand winner banner → `showWinner()` after 2.5s
- `showWinner(winnerId)` — game-over overlay
- `handleMoveResult(res)` — called from `game:move` event; assigns `res` as `state.gameState`; stops poll on `matchStatus === 'finished'` or `meta.winner`
- `stopPoll()` — clears all intervals; resets `localTurnRemaining`, `localBetweenRoundsRemaining`, `prevMatchStatus`
- `applyServerState(gs)` — detects `prevMatchStatus === 'active' → 'waiting'` transition (room reset) and shows toast

**Role and host changes:** After `switchRole`, `wrJoinTable`, `wrLeaveTable` — calls `api.getState()` immediately to refresh `myRole` and `hostId` from server before re-rendering.

---

## `src/games/registry.js`

Plugin registry. Exports `{ poker, uno }` object pointing to each game module.

---

## `src/games/poker/index.js`

Poker plugin entry.

**Exports:** `{ init, render, animateAllinRunout }`
- `init()` — bind Fold / Check/Call / Bet button click listeners
- `render(meta, mine)` — delegate to `renderBoard(meta, mine)`
- `animateAllinRunout(meta, prevCount)` — delegate to `poker/render.js`

---

## `src/games/poker/actions.js`

Poker action dispatchers.

**Exports:** `pkAction(type)`, `pkCall()`, `pkBet()`

- `act(fn)` — internal: calls `fn()` (action), then fetches state via `api.getState()`, fires `CustomEvent('game:move', { detail: stateRes })` on `document`
- `pkAction(type)` — calls `api.pokerFold` or `api.pokerCheck` via `act()`
- `pkCall()` — calls `api.pokerCall` via `act()`
- `pkBet()` — reads amount from `#bet-amt`, calls `api.pokerBet` via `act()`

All action endpoints return `{ ok: true }` — state is fetched separately after each action. Errors caught and shown via `showToast()`.

---

## `src/games/poker/render.js`

Poker table visual rendering (~500 lines).

**Exports:** `renderBoard(meta, mine)`, `animateAllinRunout(meta, prevCount)`

**Key render functions:**
- `syncOpponentSlots(oppIds)` — build/reuse opponent badge DOM, assign `data-seat` from `SEAT_MAP`
- `renderAction(meta, mine)` — set Fold/Check/Call/Bet labels and disabled state
- `renderCommunity(cards)` — display 0-5 community cards
- `renderMyHand(cards)` — display 2 hole cards at bottom
- `renderOpponentHands(players)` — back cards or face cards (showdown)
- `renderPot(meta)` — pot amount, blind info
- `renderBets(meta)` — individual player bets near each seat
- `renderMeta(meta)` — phase label, current player name, last action text

**Animations:**
- `flyChip(fromEl, toEl)` — DOM chip element, CSS `--tx`/`--ty` translate, cleaned on `animationend`
- `animateBetToPot()` — detect bet delta → fly chips toward pot
- `animatePotToWinner(winnerId)` — fly chips from pot to winner badge
- `animateFoldCards()` — rotate + translate cards off screen
- `animateAllinRunout(meta, prevCount)` — sequence: flop → turn → river with delays

`SEAT_MAP[n]` maps opponent count to seat position strings (top-center, top-left, … right).

---

## `src/games/uno/index.js`

UNO plugin entry.

**Exports:** `{ init, render }`
- `init()` — bind Draw button and color-picker buttons
- `render(meta, mine)` — delegate to `renderBoard(meta, mine, unoPlay)`

---

## `src/games/uno/actions.js`

UNO action dispatchers.

**Exports:** `unoAct(action)`, `unoPlay(card)`, `pickColor(color)`

- `act(fn)` — internal: calls action, fetches state, fires `game:move` event (same pattern as poker/actions.js)
- `unoPlay(card)` — if wild: set `state.pendingWild`, `openModal('color-modal')`; else call `unoAct` immediately
- `pickColor(color)` — `closeModal()` → `unoAct({ type:'play', card: pendingWild, color })`
- `unoAct(action)` — calls `api.unoDraw` or `api.unoPlay` via `act()`

---

## `src/games/uno/render.js`

UNO board rendering (~120 lines).

**Exports:** `renderBoard(meta, mine, onPlay)`, `canPlay(card, meta)`

- Renders N opponent slots (`#uno-opponents`) — each shows name, card count, turn indicator, UNO!/winner badges
  - During normal play: mini back-cards row
  - During reveal window (`meta.phase === 'finished'`): actual small card SVGs for revealed hands
- Renders direction indicator (`#uno-direction`, ↻/↺)
- Renders top discard card (image + CSS fallback)
- Renders current color label
- Reveals countdown (`#uno-reveal-bar`) when `state.gameState.revealRemainingSec` is present
- Renders player hand: each card clickable if `mine && canPlay(card, meta)`; hides `btn-draw` during finished phase
- Shows `#uno-my-uno` UNO! badge when my hand has 1 card (not during finished)
- `canPlay` — true if card color matches `meta.currentColor`, value matches top discard value, or card is wild
- Card image path: `{cfg.url}/assets/cards/uno-deck/{card}.svg`; `.small` class for 42×62px reveal cards

---

## `src/ui/modal.js`

**Exports:** `openModal(id)`, `closeModal(id)` — add/remove `.open` class on overlay element.

---

## `src/ui/toast.js`

**Exports:** `showToast(msg, ms=4500)` — set toast text, add `.show` class, auto-hide after `ms`. Clears previous timer to prevent overlap.

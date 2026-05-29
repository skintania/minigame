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
| `joinRoom(sid, code, role)` | POST | `/rooms/join` |
| `getRoomStatus(code, sid)` | GET | `/rooms/{code}` |
| `switchRole(code, sid, role)` | PATCH | `/rooms/{code}/role` |
| `patchSettings(code, sid, settings)` | PATCH | `/rooms/{code}/settings` |
| `leaveRoom(code, sid)` | DELETE | `/rooms/{code}/leave` |
| `kickPlayer(code, sid, targetId)` | DELETE | `/rooms/{code}/players/{targetId}` |
| `move(gameId, sid, matchId, action)` | POST | `/games/{gameId}/move` |
| `getState(gameId, matchId, sid)` | GET | `/games/{gameId}/state` |

All calls use `cfg.url` as base. Non-2xx responses throw `Error(d.error)`.

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
- `status === 'waiting'` → `updateWaitingPanel()`
- `status === 'active'` → `registry[gameId].render(meta, isMine)` + turn timer
- `meta.handWinner` or `meta.winner` → `stopPoll()` → `onHandEnd()`
- `status === 'between-rounds'` → show overlay, tick countdown

**Key functions:**
- `pollRoomHeartbeat()` — detect host transfer, update panels
- `detectElimination()` — check if player's sessionId still in active player list
- `updateWaitingPanel()` — render waiting-phase UI (player list, chips, join/start/settings)
- `updateSpectatorPanel()` — update spectator list in sidebar
- `showHandResult(meta)` — poker hand winner banner + between-rounds overlay
- `showWinner(winnerId)` — game-over overlay with winner name
- `startNextHand()` — `api.move({type:'next-round'})` → re-`enterGame()`
- `handleMoveResult(res)` — called from `game:move` event; updates state + render
- `stopPoll()` — clears all intervals/timers

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

- `pkAction(type)` — send `{type}` (fold, check)
- `pkCall()` — read call amount from button's data attribute, send `{type:'call', amount}`
- `pkBet()` — read amount from `#pk-bet-input`, validate against min-raise, send `{type:'bet', amount}`
- `dispatch(action)` — `api.move()` → fires `CustomEvent('game:move')` on `document`

Errors caught and shown via `showToast()`.

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

- `unoPlay(card)` — if wild: set `state.pendingWild`, `openModal('color-modal')`; else dispatch immediately
- `pickColor(color)` — `closeModal()` → dispatch `{type:'play', card: pendingWild, color}`
- `unoAct(action)` — generic dispatch (used for draw)
- `dispatch(action)` — `api.move()` → fires `game:move` event

---

## `src/games/uno/render.js`

UNO board rendering (~80 lines).

**Exports:** `renderBoard(meta, mine, onPlay)`, `canPlay(card, meta)`

- Renders opponent card count + mini back-cards
- Renders top discard card (image + CSS fallback)
- Renders current color label
- Renders player hand: each card clickable if `mine && canPlay(card, meta)`
- `canPlay` — true if card color matches current, or value matches top card, or card is wild

Card image path: `{cfg.url}/assets/cards/uno-deck/{card}.svg`

---

## `src/ui/modal.js`

**Exports:** `openModal(id)`, `closeModal(id)` — add/remove `.open` class on overlay element.

---

## `src/ui/toast.js`

**Exports:** `showToast(msg, ms=4500)` — set toast text, add `.show` class, auto-hide after `ms`. Clears previous timer to prevent overlap.

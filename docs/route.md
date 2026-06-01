# Route & Call Graph

Quick reference for tracing what calls what. Use this to find where a behavior lives.

## Import Tree

```
index.html
  └─ src/pages/login.js
       └─ src/views/login.js
            ├─ src/state.js
            ├─ src/api/client.js
            └─ src/ui/toast.js

lobby.html
  └─ src/pages/lobby.js
       └─ src/views/lobby.js
            ├─ src/state.js
            ├─ src/api/client.js
            └─ src/ui/toast.js

game.html
  └─ src/pages/game.js
       ├─ src/views/game.js
       │    ├─ src/state.js
       │    ├─ src/api/client.js
       │    ├─ src/games/registry.js
       │    ├─ src/ui/toast.js
       │    └─ src/ui/modal.js
       └─ src/games/registry.js
            ├─ src/games/poker/index.js
            │    ├─ src/games/poker/actions.js      ← api/client, state, toast
            │    └─ src/games/poker/render.js       ← state, cfg
            ├─ src/games/uno/index.js
            │    ├─ src/games/uno/actions.js        ← api/client, state, modal, toast
            │    └─ src/games/uno/render.js         ← state, cfg
            ├─ src/games/slave/index.js
            │    ├─ src/games/slave/actions.js      ← api/client, state, toast
            │    └─ src/games/slave/render.js       ← state, cfg
            ├─ src/games/dummy/index.js
            │    ├─ src/games/dummy/actions.js      ← api/client, state, toast
            │    └─ src/games/dummy/render.js       ← state, cfg, toast
            └─ src/games/blackjack/index.js
                 ├─ src/games/blackjack/actions.js  ← api/client, state, toast
                 └─ src/games/blackjack/render.js   ← state, cfg
```

## Page Navigation Flow

```
index.html (login)
  → goHome()              show #view-home (same page)
  → doCreateRoom()        → game.html  (state.isHost=true)
  → doJoinRoom()          → game.html  (state.isHost=false, role=spectator)

game.html (waiting phase)
  → "Back to Room" btn    → index.html (leaveRoom clears state)
  → host clicks Start     → stay on game.html, phase becomes active

game.html (active)
  → game ends             → winner overlay (stay on page)
  → "Back to Lobby" btn   → index.html

lobby.html
  → "Leave Room" btn      → index.html
  (note: lobby.html is mostly legacy; game.html handles waiting phase now)
```

## Key Function Call Chains

### Login → Home
```
initLogin() [views/login.js]
  doLogin() → api.auth() → saveSession() → goHome()
  auto-resume: api.resume() → if activeMatch → navigate game.html
```

### Create Room
```
doCreateRoom(gameId) [views/login.js]
  → api.createRoom()
  → state.{roomCode, matchId, isHost} = ...
  → saveSession()
  → window.location.href = 'game.html'
```

### Join Room
```
doJoinRoom() [views/login.js]
  → api.joinRoom(code, 'spectator')
  → state.{roomCode, matchId, gameId} = ...
  → saveSession()
  → window.location.href = 'game.html'
```

### Game Page Load
```
pages/game.js
  → loadSession()
  → guard: redirect if no sessionId/matchId/roomCode
  → registry[].init()  ← binds action button listeners
  → initGame()         ← binds overlay button listeners
  → enterGame()        ← starts state.poll (2.2s) + roomHeartbeatInterval (15s)
```

### Game State Poll Loop
```
enterGame() sets state.poll = setInterval(2200ms)
  → api.getState()
  → state.gameState = res
  → applyServerState(res)
  → render()
       ├─ phase=waiting        → updateWaitingPanel()
       ├─ phase=showdown       → updateShowdownBar() + board render (poll keeps running)
       ├─ phase=between-rounds → showBetweenRounds() once + board render (poll keeps running)
       ├─ active phase         → registry[gameId].render(meta, mine)
       └─ meta.winner set      → stopPoll() → onHandEnd() → showHandResult() / showWinner()
```

### Player Action (Poker)
```
click Fold/Check/Bet [poker/index.js button listener]
  → pkAction('fold') or pkCall() or pkBet() [poker/actions.js]
  → api.pokerFold / api.pokerCheck / api.pokerCall / api.pokerBet  → { ok: true }
  → api.getState()  → full unified game state
  → fires CustomEvent('game:move', { detail: stateRes }) on document
  → game.js listener: handleMoveResult(stateRes)
  → state.gameState = stateRes → applyServerState(stateRes) → render()
```

### Player Action (UNO)
```
click card [uno/render.js onPlay callback]
  → unoPlay(card) [uno/actions.js]
  → if wild: state.pendingWild = card → openModal('color-modal')
  → else: api.unoPlay() → { ok: true } → api.getState() → fires 'game:move'

click color in modal
  → pickColor(color) [uno/actions.js]
  → closeModal()
  → api.unoPlay(matchId, sessionId, pendingWild, color) → { ok: true } → api.getState() → fires 'game:move'
```

### Showdown → Between-rounds → Next Hand
```
round ends
  → poll keeps running; render() detects phase=showdown
  → updateShowdownBar() opens pill with winner name + 10s countdown (from state.showdownRemainingSec)
  → host can click "Skip" → hostNextRound() → api.pokerNextRound() → api.getState() → render()
  → server auto-transitions to between-rounds after 10s
  → poll detects phase=between-rounds → showBetweenRounds() opens overlay
  → if betweenRoundsRemainingSec present: local countdown from that value
  → host "Start Next Round" → hostNextRound() → api.pokerNextRound() → api.getState() → render()
  → server starts new hand → poll detects active phase → hideBetweenRounds()

Game over (meta.winner set):
  → stopPoll()
  → showHandResult() → brief banner → showWinner() after 2.5s
```

### Room Heartbeat
```
roomHeartbeatInterval (15s) [game.js]
  → pollRoomHeartbeat()
  → api.getRoomStatus(roomCode, sessionId)
  → detect hostId change → update state.{isHost, hostId}
  → updateSpectatorPanel()
  → if waiting: updateWaitingPanel()
```

## Custom Events

| Event | Fired by | Listened by | Purpose |
|-------|---------|------------|---------|
| `game:move` | `poker/actions.js`, `uno/actions.js`, `slave/actions.js`, `dummy/actions.js`, `blackjack/actions.js` | `views/game.js` | Relay move result back to game loop |

## DOM ID Quick Reference

| ID | Page | What it is |
|----|------|-----------|
| `#view-login` | index | Login form |
| `#view-home` | index | Home buttons |
| `#view-create` | index | Game picker |
| `#poker-board` | game | Poker table container |
| `#uno-board` | game | UNO board container |
| `#slave-board` | game | Slave board container |
| `#dummy-board` | game | Dummy board container |
| `#blackjack-board` | game | Blackjack board container |
| `#pk-hand-winner` | game | Hand result banner |
| `#winner-overlay` | game | Game-over full-screen overlay |
| `#showdown-bar` | game | Showdown pill (winner name + countdown + Skip for host) |
| `#between-rounds-overlay` | game | Between-rounds countdown overlay |
| `#color-modal` | game | UNO wild color picker modal |
| `#room-dropdown` | game | Room menu panel (code, players, leave) |
| `#spectator-panel` | game | Spectator list sidebar |
| `#toast` | all | Toast notification |

## Polling Intervals Summary

| Interval | Period | Location | Stopped by |
|----------|--------|---------|-----------|
| `state.poll` | 2.2s | `enterGame()` | `stopPoll()` |
| `roomHeartbeatInterval` | 15s | `enterGame()` | `stopPoll()` |
| `turnTimerInterval` | 1s | `updateTurnTimer()` | `stopPoll()` / on turn change |
| `showdownInterval` | 1s | `updateShowdownBar()` | `stopPoll()` / `hideShowdownBar()` |
| `betweenRoundsInterval` | 1s | `showBetweenRounds()` | `stopPoll()` / countdown ends |
| lobby `heartbeat` | 15s | `initLobby()` | page unload |
| lobby `stateTimer` | 4s | `initLobby()` | page unload |

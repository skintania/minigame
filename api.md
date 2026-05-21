# API Reference

Base URL: `https://minigame-skintania-api.skintania143.workers.dev`

All request bodies must be `Content-Type: application/json`. All responses are JSON.

---

## Health

### `GET /health`

Check if the worker is running.

**Response**
```json
{ "status": "ok" }
```

---

## Auth

### `POST /auth`

Create a new anonymous session. Call this once and store the returned `sessionId` — it is required for all game actions.

**Request**
```json
{ "username": "string" }
```

**Response**
```json
{
  "session": {
    "sessionId": "uuid",
    "username": "string",
    "createdAt": "2026-05-20T10:00:00.000Z"
  }
}
```

---

## Rooms

Private matches joined by a 6-digit code. Only players with the code can join.

### `POST /rooms/create`

Create a private room and get the code to share.

**Request**
```json
{
  "sessionId": "uuid",
  "gameId": "poker" | "uno",
  "maxPlayers": 8
}
```

`maxPlayers` is optional (default `8`, min `2`, max `16`).

**Response**
```json
{ "matchId": "uuid", "roomCode": "843921" }
```

---

### `POST /rooms/join`

Join a private room using its 6-digit code.

**Request**
```json
{ "sessionId": "uuid", "roomCode": "843921" }
```

**Response**
```json
{ "matchId": "uuid", "gameId": "poker" }
```

Errors: `"Room not found"`, `"Room is no longer open"`, `"Room is full"`.

---

### `GET /rooms/:code`

Poll this while waiting for players to join.

**Response**
```json
{
  "roomCode": "843921",
  "matchId": "uuid",
  "gameId": "poker",
  "status": "waiting",
  "creatorId": "uuid",
  "maxPlayers": 8,
  "playerCount": 2
}
```

---

### `PATCH /rooms/:code/settings`

Change room settings. Only the room creator can call this. Room must still be in `waiting` status.

**Request**
```json
{ "sessionId": "uuid", "maxPlayers": 4 }
```

**Response**
```json
{ "roomCode": "843921", "maxPlayers": 4 }
```

Errors: `"Only the room creator can change settings"`, `"Cannot change settings after the game has started"`, `"Cannot set max_players below current player count (n)"`.

---

### `DELETE /rooms/:code/players/:targetId`

Kick a player from the room. Only the creator can call this, only while `waiting`.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response**
```json
{ "kicked": "uuid" }
```

Errors: `"Only the room creator can kick players"`, `"Cannot kick players after the game has started"`, `"Cannot kick yourself"`.

---

## Assets

### `GET /assets/*`

Fetch a card image or any other static asset from R2 storage. No auth required.

The path after `/assets/` maps directly to the R2 key. See `docs/r2-structure.md` for the full key layout.

**Common paths**

| Path | Description |
|---|---|
| `/assets/cards/standard-deck/{rank}_{suit}.svg` | Poker card face — e.g. `/assets/cards/standard-deck/a_spades.svg`, `k_hearts.svg`, `10_clubs.svg` |
| `/assets/cards/standard-deck/back.svg` | Poker card back |
| `/assets/cards/standard-deck/black_joker.svg` | Black joker |
| `/assets/cards/standard-deck/red_joker.svg` | Red joker |
| `/assets/cards/uno-deck/{color}_{value}.svg` | UNO card — e.g. `/assets/cards/uno-deck/red_7.svg` |
| `/assets/cards/uno-deck/wild.svg` | UNO wild card |
| `/assets/cards/uno-deck/back.svg` | UNO card back |
| `/assets/cards/chips/{value}.svg` | Chip art — e.g. `/assets/cards/chips/100.svg` |
| `/assets/games/{gameId}/icon.svg` | Game lobby icon |
| `/assets/avatars/{sessionId}.svg` | Player avatar |

**Response** — raw file bytes with appropriate `Content-Type` (`image/svg+xml`, `image/png`, etc.)

Cached for 1 year (`Cache-Control: public, max-age=31536000, immutable`).

Errors: `404` if the key doesn't exist in R2.

---

## Lobby

### `POST /lobby/join`

Find an existing public waiting match, or create one. Only joins matches that have no room code.

**Request**
```json
{
  "sessionId": "uuid",
  "gameId": "poker" | "uno"
}
```

**Response**
```json
{ "matchId": "uuid" }
```

---

## Games

### `POST /games/:gameId/join`

Manually join or create a match for a specific game. Equivalent to `/lobby/join` but targeted directly at a game route.

`:gameId` — `poker` or `uno`

**Request**
```json
{ "sessionId": "uuid" }
```

**Response**
```json
{ "matchId": "uuid" }
```

---

### `GET /games/:gameId/state`

Get the current game state for a match.

`:gameId` — `poker` or `uno`

**Query params**

| Param | Type | Description |
|---|---|---|
| `matchId` | string | The match to fetch state for |
| `sessionId` | string | Your session ID — opponent hole cards are hidden unless it's showdown |

In poker, opponent `hands` entries are replaced with `["hidden", "hidden"]` until the `showdown` phase. At showdown all hands are revealed. Pass your `sessionId` so the server knows which hand is yours.

**Response** — full game state object (see state shapes below)

---

### `POST /games/:gameId/move`

Submit a player action for the current turn.

`:gameId` — `poker` or `uno`

**Request**
```json
{
  "sessionId": "uuid",
  "matchId": "uuid",
  "action": { ... }
}
```

**Response**
```json
{
  "state": { ... },
  "status": "waiting" | "ok" | "started" | "phase-updated" | "finished",
  "message": "string"
}
```

`waiting` — game hasn't started yet (keep polling after more players join and call `start`)

---

## Game Actions

### Poker (`gameId = "poker"`)

**Start the game** — requires at least 2 players to have joined
```json
{ "type": "start" }
```

**Fold**
```json
{ "type": "fold" }
```

**Check** — only valid when your current bet matches the table bet
```json
{ "type": "check" }
```

**Call** — match the current table bet
```json
{ "type": "call" }
```

**Bet**
```json
{ "type": "bet", "amount": 50 }
```

**Poker game phases:** `waiting → preflop → flop → turn → river → showdown`

---

### UNO (`gameId = "uno"`)

**Start the game** — requires at least 2 players to have joined
```json
{ "type": "start" }
```

**Play a card**
```json
{ "type": "play", "card": "red_7" }
```

**Play a wild card** — `color` is required
```json
{ "type": "play", "card": "wild", "color": "blue" }
```

**Play Wild Draw Four** — `color` is required
```json
{ "type": "play", "card": "wild_draw4", "color": "green" }
```

**Draw a card**
```json
{ "type": "draw" }
```

**UNO card format:** `{color}_{value}` — e.g. `red_0`, `blue_skip`, `yellow_reverse`, `green_draw2`, `wild`, `wild_draw4`

---

## Game state shapes

### Poker
```json
{
  "players": ["sessionId1", "sessionId2"],
  "metadata": {
    "phase": "waiting | preflop | flop | turn | river | showdown",
    "community": ["a-spades", "10-hearts", "3-clubs"],
    "hands": { "sessionId1": ["k-diamonds", "q-spades"] },
    "pot": 150,
    "bets": { "sessionId1": 50, "sessionId2": 100 },
    "folded": { "sessionId1": false, "sessionId2": false },
    "currentPlayer": "sessionId1",
    "currentBet": 100,
    "winner": null,
    "lastAction": "sessionId2 bet 100"
  }
}
```

### UNO
```json
{
  "players": ["sessionId1", "sessionId2"],
  "metadata": {
    "phase": "waiting | started | finished",
    "discard": ["red_7", "blue_skip"],
    "hands": { "sessionId1": ["green_2", "wild"], "sessionId2": ["red_0"] },
    "currentPlayer": "sessionId1",
    "direction": 1,
    "currentColor": "red",
    "lastCard": "blue_skip",
    "winner": null,
    "lastAction": "sessionId2 played blue_skip and next player draws 2"
  }
}
```

`direction` is `1` (clockwise) or `-1` (counter-clockwise, after a reverse card).

---

## Error responses

```json
{ "error": "message describing the problem" }
```

| Status | Meaning |
|---|---|
| `400` | User/game error — message is safe to show |
| `404` | Route not found |
| `500` | Unexpected server error |

Common `400` messages:
- `"invalid session"` — sessionId does not exist, call `POST /auth` first
- `"match or player not found"` — matchId is wrong or you haven't joined this match
- `"match not found"` — matchId does not exist
- `"It is not your turn."` — another player must move first
- `"At least 2 players are required to start poker."` — need more players
- `"At least 2 players are required to start UNO."` — need more players
- `"Card is not in hand."` — UNO card not in your hand
- `"Card is not playable on the current discard."` — UNO card doesn't match
- `"A color must be chosen when playing a wild card."` — missing `color` field
- `"Cannot check when bet amount is not matched."` — poker check not valid
- `"Bet amount must be a positive number."` — invalid bet amount

---

## Typical flow

**Public matchmaking**
```
1. POST /auth                       → get sessionId
2. POST /lobby/join                 → get matchId  (second player does the same)
3. GET  /rooms/:code or state       → poll until playerCount >= 2
4. POST /games/:id/move { type: "start" }
5. GET  /games/:id/state            → render board
6. POST /games/:id/move             → take your turn
7. repeat 5–6 until status = "finished"
```

**Private room**
```
1. POST /auth                       → get sessionId
2. POST /rooms/create               → get matchId + roomCode  (host only)
   share roomCode with friend
3. POST /rooms/join { roomCode }    → friend gets matchId + gameId
4. GET  /rooms/:code                → poll until playerCount >= 2
5. POST /games/:id/move { type: "start" }
6. GET  /games/:id/state            → render board
7. POST /games/:id/move             → take your turn
8. repeat 6–7 until status = "finished"
```

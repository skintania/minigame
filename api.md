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

Create a new session, or resume an existing one. Always store the returned `sessionId` (e.g. in `localStorage`) — it is required for all game actions.

**Create — first visit**
```json
{ "username": "string" }
```

**Resume — returning after disconnect**

Pass back the `sessionId` you stored. If valid, the same session and any active matches are returned. No `username` needed.
```json
{ "sessionId": "uuid" }
```

**Response**
```json
{
  "session": {
    "sessionId": "uuid",
    "username": "string",
    "createdAt": "2026-05-20T10:00:00.000Z"
  },
  "activeMatches": [
    { "matchId": "uuid", "gameId": "poker", "status": "active", "roomCode": "843921" }
  ]
}
```

`activeMatches` lists any matches still in `waiting` or `active` state. On a fresh session this is always `[]`. Use it to drop the player back into their game without asking them which match to rejoin.

Errors: `"Session not found"` — the stored `sessionId` is unknown; discard it and call with `username` instead.

---

### `GET /sessions/:sessionId/matches`

Returns all active matches for a session. Useful if you need to refresh the list without going through `POST /auth`.

**Response**
```json
{
  "matches": [
    { "matchId": "uuid", "gameId": "poker", "status": "active", "roomCode": "843921" }
  ]
}
```

---

## Rooms

Private matches joined by a 6-digit code. Only players with the code can join.

Idle rooms are automatically cleaned up: `waiting` rooms are deleted after **2 hours**, and `active` matches with no moves for **24 hours** are also removed.

### `POST /rooms/create`

Create a private room and get the code to share.

**Request**
```json
{
  "sessionId": "uuid",
  "gameId": "poker" | "uno",
  "maxPlayers": 8,
  "startingChips": 1000,
  "turnTimeLimit": 30,
  "roundLimit": 10,
  "betweenRoundsSec": 30
}
```

All fields are optional. Defaults: `maxPlayers = 8` (min `2`, max `16`), `startingChips = 1000` (min `100`, max `1,000,000`), `turnTimeLimit = 0` (disabled; min `10`, max `300` seconds), `roundLimit = 0` (infinite; min `1`, max `1000`), `betweenRoundsSec = 0` (disabled; min `5`, max `120` seconds). `startingChips`, `turnTimeLimit`, `roundLimit`, and `betweenRoundsSec` are poker-only.

**Player inactivity timeout:** Any player who has not called any API endpoint for **30 minutes** is automatically kicked from their room. This is fixed and cannot be configured. During an active hand the kick only fires during the `between-rounds` phase to avoid disrupting gameplay. If the last player is removed, the room is deleted immediately.

**Response**
```json
{ "matchId": "uuid", "roomCode": "843921" }
```

---

### `POST /rooms/join`

Join a private room using its 6-digit code.

**Request**
```json
{ "sessionId": "uuid", "roomCode": "843921", "role": "player" | "spectator" }
```

`role` defaults to `"player"`. Spectators can join rooms that are already `active` (to watch); players can only join `waiting` rooms. Spectators are not added to the game and do not count against `maxPlayers`.

**Response**
```json
{ "matchId": "uuid", "gameId": "poker" }
```

Errors: `"Room not found"`, `"Room is no longer open"`, `"Room is full"`, `"Room is no longer open. Join as spectator to watch."`.

---

### `GET /rooms/:code`

Poll this while waiting for players to join. Pass `?sessionId=<uuid>` to update your activity timestamp and trigger inactive-player cleanup when `playerTimeoutSec` is set.

**Response**
```json
{
  "roomCode": "843921",
  "matchId": "uuid",
  "gameId": "poker",
  "status": "waiting",
  "creatorId": "uuid",
  "maxPlayers": 8,
  "startingChips": 1000,
  "turnTimeLimit": 30,
  "roundLimit": 10,
  "betweenRoundsSec": 30,
  "playerCount": 2,
  "spectatorCount": 1
}
```

---

### `PATCH /rooms/:code/settings`

Change room settings. Only the room creator can call this. Room must still be in `waiting` status.

Send only the fields you want to change — at least one is required.

**Request**
```json
{ "sessionId": "uuid", "maxPlayers": 4, "startingChips": 500, "turnTimeLimit": 60, "roundLimit": 5, "betweenRoundsSec": 30 }
```

**Response** — echoes back the fields that were updated
```json
{ "roomCode": "843921", "maxPlayers": 4, "startingChips": 500, "turnTimeLimit": 60, "roundLimit": 5, "betweenRoundsSec": 30 }
```

Errors: `"Only the room creator can change settings"`, `"Cannot change settings after the game has started"`, `"Cannot set max_players below current player count (n)"`, `"At least one setting (maxPlayers, startingChips, turnTimeLimit, roundLimit, or betweenRoundsSec) is required"`.

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

### `PATCH /rooms/:code/role`

Switch your own role between player and spectator. Only valid during the `between-rounds` phase (when `betweenRoundsSec > 0`).

- Switching to **player**: adds you to the next hand with `startingChips` (if your chip count is 0 or you've never played).
- Switching to **spectator**: removes you from the next hand. Any chips you hold are forfeited.

**Request**
```json
{ "sessionId": "uuid", "role": "player" | "spectator" }
```

**Response**
```json
{ "roomCode": "843921", "role": "spectator" }
```

Errors: `"Room not found"`, `"Can only change role while the game is active"`, `"Can only change role between rounds"`, `"You are not in this room"`.

---

## Assets

### `GET /assets/*`

Fetch a card image or any other static asset from R2 storage. No auth required.

The path after `/assets/` maps directly to the R2 key. See `docs/r2-structure.md` for the full key layout.

**Common paths**

| Path | Description |
|---|---|
| `/assets/cards/standard-deck/{rank}-{suit}.svg` | Poker card face — e.g. `/assets/cards/standard-deck/A-spades.svg` |
| `/assets/cards/standard-deck/back.svg` | Poker card back |
| `/assets/cards/uno-deck/{color}_{value}.svg` | UNO card — e.g. `/assets/cards/uno-deck/red_7.svg` |
| `/assets/cards/uno-deck/wild.svg` | UNO wild card |
| `/assets/cards/uno-deck/back.svg` | UNO card back |
| `/assets/cards/chips/chip-{value}.svg` | Chip art — e.g. `/assets/cards/chips/chip-100.svg` |
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

**Response** — full game state object (see state shapes below). Always includes a `playerNames` map.

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
  "status": "waiting" | "ok" | "started" | "phase-updated" | "round-complete" | "finished",
  "message": "string",
  "playerNames": { "sessionId1": "Alice", "sessionId2": "Bob" }
}
```

| Status | Meaning |
|---|---|
| `waiting` | Game hasn't started yet — keep polling after more players join and send `start` |
| `ok` | Normal move accepted, waiting for next player |
| `started` | Game just started |
| `phase-updated` | Betting round ended, community cards dealt (flop / turn / river) |
| `round-complete` | Hand finished, next hand started automatically |
| `finished` | Game over — check `state.metadata.winner` for the winner |

---

## Game Actions

### Poker (`gameId = "poker"`)

**Start the game** — requires at least 2 players; in a private room only the creator can send this
```json
{ "type": "start" }
```

**Start next round early** — only valid during the `between-rounds` phase; creator can use this to skip the remaining countdown
```json
{ "type": "next-round" }
```

**Fold**
```json
{ "type": "fold" }
```

**Check** — only valid when your current bet already matches `currentBet` (nothing owed)
```json
{ "type": "check" }
```

**Call** — matches `currentBet` automatically; goes all-in for remaining chips if you can't cover the full amount; acts as a check if nothing is owed (e.g. BB when no one raised)
```json
{ "type": "call" }
```

**Bet / Raise** — raises must be at least as large as the previous raise in the same street; all-in bets are always allowed regardless of size
```json
{ "type": "bet", "amount": 50 }
```

**Blinds:** Each hand posts a small blind and big blind automatically before cards are dealt. Blind sizes scale with `startingChips` (SB = `startingChips / 100`, BB = `startingChips / 50`). For 1000-chip games: SB = 10, BB = 20. Preflop action starts at UTG (seat after BB). In heads-up the dealer posts the SB and acts first preflop.

**All-in:** When a player goes all-in and at most one opponent still has chips, the remaining streets run out automatically to showdown. Side pots are calculated correctly when players go all-in for different amounts — each player can only win the portion of the pot they contributed to. Ties split the pot equally (odd chip goes to the first winner).

**Poker game phases:** `waiting → preflop → flop → turn → river → showdown → between-rounds → preflop → …`

When `betweenRoundsSec > 0`, after each hand the game enters `between-rounds`. During this window, players may call `PATCH /rooms/:code/role` to switch between spectator and player. The next hand starts automatically when `betweenRoundsUntil` is reached, or earlier if the creator sends `{ "type": "next-round" }`.

---

### UNO (`gameId = "uno"`)

**Start the game** — requires at least 2 players; in a private room only the creator can send this
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

All state responses include a top-level `playerNames` map that resolves session IDs to usernames. Use this to display player names in the UI without a separate lookup.

### Poker
```json
{
  "players": ["sessionId1", "sessionId2"],
  "playerNames": { "sessionId1": "Alice", "sessionId2": "Bob" },
  "metadata": {
    "phase": "waiting | preflop | flop | turn | river | showdown | between-rounds",
    "community": ["A♠", "10♥", "3♣"],
    "hands": {
      "sessionId1": ["K♦", "Q♠"],
      "sessionId2": ["hidden", "hidden"]
    },
    "pot": 150,
    "bets": { "sessionId1": 50, "sessionId2": 100 },
    "totalBets": { "sessionId1": 70, "sessionId2": 100 },
    "chips": { "sessionId1": 880, "sessionId2": 850 },
    "folded": { "sessionId1": false, "sessionId2": false },
    "currentPlayer": "sessionId1",
    "currentBet": 100,
    "lastRaiseAmount": 20,
    "dealerIndex": 0,
    "sbIndex": 0,
    "bbIndex": 1,
    "turnTimeLimit": 30,
    "turnStartedAt": "2026-05-21T10:00:00.000Z",
    "roundLimit": 10,
    "betweenRoundsSec": 30,
    "betweenRoundsUntil": null,
    "currentRound": 2,
    "handWinner": "sessionId2",
    "winner": null,
    "lastAction": "sessionId2 bet 100"
  }
}
```

`chips` — each player's current chip stack. Deducted on every bet/blind, awarded at showdown via side pot calculation.

`bets` — chips put in during the **current street only**. Resets to 0 at each new street.

`totalBets` — cumulative chips put in across **all streets** this hand. Used to calculate side pots at showdown.

`lastRaiseAmount` — size of the last raise this street. The next raise must be at least this large (all-in bets exempt).

`sbIndex` / `bbIndex` — index into `players` of the small and big blind for this hand.

`handWinner` — the player who won the most recent hand (by showdown or everyone else folding). `null` before the first hand ends.

`winner` — the overall game winner. Only set when the game is fully finished (one player holds all chips or `roundLimit` is reached). `null` while the game is ongoing.

`betweenRoundsSec` — countdown length in seconds between hands. `0` means the next hand starts immediately.

`betweenRoundsUntil` — ISO timestamp when the between-rounds countdown ends and the next hand auto-starts. `null` when not in the `between-rounds` phase.

Opponent `hands` entries show `["hidden", "hidden"]` until `showdown`. Pass `sessionId` to `GET /games/poker/state` so the server knows which hand to reveal.

Card strings use Unicode suit symbols: `♠` `♥` `♦` `♣` (e.g. `A♠`, `10♥`). To map to R2 asset keys, convert suit to its ASCII name (`♠→spades`, `♥→hearts`, `♦→diamonds`, `♣→clubs`) and join with `-`: `A♠ → cards/standard-deck/A-spades.svg`.

### UNO
```json
{
  "players": ["sessionId1", "sessionId2"],
  "playerNames": { "sessionId1": "Alice", "sessionId2": "Bob" },
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
- `"Session not found"` — stored `sessionId` is unknown; create a new session with `username`
- `"invalid session"` — sessionId does not exist when submitting a move
- `"match or player not found"` — matchId is wrong or you haven't joined this match
- `"match not found"` — matchId does not exist
- `"Only the room creator can start the game"` — start action sent by a non-creator
- `"Cannot join a game that has already started."` — game is past the waiting phase
- `"It is not your turn."` — another player must move first
- `"At least 2 players are required to start poker."` — need more players
- `"At least 2 players are required to start UNO."` — need more players
- `"Cannot check — there is a bet to call."` — use `call` or `bet` to match `currentBet`
- `"Bet amount must be a positive number."` — invalid bet amount
- `"Insufficient chips. You have N."` — bet exceeds your chip stack
- `"Minimum raise is N (raise by at least N). You raised by M."` — raise too small; must match or exceed the previous raise size (all-in exempt)
- `"Card is not in hand."` — UNO card not in your hand
- `"Card is not playable on the current discard."` — UNO card doesn't match
- `"A color must be chosen when playing a wild card."` — missing `color` field
- `"Only the room creator can change settings"` — PATCH /rooms settings by non-creator
- `"Only the room creator can kick players"` — DELETE /rooms player by non-creator
- `"Room is full"` — room has reached `maxPlayers`

---

## Typical flow

**Public matchmaking**
```
1. POST /auth { username }          → save sessionId
2. POST /lobby/join                 → get matchId  (second player does the same)
3. poll GET /games/:id/state        → wait until 2+ players joined
4. POST /games/:id/move { type: "start" }
5. GET  /games/:id/state            → render board
6. POST /games/:id/move             → take your turn
7. repeat 5–6 until status = "finished"
```

**Private room**
```
1. POST /auth { username }          → save sessionId
2. POST /rooms/create               → get matchId + roomCode  (host only)
   share roomCode with friend
3. POST /rooms/join { roomCode }    → friend gets matchId + gameId
4. poll GET /rooms/:code            → wait until playerCount >= 2
5. POST /games/:id/move { type: "start" }
6. GET  /games/:id/state            → render board
7. POST /games/:id/move             → take your turn
8. repeat 6–7 until status = "finished"
```

**Reconnection after disconnect**
```
1. POST /auth { sessionId }         → resume; response includes activeMatches
   if "Session not found" → POST /auth { username } to create a new session
2. pick the match from activeMatches (matchId + gameId)
3. GET  /games/:id/state            → restore board from saved state
4. resume from step 6 of the normal flow
```

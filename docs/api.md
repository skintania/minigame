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

### `PATCH /sessions/:sessionId/username`

Rename the session's display username. Blocked while the session has any `active` matches — the player must not be in a running game.

**Request**
```json
{ "username": "NewName" }
```

**Response**
```json
{ "sessionId": "uuid", "username": "NewName", "createdAt": "..." }
```

Errors: `"Session not found"`, `"Cannot rename while in an active game"`.

---

## Matches

### `GET /matches/:matchId/summary`

Fetch the final results of a completed match. The record persists in the `summaries` table permanently — call this after `end-game` closes the room or after `getGameState` returns 404 (match cleaned up).

**Response**
```json
{
  "matchId": "uuid",
  "gameId": "oldmaid",
  "winnerId": "uuid",
  "winnerUsername": "Alice",
  "durationSec": 142,
  "finishedAt": "2026-06-03T10:00:00.000Z",
  "playerNames": { "uuid1": "Alice", "uuid2": "Bob" },
  "result": { }
}
```

`result` is game-specific:

| Game | `result` fields |
|------|----------------|
| `oldmaid` | `{ losses: { "uuid": count }, round: N, loser: "uuid" }` |
| `poker` / `blackjack` / `pokdeng` | `{ finalChips: { "uuid": N } }` |
| `uno` / `slave` | `{ finishOrder: ["uuid1", "uuid2"] }` |

Errors: `"Summary not found"` (404) — match has not finished yet or matchId is wrong.

---

## Rooms

Private matches joined by a 6-digit code. Only players with the code can join.

Idle rooms are automatically cleaned up: `waiting` rooms are deleted after **2 hours**, and `active` matches with no moves for **24 hours** are also removed.

### `GET /rooms`

List all public rooms available to join. Returns up to 50 rooms ordered newest first.

**Query params**

| Param | Type | Description |
|---|---|---|
| `gameId` | string (optional) | Filter by game — e.g. `?gameId=oldmaid` |

**Response**
```json
[
  {
    "roomCode": "843921",
    "matchId": "uuid",
    "gameId": "oldmaid",
    "status": "waiting",
    "hostUsername": "Alice",
    "playerCount": 2,
    "maxPlayers": 8
  }
]
```

Only `visibility = "public"` rooms in `waiting` or `active` status are returned. Private rooms never appear here.

---

### `POST /rooms/create`

Create a room and get the code to share.

**Request**
```json
{
  "sessionId": "uuid",
  "gameId": "poker" | "uno" | "slave" | "dummy" | "oldmaid" | "...",
  "maxPlayers": 8,
  "startingChips": 1000,
  "turnTimeLimit": 30,
  "roundLimit": 10,
  "betweenRoundsSec": 30,
  "visibility": "public",
  "password": "secret"
}
```

All fields except `sessionId` and `gameId` are optional. Defaults: `maxPlayers = 8` (min `2`, max `16`), `startingChips = 1000` (min `100`, max `1,000,000`), `turnTimeLimit = 0` (disabled; min `10`, max `300` sec), `roundLimit = 0` (infinite; min `1`, max `1000`), `betweenRoundsSec = 0` (disabled; min `5`, max `120` sec), `visibility = "public"`.

`password` is required when `visibility = "private"`. Public rooms ignore `password`.

**Player inactivity timeout:** Any player who has not called a game endpoint (`GET /games/:matchId/state` or any action) for **5 minutes** is automatically kicked. What happens depends on the game and phase:
- `waiting`: removed from the room entirely. Room is deleted if it becomes empty.
- Poker `between-rounds` / `showdown`: moved to spectator.
- Poker mid-hand (`preflop`–`river`): folded out immediately, moved to spectator. If only one player is left active, the hand ends and pot is awarded. Kicked players can rejoin as `player` role during `between-rounds`.
- UNO / Slave mid-game: moved to spectator and removed from the active player list. If it was their turn, the turn advances to the next active player.

The scheduled cleanup job also removes players inactive for **30 minutes** across all rooms.

**Response**
```json
{ "matchId": "uuid", "roomCode": "843921", "visibility": "public" }
```

---

### `POST /rooms/join`

Join a private room using its 6-digit code. You always join as a **spectator** first. To sit at the table and play, call `PATCH /rooms/:code/role` after joining.

Joining works whether the room is `waiting` or `active` — you can drop into an ongoing game to watch at any time.

**Request**
```json
{ "sessionId": "uuid", "roomCode": "843921", "password": "secret" }
```

`password` is required for private rooms. Omit or leave `null` for public rooms.

**Response**
```json
{ "matchId": "uuid", "gameId": "poker" }
```

Errors: `"Room not found"`, `"Room is no longer open"` (room is `finished`), `"This room requires a password"`, `"Incorrect password"`.

---

### `GET /rooms/:code`

Poll this to get room state and keep your session alive. **Frontend must call this every 15–20 seconds with `?sessionId=` attached** — this is the heartbeat. If the host stops sending heartbeats for 60 seconds, host is automatically transferred to a random player at the table (preferring active players over spectators).

**Response**
```json
{
  "roomCode": "843921",
  "matchId": "uuid",
  "gameId": "poker",
  "status": "waiting",
  "hostId": "uuid",
  "maxPlayers": 8,
  "startingChips": 1000,
  "turnTimeLimit": 30,
  "roundLimit": 10,
  "betweenRoundsSec": 30,
  "visibility": "public",
  "playerCount": 2,
  "spectatorCount": 1,
  "members": [
    { "sessionId": "uuid", "username": "Alice", "role": "player" },
    { "sessionId": "uuid", "username": "Bob",   "role": "spectator" }
  ]
}
```

`hostId` is the current host session ID. The host can start rounds, change settings (before game starts or between rounds), and kick players. If the host leaves the room, host is automatically transferred to a random player at the table (or a spectator if the table is empty).

`members` lists every person currently in the room with their username and role (`"player"` or `"spectator"`), ordered by join time.

---

### `PATCH /rooms/:code/settings`

Change room settings. Only the room host can call this. Only valid while `waiting` or in the `between-rounds` phase.

Send only the fields you want to change — at least one is required.

**Request**
```json
{
  "sessionId": "uuid",
  "maxPlayers": 4,
  "startingChips": 500,
  "turnTimeLimit": 60,
  "roundLimit": 5,
  "betweenRoundsSec": 30,
  "visibility": "private",
  "password": "secret"
}
```

`password` is required when changing `visibility` to `"private"`. Set `visibility = "public"` to remove the password (password field is ignored).

**Response** — echoes back the fields that were updated
```json
{ "roomCode": "843921", "maxPlayers": 4, "visibility": "private" }
```

Errors: `"Only the room host can change settings"`, `"Can only change settings before the game starts or between rounds"`, `"Cannot set max_players below current player count (n)"`, `"At least one setting is required"`, `"password is required when setting visibility to private"`.

---

### `DELETE /rooms/:code/players/:targetId`

Kick a player from the room. Only the host can call this. Only valid while `waiting` or in `between-rounds`.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response**
```json
{ "kicked": "uuid" }
```

Errors: `"Only the room host can kick players"`, `"Can only kick players before the game starts or between rounds"`, `"Cannot kick yourself"`.

---

### `PATCH /rooms/:code/role`

Switch your own role between spectator and player. This is the "Join Table" / "Leave Table" action.

Valid timing:
- **Before game starts** (`status = waiting`): join or leave the table freely at any time.
- **During a game** (`status = active`): only allowed while in the `between-rounds` phase — the countdown window between hands.

Role change effects:
- Switching to **player**: seats you at the table. During an active game, you receive `startingChips` if your chip count is 0.
- Switching to **spectator**: removes you from the next hand. Chips are kept in your stack if you return.

The `maxPlayers` limit applies when switching to player. Spectators never count against it.

**Request**
```json
{ "sessionId": "uuid", "role": "player" | "spectator" }
```

**Response**
```json
{ "roomCode": "843921", "role": "spectator" }
```

Errors: `"Room not found"`, `"Can only change role before the game starts or between rounds"`, `"Table is full"`, `"You are not in this room"`.

---

### `DELETE /rooms/:code/leave`

Fully leave a room. Removes you from both the spectator list and the active player list.

Valid timing: only during `waiting` or `between-rounds` (same as role changes). Mid-hand, use `PATCH /rooms/:code/role` to step back to spectator instead — you'll be removed from the next hand safely.

If you are the last person in the room, the room is deleted. If you are the host and others are present, host is transferred to the next member before you leave.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response**
```json
{ "left": true }
```

Errors: `"Room not found"`, `"Can only leave before the game starts or between rounds"`, `"You are not in this room"`.

---

## Assets

### `GET /assets/*`

Fetch a card image or any other static asset from R2 storage. No auth required.

The path after `/assets/` maps directly to the R2 key.

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
  "gameId": "poker" | "uno" | "slave" | "dummy"
}
```

**Response**
```json
{ "matchId": "uuid" }
```

---

## Games — Poker

**Action endpoints return `{ "ok": true }` only.** After any action, poll `GET /games/poker/:matchId/state` to get the updated game state.

### `POST /games/poker/join`

Find or join a waiting public poker match. Only joins matches with no room code. Equivalent to `POST /lobby/join` with `gameId: "poker"`.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response**
```json
{ "matchId": "uuid" }
```

---

### `GET /games/poker/:matchId/state`

Get the current game state. Also updates your `last_seen_at` heartbeat and applies any pending turn or between-rounds timeouts.

**Query params**

| Param | Type | Description |
|---|---|---|
| `sessionId` | string | Your session ID — used to hide opponent hole cards and compute `myRole`/`isMyTurn` |

**Response** — [Unified Game Response](#unified-game-response)

---

### `POST /games/poker/:matchId/start`

Start the first hand. Host only. Requires ≥ 2 players seated at the table.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

---

### `POST /games/poker/:matchId/next-round`

Start the next hand. Host only. Only valid during the `between-rounds` phase. Requires ≥ 2 players at the table.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

---

### `POST /games/poker/:matchId/fold`

Fold your hand and exit the current betting round.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

---

### `POST /games/poker/:matchId/check`

Pass without betting. Only valid when nothing is owed (`currentBet` equals your contribution for this street).

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

---

### `POST /games/poker/:matchId/call`

Match the current bet. Goes all-in if your chips are insufficient. Acts as a check if nothing is owed (e.g. BB when no one raised).

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

---

### `POST /games/poker/:matchId/show`

Showdown phase only. Reveal your hole cards to all players.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

Errors: `"Not in showdown phase."`, `"You have no showdown decision to make."`, `"You have already decided."`

---

### `POST /games/poker/:matchId/muck`

Showdown phase only. Keep your cards hidden. Only available when you are **not** the hand winner — the winner is always required to show.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

Errors: `"Not in showdown phase."`, `"You have no showdown decision to make."`, `"You have already decided."`

---

### `POST /games/poker/:matchId/bet`

Open or raise the betting. Must be at least as large as the previous raise this street (all-in bets are always allowed regardless of size).

**Request**
```json
{ "sessionId": "uuid", "amount": 50 }
```

`amount` must be a positive number.

**Response** `{ "ok": true }`

Errors: `"amount must be a positive number"`, `"Insufficient chips. You have N."`, `"Minimum raise is N (raise by at least N). You raised by M."`.

---

## Games — UNO

**Action endpoints return `{ "ok": true }` only.** After any action, poll `GET /games/uno/:matchId/state` to get the updated game state.

### `POST /games/uno/join`

Find or join a waiting public UNO match. Only joins matches with no room code.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response**
```json
{ "matchId": "uuid" }
```

---

### `GET /games/uno/:matchId/state`

Get the current game state. Opponent hands are hidden — only card counts are implied via `hands` key count.

**Query params**

| Param | Type | Description |
|---|---|---|
| `sessionId` | string | Your session ID — used to hide opponent hands and compute `myRole`/`isMyTurn` |

**Response** — [Unified Game Response](#unified-game-response)

---

### `POST /games/uno/:matchId/start`

Start the first round. Host only. Requires ≥ 2 players seated at the table.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

---

### `POST /games/uno/:matchId/next-round`

Start the next round after someone wins. Host only. Only valid when `metadata.phase = "finished"`. Requires ≥ 2 players at the table. The winner's round win is recorded in `metadata.roundWins` before the new round begins.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

Errors: `"Can only start the next round after the current round ends."`, `"At least 2 players are required to start the next round."`, `"Only the room host can start the round"`.

---

### `POST /games/uno/:matchId/play`

Play a card (or multiple cards) from your hand. `color` is required when playing `wild` or `wild_draw4`.

**Single card**
```json
{ "sessionId": "uuid", "card": "red_7" }
```

**Wild card**
```json
{ "sessionId": "uuid", "card": "wild", "color": "blue" }
```

**Multi-card (same number, one turn)**

Play multiple number cards (0–9) that share the same value in a single turn. The first card must be playable on the current discard; subsequent cards only need to match the number. Wild, skip, reverse, draw2, and wild_draw4 cannot be combined this way.

```json
{ "sessionId": "uuid", "cards": ["red_7", "green_7", "blue_7"] }
```

**Draw stacking (+2 / +4)**

When `metadata.pendingDraw > 0`, the current player must either draw the full penalty (`POST /draw`) or counter with a draw2 or wild_draw4 to stack more onto the next player. Only one card can be played when stacking.

```json
{ "sessionId": "uuid", "card": "green_draw2" }
```

**Response** `{ "ok": true }`

Errors: `"Card is not in hand."`, `"Card is not playable on the current discard."`, `"A color must be chosen when playing a wild card."`, `"Only number cards (0–9) can be played together in one turn."`, `"All cards played together must share the same number."`, `"You must stack a +2 or +4, or draw N cards."`, `"You can only play one draw card when stacking."`.

---

### `POST /games/uno/:matchId/draw`

Draw a card. Behaviour depends on context:

- **No pending draw:** Draw one card. If the drawn card is playable, your turn does **not** pass — you may play it with `POST /play` or skip with `POST /pass`.
- **Pending draw penalty (`pendingDraw > 0`):** Draw all accumulated penalty cards at once. The turn **always passes** after a penalty draw — you cannot play any of the drawn cards.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

---

### `POST /games/uno/:matchId/pass`

After drawing a card that is playable, pass without playing it. Advances the turn to the next player.

Only valid immediately after a normal `draw` where the drawn card was playable (`drewThisTurn = true` in metadata). Calling this at any other time returns a 400 error.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

Errors: `"You can only pass after drawing a card."`

---

### `POST /games/uno/:matchId/end-game`

Close the room immediately. Host only. Valid at any point during an active match — does not wait for the current round to finish.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

Errors: `"Only the room host can start the round"`

---

## Games — Slave

Slave (also called President) is a trick-taking shedding game. Players race to empty their hand. The first to finish is **President**, the last is **Slave**. Each new round, lower-ranked players give their best cards to higher-ranked players.

**Action endpoints return `{ "ok": true }` only.** After any action, poll `GET /games/slave/:matchId/state` to get the updated game state.

**Beating rules:**
- Same count → higher rank wins (rank order: 3 low → 2 high)
- 3 cards always beats any 1 card (regardless of rank)
- 4 cards always beats any 2 cards (regardless of rank)
- No other cross-count combinations are valid

**Card format:** `{rank}{suit}` — e.g. `3♣`, `10♠`, `A♥`, `2♦`. Ranks low to high: `3 4 5 6 7 8 9 10 J Q K A 2`.

### `POST /games/slave/join`

Find or join a waiting public Slave match.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response**
```json
{ "matchId": "uuid" }
```

---

### `GET /games/slave/:matchId/state`

Get the current game state. Opponent hands are hidden — only card counts are implied.

**Query params**

| Param | Type | Description |
|---|---|---|
| `sessionId` | string | Your session ID |

**Response** — [Unified Game Response](#unified-game-response)

---

### `POST /games/slave/:matchId/start`

Start the first round. Host only. Requires ≥ 2 players seated at the table. All 52 cards are dealt evenly (some players may receive one extra card). The player dealt `3♣` goes first.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

---

### `POST /games/slave/:matchId/play`

Play one or more cards as a trick or to beat the current trick.

**Request**
```json
{ "sessionId": "uuid", "cards": ["3♣", "3♦"] }
```

Rules:
- All cards in `cards` must share the same rank (e.g. two 5s, three Ks).
- The play must beat the current trick according to the beating rules above.
- The player holding `3♣` must include it in their **first play** of each round.
- If the play empties your hand, you finish and are assigned a rank. The round continues until only one player remains.

**Response** `{ "ok": true }`

Errors: `"All played cards must have the same rank."`, `"Your first play must include the 3♣."`, `"Cannot beat the current trick (N cards, value V)."`, `"Card X is not in hand."`, `"Specify cards to play as an array."`.

---

### `POST /games/slave/:matchId/pass`

Pass on the current trick. Only valid when a trick is active — you cannot pass to start a new trick.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

Errors: `"You must play a card to start a new trick — you cannot pass."`

---

### `POST /games/slave/:matchId/next-round`

Start the next round after the current one ends. Host only. Only valid when `metadata.phase = "finished"`. Applies the rank-based card exchange before dealing new cards.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

Errors: `"Can only start the next round after the current round ends."`, `"Only the room host can start the round"`.

---

### `POST /games/slave/:matchId/end-game`

Close the room immediately. Host only.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

---

## Unified Game Response

`GET /:matchId/state` is the only endpoint that returns game state. Action endpoints (`POST /:matchId/fold`, `/bet`, `/play`, etc.) return `{ "ok": true }` only — poll state after every action to update the UI.

The state shape returned by `GET /:matchId/state`:

```json
{
  "players": ["sessionId1", "sessionId2"],
  "metadata": { ... },
  "playerNames":   { "sessionId1": "Alice", "sessionId2": "Bob" },
  "spectatorNames": { "sessionId3": "Charlie" },
  "hostId": "uuid",
  "myRole": "player" | "spectator",
  "matchStatus": "waiting" | "active" | "finished",
  "isMyTurn": true,
  "turnOrder": ["sessionId1", "sessionId2"],
  "betweenRoundsRemainingSec": 12,
  "revealRemainingSec": 8
}
```

| Field | Description |
|---|---|
| `players` | Ordered list of sessionIds currently seated at the table |
| `metadata` | Game-specific state (see shapes below) |
| `playerNames` | Map of sessionId → username for every player at the table |
| `spectatorNames` | Map of sessionId → username for every spectator in the room |
| `hostId` | Session ID of the current room host |
| `myRole` | Your current role: `"player"` or `"spectator"` |
| `matchStatus` | Overall match state: `"waiting"`, `"active"`, or `"finished"` |
| `isMyTurn` | `true` if it is currently your turn to act |
| `turnOrder` | All players in the order they will play, starting from the current player going in the current direction. Present for all games when a round is active (`phase !== "waiting"`). Use this to render the seat sequence. |
| `showdownRemainingSec` | Seconds until the showdown display auto-closes (always 10s). Only present during Poker `showdown` phase. `undefined` otherwise. |
| `revealRemainingSec` | Seconds remaining in the UNO reveal window after a round ends. During this window all hands are visible and `winner` is hidden — let players discover the winner by seeing the empty hand. Only present for UNO during the 10-second reveal window. `undefined` otherwise. |
| `betweenRoundsRemainingSec` | Seconds until the next hand auto-starts. Only present during Poker `between-rounds` when `betweenRoundsSec > 0`. `undefined` otherwise. |
| `turnRemainingSec` | Seconds remaining for the current player's turn. Only present during Poker when `turnTimeLimit > 0` and a turn is in progress. `undefined` otherwise. |
| `playerStates` | Per-player display map (Poker only, absent during `waiting` phase). See [Player States](#player-states-poker-only) below. |

---

### Player States (Poker only)

`playerStates` is a map of `sessionId → PlayerState`. It is present on every Poker response when `metadata.phase !== "waiting"`. It gives the frontend a single pre-computed object per seat — no need to cross-reference multiple metadata fields.

```json
{
  "playerStates": {
    "sessionId1": {
      "cards": ["A♠", "J♣"],
      "chips": 1010,
      "bet": 50,
      "totalBet": 120,
      "status": "active",
      "isCurrentPlayer": true,
      "isDealer": false,
      "isSB": true,
      "isBB": false,
      "showdownDecision": "pending"
    },
    "sessionId2": {
      "cards": ["fold", "fold"],
      "chips": 850,
      "bet": 0,
      "totalBet": 150,
      "status": "folded",
      "isCurrentPlayer": false,
      "isDealer": false,
      "isSB": false,
      "isBB": true
    },
    "sessionId3": {
      "cards": ["hidden", "hidden"],
      "chips": 0,
      "bet": 200,
      "totalBet": 200,
      "status": "allin",
      "isCurrentPlayer": false,
      "isDealer": true,
      "isSB": false,
      "isBB": false
    }
  }
}
```

| Field | Description |
|---|---|
| `cards` | `["A♠","J♣"]` — your own cards or opponent cards that were shown. `["hidden","hidden"]` — opponent's cards, still in hand but not yet revealed. `["fold","fold"]` — player folded, cards permanently hidden. |
| `chips` | Current chip stack (after this hand's payouts). |
| `bet` | Chips bet on the **current street only** (resets each street). |
| `totalBet` | Total chips committed across **all streets** this hand — use this for side-pot display. |
| `status` | `"active"` in hand with chips. `"folded"` folded this hand. `"allin"` still in hand but chips = 0. |
| `isCurrentPlayer` | `true` if it is currently this player's turn. |
| `isDealer` | `true` if this player is the dealer button this hand. |
| `isSB` | `true` if this player posted the small blind this hand. |
| `isBB` | `true` if this player posted the big blind this hand. |
| `showdownDecision` | Only present during `showdown` phase. `"show"` cards revealed. `"muck"` cards hidden. `"pending"` player hasn't decided yet. |

---

## Game State Shapes

### Poker `metadata`

```json
{
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
  "betweenRoundsUntil": "2026-05-21T10:01:00.000Z",
  "currentRound": 2,
  "handWinner": "sessionId2",
  "winner": null,
  "lastAction": "sessionId2 bet 100"
}
```

| Field | Description |
|---|---|
| `chips` | Each player's current chip stack |
| `bets` | Chips put in during the **current street only** — resets at each new street |
| `totalBets` | Cumulative chips put in across **all streets** this hand — used for side pot calculation |
| `lastRaiseAmount` | Size of the last raise this street; next raise must be at least this large (all-in exempt) |
| `sbIndex` / `bbIndex` | Index into `players` of the small and big blind for this hand |
| `handWinner` | Player who won the most recent hand. `null` before first hand ends |
| `winner` | Overall game winner. Only set when the game is `finished`. `null` while ongoing |
| `betweenRoundsUntil` | ISO timestamp when the between-rounds countdown ends and the next hand auto-starts. `null` outside `between-rounds` phase |

Opponent `hands` entries: `["hidden","hidden"]` while in play, `["fold","fold"]` after folding, or actual cards after showing at showdown. Your own cards are always actual values. Prefer using `playerStates[id].cards` — it combines all these cases in one place.

**Blinds:** SB = `startingChips / 100`, BB = `startingChips / 50`. For 1000-chip games: SB = 10, BB = 20. Preflop action starts at UTG (seat after BB). In heads-up the dealer posts the SB and acts first preflop.

**All-in:** When a player goes all-in and at most one opponent still has chips, remaining streets run out automatically. Side pots are calculated correctly. Ties split the pot equally (odd chip goes to the first winner by seat order).

**Card strings** use Unicode suit symbols: `♠ ♥ ♦ ♣` (e.g. `A♠`, `10♥`). To map to R2 asset keys, convert suit to its ASCII name (`♠→spades`, `♥→hearts`, `♦→diamonds`, `♣→clubs`) and join with `-`: `A♠ → cards/standard-deck/A-spades.svg`.

**Phases:** `waiting → preflop → flop → turn → river → showdown → between-rounds → preflop → …`

`showdown` is a stable display phase — `handWinner` is set and chips are already awarded. The phase lasts 10 seconds (`showdownRemainingSec`), then auto-advances to `between-rounds`. The host can skip it early with `POST /:matchId/next-round`.

**Mucking:** During showdown, non-winning players can choose to hide their cards (`POST /:matchId/muck`) or reveal them (`POST /:matchId/show`). The winner is always required to show. `metadata.showdownDecisions` shows each player's decision: `"show"`, `"muck"`, or `"pending"`. Only cards with `"show"` are revealed in the response — all others remain `["hidden", "hidden"]`. When all players have decided, the phase advances to `between-rounds` immediately (no need to wait for the 5-second timer). If the timer expires or the host presses `next-round`, remaining `"pending"` players are auto-mucked.

**Eliminated players:** at the end of each hand, players with 0 chips are automatically moved to spectator. They can call `PATCH /rooms/:code/role { role: "player" }` during `between-rounds` to rejoin with `startingChips`.

**Game end:** when `roundLimit > 0` and all rounds have been played — the last standing player is `metadata.winner`, `matchStatus` becomes `"finished"`.

**Room reset:** when all players bust out and only one player has chips remaining, the room resets automatically instead of closing. All seated players are moved to spectator, game state is wiped (settings preserved), and `matchStatus` returns to `"waiting"`. Players can rejoin as `"player"` during `between-rounds` or after the reset, and the host can start a fresh game.

---

### UNO `metadata`

```json
{
  "phase": "waiting | started | finished",
  "discard": ["red_7", "blue_skip"],
  "hands": {
    "sessionId1": ["green_2", "wild"],
    "sessionId2": ["hidden", "hidden", "hidden"]
  },
  "currentPlayer": "sessionId1",
  "currentPlayerIndex": 0,
  "direction": 1,
  "currentColor": "red",
  "lastCard": "blue_skip",
  "lastAction": "sessionId2 played blue_skip",
  "pendingDraw": 0,
  "drewThisTurn": false,
  "winner": null,
  "finishOrder": ["sessionId3"],
  "roundWins": { "sessionId1": 2, "sessionId2": 1 }
}
```

Opponent `hands` entries are `"hidden"` strings — the array length reveals how many cards they hold.

`direction` is `1` (clockwise) or `-1` (counter-clockwise, after a reverse card).

`currentPlayerIndex` is the index of `currentPlayer` in the `players` array. Together with `direction` this defines the full turn sequence — but prefer the top-level `turnOrder` field which pre-computes it.

`pendingDraw` is the total accumulated draw penalty (from stacked +2/+4 cards) waiting for the current player. If `> 0`, the current player must either draw that many cards (`POST /draw`) or stack another draw2/wild_draw4 (`POST /play`).

`drewThisTurn` is `true` when the current player already drew this turn and the drawn card is playable. They may `POST /play` to use it or `POST /pass` to skip.

`finishOrder` is the ordered list of players who have emptied their hand this round, earliest first. Players in this list are skipped during turn advancement. When only one player remains, they are automatically appended as the loser.

`roundWins` tracks how many rounds each player has won across the session. Persists across rounds and is never reset.

**Phases:** `waiting → started → finished → started → …` (repeats each round)

When `phase = "finished"`, the round is over. During the **10-second reveal window** (`revealRemainingSec` is present), all hands are shown and `winner` is hidden — let players discover who won by seeing the empty hand. After the window, hands hide again and `winner` is set. The host then calls `POST /next-round` to deal new cards. The room never closes automatically.

**Card format:** `{color}_{value}` — e.g. `red_0`, `blue_skip`, `yellow_reverse`, `green_draw2`, `wild`, `wild_draw4`.

---

### Slave `metadata`

```json
{
  "phase": "waiting | started | finished",
  "hands": {
    "sessionId1": ["3♣", "7♠", "A♥"],
    "sessionId2": ["hidden", "hidden", "hidden", "hidden"]
  },
  "currentPlayer": "sessionId1",
  "currentPlayerIndex": 0,
  "trick": {
    "count": 2,
    "value": 5,
    "playedBy": "sessionId2",
    "cards": ["8♣", "8♦"]
  },
  "consecutivePasses": 1,
  "finishOrder": ["sessionId3"],
  "ranks": { "sessionId3": "President", "sessionId1": "Vice President" },
  "winner": "sessionId3",
  "lastAction": "sessionId2 played 8♣ 8♦",
  "roundWins": { "sessionId3": 1 }
}
```

`trick` is the current active trick. `count` is the number of cards played, `value` is the rank index (0 = 3, 12 = 2), `playedBy` is who last played. `null` when no trick is active (start of round or after a trick is won).

`consecutivePasses` is the number of consecutive passes since the last play. When this equals the number of active players minus the last player to play, the trick is won and the leader plays again.

`finishOrder` lists players who have emptied their hand this round, earliest first. The last remaining player is automatically added as the final finisher (Slave) when only one active player remains.

`ranks` is set when `phase = "finished"`. Maps each player to their title: `"President"`, `"Vice President"`, `"Citizen"`, `"Vice Slave"`, `"Slave"`. Only `President` and `Slave` exist in 2–3 player games; `Vice President` and `Vice Slave` appear with 4+ players.

**Card exchange (between rounds):** When `POST /next-round` is called, cards are dealt fresh and ranks from the previous round trigger an automatic exchange before the round starts:
- Slave gives their **best N cards** to President; President gives their **worst N cards** to Slave. (`N = 2` for 4+ players, `N = 1` for 2–3 players.)
- Vice Slave gives their **best 1 card** to Vice President; Vice President gives their **worst 1 card** to Vice Slave. (4+ players only.)

`roundWins` counts how many rounds each player has finished as President.

---

## Games — Dummy (ดัมมี่)

Thai Dummy is a multi-round rummy-style game. Players draw, form melds, and race to empty their hand. Scores accumulate across rounds; highest total wins.

**Card format:** `{rank}{suit}` — e.g. `3♣`, `10♠`, `A♥`, `Q♠`. Suit symbols: ♣ ♦ ♥ ♠.

**Meld types:** Set (3–4 cards of the same rank) or Run (3+ consecutive ranks, same suit). Ace is high only (Q-K-A valid; A-2-3 invalid).

**Point values:** 2–9 = 5 pts, 10/J/Q/K = 10 pts, A = 15 pts, 2♣ = 50 pts, Q♠ = 50 pts, opening discard card = 50 pts.

**Action endpoints return `{ "ok": true }` only.** Poll `GET /games/dummy/:matchId/state` after every action.

### `POST /games/dummy/join`

Find or join a waiting public Dummy match.

**Request** `{ "sessionId": "uuid" }` **Response** `{ "matchId": "uuid" }`

---

### `GET /games/dummy/:matchId/state`

**Query params** `sessionId` — hides opponent hands, computes `myRole`/`isMyTurn`.

**Response** — [Unified Game Response](#unified-game-response)

---

### `POST /games/dummy/:matchId/start`

Start round 1. Host only. Requires 3–5 players. Cards dealt: 3 players → 9 cards, 4 → 7 cards, 5 → 5 cards. First card of the remaining deck is flipped to start the discard pile (worth 50 pts to whoever lays it).

**Request** `{ "sessionId": "uuid" }` **Response** `{ "ok": true }`

---

### `POST /games/dummy/:matchId/draw`

Draw one card from the stock pile. Must be your first action of the turn.

**Request** `{ "sessionId": "uuid" }` **Response** `{ "ok": true }`

Errors: `"You have already drawn this turn."`, `"Stock pile is empty. Draw from the discard pile instead."`

---

### `POST /games/dummy/:matchId/draw-discard`

Draw from the discard pile. Takes the target card **plus all cards below it** (newer cards). The target card **must be included in a lay action this turn**.

The discard pile is ordered oldest-at-top (`discardPile[0]`) to newest-at-bottom (`discardPile[last]`). Targeting an older card takes it and all newer cards beneath it.

**Request**
```json
{ "sessionId": "uuid", "card": "K♠" }
```

`card` — the target card to draw (and all cards below it in the pile).

**Response** `{ "ok": true }`

Errors: `"You have already drawn this turn."`, `"K♠ is not in the discard pile."`

---

### `POST /games/dummy/:matchId/lay`

Lay down a new meld from your hand onto the table. Requires at least 3 cards. If you drew from the discard pile, the target card must be included.

**Request**
```json
{ "sessionId": "uuid", "cards": ["K♣", "K♦", "K♥"] }
```

**Response** `{ "ok": true }`

Errors: `"A meld requires at least 3 cards."`, `"Invalid meld. Must be a set (3–4 same rank) or run (3+ consecutive same suit, A is high only)."`, `"Card X is not in your hand."`, `"You must include X (drawn from discard pile) in this meld."`

---

### `POST /games/dummy/:matchId/fak`

Add one card from your hand to an existing meld on the table (ฝาก). You must have laid down at least one meld yourself this round.

**Request**
```json
{ "sessionId": "uuid", "card": "K♠", "meldIndex": 0 }
```

`meldIndex` — index of the meld in `metadata.melds[]`.

**Response** `{ "ok": true }`

Errors: `"You must lay down a meld before you can ฝาก."`, `"Cannot add K♠ to that meld."`, `"Invalid meld index."`

---

### `POST /games/dummy/:matchId/discard`

Discard one card to end your turn. You must have drawn first. If you drew from the discard pile, you must have laid the target card first.

Discarding a card that could have been **ฝาก'd** onto an existing meld incurs a **-50 point penalty** (melds are visible on the table). Discarding a card that could form a new meld from hand cards only is not penalised.

**Request**
```json
{ "sessionId": "uuid", "card": "5♦" }
```

**Response** `{ "ok": true }`

Errors: `"You must draw before discarding."`, `"You must lay down X (drawn from discard pile) before discarding."`, `"Card X is not in your hand."`

---

### `POST /games/dummy/:matchId/next-round`

Start the next round. Host only. Only valid during `between-rounds`.

**Request** `{ "sessionId": "uuid" }` **Response** `{ "ok": true }`

---

### `POST /games/dummy/:matchId/end-game`

Close the room immediately. Host only.

**Request** `{ "sessionId": "uuid" }` **Response** `{ "ok": true }`

---

### Dummy `metadata`

```json
{
  "phase": "waiting | started | between-rounds | finished",
  "hands": {
    "sessionId1": ["K♣", "7♦", "A♠"],
    "sessionId2": ["hidden", "hidden", "hidden", "hidden"]
  },
  "stockCount": 24,
  "discardPile": ["3♣", "8♥", "Q♦"],
  "melds": [
    {
      "owner": "sessionId1",
      "cards": ["5♣", "6♣", "7♣", "4♣"],
      "contributions": [
        { "player": "sessionId1", "card": "5♣" },
        { "player": "sessionId1", "card": "6♣" },
        { "player": "sessionId1", "card": "7♣" },
        { "player": "sessionId2", "card": "4♣" }
      ]
    }
  ],
  "hasLaidDown": { "sessionId1": true, "sessionId2": true },
  "currentPlayer": "sessionId1",
  "currentPlayerIndex": 0,
  "drewThisTurn": false,
  "drewDiscardTarget": null,
  "openingCard": "3♣",
  "discardPenalties": { "sessionId1": 0, "sessionId2": 50 },
  "totalScores": { "sessionId1": 120, "sessionId2": 80 },
  "currentRound": 2,
  "totalRounds": 5,
  "lastAction": "sessionId1 laid down 5♣ 6♣ 7♣",
  "roundScores": null,
  "roundWinner": null,
  "winner": null
}
```

| Field | Description |
|---|---|
| `discardPile` | Full pile, visible to all. `[0]` = oldest (top), `[last]` = newest (bottom, last discarded). |
| `melds` | All laid-down melds on the table. Public. `owner` is the player who laid it. |
| `hasLaidDown` | Whether each player has laid down at least one meld this round. |
| `drewThisTurn` | `true` if the current player has already drawn. They must now lay/fak/discard. |
| `drewDiscardTarget` | Card drawn from discard that must appear in a `lay` action before discarding. `null` otherwise. |
| `stockCount` | Number of cards remaining in the stock pile (contents hidden). |
| `openingCard` | The first card of the discard pile — worth 50 pts to whoever lays it. |
| `discardPenalties` | Accumulated -50 pt penalties this round per player (discarding a playable card). |
| `totalScores` | Cumulative scores across all completed rounds. |
| `roundScores` | Scores for the just-completed round. `null` while a round is in progress. |
| `roundWinner` | Who went out this round. `null` while in progress. |
| `winner` | Overall game winner (set when `phase = "finished"`). |

**Round scoring:** Laid cards = positive points. Cards in hand at round end = negative points. +50 for going out. -50 per discard-penalty event. Players who never laid down get ×2 on their hand penalty (dummy rule). If the round winner's total laid cards are all one suit: other players' hand penalties ×2 (single-suit knock). If winner also never laid down: ×4 (blind single-suit knock).

**Discard penalty (-50):** Only triggered when the discarded card could have been ฝาก'd onto a visible meld (requires `hasLaidDown = true`). Discarding a card that could form a new meld from hand is not penalised.

**Feeding penalty (-50):** If the very next player draws your just-discarded card (bottom of discard pile) and goes out that turn, you receive an additional -50 penalty.

**Phases:** `waiting → started → between-rounds → started → …` (host triggers `next-round`). After `totalRounds` rounds, `phase = "finished"` and `matchStatus = "finished"`.

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
- `"Only the room host can start the round"` — start/next-round sent by a non-host
- `"You are not seated at this table."` — submitting a game action while you are a spectator
- `"It is not your turn."` — another player must move first
- `"At least 2 players are required to start poker."` — need more players
- `"At least 2 players are required to start UNO."` — need more players
- `"At least 2 players are required to start."` — need more players (Slave)
- `"All played cards must have the same rank."` — Slave cards must be a valid set
- `"Your first play must include the 3♣."` — first trick of Slave round must contain 3♣
- `"You must play a card to start a new trick — you cannot pass."` — Slave pass with no active trick
- `"Cannot check — there is a bet to call."` — use `call` or `bet` to match `currentBet`
- `"amount must be a positive number"` — invalid bet amount sent to `/bet`
- `"Insufficient chips. You have N."` — bet exceeds your chip stack
- `"Minimum raise is N (raise by at least N). You raised by M."` — raise too small (all-in exempt)
- `"Card is not in hand."` — UNO card not in your hand
- `"Card is not playable on the current discard."` — UNO card doesn't match
- `"A color must be chosen when playing a wild card."` — missing `color` field
- `"Only the room host can change settings"` — PATCH /rooms settings by non-host
- `"Only the room host can kick players"` — DELETE /rooms player by non-host
- `"Can only change settings before the game starts or between rounds"` — settings change outside safe phase
- `"Can only kick players before the game starts or between rounds"` — kick outside safe phase
- `"Table is full"` — room has reached `maxPlayers` when trying to join as player
- `"Can only change role before the game starts or between rounds"` — role/leave action outside permitted phase

---

## Typical flows

**Public matchmaking — Poker**
```
1. POST /auth { username }                      → save sessionId
2. POST /games/poker/join { sessionId }         → get matchId  (second player does the same)
3. poll GET /games/poker/:matchId/state         → wait until ≥ 2 players, matchStatus = "waiting"
4. POST /games/poker/:matchId/start { sessionId }   (host only)
5. poll GET /games/poker/:matchId/state         → render board
6. POST /games/poker/:matchId/fold|check|call|bet   → take your turn (isMyTurn = true)
7. repeat 5–6 until matchStatus = "finished"
```

**Private room — Poker**
```
1. POST /auth { username }                      → save sessionId
2. POST /rooms/create { sessionId, gameId: "poker" } → get matchId + roomCode (host)
   share roomCode with friends
3. POST /rooms/join { sessionId, roomCode }     → everyone joins as spectator
4. PATCH /rooms/:code/role { sessionId, role: "player" } → sit at the table
5. poll GET /rooms/:code?sessionId=             → wait until playerCount ≥ 2
6. POST /games/poker/:matchId/start { sessionId }   (host only)
7. poll GET /games/poker/:matchId/state         → render board, players take turns
8. POST /games/poker/:matchId/fold|check|call|bet   → take your turn
   … hand ends, matchStatus stays "active", metadata.phase = "between-rounds" …
9. PATCH /rooms/:code/role                      → join or leave the table (any member)
10. POST /games/poker/:matchId/next-round       → start next hand (host only)
11. repeat 7–10 until matchStatus = "finished"
```

**Private room — UNO**
```
1. POST /auth { username }
2. POST /rooms/create { sessionId, gameId: "uno" } → get matchId + roomCode
3. POST /rooms/join { sessionId, roomCode }     → join as spectator
4. PATCH /rooms/:code/role { sessionId, role: "player" }
5. POST /games/uno/:matchId/start { sessionId } → host starts (≥ 2 players)
6. poll GET /games/uno/:matchId/state
7. if isMyTurn:
   - play:  POST /play { card } or { cards: [...] } or { card: "wild", color }
   - draw:  POST /draw  (if drawn card playable, turn stays; play it or POST /pass)
   - stack: POST /play { card: "green_draw2" }  (when pendingDraw > 0)
8. when phase = "finished": wait for revealRemainingSec, then host calls POST /next-round
9. repeat 6–8; host calls POST /end-game to close the room
```

**Private room — Slave**
```
1. POST /auth { username }
2. POST /rooms/create { sessionId, gameId: "slave" } → get matchId + roomCode
3. POST /rooms/join { sessionId, roomCode }     → join as spectator
4. PATCH /rooms/:code/role { sessionId, role: "player" }
5. POST /games/slave/:matchId/start { sessionId } → host starts (≥ 2 players)
6. poll GET /games/slave/:matchId/state
7. if isMyTurn:
   - play: POST /play { cards: ["3♣", "3♠"] }  (must include 3♣ on first play)
   - pass: POST /pass  (only when a trick is active)
8. when phase = "finished": host calls POST /next-round
   (card exchange is applied automatically before new round starts)
9. repeat 6–8; host calls POST /end-game to close the room
```

**Spectator joining mid-game / switching roles**
```
1. POST /rooms/join { roomCode }                → join as spectator anytime
2. GET /games/poker/:matchId/state?sessionId=   → watch the game (myRole = "spectator")
3. (during between-rounds)
   PATCH /rooms/:code/role { role: "player" }   → join the next hand
4. (during between-rounds)
   PATCH /rooms/:code/role { role: "spectator" } → leave the table
5. DELETE /rooms/:code/leave                    → leave the room entirely
```

**Reconnection after disconnect**
```
1. POST /auth { sessionId }         → resume; response includes activeMatches
   if "Session not found" → POST /auth { username } to create a new session
2. pick the match from activeMatches (matchId + gameId)
3. GET /games/poker/:matchId/state?sessionId=   → restore board from saved state
4. resume taking turns (isMyTurn will tell you if it's your move)
```

---

## Blackjack

Players vs. a dealer. Two dealer modes: `bot` (house dealer) or `rotate` (players take turns). Chip-based betting. Multi-round. Players who reach 0 chips become spectators.

### Endpoints

| Method | Path | Body |
|--------|------|------|
| POST | `/games/blackjack/join` | `{ sessionId }` |
| GET | `/games/blackjack/:matchId/state` | query: `sessionId` |
| POST | `/games/blackjack/:matchId/start` | `{ sessionId, bankerMode?: "bot"\|"rotate" }` |
| POST | `/games/blackjack/:matchId/bet` | `{ sessionId, amount }` |
| POST | `/games/blackjack/:matchId/hit` | `{ sessionId }` |
| POST | `/games/blackjack/:matchId/stand` | `{ sessionId }` |
| POST | `/games/blackjack/:matchId/double-down` | `{ sessionId }` |
| POST | `/games/blackjack/:matchId/split` | `{ sessionId }` |
| POST | `/games/blackjack/:matchId/next-round` | `{ sessionId }` |
| POST | `/games/blackjack/:matchId/end-game` | `{ sessionId }` |

### Phases

```
waiting
  → host calls /start (with bankerMode)
betting  (non-dealer players place bets)
  → last bet placed → cards dealt automatically
playing  (players take turns vs dealer)
  → all players done → dealer auto-plays → results calculated
between-rounds  (show results)
  → host calls /next-round (or betweenRoundsSec timer)
betting  (next round — dealer rotates if rotate mode)
  ...repeat...
finished  (roundLimit reached or host ends game)
```

### State Fields (`metadata`)

| Field | Description |
|-------|-------------|
| `phase` | `waiting` \| `betting` \| `playing` \| `between-rounds` \| `finished` |
| `bankerMode` | `"bot"` or `"rotate"` |
| `dealerId` | Session ID of current dealer in rotate mode (`null` in bot mode) |
| `dealerHand` | Dealer cards. During `betting`/`playing`: `["A♠", "hidden"]` (hole card hidden) |
| `hands[playerId]` | Array of hands — `string[][]`. Normally 1 hand; 2–4 after splits |
| `bets[playerId]` | Bet per hand — `number[]` |
| `handStatus[playerId]` | Per-hand status — `("active"\|"stood"\|"bust"\|"blackjack")[]` |
| `activeHandIndex[playerId]` | Which hand index the player is currently playing |
| `betsPlaced[playerId]` | `true` once the player has placed their bet this round |
| `chips[playerId]` | Current chip count (bet already deducted for the current round) |
| `currentPlayer` | Session ID of the player whose turn it is (`null` during betting/between-rounds) |
| `results[playerId]` | Per-hand outcome — `("win"\|"lose"\|"push"\|"blackjack")[]`. Set after dealer plays |
| `netChips[playerId]` | Net chip change for this round per player (includes dealer in rotate mode) |
| `deckSize` | Cards remaining in the shoe |
| `currentRound` | Current round number |
| `winner` | Session ID of winner when `phase = "finished"` |

### Rules

- **`bankerMode`:** defaults to `"bot"`. Rotate mode requires ≥ 2 players.
- **Bet phase:** each non-dealer player must call `/bet`. When the last player bets, cards are dealt and `phase` → `playing`. In rotate mode, the dealer (`dealerId`) cannot bet.
- **Rotate mode chip flow:** bets transfer to the dealer's stack at bet time. At resolution, payouts mirror back — chips are zero-sum between the dealer and each player. `netChips[dealerId]` = negative sum of all player net changes.
- **Turn order:** `isMyTurn = true` when it's your turn during `playing` phase. The dealer never takes a player turn — the bot always runs the dealer hand automatically.
- **Hit/Stand/Double-Down/Split:** only available when `isMyTurn = true` and `phase = "playing"`.
- **Double-down:** only on the initial 2-card hand; requires chips ≥ current bet.
- **Split:** two cards of the same value (10/J/Q/K all count as equal). Requires chips ≥ current bet. Max 4 hands (3 splits). Split 21 pays 1:1, not 3:2.
- **Dealer:** hits on soft 17 or below; stands on hard 17+. Plays after all players finish.
- **Payouts:** natural blackjack = 3:2 · win = 1:1 · push = refund · bust/lose = 0.
- **Dealer rotation:** after each round, `dealerId` advances to the next seated player.
- **Bust to spectator:** players with 0 chips after a round are moved to spectator (same as poker).

### Example round flow

```
1. All non-dealer players call POST /bet { amount }
   → when last bet is placed, cards are dealt and phase → "playing"
2. isMyTurn player calls: /hit, /stand, /double-down, or /split
3. Repeat until all player hands are resolved
   → dealer auto-plays, results set, phase → "between-rounds"
4. Poll GET /state — read results[myId] and netChips[myId]
5. Host calls POST /next-round (dealer rotates automatically in rotate mode)
```

---

## Pok Deng (ป๊อกเด้ง)

Players vs. banker. Two modes: `bot` (house banker) or `rotate` (players take turns). 1 deck reshuffled each round.

### Endpoints

| Method | Path | Body |
|--------|------|------|
| POST | `/games/pokdeng/join` | `{ sessionId }` |
| GET | `/games/pokdeng/:matchId/state` | query: `sessionId` |
| POST | `/games/pokdeng/:matchId/start` | `{ sessionId, bankerMode: "bot"\|"rotate" }` |
| POST | `/games/pokdeng/:matchId/bet` | `{ sessionId, amount }` |
| POST | `/games/pokdeng/:matchId/draw` | `{ sessionId }` |
| POST | `/games/pokdeng/:matchId/stand` | `{ sessionId }` |
| POST | `/games/pokdeng/:matchId/next-round` | `{ sessionId }` |
| POST | `/games/pokdeng/:matchId/end-game` | `{ sessionId }` |

### State Fields (`metadata`)

| Field | Description |
|-------|-------------|
| `phase` | `waiting` \| `betting` \| `drawing` \| `between-rounds` \| `finished` |
| `bankerMode` | `"bot"` or `"rotate"` |
| `bankerId` | Session ID of current banker (`null` in bot mode) |
| `hands[playerId]` | Player's cards (own: actual; others: `["hidden",...]` during betting/drawing) |
| `botHand` | Bot's cards (bot mode; `["hidden",...]` during betting/drawing) |
| `bets[playerId]` | Bet this round (non-bankers only) |
| `betsPlaced[playerId]` | Whether player has bet |
| `chips[playerId]` | Current chip count |
| `currentPlayer` | Session ID whose draw/stand turn it is |
| `results[playerId]` | `{ outcome, payout, playerValue, bankerValue, playerDeng, bankerDeng }` |
| `currentRound` | Current round number |
| `winner` | Session ID of winner when `phase = "finished"` |

### Rules summary

- **Bet phase:** all non-banker players bet. When last bet lands, cards dealt automatically.
- **Drawing:** total 0–5 → choose draw/stand · total 6–9 → auto-stand (no turn given).
- **Banker Pok:** if banker/bot has 8–9, no one draws — round resolves immediately.
- **Bot draw:** auto-draws if total ≤ 4.
- **Deng:** ตอง / สเตรทฟลัช = ×5 · เรียง / สี (3-card) = ×3 · คู่ / same-suit = ×2 · normal = ×1.
- **Payout:** winner's deng × bet. Tiebreaker = higher deng. Full tie = push.

---

## Old Maid (ไพ่แมวดำ)

Thai card game with a 53-card deck (52 standard + 1 Joker). Players sit in a circle, blindly picking one card from the player on their left. Pairs are discarded. The last player holding the unpaired Joker loses.

### Endpoints

| Method | Path | Body |
|--------|------|------|
| POST | `/games/oldmaid/join` | `{ sessionId }` |
| GET | `/games/oldmaid/:matchId/state` | query: `sessionId` |
| POST | `/games/oldmaid/:matchId/start` | `{ sessionId }` |
| POST | `/games/oldmaid/:matchId/pick` | `{ sessionId, index }` |
| POST | `/games/oldmaid/:matchId/set-shuffle-mode` | `{ sessionId, mode }` |
| POST | `/games/oldmaid/:matchId/reorder-hand` | `{ sessionId, cards }` |
| POST | `/games/oldmaid/:matchId/next-round` | `{ sessionId }` |
| POST | `/games/oldmaid/:matchId/end-game` | `{ sessionId }` |

**Important:** `start`, `pick`, `set-shuffle-mode`, `reorder-hand`, and `next-round` all return the **full game state** directly (same shape as `GET /state`) — no need to poll after these actions.

`end-game` returns `{ "ok": true }`. After calling it, the match is deleted from the server. Navigate to `GET /matches/:matchId/summary` for the final results.

### Flow

```
1. POST /start → returns full game state; cards dealt, pairs auto-discarded
2. Poll GET /state (or use response from last action)
3. isMyTurn → POST /pick { index }  (index into the left player's face-down hand)
                  └→ returns full state immediately (no poll needed)
4. Server auto-discards new pairs; phase stays "playing" until one player is left with the Joker
5. Round ends: metadata.phase = "between-rounds", metadata.loser set
6. Host calls POST /next-round → new round starts, losses tallied, round counter increments
7. Repeat steps 2–6 indefinitely; host calls POST /end-game to close the room
```

### Shuffle modes

Each player independently controls whether their hand is randomised before others pick from it. Toggle anytime during `playing` phase.

| Mode | Behaviour |
|------|-----------|
| `"auto"` (default) | Server shuffles the player's hand order before each pick. Joker position is always random. |
| `"manual"` | Hand order stays fixed. Player arranges it themselves via `POST /reorder-hand`. |

**`POST /set-shuffle-mode`** — body: `{ sessionId, mode: "auto" | "manual" }`

**`POST /reorder-hand`** — manual mode only. Body: `{ sessionId, cards: string[] }` — the player's full hand in the desired order. Server validates it is a permutation of their current hand. Errors: `"Switch to manual mode to reorder your hand"`, `"Must include all N card(s) in hand"`, `"Card X is not in your hand"`.

### State fields (`metadata`)

| Field | Description |
|-------|-------------|
| `phase` | `"waiting"` \| `"playing"` \| `"between-rounds"` |
| `hands[playerId]` | Own hand: actual card strings. Others: `["hidden", ...]` (length = card count) |
| `handSize[playerId]` | Card count per player — always present, even for opponent hands. Use this instead of `hands[id].length` for opponents. |
| `discarded[playerId]` | All pairs this player has discarded so far — `string[][]` (each entry is a pair) |
| `initialDiscards[playerId]` | Pairs auto-discarded at game start — use for opening animation |
| `shuffleMode[playerId]` | `"auto"` or `"manual"` per player |
| `currentPlayer` | Session ID whose turn it is to pick |
| `currentPlayerIndex` | Index of `currentPlayer` in `players` array |
| `pickFrom` | Session ID of the player whose cards are tappable right now (the pick target). Use this instead of `turnOrder[1]` — it correctly skips eliminated players. `null` when not in `playing` phase. |
| `eliminated` | Players who emptied their hand (safe). Still in `players[]`, skipped in turn order. |
| `loser` | Session ID of the player left with the Joker when the round ends. `null` while in progress. |
| `round` | Current round number (starts at 1). |
| `losses[playerId]` | How many rounds each player has lost (held the Joker at round end). |
| `lastPick` | `{ picker, from, card, newPairs }` — result of the most recent pick. `card` visible to all. |
| `lastAction` | Human-readable description of the last event |

**`phase = "between-rounds"`** means the round just ended. `loser` is set. The host calls `POST /next-round` to start the next round. This is also the terminal state while the host has not yet ended the match — the game loops through rounds indefinitely until `POST /end-game` is called.

**Why use `pickFrom` not `turnOrder[1]`?** `turnOrder[1]` is the second player in the full sequence, which may include eliminated players. `pickFrom` mirrors the server's `getLeftPlayer` logic exactly — it skips eliminated players and empty hands to always point to the correct tappable seat.

### Pair rules

- Same rank, any suit = a pair (e.g. `A♠` + `A♥`)
- 4-of-a-kind = 2 pairs, all four cards discarded
- The Joker has no pair and is never discarded

### Notes

- Eliminated players stay in the circle (still in `players[]`) — they are skipped when determining whose left neighbour to pick from, and skipped in turn advancement.
- `lastPick.card` is always revealed in the response — show the picked card to all players for the animation.
- `turnOrder` is present in the unified response and gives the pick sequence starting from the current player.

---

## Doraemon (drinking card game)

A Thai party drinking game using a standard 52-card deck. Players sit in a circle, each drawing one card per turn. Cards trigger drinks, mini-games, or ongoing effects. No winners — game ends when the deck is empty.

**Rule:** No pointing allowed (Doraemon has no hands). Violations are reportable.

### Endpoints

| Method | Path | Body |
|--------|------|------|
| POST | `/games/doraemon/join` | `{ sessionId }` |
| GET | `/games/doraemon/:matchId/state` | query: `sessionId` |
| POST | `/games/doraemon/:matchId/start` | `{ sessionId }` |
| POST | `/games/doraemon/:matchId/draw` | `{ sessionId }` |
| POST | `/games/doraemon/:matchId/choose-buddy` | `{ sessionId, target }` |
| POST | `/games/doraemon/:matchId/set-category` | `{ sessionId, topic }` |
| POST | `/games/doraemon/:matchId/report-loser` | `{ sessionId, target }` |
| POST | `/games/doraemon/:matchId/set-k-rule` | `{ sessionId, text }` |
| POST | `/games/doraemon/:matchId/use-bathroom-pass` | `{ sessionId }` |
| POST | `/games/doraemon/:matchId/trigger-gesture` | `{ sessionId }` |
| POST | `/games/doraemon/:matchId/report-gesture-loser` | `{ sessionId, target }` |
| POST | `/games/doraemon/:matchId/report-talking` | `{ sessionId, talker }` |
| POST | `/games/doraemon/:matchId/report-pointing` | `{ sessionId, offender }` |
| POST | `/games/doraemon/:matchId/end-game` | `{ sessionId }` |

### Card effects

| Card | Effect |
|------|--------|
| A | Drawer drinks 1 sip |
| 2 | Drawer drinks 2 sips |
| 3 | Drawer drinks 3 sips |
| 4 | Drawer drinks 4 sips |
| 5 | Buddy selection — drawer picks a buddy (`POST /choose-buddy { target }`); from now on, whenever either drinks the other drinks too |
| 6 | Category game — drawer types a topic via `POST /set-category { topic }`; players say items verbally; loser reported via `POST /report-loser { target }` |
| 7 | Number 7 game — players count aloud, skipping numbers ending in 7 or divisible by 7; loser reported via `POST /report-loser { target }` |
| 8 | Bathroom pass — drawer gains 1 pass (`bathroomPasses[id]`); use anytime via `POST /use-bathroom-pass` |
| 9 | Left player drinks 1 sip (counter-clockwise neighbour) |
| 10 | Right player drinks 1 sip (clockwise neighbour) |
| J | Gesture power — drawer becomes the gesture holder and can trigger pose challenges anytime via `POST /trigger-gesture`; anyone reports the loser via `POST /report-gesture-loser { target }`. Power stays with the drawer until another J is drawn. |
| Q | Drawer is silenced — anyone who talks to them drinks 1 sip, reported via `POST /report-talking { talker }`. Stays silenced until another Q is drawn. |
| K | Rule builder — K1 sets WHAT (typed text), K2 sets WHERE, K3 sets HOW LONG; K4 announces and executes the rule, then resets |

All drink events propagate through the full buddy chain. If A→B are buddies and B→C are buddies, A drinking also makes B and C drink.

### Phases

```
waiting → playing → (pending-buddy | pending-category | pending-minigame | pending-k-rule) → playing → … → finished
```

| Phase | What's happening |
|-------|-----------------|
| `waiting` | Lobby, waiting for players and host to start |
| `playing` | Normal turn — current player calls `POST /draw` |
| `pending-buddy` | Drawer chose 5 — must call `POST /choose-buddy { target }` |
| `pending-category` | Drawer chose 6 — must call `POST /set-category { topic }` to name the category |
| `pending-minigame` | Category/number7 mini-game active — anyone can call `POST /report-loser { target }` |
| `pending-k-rule` | Drew K (1st–3rd) — drawer must call `POST /set-k-rule { text }` |
| `finished` | Deck exhausted or host ended game |

### State fields (`metadata`)

| Field | Description |
|-------|-------------|
| `phase` | Current game phase (see above) |
| `deckSize` | Cards remaining (deck contents hidden) |
| `discardPile` | All drawn cards in order |
| `drawnCard` | The card drawn this turn (visible to all) |
| `currentPlayer` | Session ID whose turn it is to draw |
| `currentPlayerIndex` | Index of `currentPlayer` in `players` array |
| `drinks` | `Record<playerId, number>` — accumulated sip count per player |
| `bathroomPasses` | `Record<playerId, number>` — unused bathroom pass count |
| `buddies` | `Record<playerId, playerId>` — symmetric buddy pairs |
| `silenced` | Session ID of the currently silenced player (`null` if none). Clears when another Q is drawn. |
| `jHolder` | Session ID of the player who currently holds the J gesture power (`null` if not yet drawn). Clears when another J is drawn. |
| `gesturePending` | `true` when a gesture challenge is active and awaiting `POST /report-gesture-loser` |
| `kRules` | `{ what, where, howLong, count }` — partial K rule being built |
| `pendingMinigame` | `{ type: 'category'\|'number7', topic? }` or `null` (only from cards 6 and 7) |
| `lastAction` | Human-readable description of the last action |

### Reporting actions (any player, any time during game)

**`POST /trigger-gesture`** — J holder only. Starts a gesture (pose) challenge. Sets `gesturePending = true`. Only valid during `playing` phase.

**`POST /report-gesture-loser { target }`** — Any player. Reports who was last to mimic the pose; `target` drinks 1 sip. Only valid while `gesturePending = true`.

**`POST /report-talking { talker }`** — Any player. Reports someone who talked to the silenced player. `talker` drinks 1 sip. Requires an active silenced player.

**`POST /report-pointing { offender }`** — Any player. Reports someone for pointing (house rule). `offender` drinks 1 sip.

**`POST /use-bathroom-pass`** — Use one of your bathroom passes. Requires `bathroomPasses[you] > 0`.

### Notes

- Buddy from card 5 is replaced if either buddy draws another 5 later.
- The 4th K executes the rule immediately on draw (no text input). K rule resets to start.
- Drawing K4 before K1–K3 are set will still execute with whatever partial text was stored (`"?"` for missing parts).
- If a player disconnects mid-turn during `pending-buddy`, `pending-category`, or `pending-k-rule`, the pending phase auto-resolves and the next player's turn begins.

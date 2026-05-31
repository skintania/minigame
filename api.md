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

**Player inactivity timeout:** Any player who has not called a game endpoint (`GET /games/:matchId/state` or any action) for **5 minutes** is automatically kicked. What happens depends on the game phase:
- `waiting`: removed from the room entirely. Room is deleted if it becomes empty.
- `between-rounds` / `showdown`: moved to spectator.
- Mid-hand (`preflop`–`river`): folded out immediately, moved to spectator. If only one player is left active, the hand ends and pot is awarded. Kicked players can rejoin as `player` role during `between-rounds`.

The scheduled cleanup job also removes players inactive for **30 minutes** across all rooms.

**Response**
```json
{ "matchId": "uuid", "roomCode": "843921" }
```

---

### `POST /rooms/join`

Join a private room using its 6-digit code. You always join as a **spectator** first. To sit at the table and play, call `PATCH /rooms/:code/role` after joining.

Joining works whether the room is `waiting` or `active` — you can drop into an ongoing game to watch at any time.

**Request**
```json
{ "sessionId": "uuid", "roomCode": "843921" }
```

**Response**
```json
{ "matchId": "uuid", "gameId": "poker" }
```

Errors: `"Room not found"`, `"Room is no longer open"` (room is `finished`).

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
{ "sessionId": "uuid", "maxPlayers": 4, "startingChips": 500, "turnTimeLimit": 60, "roundLimit": 5, "betweenRoundsSec": 30 }
```

**Response** — echoes back the fields that were updated
```json
{ "roomCode": "843921", "maxPlayers": 4, "startingChips": 500, "turnTimeLimit": 60, "roundLimit": 5, "betweenRoundsSec": 30 }
```

Errors: `"Only the room host can change settings"`, `"Can only change settings before the game starts or between rounds"`, `"Cannot set max_players below current player count (n)"`, `"At least one setting (maxPlayers, startingChips, turnTimeLimit, roundLimit, or betweenRoundsSec) is required"`.

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
  "gameId": "poker" | "uno"
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

Start the game. Host only. Requires ≥ 2 players seated at the table.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

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
- **Pending draw penalty (`pendingDraw > 0`):** Draw all pending cards at once. Turn always passes after a penalty draw; you cannot play the drawn cards.

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

### `POST /games/uno/:matchId/next-round`

Start the next round. Host only. Only valid when `phase === "finished"` and the reveal window has ended (`revealRemainingSec` is `null`). Deals new hands and begins a new round in the same match.

**Request**
```json
{ "sessionId": "uuid" }
```

**Response** `{ "ok": true }`

Errors: `"Only the room host can start the round"`, `"Round is not over yet."`.

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
  "betweenRoundsRemainingSec": 12
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
| `showdownRemainingSec` | Seconds until the showdown display auto-closes (always 10s). Only present during Poker `showdown` phase. `undefined` otherwise. |
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
  "direction": 1,
  "currentColor": "red",
  "lastCard": "blue_skip",
  "winner": null,
  "lastAction": "sessionId2 played blue_skip",
  "pendingDraw": 0,
  "drewThisTurn": false,
  "roundWins": { "sessionId1": 2, "sessionId2": 1 }
}
```

Opponent `hands` entries are `"hidden"` strings — the array length reveals how many cards they hold.

`direction` is `1` (clockwise) or `-1` (counter-clockwise, after a reverse card).

`pendingDraw` is the total accumulated draw penalty (from stacked +2/+4 cards) waiting for the current player. If `> 0`, the current player must either draw that many cards (`POST /draw`) or stack another draw2/wild_draw4 (`POST /play`).

`drewThisTurn` is `true` when the current player already drew this turn and the drawn card is playable. They may `POST /play` to use it or `POST /pass` to skip.

`roundWins` tracks cumulative round wins per `sessionId` across all rounds in this match session. Updated after each round ends.

**Finished phase:** when a player plays their last card, `phase` becomes `"finished"`, `winner` is set, and `revealRemainingSec` counts down from 10 (top-level field on the state response, alongside `isMyTurn`). During this window all hands are revealed. Once `revealRemainingSec` is `null`, the host may call `POST /next-round` to begin a new round.

**Card format:** `{color}_{value}` — e.g. `red_0`, `blue_skip`, `yellow_reverse`, `green_draw2`, `wild`, `wild_draw4`.

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
8. repeat 6–7 until matchStatus = "finished"
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

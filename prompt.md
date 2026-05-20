# Frontend Briefing

I'm building the frontend for a turn-based multiplayer minigame platform. The backend is a Cloudflare Workers API. Here's everything you need to know.

---

## Base URL

```
https://<your-worker>.workers.dev
```

All requests use `Content-Type: application/json`. All responses are JSON.

---

## Auth

Do this once on load and store `sessionId` — it is required for every game action.

```
POST /auth
{ "username": "string" }
→ { "session": { "sessionId": "uuid", "username": "string", "createdAt": "..." } }
```

---

## Matchmaking

Both players call this independently. The server pairs them automatically.

```
POST /lobby/join
{ "sessionId": "uuid", "gameId": "poker" | "uno" }
→ { "matchId": "uuid" }
```

---

## Game loop

```
POST /games/:gameId/move
{ "sessionId": "uuid", "matchId": "uuid", "action": { ... } }
→ { "state": { ... }, "status": "waiting|ok|started|phase-updated|finished", "message": "string" }

GET /games/:gameId/state?matchId=uuid
→ full game state object
```

**Status values:**
| Status | Meaning |
|---|---|
| `waiting` | Game not started yet — more players needed or `start` not sent |
| `ok` | Move accepted, game continues |
| `started` | Game just started |
| `phase-updated` | Poker phase advanced (flop, turn, river) |
| `finished` | Game over — check `state.metadata.winner` |

---

## Starting a game

Any player can send this after both have joined:

```json
{ "type": "start" }
```

---

## Poker actions

`:gameId` = `poker`

| Action | Body |
|---|---|
| Start | `{ "type": "start" }` |
| Fold | `{ "type": "fold" }` |
| Check | `{ "type": "check" }` |
| Bet | `{ "type": "bet", "amount": 50 }` |

**Phases:** `waiting → preflop → flop → turn → river → showdown`

**Poker state shape:**
```json
{
  "players": ["sessionId1", "sessionId2"],
  "metadata": {
    "phase": "preflop",
    "community": ["A-spades", "10-hearts", "3-clubs"],
    "hands": { "sessionId1": ["K-diamonds", "Q-spades"] },
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

---

## UNO actions

`:gameId` = `uno`

| Action | Body |
|---|---|
| Start | `{ "type": "start" }` |
| Play a card | `{ "type": "play", "card": "red_7" }` |
| Play wild | `{ "type": "play", "card": "wild", "color": "blue" }` |
| Play Wild Draw Four | `{ "type": "play", "card": "wild_draw4", "color": "green" }` |
| Draw a card | `{ "type": "draw" }` |

**Card format:** `{color}_{value}` — e.g. `red_0`, `blue_skip`, `yellow_reverse`, `green_draw2`, `wild`, `wild_draw4`

**Colors:** `red`, `yellow`, `green`, `blue`

**UNO state shape:**
```json
{
  "players": ["sessionId1", "sessionId2"],
  "metadata": {
    "phase": "started",
    "discard": ["red_7", "blue_skip"],
    "hands": { "sessionId1": ["green_2", "wild"], "sessionId2": ["red_0"] },
    "currentPlayer": "sessionId1",
    "direction": 1,
    "currentColor": "red",
    "lastCard": "blue_skip",
    "winner": null,
    "lastAction": "sessionId2 played blue_skip"
  }
}
```

`direction` is `1` (clockwise) or `-1` (counter-clockwise, set by a reverse card).

---

## Errors

`400` — user or game error, message is safe to show directly.
`500` — server crash, show a generic message.

```json
{ "error": "message" }
```

| Message | Meaning |
|---|---|
| `"invalid session"` | sessionId not found — call `POST /auth` again |
| `"match or player not found"` | matchId wrong or you haven't joined |
| `"match not found"` | matchId does not exist |
| `"It is not your turn."` | Wait for the other player |
| `"At least 2 players are required to start poker."` | Need more players |
| `"At least 2 players are required to start UNO."` | Need more players |
| `"Card is not in hand."` | Card not in your hand |
| `"Card is not playable on the current discard."` | Card doesn't match color or value |
| `"A color must be chosen when playing a wild card."` | Add `"color"` field to action |
| `"Cannot check when bet amount is not matched."` | Must call or fold instead |
| `"Bet amount must be a positive number."` | Invalid bet amount |

---

## Card assets

SVG files served from Cloudflare R2 via the Worker (asset route not yet implemented — request the card by key).

**Standard deck** (Poker):
```
imgs/standard-deck/{rank}-{suit}.svg
```
e.g. `imgs/standard-deck/A-spades.svg`, `imgs/standard-deck/10-hearts.svg`

Ranks: `2`–`10`, `J`, `Q`, `K`, `A`
Suits: `spades`, `hearts`, `diamonds`, `clubs`
Card back: `imgs/standard-deck/back.svg`

**UNO deck:**
```
imgs/uno-deck/{color}_{value}.svg
```
e.g. `imgs/uno-deck/red_7.svg`, `imgs/uno-deck/wild.svg`, `imgs/uno-deck/wild_draw4.svg`
Card back: `imgs/uno-deck/back.svg`

**Game icons:**
```
games/poker/icon.svg
games/uno/icon.svg
```

---

## Typical flow

```
1. POST /auth                           → store sessionId
2. Both players POST /lobby/join        → store matchId
3. POST /games/:id/move { type: "start" }
4. GET  /games/:id/state               → render board
5. POST /games/:id/move { your action }
6. Repeat 4–5 until status === "finished"
7. Show state.metadata.winner
```

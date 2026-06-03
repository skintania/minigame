# Old Maid (ไพ่แมวดำ) — Frontend Implementation Guide

Thai card game. 53-card deck (52 + 1 Joker). Players sit in a circle and take turns blindly picking one card from the player on their left. Matching pairs are discarded. The last player holding the unpaired Joker loses.

---

## Quick Start

```
1. POST /auth { username }                              → save sessionId
2. POST /rooms/create { sessionId, gameId: "oldmaid" } → get matchId + roomCode
3. Everyone: POST /rooms/join { roomCode }
4. Everyone: PATCH /rooms/:code/role { role: "player" }
5. Host: POST /games/oldmaid/:matchId/start { sessionId }
6. Poll GET /games/oldmaid/:matchId/state?sessionId=
7. Animate initialDiscards (pairs auto-discarded at deal)
8. isMyTurn → POST /games/oldmaid/:matchId/pick { sessionId, index }
9. matchStatus = "finished" → show loser
```

---

## Phases

| Phase | What to show |
|-------|-------------|
| `waiting` | Lobby — seated players, wait for host to start |
| `playing` | Main game — current player picks from their left |
| `finished` | Game over — show `metadata.loser` |

---

## State Shape (`metadata`)

```json
{
  "phase": "playing",
  "hands": {
    "sessionId1": ["A♠", "Joker", "7♥"],
    "sessionId2": ["hidden", "hidden", "hidden", "hidden"],
    "sessionId3": ["hidden"]
  },
  "discarded": {
    "sessionId1": [["K♠", "K♦"], ["3♣", "3♥"]],
    "sessionId2": [["Q♠", "Q♥"]]
  },
  "initialDiscards": {
    "sessionId1": [["A♣", "A♦"]],
    "sessionId2": [["10♠", "10♥"], ["J♣", "J♦"]]
  },
  "shuffleMode": {
    "sessionId1": "auto",
    "sessionId2": "manual"
  },
  "currentPlayer": "sessionId1",
  "currentPlayerIndex": 0,
  "eliminated": ["sessionId3"],
  "loser": null,
  "lastPick": {
    "picker": "sessionId1",
    "from": "sessionId2",
    "card": "7♥",
    "newPairs": [["7♠", "7♥"]]
  },
  "lastAction": "sessionId1 picked a card from sessionId2"
}
```

---

## Key Fields

| Field | Description |
|-------|-------------|
| `hands[me]` | Your actual cards — always visible |
| `hands[others]` | Array of `"hidden"` strings — length = their card count |
| `discarded[id]` | Pairs this player has discarded — show as face-up pairs |
| `initialDiscards[id]` | Pairs discarded at game start — animate on first render then ignore |
| `shuffleMode[me]` | `"auto"` or `"manual"` — show toggle for own seat only |
| `eliminated` | Players who emptied their hand — mark as safe (✅) |
| `loser` | Set when game ends — highlight this player's seat |
| `lastPick.card` | The card just picked — revealed to all; animate sliding it into picker's hand |
| `lastPick.newPairs` | Pairs formed from the last pick — animate discarding them |

---

## Turn Flow

### Current player's turn (`isMyTurn = true`)

1. Highlight the left neighbour's seat and show their card backs
2. Each card back is tappable — render `hands[leftPlayer].length` face-down card buttons
3. On tap, call:
   ```
   POST /games/oldmaid/:matchId/pick
   { "sessionId": "...", "index": 2 }
   ```
   `index` is the position (0-based) the player tapped in the left player's hand

4. After response, poll state — animate:
   - `lastPick.card` flying from left player's hand to current player's hand
   - If `lastPick.newPairs.length > 0` — animate pair(s) sliding off to the discard zone
   - If left player's hand is now empty → play "safe" animation on their seat

### Other players' turn

Show who the current player is and whose hand they will pick from (the left neighbour). Disable the pick UI.

---

## Shuffle Mode Toggle

Show a toggle on your own seat (not others):

```
🔀 Auto  ←→  ✋ Manual
```

**Auto** (default): you don't need to do anything — the server randomises your card order before each pick. The Joker's position is always fresh.

**Manual**: your cards stay in the order you arrange them. Show a drag-to-reorder UI for your own hand. When the player finishes arranging, call:
```
POST /games/oldmaid/:matchId/reorder-hand
{ "sessionId": "...", "cards": ["A♠", "Joker", "7♥"] }
```
Submit the full hand in the new order.

Toggle between modes:
```
POST /games/oldmaid/:matchId/set-shuffle-mode
{ "sessionId": "...", "mode": "auto" | "manual" }
```

**When to call reorder:** in manual mode, the player should arrange their cards before it becomes someone else's turn to pick from them. A good UX: show the reorder UI whenever the next picker's turn is approaching (i.e. `turnOrder[1]` is about to become `currentPlayer`).

---

## Initial Deal Animation

After `start`, `metadata.initialDiscards` shows what was auto-discarded from each player's starting hand. Use this for an opening animation:

1. Show all cards being dealt face-down
2. Flip each player's hand briefly
3. Animate pairs sliding off for each player per `initialDiscards[id]`
4. After animation, hide opponent hands (show as backs)

`initialDiscards` stays in state permanently — it won't change after game start.

---

## Seat Ring Layout

Use `turnOrder` from the unified response to render seats in pick order, starting from the current player going clockwise. The player at `turnOrder[1]` is who the current player picks from.

For each seat, show:
- Player name
- Number of hidden cards (length of their `hands[id]` array)
- Number of pairs discarded (`discarded[id].length` pairs × 2 cards)
- Shuffle mode icon (🔀 auto / ✋ manual) — visible for all seats
- ✅ badge if in `eliminated`
- 🃏 "picking from" arrow when it's their left neighbour's turn

---

## End Screen

When `matchStatus === "finished"`:
- Highlight `metadata.loser` with a losing animation (holding the Joker)
- Show all other players as safe
- Show discard piles for each player (all the pairs they collected)
- "Play again?" — host calls `POST /rooms/create` again

---

## Reconnection

`POST /auth { sessionId }` resumes the session. `GET /state` restores full hand, eliminated status, shuffle mode, and `lastPick`.

---

## Polling Notes

- Poll `GET /state?sessionId=` every 2–3 seconds
- `isMyTurn` tells you when to enable the pick UI
- `turnOrder[1]` is always the player the current player will pick from (their left neighbour, skipping eliminated players)
- After any action, poll immediately rather than waiting for the next interval

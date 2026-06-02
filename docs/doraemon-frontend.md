# Doraemon — Frontend Implementation Guide

Thai drinking party card game. Players sit in a circle and take turns drawing one card at a time from a shuffled 52-card deck. Cards trigger drinks, mini-games, or ongoing effects. Game ends when the deck is empty. No winner.

---

## Quick Start

```
1. POST /auth { username }                         → save sessionId
2. POST /rooms/create { sessionId, gameId: "doraemon" }  → get matchId + roomCode
3. Everyone: POST /rooms/join { roomCode }         → join as spectator
4. Everyone: PATCH /rooms/:code/role { role: "player" }  → sit at the table
5. Host: POST /games/doraemon/:matchId/start { sessionId }
6. Poll GET /games/doraemon/:matchId/state?sessionId=
7. isMyTurn → POST /games/doraemon/:matchId/draw { sessionId }
8. Handle pending phases (buddy, mini-game, K-rule) before next draw
9. Deck empties → matchStatus = "finished"
```

---

## Phases

| Phase | What to show |
|-------|-------------|
| `waiting` | Lobby — show seated players, wait for host to start |
| `playing` | Main game — current player draws (`isMyTurn`) |
| `pending-buddy` | Current player must pick a buddy — show player selector |
| `pending-minigame` | Card 6 or 7 mini-game active — anyone can report loser |
| `pending-k-rule` | Current player must type rule text — show text input |
| `finished` | Game over — show drink totals |

---

## State Shape (`metadata`)

```json
{
  "phase": "playing",
  "deckSize": 38,
  "discardPile": ["A♠", "7♥", "Q♦"],
  "drawnCard": "Q♦",
  "currentPlayer": "sessionId1",
  "currentPlayerIndex": 0,
  "drinks": { "sessionId1": 3, "sessionId2": 1 },
  "bathroomPasses": { "sessionId1": 0, "sessionId2": 1 },
  "buddies": { "sessionId1": "sessionId2", "sessionId2": "sessionId1" },
  "silenced": "sessionId1",
  "kRules": { "what": "bark like a dog", "where": null, "howLong": null, "count": 1 },
  "pendingMinigame": null,
  "lastAction": "sessionId1 drew Q♦ — is now SILENCED!"
}
```

Key fields:

| Field | Description |
|-------|-------------|
| `deckSize` | Cards left to draw |
| `discardPile` | All drawn cards in order (oldest first) |
| `drawnCard` | The card drawn this turn — animate/highlight this |
| `drinks[id]` | Accumulated sip count for each player |
| `bathroomPasses[id]` | Unused bathroom passes |
| `buddies` | Symmetric map — `buddies[A] = B` and `buddies[B] = A` |
| `silenced` | Session ID of silenced player, or `null` |
| `kRules.count` | How many Ks have been drawn (0–3 in pending state) |
| `pendingMinigame.type` | `'category'`, `'number7'`, or `'gesture'` |
| `pendingMinigame.topic` | For category games — the topic to guess items of |

---

## Card Effects & UI

### A–4 — Drink sips

Draw → auto-resolved. Show animation: "You drew [card] — drink N sip(s)!". Check `drinks[me]` for running total. Buddy also drinks if linked.

### 5 — Buddy Selection (`pending-buddy`)

Show a player picker listing all players except the drawer. On tap:
```
POST /games/doraemon/:matchId/choose-buddy
{ "sessionId": "...", "target": "targetSessionId" }
```
Update `buddies` in the next state poll. Show buddy links on the UI (chain icon between paired players). The buddy relationship **stays for the rest of the game** until one of the pair draws another 5.

**Buddy chain:** drinks propagate through the full chain. If A→B and B→C are buddies, A drinking makes B and C both drink. Render the full chain visually (e.g. A — B — C connected by icons).

### 6 — Category Game (`pending-minigame` type: `category`)

Show: "Category: [topic]! Players say items. Who lost?"

Display a list of all players. The player who taps someone calls:
```
POST /games/doraemon/:matchId/report-loser
{ "sessionId": "...", "target": "loserSessionId" }
```
Anyone (not just the drawer) can submit this.

### 7 — Number 7 Game (`pending-minigame` type: `number7`)

Show: "Number 7 game! Count aloud — skip multiples of 7 and numbers ending in 7. Who messed up?"

Same `report-loser` call as above.

### 8 — Bathroom Pass

Auto-resolved. Show: "[player] got a bathroom pass!". `bathroomPasses[drawer]` will be incremented in next state. Display bathroom pass count on each player's seat.

**Using a bathroom pass** (any time during game):
```
POST /games/doraemon/:matchId/use-bathroom-pass
{ "sessionId": "..." }
```
Show a "Bathroom" button whenever `bathroomPasses[me] > 0`.

### 9 — Left Drinks

Auto-resolved. The player to the left (counter-clockwise: index − 1) drinks 1 sip.

Use `turnOrder` from the top-level response to determine seat order.

### 10 — Right Drinks

Auto-resolved. The player to the right (clockwise: index + 1) drinks 1 sip.

### J — Gesture Power (persistent, non-blocking)

Drawing J makes the drawer the **gesture holder** (`metadata.jHolder`). This power stays until another J is drawn.

Show a "⚡ Trigger pose challenge" button on the gesture holder's seat (or floating for that player). When tapped by the holder:
```
POST /games/doraemon/:matchId/trigger-gesture
{ "sessionId": "..." }
```
Sets `metadata.gesturePending = true`. Show an alert to all players: "[name] is doing a pose — copy it! Last one drinks!"

While `gesturePending = true`, show a player picker for anyone to report the loser:
```
POST /games/doraemon/:matchId/report-gesture-loser
{ "sessionId": "...", "target": "loserSessionId" }
```
The loser drinks 1 sip (including their buddy chain). `gesturePending` resets to `false`.

The J holder can trigger as many challenges as they want, one at a time, for the rest of the game.

### Q — Silenced

Auto-resolved. Show a prominent "SILENCED" badge on the drawer's seat.

While `silenced !== null`:
- Show a "⚠️ Talked to [name]?" button all players can tap.
- On tap, show a player picker (excluding the silenced player themselves).
- Submit:
```
POST /games/doraemon/:matchId/report-talking
{ "sessionId": "...", "talker": "offenderSessionId" }
```
The silenced effect persists until the game ends. Drawing another Q replaces the silenced player.

### K — Rule Builder (`pending-k-rule`)

On each of the first 3 Ks drawn: show a text input for the drawer.

| K count | Prompt |
|---------|--------|
| 1 | "What is the rule? (the activity)" |
| 2 | "Where does the rule happen?" |
| 3 | "How long / how does it happen?" |

Submit:
```
POST /games/doraemon/:matchId/set-k-rule
{ "sessionId": "...", "text": "bark like a dog" }
```

Display the partial rule as it builds:
- K1: `WHAT: "bark like a dog"`
- K2: `WHAT: "..." / WHERE: "under the table"`
- K3: `WHAT: "..." / WHERE: "..." / HOW: "for 10 seconds"`

On the **4th K**: no input needed — drawn card auto-executes the rule and resets. Show a big announcement: "🔔 RULE: bark like a dog / under the table / for 10 seconds — EXECUTE NOW!"

---

## House Rule — No Pointing

Show a "👉 Caught pointing?" button all players can tap at any time during the game. On tap:
```
POST /games/doraemon/:matchId/report-pointing
{ "sessionId": "...", "offender": "offenderSessionId" }
```
The offender drinks 1 sip.

---

## Drink Counter Display

Show a running sip total for each player at the table. Highlight when `drinks[id]` increases. Display buddy links visually (chain icon, same color, etc.).

```
Alice  🍺×5  (buddy: Bob)
Bob    🍺×3  (buddy: Alice)
Carol  🍺×8  🚽×1
```

---

## End Screen

When `matchStatus === "finished"`:
- Show drink totals for all players sorted by count descending.
- No winner is declared — this is a party game.
- Show "Play again?" — host can call `POST /rooms/create` again.

---

## Reconnection

Standard reconnection applies — `POST /auth { sessionId }` resumes the session. `GET /games/doraemon/:matchId/state` restores full state including all ongoing effects (silenced player, buddies, partial K rule, pending mini-game).

---

## Polling Notes

- Poll `GET /games/doraemon/:matchId/state?sessionId=` every 2–3 seconds.
- `isMyTurn` tells you when to enable the Draw button.
- Any player can submit `report-loser`, `report-talking`, and `report-pointing` at any time — show these controls to all players throughout the game.
- `turnOrder` in the response gives players in clockwise seat order starting from the current player — use this to render the seat ring correctly.

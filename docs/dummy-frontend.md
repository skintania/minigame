# Thai Dummy (ดัมมี่) — Frontend Implementation Guide

## Overview

Thai Dummy is a multi-round rummy game for 3–5 players. Each round, players draw cards, form melds on the table, and try to empty their hand. Scores accumulate across rounds; the player with the highest total after N rounds wins.

---

## Turn Structure

A player's turn always follows this order:

```
1. Draw      → must draw exactly once (stock or discard)
2. Lay/Fak   → optional, can do multiple times in any order
3. Discard   → must discard exactly once to end the turn
               (skip discard only if you go out via lay/fak with 0 cards left)
```

Use `metadata.drewThisTurn` to know which step the current player is on:
- `false` → player must draw first
- `true` → player has drawn; may lay/fak now, must discard before turn ends

---

## State Fields to Render

| Field | What to show |
|-------|-------------|
| `metadata.hands[mySessionId]` | Your own cards (actual card names) |
| `metadata.hands[otherId]` | Array of `"hidden"` strings — length = their card count |
| `metadata.stockCount` | Number of cards remaining in stock pile |
| `metadata.discardPile` | Full discard pile — `[0]` = oldest/top card (highlighted), `[last]` = newest/bottom (just discarded) |
| `metadata.melds` | All laid melds on the table, public to everyone. Each meld has `owner` (who laid it), `cards` (all cards), and `contributions` (per-card attribution for scoring) |
| `metadata.hasLaidDown` | Map of who has laid down this round (needed to show/hide ฝาก button) |
| `metadata.openingCard` | The first card of the discard pile — worth 50 pts, highlight it specially |
| `metadata.drewDiscardTarget` | If set: current player must lay this card before they can discard |
| `metadata.currentPlayer` | Whose turn it is |
| `metadata.currentRound` / `metadata.totalRounds` | e.g. "Round 2 / 5" |
| `metadata.totalScores` | Cumulative scores per player |
| `metadata.roundScores` | Scores for the last completed round (null during a round) |
| `metadata.discardPenalties` | Accumulated discard penalties this round per player |
| `metadata.roundWinner` | Who went out this round |
| `metadata.winner` | Overall game winner (set when `phase = "finished"`) |

---

## Discard Pile — Visual Layout

The discard pile is ordered **oldest at top, newest at bottom**. Cards stack downward visually.

```
discardPile[0]    ← oldest / top  (visible, always shown)
discardPile[1]
discardPile[2]
...
discardPile[last] ← newest / bottom  (just discarded by previous player)
```

When drawing from the discard pile, the player picks a **target card** and takes it **plus everything below it** (all newer cards). Show which cards would be taken on hover/select.

---

## Actions

### Draw from Stock
```
POST /games/dummy/:matchId/draw
Body: { sessionId }
```
Only enabled when `drewThisTurn = false`.

---

### Draw from Discard Pile
```
POST /games/dummy/:matchId/draw-discard
Body: { sessionId, card: "K♠" }
```
`card` is the target card name. The player takes that card plus all cards below it.

**Important:** After this, `metadata.drewDiscardTarget` will be set to the target card. The player **must** include it in a `lay` action before they can discard.

Show a warning/indicator when `drewDiscardTarget` is set so the player knows which card must be laid.

---

### Lay Down a Meld
```
POST /games/dummy/:matchId/lay
Body: { sessionId, cards: ["5♣", "6♣", "7♣"] }
```

Valid melds:
- **Set:** 3–4 cards of the same rank (e.g. `K♣ K♦ K♥`)
- **Run:** 3+ consecutive ranks, same suit (e.g. `5♣ 6♣ 7♣`). Ace is high only — `Q-K-A` valid, `A-2-3` invalid.

**First lay restriction:** Enable this action only when `drewThisTurn = true` AND (`hasLaidDown[me] = true` OR `drewDiscardTarget != null`). A player cannot lay down for the first time in a round unless they drew from the discard pile this turn.

If `drewDiscardTarget` is set, the selected cards **must include** that card.

---

### ฝาก (Add to Existing Meld)
```
POST /games/dummy/:matchId/fak
Body: { sessionId, card: "4♣", meldIndex: 0 }
```

`meldIndex` is the index of the meld in `metadata.melds[]`.

Only show/enable this button if:
- `drewThisTurn = true`, AND
- `metadata.hasLaidDown[mySessionId] = true`

The player selects one card from their hand and one meld to add it to.

---

### Discard
```
POST /games/dummy/:matchId/discard
Body: { sessionId, card: "5♦" }
```

Only enabled when:
- `drewThisTurn = true`, AND
- `drewDiscardTarget = null` (or it has been satisfied via a `lay`)

**Penalty warning:** If the card can be ฝาก'd onto any existing meld on the table, the API applies a -50 penalty automatically (melds are visible — no excuse to miss them). Discarding a card that could form a new meld from hand only is **not** penalised. Consider highlighting cards in hand that match a visible meld as a hint.

---

## Going Out

A round ends the moment any player's hand reaches 0 cards (after `lay`, `fak`, or `discard`). The API returns `status: "round-complete"` (or `"finished"` on the last round). Poll state to see:
- `metadata.phase = "between-rounds"` or `"finished"`
- `metadata.roundScores` — score breakdown for this round
- `metadata.roundWinner` — who went out
- `metadata.totalScores` — updated cumulative scores

---

## Round Scoring Breakdown

Display this at end of each round:

| Component | Formula |
|-----------|---------|
| Laid cards | +sum of point values of all their melds |
| Hand cards | −sum of point values of remaining hand |
| Never laid down (dummy) | hand penalty ×2 |
| Going-out bonus | +50 (winner only) |
| Single-suit knock | other players' hand penalty ×2 |
| Blind + single-suit knock | other players' hand penalty ×4 |
| Discard penalty | −50 per violation |
| Feeding penalty | −50 if your discard was picked up by next player who then went out |

**Card point values:**

| Cards | Points |
|-------|--------|
| 2, 3, 4, 5, 6, 7, 8, 9 | 5 pts each |
| 10, J, Q, K | 10 pts each |
| A | 15 pts each |
| 2♣ | 50 pts |
| Q♠ | 50 pts |
| Opening discard card | 50 pts (whichever card it is) |

---

## Phase Flow

```
waiting
  → host calls /start
started  (round in progress)
  → someone goes out
between-rounds  (show scores, wait)
  → host calls /next-round (or game ends after totalRounds)
started  (next round)
  ...repeat...
finished  (all rounds done)
```

Between rounds: show `roundScores`, `totalScores`, and who won the round. Host button to start next round. After the last round, show final standings from `totalScores`.

---

## Meld Validation (Client-Side)

To give instant feedback before sending the request, validate locally:

**Set:** all cards share the same rank AND length is 3 or 4.

**Run:** all cards share the same suit AND ranks are consecutive (no gaps) AND Ace is only at the high end.

Rank order for runs (low to high): `2 3 4 5 6 7 8 9 10 J Q K A`

Valid run examples: `3♣ 4♣ 5♣`, `Q♥ K♥ A♥`, `9♠ 10♠ J♠ Q♠`
Invalid: `A♦ 2♦ 3♦` (A cannot be low), `K♠ A♠ 2♠` (no wrapping)

**ฝาก validation:**
- For a set meld: card must have the same rank AND the set must have < 4 cards.
- For a run meld: adding the card must keep the run consecutive (i.e. the new card goes at either end).

---

## Discard Pile Draw — UI Suggestion

When the player wants to draw from the discard pile:

1. Show the full `discardPile` array (oldest at top, newest at bottom).
2. Player taps/clicks a target card.
3. Highlight the target card **and all cards below it** (they all come to hand).
4. Show confirmation: "Draw X cards?" → send `draw-discard { card: targetCard }`.

Note: if only the bottom card is selected (just `discardPile[last]`), only 1 card is drawn — this is the "feeding" scenario if the player goes out with it.

---

## Key UI States

| Condition | UI |
|-----------|-----|
| `isMyTurn = false` | All action buttons disabled |
| `drewThisTurn = false` | Only draw buttons enabled |
| `drewThisTurn = true` AND `hasLaidDown[me] = true` | Lay / ฝาก / discard buttons enabled |
| `drewThisTurn = true` AND `hasLaidDown[me] = false` AND `drewDiscardTarget != null` | Lay enabled (first lay, drew from discard) |
| `drewThisTurn = true` AND `hasLaidDown[me] = false` AND `drewDiscardTarget = null` | Lay disabled (drew from stock, can't lay yet); only discard enabled |
| `drewDiscardTarget != null` | Highlight the target card in hand; warn that it must be laid before discarding |
| `hasLaidDown[me] = false` | Hide or disable ฝาก button |
| `phase = "between-rounds"` | Show score table; host sees "Next Round" button |
| `phase = "finished"` | Show final standings from `totalScores` |

---

## Polling

Poll `GET /games/dummy/:matchId/state?sessionId=` every **2–3 seconds** during an active round. No auto-advance timers exist for Dummy — turns only advance when a player acts.

# Pok Deng (ป๊อกเด้ง) — Frontend Implementation Guide

## Overview

Thai card game: all players vs. a banker. Each round, players place bets, receive 2 cards, and optionally draw a 3rd. The banker plays last. Hands are compared against the banker; special hand combinations (Deng) multiply the payout.

Two banker modes (host chooses at game start):
- **`bot`** — the house/backend is always the banker (infinite chips)
- **`rotate`** — players take turns being banker; chip transfers are between real players

---

## Phase Flow

```
waiting
  → host calls /start (with bankerMode)
betting      (players place bets)
  → last bet placed → cards dealt automatically
drawing      (players decide draw or stand, one at a time)
  → all done → banker/bot plays → results set → phase = "between-rounds"
between-rounds
  → host calls /next-round (or betweenRoundsSec timer)
betting      (next round — banker rotates if rotate mode)
  ...repeat...
finished
```

---

## State Fields to Render

| Field | Description |
|-------|-------------|
| `metadata.phase` | `waiting` \| `betting` \| `drawing` \| `between-rounds` \| `finished` |
| `metadata.bankerMode` | `"bot"` or `"rotate"` |
| `metadata.bankerId` | Session ID of current banker (`null` in bot mode) |
| `metadata.chips[playerId]` | Current chip counts |
| `metadata.bets[playerId]` | Bet placed this round (only non-bankers in rotate mode) |
| `metadata.betsPlaced[playerId]` | `true` once the player has bet |
| `metadata.hands[myId]` | Your cards — `string[]` (2 or 3 cards) |
| `metadata.hands[otherId]` | `["hidden", "hidden"]` or `["hidden","hidden","hidden"]` during betting/drawing |
| `metadata.botHand` | Bot's cards (bot mode). `["hidden","hidden"]` during betting/drawing; revealed in between-rounds |
| `metadata.currentPlayer` | Session ID whose draw/stand turn it is (`null` during betting/between-rounds) |
| `metadata.results[playerId]` | Per-player result (available in between-rounds): `{ outcome, payout, playerValue, bankerValue, playerDeng, bankerDeng }` |
| `metadata.currentRound` | Current round number |
| `metadata.winner` | Session ID of overall winner when `phase = "finished"` |

---

## Actions

### Place Bet
```
POST /games/pokdeng/:matchId/bet
Body: { sessionId, amount }
```
- Valid during `phase = "betting"` when `betsPlaced[myId] = false`.
- In rotate mode: the current banker (`bankerId`) **does not** place a bet.
- When all non-banker players have bet, cards are dealt automatically — poll state.

---

### Draw (เปิดไพ่)
```
POST /games/pokdeng/:matchId/draw
Body: { sessionId }
```
Take a 3rd card. Only available when:
- `isMyTurn = true` AND `phase = "drawing"`
- Your 2-card total is ≤ 5

---

### Stand (ไม่รับ)
```
POST /games/pokdeng/:matchId/stand
Body: { sessionId }
```
Keep your current hand. Available when `isMyTurn = true` AND `phase = "drawing"`.

---

### Next Round (host only)
```
POST /games/pokdeng/:matchId/next-round
Body: { sessionId }
```
Starts the next betting round. In rotate mode, the banker role shifts to the next player automatically.

---

### End Game (host only)
```
POST /games/pokdeng/:matchId/end-game
Body: { sessionId }
```
Ends the game immediately. Player with most chips wins.

---

## Drawing Rules

| 2-card total | Rule |
|---|---|
| 0–5 | Player CHOOSES to draw or stand (`isMyTurn = true`, show draw/stand buttons) |
| 6–7 | Auto-stand (no choice; skip this player's turn) |
| 8–9 (Pok) | Auto-stand; player is skipped |

**Banker Pok rule:** If the banker (or bot) has 8 or 9 with their initial 2 cards, no one draws — the round resolves immediately after dealing.

**Bot banker draw rule:** Bot automatically draws if its 2-card total ≤ 4, otherwise stands.

**Turn order:** Non-banker players act first (in seat order), then the human banker (rotate mode only). Bot never has a turn during drawing — it acts automatically after all players decide.

---

## Deng Multipliers

The winner's Deng determines the payout multiplier.

| Hand | Cards | Deng |
|------|-------|------|
| Three of a kind (ตอง) | 3 | ×5 |
| Straight flush (สเตรทฟลัช) | 3 | ×5 |
| Straight (เรียง) | 3 | ×3 |
| Flush / same suit (สี) | 3 | ×3 |
| Pair (คู่) in 3-card hand | 3 | ×2 |
| Pair (คู่) in 2-card hand | 2 | ×2 |
| Same suit (สี) in 2-card hand | 2 | ×2 |
| Normal | any | ×1 |

**Note:** Ace is always low (value = 1). Valid straights: A-2-3, 2-3-4, …, J-Q-K. Q-K-A is **not** a valid straight.

---

## Card Values (for displaying hand totals)

| Cards | Value |
|-------|-------|
| A | 1 |
| 2–9 | Face value |
| 10, J, Q, K | 0 |

**Hand total** = sum of all card values **mod 10**. The goal is to get as close to 9 as possible.

---

## Payout Logic

| Outcome | Chip change for player |
|---------|----------------------|
| Win | `+bet × playerDeng` |
| Lose | `−bet × bankerDeng` |
| Push (exact tie on both value AND deng) | `±0` |

**Tiebreaker:** If player and banker have the same hand value, compare Deng — higher Deng wins. Push only when both value AND Deng are equal.

**Bot mode:** chip gains/losses apply to the player only (no banker chips to track).
**Rotate mode:** chips transfer between player and banker (zero-sum per matchup).

---

## Result Object (`results[playerId]`)

```json
{
  "outcome": "win",       // "win" | "lose" | "push"
  "payout": 200,          // net chip change (+200 = gained, -100 = lost)
  "playerValue": 7,       // player's hand value (0–9)
  "bankerValue": 5,       // banker/bot hand value (0–9)
  "playerDeng": 2,        // player's deng multiplier
  "bankerDeng": 1         // banker's deng multiplier
}
```

---

## Key UI States

| Condition | UI |
|-----------|-----|
| `phase = "betting"` AND `betsPlaced[myId] = false` AND (bot mode OR `myId ≠ bankerId`) | Show bet input |
| `phase = "betting"` AND (`betsPlaced[myId] = true` OR `myId === bankerId`) | "Waiting for others to bet…" |
| `phase = "drawing"` AND `isMyTurn = false` | Disabled; show whose turn it is |
| `phase = "drawing"` AND `isMyTurn = true` | Show draw button (if 2-card total ≤ 5) + stand button |
| `phase = "between-rounds"` | Show all revealed hands; show results table; host sees "Next Round" |
| `phase = "finished"` | Final chip standings; highlight winner |
| `bankerMode = "rotate"` | Highlight the current `bankerId` seat; show "Banker" label |

---

## Hand Visibility

- During `betting` and `drawing`: you see only **your own** hand. All other players' cards show as `"hidden"`. The bot's hand also shows as `"hidden"` (card count IS revealed — a 3-card hand shows 3 `"hidden"` entries).
- During `between-rounds` and `finished`: **all** hands are revealed.

This means a player drawing a 3rd card is visible to everyone (the count changes), but the card value stays hidden until the reveal.

---

## Rotate Mode — Banker Behavior

- Banker is identified by `metadata.bankerId`.
- The banker does NOT place a bet.
- The banker draws/stands at the END of the drawing phase (after all other players act). `isMyTurn` works the same way — banker gets their turn just like any player.
- After each round, `bankerId` automatically rotates to the next seated player. The new banker is shown in `metadata.bankerId` after `next-round`.
- If the banker runs out of chips (goes to 0 or below from large deng losses), they're moved to spectator and the rotation skips them.

---

## Polling

Poll `GET /games/pokdeng/:matchId/state?sessionId=` every **2–3 seconds**.

No manual trigger is needed to detect when betting ends and cards are dealt — the `phase` will change from `"betting"` to `"drawing"` on the next poll after the last bet is placed.

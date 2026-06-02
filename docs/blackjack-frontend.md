# Blackjack — Frontend Implementation Guide

## Overview

Players vs. a dealer. Two dealer modes (host chooses at game start):
- **`bot`** — the house/backend is always the dealer (infinite chips)
- **`rotate`** — players take turns being dealer; chip transfers are zero-sum between dealer and players

Chip system is identical to poker — players with 0 chips after a round become spectators.

---

## Phase Flow

```
waiting
  → host calls /start (with bankerMode)
betting      (everyone places a bet — dealer is excluded in rotate mode)
  → last bet placed → cards dealt automatically → phase = "playing"
playing      (players act one at a time)
  → all players done → dealer auto-plays → results set → phase = "between-rounds"
between-rounds
  → host calls /next-round  (or betweenRoundsSec timer fires)
betting      (next round — dealer rotates if rotate mode)
  ...repeat...
finished     (roundLimit reached or host ends game)
```

---

## State Fields to Render

| Field | What to show |
|-------|-------------|
| `metadata.phase` | Current phase |
| `metadata.bankerMode` | `"bot"` or `"rotate"` |
| `metadata.dealerId` | Session ID of current dealer in rotate mode (`null` in bot mode) |
| `metadata.chips[myId]` | My current chips (bet already deducted this round) |
| `metadata.betsPlaced[myId]` | `true` once I've placed my bet |
| `metadata.hands[myId]` | My hands — `string[][]`. Normally 1 hand; 2–4 after splits |
| `metadata.bets[myId]` | Bet per hand — `number[]` |
| `metadata.handStatus[myId]` | Status per hand — `"active" | "stood" | "bust" | "blackjack"` |
| `metadata.activeHandIndex[myId]` | Which hand I'm currently playing (during my turn) |
| `metadata.dealerHand` | Dealer cards. Hole card is `"hidden"` during `betting`/`playing` |
| `metadata.currentPlayer` | Session ID whose turn it is (`null` during betting/between-rounds) |
| `metadata.results[myId]` | Per-hand result — `"win" \| "lose" \| "push" \| "blackjack"` (available in `between-rounds`) |
| `metadata.netChips[myId]` | Net chip change this round (available in `between-rounds`) |
| `metadata.deckSize` | Cards left in the shoe |
| `metadata.currentRound` | Current round number |
| `metadata.winner` | Overall winner session ID when `phase = "finished"` |

**Other players:** their `hands`, `bets`, `handStatus`, and `chips` are all visible — blackjack is a public-hand game.

---

## Actions

### Start Game (host only)
```
POST /games/blackjack/:matchId/start
Body: { sessionId, bankerMode?: "bot" | "rotate" }
```
- `bankerMode` defaults to `"bot"` if omitted.
- Rotate mode requires ≥ 2 players.

---

### Place Bet
```
POST /games/blackjack/:matchId/bet
Body: { sessionId, amount }
```
- Only valid during `phase = "betting"` and `betsPlaced[myId] = false`.
- In rotate mode: the current dealer (`dealerId`) **cannot** place a bet.
- `amount` must be ≥ 1 and ≤ `chips[myId]`.
- When **every** non-dealer player has placed a bet, cards are dealt and `phase` → `playing` automatically — poll state.

---

### Hit
```
POST /games/blackjack/:matchId/hit
Body: { sessionId }
```
Draw one more card. Available when `isMyTurn = true` and `phase = "playing"`.

The server auto-stands on 21, and auto-busts on > 21 — both advance your turn.

---

### Stand
```
POST /games/blackjack/:matchId/stand
Body: { sessionId }
```
End your turn for the current hand. Your turn advances to the next hand (split) or next player.

---

### Double Down
```
POST /games/blackjack/:matchId/double-down
Body: { sessionId }
```
- Only on a 2-card hand.
- Requires `chips[myId] ≥ bets[myId][activeHandIndex]` (the extra bet is deducted from chips).
- Doubles the bet, draws exactly one card, then auto-stands.

---

### Split
```
POST /games/blackjack/:matchId/split
Body: { sessionId }
```
- Only on a 2-card hand where both cards have the same value (10 / J / Q / K all count as equal).
- Requires `chips[myId] ≥ bets[myId][activeHandIndex]` (matched bet for the new hand is deducted).
- Maximum 4 hands total (3 splits).
- After split, play continues on hand 0, then hand 1 (etc.) in order.
- A 21 formed from a split is **not** a natural blackjack — it pays 1:1, not 3:2.

---

### Next Round (host only)
```
POST /games/blackjack/:matchId/next-round
Body: { sessionId }
```
Only valid during `phase = "between-rounds"`. Resets for a new betting round and increments `currentRound`. In rotate mode, `dealerId` automatically advances to the next seated player.

---

### End Game (host only)
```
POST /games/blackjack/:matchId/end-game
Body: { sessionId }
```
Immediately ends the game. The player with the most chips is set as `winner`.

---

## Key UI States

| Condition | UI |
|-----------|-----|
| `phase = "betting"` AND `betsPlaced[myId] = false` AND (bot mode OR `myId ≠ dealerId`) | Show bet input + confirm button |
| `phase = "betting"` AND (`betsPlaced[myId] = true` OR `myId === dealerId`) | Show "Waiting for others to bet…" |
| `phase = "playing"` AND `isMyTurn = false` | All action buttons disabled |
| `phase = "playing"` AND `isMyTurn = true` | Enable hit / stand. Show double-down if hand has 2 cards and chips ≥ bet. Show split if hand has 2 cards of same value and chips ≥ bet. |
| `activeHandIndex[myId] > 0` | Highlight the active hand; dim other hands |
| `phase = "between-rounds"` | Show results and net chip change per player; host sees "Next Round" button |
| `phase = "finished"` | Show final chip counts; highlight `winner` |
| `bankerMode = "rotate"` | Highlight the current `dealerId` seat; show "Dealer" label |

---

## Dealer Hand Display

During `betting` and `playing` phases, `dealerHand` is returned as:
```
["A♠", "hidden"]
```
The first card (index 0) is the **up card** — shown face-up. The second card (`"hidden"`) is the **hole card** — show face-down.

After the round resolves (`between-rounds` and `finished`), the full hand is revealed:
```
["A♠", "7♣"]
```

---

## Rotate Mode — Dealer Behavior

- Dealer is identified by `metadata.dealerId`.
- The dealer does **not** place a bet. Block the bet UI if `myId === dealerId`.
- The dealer has **no** `hands` / `handStatus` entry — they never play as a player. The bot always runs the dealer hand (`dealerHand`), regardless of mode.
- At bet time: each player's bet is immediately transferred to the dealer's chip stack. This means `chips[dealerId]` grows as players bet.
- At resolution: chip payouts are applied in the normal direction (players gain or lose), and the dealer's net is the mirror (zero-sum per player). `netChips[dealerId]` reflects this in the results.
- After each round, `dealerId` automatically rotates to the next seated player. The new dealer is shown in `metadata.dealerId` after `next-round`.

---

## Scoring Breakdown

Display this in `between-rounds` using `results[playerId]` and `netChips[playerId]`:

| Result | What it means | Chip change |
|--------|--------------|-------------|
| `blackjack` | Natural 21 (Ace + 10-value on first 2 cards), dealer had no blackjack | +1.5 × bet (3:2) |
| `win` | Player hand beats dealer (or dealer busted) | +1 × bet |
| `push` | Tie — same value | ±0 (bet refunded) |
| `lose` | Dealer beats player, or player bust | −bet |

Note: players with multiple hands (split) have one result entry per hand in `results[myId][]`.

---

## Card Values (for local hand-value display)

| Cards | Value |
|-------|-------|
| 2–9 | Face value |
| 10, J, Q, K | 10 |
| A | 11 (counts as 1 if hand would bust) |

A **soft** hand contains an Ace counted as 11. Show e.g. "Soft 17" vs "17".

---

## Bust to Spectator

After each round resolves, players with 0 chips are automatically moved to spectator. If only 1 player remains with chips, the room resets to `waiting`.

---

## Polling

Poll `GET /games/blackjack/:matchId/state?sessionId=` every **2–3 seconds** during active play.

No manual polling is needed to detect when betting completes and cards are dealt — the phase will change from `betting` to `playing` in the next state poll after the last bet is placed.

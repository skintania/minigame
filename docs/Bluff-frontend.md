# Bluff — Frontend Implementation Guide

## Overview

Bluff is a turn-based bluffing card game. Players take turns playing cards face-down and claiming they are the required rank. The current player can either play cards or challenge the previous play. First to empty their hand wins.

---

## Polling / Real-time

Poll `GET /games/bluff/:matchId/state?sessionId=` every **2 seconds** while the game is active. No WebSocket needed.

---

## State Shape

```ts
interface BluffState {
  players: string[];           // session IDs in turn order
  playerNames: Record<string, string>;
  spectatorNames: Record<string, string>;
  hostId: string;
  myRole: 'player' | 'spectator';
  matchStatus: 'waiting' | 'active' | 'finished';
  isMyTurn: boolean;
  turnOrder: string[];         // players starting from currentPlayer
  metadata: BluffMeta;
}

interface BluffMeta {
  phase: 'waiting' | 'playing' | 'finished';
  currentPlayer: string | null;
  currentRank: string;         // e.g. "A", "7", "K" — the rank that MUST be claimed this turn
  currentRankIndex: number;    // 0–12
  hands: Record<string, string[] | 'hidden'[]>;
  // Own hand: ["A♠","7♥",...] — actual card strings
  // Opponents: ["hidden","hidden",...] — length = number of cards they hold
  pileSize: number;            // total cards in the face-down pile
  lastPlay: {
    playerId: string;
    claimedRank: string;
    count: number;
    // actual cards are NOT sent — revealed only on challenge
  } | null;
  lastChallenge: {
    challengerId: string;
    playerId: string;          // who was challenged
    success: boolean;          // true = bluffer caught, false = honest player
    actualCards: string[];     // what was really played
    claimedRank: string;
    loserId: string;           // who took the pile
    pileSize: number;          // how many cards were in pile at time of challenge
  } | null;
  winner: string | null;
  lastAction: string | null;
}
```

---

## UI Screens

### 1. Waiting room
Show player list. Host sees **Start** button (enabled when ≥ 2 players).

### 2. Playing

**Your hand** (bottom of screen)
- Show all your cards as selectable tiles
- Cards are sorted A → K automatically by the backend
- Allow multi-select (1–4 cards)
- Highlight the current required rank as a hint: `"Play your ${currentRank}s"`

**Pile** (center)
- Show `pileSize` as a card stack graphic
- Label: `"${pileSize} cards in pile"`

**Last play banner** (above pile)
When `lastPlay` is not null:
```
[PlayerName] played [count] [claimedRank]s
```
This is the claim that can be challenged.

**Opponent hands** (top / sides)
- Each opponent shows a row of face-down card backs
- Count = `hands[opponentId].length` (all entries are `"hidden"`)
- Label with their username and card count

**Challenge button**
- Show when `isMyTurn && lastPlay !== null && lastPlay.playerId !== mySessionId`
- Label: `"Bluff!"` or `"Challenge"`

**Play button**
- Show when `isMyTurn && selectedCards.length >= 1 && selectedCards.length <= 4`
- Label: `"Play ${selectedCards.length} as ${currentRank}s"`

**Turn indicator**
- Highlight the current player's name/seat
- When `isMyTurn`: show a prompt like `"Your turn — play cards or call Bluff!"`

### 3. Challenge result overlay

Show when `lastChallenge` is not null. Display for ~3 seconds before auto-dismissing.

**Caught bluffing** (`success: true`):
```
🚨 BLUFF CAUGHT!
[PlayerName] played [actualCards] — claimed [claimedRank]s
[loserName] takes [pileSize] cards
```

**Honest player** (`success: false`):
```
✅ HONEST!
[PlayerName] really played [actualCards]
[challengerName] takes [pileSize] cards
```

Show `actualCards` as real card graphics (e.g. "7♥ K♠ 3♦").

After dismissing, clear the overlay but keep `lastChallenge` data until the next play arrives.

### 4. Finished screen

Show `winner` username prominently. Host can restart via room flow.

---

## Actions

### Play cards
```http
POST /games/bluff/:matchId/play
{ "sessionId": "...", "cards": ["A♠", "7♥"] }
```
- `cards` must be exact strings from your hand
- 1–4 cards allowed
- You are claiming they are ALL the current `currentRank` (backend enforces nothing about the actual cards — bluffing is allowed)

### Challenge
```http
POST /games/bluff/:matchId/challenge
{ "sessionId": "..." }
```
- Only when `isMyTurn` and `lastPlay` exists and `lastPlay.playerId !== mySessionId`
- On success/fail, `lastChallenge` in next poll will have the result

### Start (host only)
```http
POST /games/bluff/:matchId/start
{ "sessionId": "..." }
```

### End game (host only)
```http
POST /games/bluff/:matchId/end-game
{ "sessionId": "..." }
```

---

## Rank Cycle

The rank cycles in this order and repeats:

```
A → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → J → Q → K → A → ...
```

`currentRank` in metadata always tells you the current required rank. You do not need to compute it yourself.

After a challenge (win or lose), the rank **resets to A**.

---

## Key UX Rules

| Rule | Why |
|------|-----|
| Only the **current player** can act (play or challenge) | Turn-based — `isMyTurn` controls this |
| You **cannot challenge your own play** | `lastPlay.playerId !== mySessionId` guard |
| Actual cards in `lastPlay` are **never sent** | Only revealed in `lastChallenge.actualCards` after resolution |
| Pile is **face-down** — only `pileSize` is known | Never show pile contents to anyone |
| `lastChallenge` persists until the next play clears it | Good for showing a result overlay even if user polls a bit late |
| After emptying your hand you win **immediately** | No challenge window on last-card plays |

---

## Deck sizes

| Players | Decks | Cards dealt |
|---------|-------|-------------|
| 2–4 | 1 × 52 | 26 / 17–17–18 / 13 each |
| 5–8 | 2 × 52 | ~20 each |

Some players may have one more card than others when the deck doesn't divide evenly — this is normal.

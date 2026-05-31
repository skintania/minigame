# Slave — Frontend Guide

## Cards & Rank Order

52-card deck. Card format: `{rank}{suit}` — e.g. `3♣`, `10♠`, `A♥`, `2♦`.

Rank order **low → high**: `3 4 5 6 7 8 9 10 J Q K A 2`

So `2` is the strongest single card, `3` is the weakest.

---

## Goal

Empty your hand as fast as possible. First to finish = **President**, last remaining = **Slave**.

---

## Round Flow

```
Round starts → tricks are played → players finish one by one → last player = Slave
→ ranks assigned → host calls next-round → card exchange happens → new round
```

---

## Tricks

Each turn a player either **plays cards** or **passes**.

**Playing cards:**
- You must play 1–4 cards, all of the **same rank** (e.g. three Queens = `Q♣ Q♥ Q♠`)
- Your play must **beat the current trick** (see rules below)
- If no trick is active (`trick = null`), you can play any valid set — you lead

**Passing:**
- You can only pass when a trick is active (`trick !== null`)
- You cannot pass to start a new trick

**Trick ends (cleared)** when every other active player has passed since the last card was played. The player who last played **wins the trick** and leads next — `trick` goes back to `null`.

---

## Beating Rules

| Your play | Beats |
|---|---|
| Same count, higher rank | Same count trick |
| **3 cards (any rank)** | Any **1-card** trick |
| **4 cards (any rank)** | Any **2-card** trick |
| Anything else | ✗ Cannot beat |

Examples:
- Three 3s beats a single Ace ✓ (3 beats 1)
- Four 5s beats a pair of Kings ✓ (4 beats 2)
- Three 5s does NOT beat a pair ✗ (no 3-vs-2 rule)
- A higher single beats a lower single ✓

---

## First Play Rule

The player holding `3♣` goes first and **must include `3♣`** in their opening play. They can play it alone or alongside other 3s (`3♣ 3♦` etc.).

---

## Finishing

When a player empties their hand mid-trick:
- They're added to `finishOrder` and **skipped from that point on**
- The trick they played still stands — other players must beat it or pass
- If they won the trick (everyone else passed) and they've already finished, the **next active player** leads instead

Round ends when only 1 active player remains — they're automatically added as last in `finishOrder`.

---

## Ranks (assigned at round end)

| Players | Titles assigned |
|---|---|
| 2–3 | President, (Citizen × N), Slave |
| 4+ | President, Vice President, (Citizen × N), Vice Slave, Slave |

---

## Card Exchange (start of next round)

Cards are freshly dealt, **then** the exchange happens automatically before the round begins:

| Players | Exchange |
|---|---|
| 2–3 | Slave gives their **best 1 card** to President; President gives their **worst 1 card** to Slave |
| 4+ | Same as above but **2 cards** each; Vice Slave gives **best 1** to Vice President; Vice President gives **worst 1** to Vice Slave |

The frontend doesn't need to do anything — the exchange is applied server-side inside `next-round`.

---

## Key State Fields

| Field | Meaning |
|---|---|
| `trick` | `null` = no active trick (someone must lead). Object = `{ count, value, playedBy, cards }` |
| `consecutivePasses` | How many passes since the last play. Trick clears when this reaches active player count − 1 |
| `finishOrder` | Players who emptied their hand, in order. Use this to show finish positions |
| `ranks` | Set when `phase = "finished"`. Map of `sessionId → title` |
| `turnOrder` | Pre-computed play sequence starting from current player (top-level field, not in metadata) |

---

## What to Show

| Situation | UI |
|---|---|
| `trick !== null` | Show the played cards, who played them, what count/rank must be beaten |
| `trick === null` | Current player must lead — show "Play any set" |
| `isMyTurn = true` | Enable card selection and play/pass buttons |
| Player in `finishOrder` | Show their rank badge, grey out their seat |
| `phase = "finished"` | Show full `ranks` for each player, host sees "Next Round" button |
| Opponent hands | `["hidden", "hidden", ...]` — array length = card count |

---

## Actions

**Play cards**
```json
POST /games/slave/:matchId/play
{ "sessionId": "uuid", "cards": ["Q♣", "Q♥"] }
```

**Pass**
```json
POST /games/slave/:matchId/pass
{ "sessionId": "uuid" }
```

**Start next round** (host only, after `phase = "finished"`)
```json
POST /games/slave/:matchId/next-round
{ "sessionId": "uuid" }
```

**End game** (host only, anytime)
```json
POST /games/slave/:matchId/end-game
{ "sessionId": "uuid" }
```

All action endpoints return `{ "ok": true }`. Poll `GET /games/slave/:matchId/state?sessionId=` after every action to refresh the UI.

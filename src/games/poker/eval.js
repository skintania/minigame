const HAND_NAMES = [
  '', 'High Card', 'One Pair', 'Two Pair', 'Three of a Kind',
  'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush',
]

function parseCard(str) {
  if (!str || str === 'hidden' || str === 'back') return null
  const m = str.match(/^(.+?)([♠♥♦♣])$/)
  if (!m) return null
  const r = m[1]
  const rank = r === 'A' ? 14 : r === 'K' ? 13 : r === 'Q' ? 12 : r === 'J' ? 11 : +r
  return rank ? { rank, suit: m[2] } : null
}

function* combos5(arr, start = 0, cur = []) {
  if (cur.length === 5) { yield cur; return }
  const need = 5 - cur.length
  for (let i = start; i <= arr.length - need; i++) {
    yield* combos5(arr, i + 1, [...cur, arr[i]])
  }
}

function score5(hand) {
  const ranks   = hand.map(c => c.rank).sort((a, b) => b - a)
  const suits   = hand.map(c => c.suit)
  const isFlush = suits.every(s => s === suits[0])

  let isStraight = false
  let strHigh    = ranks[0]
  if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) {
    isStraight = true
  } else if (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
    isStraight = true; strHigh = 5
  }

  const freq   = {}
  for (const r of ranks) freq[r] = (freq[r] || 0) + 1
  const counts = Object.values(freq).sort((a, b) => b - a)

  if (isFlush && isStraight) return strHigh === 14 ? 10 : 9
  if (counts[0] === 4) return 8
  if (counts[0] === 3 && counts[1] === 2) return 7
  if (isFlush) return 6
  if (isStraight) return 5
  if (counts[0] === 3) return 4
  if (counts[0] === 2 && counts[1] === 2) return 3
  if (counts[0] === 2) return 2
  return 1
}

// Returns the best 5-card hand name from an array of card strings.
// Cards must be in server format: "A♠", "10♥", etc.
// Returns '' when fewer than 5 valid cards are provided.
export function getBestHandName(cardStrings) {
  const cards = cardStrings.map(parseCard).filter(Boolean)
  if (cards.length < 5) return ''
  let best = 0
  for (const combo of combos5(cards)) {
    const s = score5(combo)
    if (s > best) best = s
  }
  return HAND_NAMES[best] || ''
}

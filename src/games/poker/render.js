import { state, cfg } from '../../state.js'

const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }
const RED_SUITS    = new Set(['hearts', 'diamonds'])
const RED_SYMS     = new Set(['♥', '♦'])
const CARD_BASE    = () => `${cfg.url}/assets/cards/standard-deck`

export function renderBoard(meta, mine) {
  document.getElementById('pk-pot').textContent   = meta.pot        ?? 0
  document.getElementById('pk-cbet').textContent  = meta.currentBet ?? 0
  document.getElementById('pk-mbet').textContent  = (meta.bets || {})[state.sessionId] ?? 0
  document.getElementById('pk-last').textContent  = meta.lastAction || ''

  // Check vs Call
  const myBet    = (meta.bets || {})[state.sessionId] || 0
  const callAmt  = (meta.currentBet || 0) - myBet
  const checkBtn = document.getElementById('btn-check')
  if (callAmt > 0) {
    checkBtn.textContent    = `Call (${callAmt})`
    checkBtn.dataset.action = 'call'
  } else {
    checkBtn.textContent    = 'Check'
    checkBtn.dataset.action = 'check'
  }

  // Community cards
  const comm = meta.community || []
  document.getElementById('pk-community').innerHTML =
    comm.map(cardHTML).join('') +
    Array(5 - comm.length).fill('<div class="p-card placeholder"></div>').join('')

  // My hand
  const myHand = (meta.hands || {})[state.sessionId] || []
  document.getElementById('pk-hand').innerHTML = myHand.map(cardHTML).join('')

  // Opponent hand — server sends ["hidden","hidden"] until showdown
  const oppId   = (state.gameState.players || []).find(p => p !== state.sessionId)
  const oppHand = (meta.hands || {})[oppId]
  document.getElementById('pk-opp-hand').innerHTML = oppHand?.length
    ? oppHand.map(cardHTML).join('')
    : '<div class="p-card back"></div><div class="p-card back"></div>'

  ;['btn-fold', 'btn-check', 'btn-bet'].forEach(id => {
    document.getElementById(id).disabled = !mine
  })
  document.getElementById('bet-amt').disabled = !mine
}

export function cardHTML(str) {
  if (!str || str === 'hidden') return '<div class="p-card back"></div>'

  // Try image first — falls back to CSS card on error
  const src = `${CARD_BASE()}/${str}.svg`
  return `<img class="p-card-img" src="${src}" alt="${str}"
    onerror="this.outerHTML='${cssCard(str).replace(/'/g, "&#39;")}'">`
}

function cssCard(str) {
  let rank, sym, colorClass

  const symMatch = str.match(/^(.+?)([♠♥♦♣])$/)
  if (symMatch) {
    rank       = symMatch[1]
    sym        = symMatch[2]
    colorClass = RED_SYMS.has(sym) ? 'red' : 'black'
  } else {
    const [r, suit] = str.split('-')
    rank       = r || str
    sym        = SUIT_SYMBOLS[suit] || suit || '?'
    colorClass = RED_SUITS.has(suit) ? 'red' : 'black'
  }

  return `<div class="p-card ${colorClass}">` +
    `<div class="tl"><span class="r">${rank}</span><span class="s">${sym}</span></div>` +
    `<div class="center">${sym}</div>` +
    `<div class="br"><span class="r">${rank}</span><span class="s">${sym}</span></div>` +
    `</div>`
}

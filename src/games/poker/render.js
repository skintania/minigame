import { state } from '../../state.js'

const SUIT_SYMBOLS  = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }
const RED_SUITS     = new Set(['hearts', 'diamonds'])
const RED_SYMS      = new Set(['♥', '♦'])

export function renderBoard(meta, mine) {
  document.getElementById('pk-pot').textContent   = meta.pot        ?? 0
  document.getElementById('pk-cbet').textContent  = meta.currentBet ?? 0
  document.getElementById('pk-mbet').textContent  = (meta.bets || {})[state.sessionId] ?? 0
  document.getElementById('pk-last').textContent  = meta.lastAction || ''

  // Check vs Call
  const myBet   = (meta.bets || {})[state.sessionId] || 0
  const callAmt = (meta.currentBet || 0) - myBet
  const checkBtn = document.getElementById('btn-check')
  if (callAmt > 0) {
    checkBtn.textContent      = `Call (${callAmt})`
    checkBtn.dataset.action   = 'call'
  } else {
    checkBtn.textContent      = 'Check'
    checkBtn.dataset.action   = 'check'
  }

  // Community cards — fill remaining slots with placeholders
  const comm   = meta.community || []
  const commEl = document.getElementById('pk-community')
  commEl.innerHTML =
    comm.map(cardHTML).join('') +
    Array(5 - comm.length).fill('<div class="p-card placeholder"></div>').join('')

  // My hand
  const myHand = (meta.hands || {})[state.sessionId] || []
  document.getElementById('pk-hand').innerHTML = myHand.map(cardHTML).join('')

  // Opponent hand — revealed by server at showdown
  const oppId   = (state.gameState.players || []).find(p => p !== state.sessionId)
  const oppHand = (meta.hands || {})[oppId]
  document.getElementById('pk-opp-hand').innerHTML = oppHand?.length
    ? oppHand.map(cardHTML).join('')
    : '<div class="p-card back"></div><div class="p-card back"></div>'

  // Enable/disable action buttons
  ;['btn-fold', 'btn-check', 'btn-bet'].forEach(id => {
    document.getElementById(id).disabled = !mine
  })
  document.getElementById('bet-amt').disabled = !mine
}

export function cardHTML(str) {
  let rank, sym, colorClass

  // Format A: "K♠", "10♣" — symbol already embedded
  const symMatch = str.match(/^(.+?)([♠♥♦♣])$/)
  if (symMatch) {
    rank       = symMatch[1]
    sym        = symMatch[2]
    colorClass = RED_SYMS.has(sym) ? 'red' : 'black'
  } else {
    // Format B: "K-spades", "10-hearts"
    const [r, suit] = str.split('-')
    rank       = r   || str
    sym        = SUIT_SYMBOLS[suit] || suit || '?'
    colorClass = RED_SUITS.has(suit) ? 'red' : 'black'
  }

  return `<div class="p-card ${colorClass}">
    <div class="tl"><span class="r">${rank}</span><span class="s">${sym}</span></div>
    <div class="center">${sym}</div>
    <div class="br"><span class="r">${rank}</span><span class="s">${sym}</span></div>
  </div>`
}

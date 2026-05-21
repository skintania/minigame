import { state, cfg } from '../../state.js'

const CARD_BASE = () => `${cfg.url}/assets/cards/standard-deck`

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
    comm.map(cardImg).join('') +
    Array(5 - comm.length).fill('<div class="p-card placeholder"></div>').join('')

  // My hand
  const myHand = (meta.hands || {})[state.sessionId] || []
  document.getElementById('pk-hand').innerHTML = myHand.map(cardImg).join('')

  // Opponent hand — server sends ["hidden","hidden"] until showdown
  const oppId   = (state.gameState.players || []).find(p => p !== state.sessionId)
  const oppHand = (meta.hands || {})[oppId]
  document.getElementById('pk-opp-hand').innerHTML = oppHand?.length
    ? oppHand.map(cardImg).join('')
    : backImg() + backImg()

  // Enable/disable action buttons
  ;['btn-fold', 'btn-check', 'btn-bet'].forEach(id => {
    document.getElementById(id).disabled = !mine
  })
  document.getElementById('bet-amt').disabled = !mine
}

function cardImg(str) {
  const src = str === 'hidden'
    ? `${CARD_BASE()}/back.svg`
    : `${CARD_BASE()}/${str}.svg`
  return `<img class="p-card-img" src="${src}" alt="${str}">`
}

function backImg() {
  return `<img class="p-card-img" src="${CARD_BASE()}/back.svg" alt="card back">`
}

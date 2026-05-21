import { state, cfg } from '../../state.js'

const UNO_BASE   = () => `${cfg.url}/assets/cards/uno-deck`
const COLOR_HEX  = { red: '#ff4757', blue: '#3AABDE', green: '#2ed573', yellow: '#ffd32a' }

export function renderBoard(meta, mine, onPlay) {
  const oppId   = (state.gameState.players || []).find(p => p !== state.sessionId)
  const oppHand = (meta.hands || {})[oppId] || []

  document.getElementById('uno-opp-cnt').textContent = oppHand.length
  document.getElementById('uno-opp-mini').innerHTML  =
    Array(Math.min(oppHand.length, 8)).fill('<div class="mini-card"></div>').join('')

  // Top discard card
  const top    = (meta.discard || []).slice(-1)[0]
  const discEl = document.getElementById('uno-discard')
  if (top) {
    discEl.className = ''
    discEl.innerHTML = `<img class="uno-card-img" src="${UNO_BASE()}/${top}.svg" alt="${top}">`
  }

  // Current color indicator
  const ccEl = document.getElementById('uno-color-lbl')
  ccEl.textContent = meta.currentColor ? meta.currentColor.toUpperCase() : '—'
  ccEl.style.color = COLOR_HEX[meta.currentColor] || 'var(--muted)'

  // Player hand
  const myHand = (meta.hands || {})[state.sessionId] || []
  const handEl = document.getElementById('uno-hand')
  handEl.innerHTML = myHand.map(card => {
    const ok = mine && canPlay(card, meta)
    return `<img class="uno-card-img ${ok ? 'playable' : 'not-playable'}"
      src="${UNO_BASE()}/${card}.svg" alt="${card}" data-card="${card}">`
  }).join('')

  handEl.onclick = mine ? e => {
    const el = e.target.closest('.uno-card-img.playable')
    if (el) onPlay(el.dataset.card)
  } : null

  document.getElementById('btn-draw').disabled    = !mine
  document.getElementById('uno-last').textContent = meta.lastAction || ''
}

export function canPlay(card, meta) {
  if (card === 'wild' || card === 'wild_draw4') return true
  const [color, val] = card.split('_')
  const [, topVal]   = ((meta.discard || []).slice(-1)[0] || '').split('_')
  return color === meta.currentColor || val === topVal
}

import { state } from '../../state.js'

const COLOR_HEX = { red: '#ff4757', blue: '#3AABDE', green: '#2ed573', yellow: '#ffd32a' }
const VALUE_DISPLAY = { skip: '⊘', reverse: '↺', draw2: '+2' }

export function renderBoard(meta, mine, onPlay) {
  const oppId   = (state.gameState.players || []).find(p => p !== state.sessionId)
  const oppHand = (meta.hands || {})[oppId] || []

  document.getElementById('uno-opp-cnt').textContent = oppHand.length
  document.getElementById('uno-opp-mini').innerHTML  =
    Array(Math.min(oppHand.length, 8)).fill('<div class="mini-card"></div>').join('')

  // Top discard card
  const top = (meta.discard || []).slice(-1)[0]
  if (top) {
    const discEl  = document.getElementById('uno-discard')
    const parsed  = parseCard(top)
    discEl.className = `uno-card ${parsed.cls}`
    discEl.innerHTML = `<span class="cv">${parsed.display}</span>${parsed.label ? `<span class="cl">${parsed.label}</span>` : ''}`
  }

  // Current color indicator
  const ccEl = document.getElementById('uno-color-lbl')
  ccEl.textContent = meta.currentColor ? meta.currentColor.toUpperCase() : '—'
  ccEl.style.color = COLOR_HEX[meta.currentColor] || 'var(--muted)'

  // Player hand — delegate clicks to container
  const myHand = (meta.hands || {})[state.sessionId] || []
  const handEl = document.getElementById('uno-hand')
  handEl.innerHTML = myHand.map(card => {
    const p  = parseCard(card)
    const ok = mine && canPlay(card, meta)
    return `<div class="uno-card ${p.cls} ${ok ? 'playable' : 'not-playable'}"
      data-card="${card}" title="${card}">
      <span class="cv">${p.display}</span>
      ${p.label ? `<span class="cl">${p.label}</span>` : ''}
    </div>`
  }).join('')

  handEl.onclick = mine ? e => {
    const el = e.target.closest('.uno-card.playable')
    if (el) onPlay(el.dataset.card)
  } : null

  document.getElementById('btn-draw').disabled      = !mine
  document.getElementById('uno-last').textContent   = meta.lastAction || ''
}

export function parseCard(card) {
  if (card === 'wild')       return { cls: 'wild', display: 'W',  label: 'Wild' }
  if (card === 'wild_draw4') return { cls: 'wild', display: '+4', label: 'Wild' }
  const [color, val] = card.split('_')
  return { cls: color, display: VALUE_DISPLAY[val] ?? val, label: null }
}

export function canPlay(card, meta) {
  if (card === 'wild' || card === 'wild_draw4') return true
  const [color, val] = card.split('_')
  const [, topVal]   = ((meta.discard || []).slice(-1)[0] || '').split('_')
  return color === meta.currentColor || val === topVal
}

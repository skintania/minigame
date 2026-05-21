import { state, cfg } from '../../state.js'

const UNO_BASE    = () => `${cfg.url}/assets/cards/uno-deck`
const COLOR_HEX   = { red: '#ff4757', blue: '#3AABDE', green: '#2ed573', yellow: '#ffd32a' }
const VALUE_LABEL = { skip: '⊘', reverse: '↺', draw2: '+2' }

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
    discEl.innerHTML = unoCardHTML(top, false, true)
  }

  // Current color
  const ccEl = document.getElementById('uno-color-lbl')
  ccEl.textContent = meta.currentColor ? meta.currentColor.toUpperCase() : '—'
  ccEl.style.color = COLOR_HEX[meta.currentColor] || 'var(--muted)'

  // Player hand
  const myHand = (meta.hands || {})[state.sessionId] || []
  const handEl = document.getElementById('uno-hand')
  handEl.innerHTML = myHand.map(card => unoCardHTML(card, mine && canPlay(card, meta))).join('')

  handEl.onclick = mine ? e => {
    const el = e.target.closest('[data-card].playable')
    if (el) onPlay(el.dataset.card)
  } : null

  document.getElementById('btn-draw').disabled    = !mine
  document.getElementById('uno-last').textContent = meta.lastAction || ''
}

function unoCardHTML(card, playable, isDiscard = false) {
  const src      = `${UNO_BASE()}/${card}.svg`
  const imgClass = `uno-card-img${playable ? ' playable' : ' not-playable'}${isDiscard ? ' discard' : ''}`
  const css      = cssUnoCard(card, playable)
  const safe     = css.replace(/'/g, "&#39;")

  return `<img class="${imgClass}" src="${src}" alt="${card}" data-card="${card}"
    onerror="this.outerHTML='${safe}'">`
}

function cssUnoCard(card, playable) {
  const { cls, display, label } = parseCard(card)
  const stateClass = playable ? 'playable' : 'not-playable'
  return `<div class="uno-card ${cls} ${stateClass}" data-card="${card}">` +
    `<span class="cv">${display}</span>` +
    (label ? `<span class="cl">${label}</span>` : '') +
    `</div>`
}

function parseCard(card) {
  if (card === 'wild')       return { cls: 'wild', display: 'W',  label: 'Wild' }
  if (card === 'wild_draw4') return { cls: 'wild', display: '+4', label: 'Wild' }
  const [color, val] = card.split('_')
  return { cls: color, display: VALUE_LABEL[val] ?? val, label: null }
}

export function canPlay(card, meta) {
  if (card === 'wild' || card === 'wild_draw4') return true
  const [color, val] = card.split('_')
  const [, topVal]   = ((meta.discard || []).slice(-1)[0] || '').split('_')
  return color === meta.currentColor || val === topVal
}

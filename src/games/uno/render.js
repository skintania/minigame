import { state, cfg } from '../../state.js'
import { orderedOpponents } from '../utils.js'

const UNO_BASE  = () => `${cfg.url}/assets/cards/uno-deck`
let _lastHandKey    = ''
let _lastDiscardKey = ''
let _prevDiscardLen = 0

const VAL_ASSET = { draw2: 'draw-two', draw4: 'draw-four' }
function cardSrc(card) {
  if (card === 'wild')       return `${UNO_BASE()}/wild.svg`
  if (card === 'wild_draw4') return `${UNO_BASE()}/wild-draw-four.svg`
  const [color, val] = card.split('_')
  const assetVal = VAL_ASSET[val] || val
  return `${UNO_BASE()}/${color}-${assetVal}.svg`
}
function cardEffClass(card) {
  if (card === 'wild' || card === 'wild_draw4') return 'eff-wild'
  if (card.endsWith('_draw2'))   return 'eff-draw2'
  if (card.endsWith('_reverse')) return 'eff-reverse'
  if (card.endsWith('_skip'))    return 'eff-skip'
  return ''
}
const COLOR_HEX = { red: '#ff4757', blue: '#3AABDE', green: '#2ed573', yellow: '#ffd32a' }
const VAL_LABEL = { skip: '⊘', reverse: '↺', draw2: '+2' }

// Seats in CW order: left → mid-left → top-left → top-center → top-right → mid-right → right
// For CCW games the opponent list is reversed before assigning so next-to-play lands on the right
const SEAT_MAP = [
  [],
  ['top-center'],
  ['top-left', 'top-right'],
  ['left', 'top-center', 'right'],
  ['left', 'top-left', 'top-right', 'right'],
  ['left', 'top-left', 'top-center', 'top-right', 'right'],
  ['left', 'mid-left', 'top-left', 'top-center', 'top-right', 'right'],
  ['left', 'mid-left', 'top-left', 'top-center', 'top-right', 'mid-right', 'right'],
]

export function renderBoard(meta, mine, onPlay) {
  const names       = state.gameState.playerNames || {}
  const hands       = meta.hands || {}
  const isFinished  = meta.phase === 'between-rounds'
  const revealSec   = state.gameState.revealRemainingSec ?? null
  const finishOrder = meta.finishOrder || []

  const opponents = orderedOpponents(meta, state.sessionId, state.gameState.players || [])

  // ── Opponents — positioned badges around the table ───────
  const oppContainer = document.getElementById('uno-opponents')
  if (oppContainer) {
    const seats = SEAT_MAP[Math.min(opponents.length, 7)] || SEAT_MAP[7]
    oppContainer.innerHTML = opponents.slice(0, 7).map((id, i) => {
      const name        = names[id] || id.slice(0, 8)
      const hand        = hands[id] || []
      const isCurrent   = meta.currentPlayer === id && !isFinished
      const isUno       = hand.length === 1 && !isFinished
      const finishPos   = isFinished ? finishOrder.indexOf(id) : -1
      const hasRevealed = isFinished && hand.length > 0 && hand.every(c => c !== 'hidden')
      const seat        = seats[i] || 'top-center'

      const POS_LABEL   = ['🥇', '🥈', '🥉']
      const posTag      = finishPos === finishOrder.length - 1 && finishOrder.length > 1
        ? '💀'
        : (POS_LABEL[finishPos] ?? (finishPos >= 0 ? `#${finishPos + 1}` : ''))

      const cardsHTML = hasRevealed
        ? hand.slice(0, 6).map(c => unoCardHTML(c, false, false, 'small')).join('')
        : Array(Math.min(hand.length, 5)).fill(
            `<img class="uno-card-img mini" src="${UNO_BASE()}/back.svg" alt="back" onerror="this.outerHTML='<div class=&quot;mini-card&quot;></div>'">`
          ).join('')

      const cls = ['uno-opp-slot', isCurrent ? 'turn-active' : '', finishPos === 0 ? 'winner-flash' : '']
        .filter(Boolean).join(' ')

      return `<div class="${cls}" data-seat="${seat}">
        <div class="uno-opp-badge">
          ${isCurrent ? '<span class="uno-turn-dot"></span>' : ''}
          <span class="uno-opp-name">${name}</span>
          ${isUno   ? '<span class="uno-uno-badge">UNO!</span>' : ''}
          ${posTag  ? `<span class="uno-winner-tag">${posTag}</span>` : ''}
          <span class="uno-opp-count-pill">${hand.length}</span>
        </div>
        <div class="uno-opp-cards${hasRevealed ? '' : ' mini'}">${cardsHTML}</div>
      </div>`
    }).join('')
  }

  // ── Direction indicator ──────────────────────────────────
  const dirEl = document.getElementById('uno-direction')
  if (dirEl) {
    const ccw   = meta.direction === -1
    dirEl.innerHTML = `<span class="dir-arrow">${ccw ? '↺' : '↻'}</span>` +
                      `<span class="dir-label">${ccw ? 'Counter-CW' : 'Clockwise'}</span>`
    dirEl.dataset.dir = ccw ? 'ccw' : 'cw'
  }

  // ── Discard pile (messy stack) ───────────────────────────
  const pile   = meta.discard || []
  const discEl = document.getElementById('uno-discard')
  if (discEl) {
    const effectiveLen = pile.length + (state.pendingWild ? 1 : 0)
    const discKey = pile.slice(-6).join(',') + '|' + (meta.lastCard || '') + '|' + (state.pendingWild || '')
    if (discKey !== _lastDiscardKey) {
      const newCount  = Math.max(0, effectiveLen - _prevDiscardLen)
      _lastDiscardKey = discKey
      _prevDiscardLen = effectiveLen
      let recent = pile.length ? pile.slice(-5) : (meta.lastCard ? [meta.lastCard] : [])
      if (state.pendingWild) recent = [...recent.slice(-5), state.pendingWild]
      // 6-slot messy rotation table (oldest → newest)
      const TRANSFORMS = [
        'rotate(-12deg) translate(-7px,  5px)',
        'rotate( 9deg)  translate( 6px, -4px)',
        'rotate(-7deg)  translate(-4px,  3px)',
        'rotate( 6deg)  translate( 3px, -2px)',
        'rotate(-3deg)  translate(-1px,  2px)',
        'rotate( 4deg)  translate( 1px,  0)',
      ]
      const maxSlots = TRANSFORMS.length
      const start    = maxSlots - recent.length
      discEl.innerHTML = recent.map((card, i) => {
        const isTop    = i === recent.length - 1
        const effClass = isTop ? cardEffClass(card) : ''
        const isNew    = newCount > 0 && i >= recent.length - newCount
        const tx       = TRANSFORMS[start + i] || TRANSFORMS[maxSlots - 1]
        return `<div class="discard-layer${isNew ? ' new-card' : ''} ${effClass}" ` +
               `style="--dtx:${tx};transform:${tx};z-index:${i + 1}">` +
          unoCardHTML(card, null, false) + '</div>'
      }).join('')
    }
  }

  // ── Current color ────────────────────────────────────────
  const ccEl = document.getElementById('uno-color-lbl')
  if (ccEl) {
    ccEl.textContent = meta.currentColor ? meta.currentColor.toUpperCase() : '—'
    ccEl.style.color = COLOR_HEX[meta.currentColor] || 'var(--muted)'
  }

  // ── Reveal countdown ─────────────────────────────────────
  const revealBar = document.getElementById('uno-reveal-bar')
  if (revealBar) {
    revealBar.style.display = revealSec != null ? '' : 'none'
    const cEl = document.getElementById('uno-reveal-countdown')
    if (cEl && revealSec != null) cEl.textContent = `${Math.ceil(revealSec)}s`
  }

  // ── Pending draw indicator ───────────────────────────────
  const pendEl = document.getElementById('uno-pending-draw')
  if (pendEl) {
    const pd = meta.pendingDraw || 0
    pendEl.style.display = pd > 0 ? '' : 'none'
    if (pd > 0) {
      const cntEl = document.getElementById('uno-pending-count')
      if (cntEl) cntEl.textContent = pd
    }
  }

  // ── Pass button (after drawing a playable card) ──────────
  const passBtn = document.getElementById('btn-pass')
  if (passBtn) passBtn.style.display = (mine && meta.drewThisTurn) ? '' : 'none'

  // ── My hand (cached to prevent image-reload flicker) ────
  const myHand = hands[state.sessionId] || []
  const handEl = document.getElementById('uno-hand')
  if (handEl) {
    const topCard = (meta.discard || []).slice(-1)[0] || meta.lastCard || ''
    const sel     = state.unoSelected || []
    const handKey = myHand.join(',') + '|' + mine + '|' + topCard + '|' +
                    (meta.currentColor || '') + '|' + (meta.pendingDraw || 0) + '|' + sel.join(',')
    if (handKey !== _lastHandKey) {
      _lastHandKey = handKey
      handEl.innerHTML = myHand.map((card, idx) =>
        unoCardHTML(card, mine ? canPlay(card, meta, idx) : null, false, '', sel.includes(idx), idx)
      ).join('')
      handEl.onclick = mine ? e => {
        const el = e.target.closest('[data-card].playable')
        if (el) onPlay(el.dataset.card, parseInt(el.dataset.idx))
      } : null
    }
  }

  // ── Draw pile ────────────────────────────────────────────
  const drawPile = document.getElementById('uno-draw-pile')
  if (drawPile) {
    const canDraw = mine && !isFinished
    drawPile.classList.toggle('drawable', !!canDraw)
    drawPile.style.pointerEvents = canDraw ? '' : 'none'
  }

  const myUnoEl = document.getElementById('uno-my-uno')
  if (myUnoEl) myUnoEl.style.display = (myHand.length === 1 && !isFinished) ? '' : 'none'

  // ── Draw button + last action ─────────────────────────────
  const drawBtn = document.getElementById('btn-draw')
  if (drawBtn) drawBtn.disabled = !mine || isFinished

  const lastEl = document.getElementById('uno-last')
  if (lastEl) {
    lastEl.textContent = Object.entries(names).reduce(
      (s, [id, n]) => s.replaceAll(id, n), meta.lastAction || ''
    )
  }
}

function unoCardHTML(card, playable, isDiscard = false, size = '', isSelected = false, idx = -1) {
  const src       = cardSrc(card)
  // null = neutral (full opacity, no click); true = playable; false = not-playable (dimmed)
  const playClass = playable === true ? 'playable' : playable === false ? 'not-playable' : ''
  const classes   = ['uno-card-img', playClass, isDiscard ? 'discard' : '', size, isSelected ? 'selected' : ''].filter(Boolean).join(' ')
  const idxAttr   = idx >= 0 ? ` data-idx="${idx}"` : ''
  const safe      = cssUnoCard(card, playable === true, size)
    .replace(/'/g, '&#39;').replace(/"/g, '&quot;')
  return `<img class="${classes}" src="${src}" alt="${card}" data-card="${card}"${idxAttr}
    onerror="this.outerHTML='${safe}'">`
}

function cssUnoCard(card, playable, size = '') {
  const { cls, display, label } = parseCard(card)
  const sc = playable ? 'playable' : 'not-playable'
  const sz = size ? ` ${size}` : ''
  return `<div class="uno-card ${cls} ${sc}${sz}" data-card="${card}">` +
    `<span class="cv">${display}</span>` +
    (label ? `<span class="cl">${label}</span>` : '') +
    `</div>`
}

function parseCard(card) {
  if (card === 'wild')       return { cls: 'wild', display: 'W',  label: 'Wild' }
  if (card === 'wild_draw4') return { cls: 'wild', display: '+4', label: 'Wild' }
  const [color, val] = card.split('_')
  return { cls: color, display: VAL_LABEL[val] ?? val, label: null }
}

export function canPlay(card, meta, cardIdx = -1) {
  // Draw stacking: wild_draw4 always counters; draw2 only if its color matches currentColor
  if (meta.pendingDraw > 0) {
    if (card === 'wild_draw4') return true
    if (card.endsWith('_draw2')) return card.split('_')[0] === meta.currentColor
    return false
  }

  // Multi-select in progress: only same-value non-wild cards remain selectable
  const sel = state.unoSelected || []
  if (sel.length > 0) {
    if (cardIdx >= 0 && sel.includes(cardIdx)) return true  // already selected → deselectable
    if (card === 'wild') return false                        // plain wild cannot be grouped
    const [, val]   = card.split('_')
    const myHand    = (meta.hands || {})[state.sessionId] || []
    const firstCard = myHand[sel[0]] || ''
    const selVal    = firstCard.split('_')[1]
    return !!val && val === selVal
  }

  if (card === 'wild' || card === 'wild_draw4') return true
  const [color, val] = card.split('_')
  const top = (meta.discard || []).slice(-1)[0] || meta.lastCard || ''
  const [, topVal] = top.split('_')
  return color === meta.currentColor || val === topVal
}

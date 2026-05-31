import { state, cfg } from '../../state.js'

const UNO_BASE  = () => `${cfg.url}/assets/cards/uno-deck`
let _lastHandKey    = ''
let _lastDiscardKey = ''

const VAL_ASSET = { draw2: 'draw-two', draw4: 'draw-four' }
function cardSrc(card) {
  if (card === 'wild_draw4') return `${UNO_BASE()}/wild-draw-four.svg`
  const [color, val] = card.split('_')
  const assetVal = VAL_ASSET[val] || val
  return `${UNO_BASE()}/${color ? `${color}-${assetVal}` : card}.svg`
}
const COLOR_HEX = { red: '#ff4757', blue: '#3AABDE', green: '#2ed573', yellow: '#ffd32a' }
const VAL_LABEL = { skip: '⊘', reverse: '↺', draw2: '+2' }

const SEAT_MAP = [
  [],
  ['top-center'],
  ['top-left', 'top-right'],
  ['top-left', 'top-center', 'top-right'],
  ['top-left', 'top-center', 'top-right', 'right'],
  ['top-left', 'top-center', 'top-right', 'mid-left', 'mid-right'],
  ['top-left', 'top-center', 'top-right', 'left', 'mid-right', 'right'],
  ['left', 'top-left', 'top-center', 'top-right', 'right', 'mid-left', 'mid-right'],
]

export function renderBoard(meta, mine, onPlay) {
  const players    = state.gameState.players || []
  const opponents  = players.filter(p => p !== state.sessionId)
  const names      = state.gameState.playerNames || {}
  const hands      = meta.hands || {}
  const isFinished = meta.phase === 'finished'
  const revealSec  = state.gameState.revealRemainingSec ?? null

  // ── Opponents — positioned badges around the table ───────
  const oppContainer = document.getElementById('uno-opponents')
  if (oppContainer) {
    const seats = SEAT_MAP[Math.min(opponents.length, 7)] || SEAT_MAP[7]
    oppContainer.innerHTML = opponents.slice(0, 7).map((id, i) => {
      const name        = names[id] || id.slice(0, 8)
      const hand        = hands[id] || []
      const isCurrent   = meta.currentPlayer === id && !isFinished
      const isUno       = hand.length === 1 && !isFinished
      const isWinner    = isFinished && hand.length === 0
      const hasRevealed = isFinished && hand.length > 0 && hand.every(c => c !== 'hidden')
      const seat        = seats[i] || 'top-center'

      const cardsHTML = hasRevealed
        ? hand.slice(0, 6).map(c => unoCardHTML(c, false, false, 'small')).join('')
        : Array(Math.min(hand.length, 5)).fill(
            `<img class="uno-card-img mini" src="${UNO_BASE()}/back.svg" alt="back" onerror="this.outerHTML='<div class=&quot;mini-card&quot;></div>'">`
          ).join('')

      const cls = ['uno-opp-slot', isCurrent ? 'turn-active' : '', isWinner ? 'winner-flash' : '']
        .filter(Boolean).join(' ')

      return `<div class="${cls}" data-seat="${seat}">
        <div class="uno-opp-badge">
          ${isCurrent ? '<span class="uno-turn-dot"></span>' : ''}
          <span class="uno-opp-name">${name}</span>
          ${isUno    ? '<span class="uno-uno-badge">UNO!</span>' : ''}
          ${isWinner ? '<span class="uno-winner-tag">🏆</span>' : ''}
          <span class="uno-opp-count-pill">${hand.length}</span>
        </div>
        <div class="uno-opp-cards${hasRevealed ? '' : ' mini'}">${cardsHTML}</div>
      </div>`
    }).join('')
  }

  // ── Direction arrow ──────────────────────────────────────
  const dirEl = document.getElementById('uno-direction')
  if (dirEl) {
    dirEl.textContent = meta.direction === -1 ? '↺' : '↻'
    dirEl.title = meta.direction === -1 ? 'Counter-clockwise' : 'Clockwise'
  }

  // ── Discard pile (messy stack) ───────────────────────────
  const pile   = meta.discard || []
  const discEl = document.getElementById('uno-discard')
  if (discEl) {
    const discKey = pile.slice(-4).join(',') + '|' + (meta.lastCard || '')
    if (discKey !== _lastDiscardKey) {
      _lastDiscardKey = discKey
      const recent = pile.length ? pile.slice(-4) : (meta.lastCard ? [meta.lastCard] : [])
      // fixed rotations/offsets per layer so the pile looks thrown down
      const TRANSFORMS = [
        'rotate(-11deg) translate(-4px, 3px)',
        'rotate(7deg)  translate(3px, -2px)',
        'rotate(-5deg) translate(-2px, -3px)',
        'rotate(4deg)  translate(1px, 0)',
      ]
      const start = 4 - recent.length
      discEl.innerHTML = recent.map((card, i) =>
        `<div class="discard-layer" style="transform:${TRANSFORMS[start + i]};z-index:${i + 1}">` +
        unoCardHTML(card, false, false) + '</div>'
      ).join('')
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
      handEl.innerHTML = myHand.map(card =>
        unoCardHTML(card, mine ? canPlay(card, meta) : null, false, '', sel.includes(card))
      ).join('')
      handEl.onclick = mine ? e => {
        const el = e.target.closest('[data-card].playable')
        if (el) onPlay(el.dataset.card)
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

function unoCardHTML(card, playable, isDiscard = false, size = '', isSelected = false) {
  const src       = cardSrc(card)
  // null = neutral (full opacity, no click); true = playable; false = not-playable (dimmed)
  const playClass = playable === true ? 'playable' : playable === false ? 'not-playable' : ''
  const classes   = ['uno-card-img', playClass, isDiscard ? 'discard' : '', size, isSelected ? 'selected' : ''].filter(Boolean).join(' ')
  const safe      = cssUnoCard(card, playable === true, size)
    .replace(/'/g, '&#39;').replace(/"/g, '&quot;')
  return `<img class="${classes}" src="${src}" alt="${card}" data-card="${card}"
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

export function canPlay(card, meta) {
  // Draw stacking: only draw2 / wild_draw4 can counter a pending penalty
  if (meta.pendingDraw > 0) {
    return card === 'wild_draw4' || card.endsWith('_draw2')
  }

  // Multi-select in progress: only same-number cards remain playable
  const sel = state.unoSelected || []
  if (sel.length > 0) {
    if (sel.includes(card)) return true  // already selected — clickable to deselect
    const [, val]   = card.split('_')
    const selVal    = sel[0].split('_')[1]
    return val && /^\d$/.test(val) && val === selVal
  }

  if (card === 'wild' || card === 'wild_draw4') return true
  const [color, val] = card.split('_')
  const top = (meta.discard || []).slice(-1)[0] || meta.lastCard || ''
  const [, topVal] = top.split('_')
  return color === meta.currentColor || val === topVal
}

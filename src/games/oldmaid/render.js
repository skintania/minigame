import { state, cfg } from '../../state.js'
import { omPick, omSetShuffleMode, omReorderHand } from './actions.js'

const SUIT_NAMES = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' }
const CARD_BASE  = () => `${cfg.url}/assets/cards/standard-deck`

let prevMatchId    = null
let selectedIdx    = null   // for manual reorder swap

function cardImgSrc(card) {
  if (card === 'Joker') return `${CARD_BASE()}/joker.svg`
  if (!card || card === 'hidden') return null
  const suit = SUIT_NAMES[card.slice(-1)]
  const rank = card.slice(0, -1)
  if (!suit) return null
  return `${CARD_BASE()}/${rank.toLowerCase()}-${suit}.svg`
}

function cardHtml(card, cls = '') {
  if (card === 'hidden') return `<div class="om-card-back ${cls}"></div>`
  const src = cardImgSrc(card)
  const isJoker = card === 'Joker'
  if (!src) return `<div class="om-card-face om-joker ${cls}">🃏</div>`
  return `<img class="om-card ${isJoker ? 'om-joker' : ''} ${cls}" src="${src}" alt="${card}" onerror="this.style.opacity='0'">`
}

function pName(id) {
  return state.gameState?.playerNames?.[id] || id.slice(0, 8)
}

export function renderBoard(meta, mine) {
  if (!meta) return

  const gs        = state.gameState
  const myId      = state.sessionId
  const players   = gs?.players    || []
  const names     = gs?.playerNames || {}
  const turnOrder = gs?.turnOrder  || players

  const {
    phase, hands = {}, discarded = {}, shuffleMode = {},
    currentPlayer, eliminated = [], loser, lastAction,
  } = meta

  const isNewMatch = state.matchId !== prevMatchId
  if (isNewMatch) { prevMatchId = state.matchId; selectedIdx = null }

  const isActive     = phase === 'playing'
  const pickTarget   = mine ? turnOrder.find(id => id !== myId && !eliminated.includes(id)) : null
  const myHand       = hands[myId] || []
  const myShuffleMode = shuffleMode[myId] || 'auto'

  // ── Phase badge ──────────────────────────────────────────
  const phaseEl = document.getElementById('g-phase')
  if (phaseEl) phaseEl.textContent = phase === 'playing' ? 'Playing' : phase === 'finished' ? 'Finished' : phase

  // ── Opponents ────────────────────────────────────────────
  const oppEl = document.getElementById('om-opponents')
  if (oppEl) {
    const opponents = turnOrder.filter(id => id !== myId)
    oppEl.innerHTML = opponents.map(id => {
      const hand         = hands[id] || []
      const pairs        = discarded[id] || []
      const isElim       = eliminated.includes(id)
      const isCurrent    = id === currentPlayer && isActive
      const isPickTarget = id === pickTarget
      const isLoser      = id === loser
      const shuffle      = shuffleMode[id]

      const classes = [
        'om-seat',
        isCurrent    ? 'om-seat-active'      : '',
        isPickTarget ? 'om-seat-pick-target' : '',
        isElim       ? 'om-eliminated'       : '',
        isLoser      ? 'om-loser'            : '',
      ].filter(Boolean).join(' ')

      const cardBacks = isPickTarget
        ? hand.map((_, i) =>
            `<button class="om-card-back om-pickable" data-pick="${i}" aria-label="Pick card ${i + 1}"></button>`
          ).join('')
        : hand.map(() => `<div class="om-card-back"></div>`).join('')

      const pairsHtml = pairs.length > 0
        ? `<div class="om-seat-pairs">${pairs.length}🃏 pair${pairs.length > 1 ? 's' : ''}</div>`
        : ''

      return `<div class="${classes}" data-id="${id}">
        <div class="om-seat-name">${names[id] || id.slice(0, 8)}${isLoser ? ' 😿' : isElim ? ' ✅' : ''}</div>
        ${shuffle ? `<div class="om-seat-shuffle">${shuffle === 'auto' ? '🔀' : '✋'}</div>` : ''}
        <div class="om-card-backs">${cardBacks}</div>
        <div class="om-seat-info">${hand.length} card${hand.length !== 1 ? 's' : ''}</div>
        ${pairsHtml}
        ${isPickTarget && mine ? `<div class="om-pick-arrow">Pick one ↑</div>` : ''}
      </div>`
    }).join('')

    if (mine) {
      oppEl.addEventListener('click', e => {
        const btn = e.target.closest('[data-pick]')
        if (!btn) return
        omPick(parseInt(btn.dataset.pick, 10))
      }, { once: true })
    }
  }

  // ── Center info ──────────────────────────────────────────
  const centerEl = document.getElementById('om-center-info')
  if (centerEl) {
    if (phase === 'finished') {
      centerEl.innerHTML = loser
        ? `<div class="om-finished-msg">😿 ${names[loser] || loser.slice(0,8)} holds the Joker!</div>`
        : `<div class="om-finished-msg">🎉 Game Over!</div>`
    } else if (mine) {
      centerEl.innerHTML = pickTarget
        ? `<div class="om-turn-msg">Pick a card from <strong>${names[pickTarget] || pickTarget.slice(0,8)}</strong></div>`
        : `<div class="om-turn-msg">✅ You're safe!</div>`
    } else {
      const cp = currentPlayer ? (names[currentPlayer] || currentPlayer.slice(0,8)) : '—'
      centerEl.innerHTML = `<div class="om-wait-msg">Waiting for <strong>${cp}</strong> to pick…</div>`
    }
  }

  // ── My hand ──────────────────────────────────────────────
  const handEl = document.getElementById('om-my-hand')
  if (handEl) {
    if (myHand.length === 0 && !eliminated.includes(myId)) {
      handEl.innerHTML = ''
    } else if (eliminated.includes(myId)) {
      handEl.innerHTML = `<div class="om-safe-badge">✅ You're safe!</div>`
    } else {
      const isManual   = myShuffleMode === 'manual'
      handEl.innerHTML = myHand.map((card, i) => {
        const isJoker    = card === 'Joker'
        const isSelected = isManual && selectedIdx === i
        return `<div class="om-hand-card ${isJoker ? 'om-hand-joker' : ''} ${isSelected ? 'om-hand-selected' : ''}" data-hand-idx="${i}">
          ${cardHtml(card, 'om-hand-card-img')}
          ${isManual ? `<div class="om-card-label">${isJoker ? '🃏 Joker' : card}</div>` : ''}
        </div>`
      }).join('')

      if (isManual) {
        handEl.addEventListener('click', e => {
          const card = e.target.closest('[data-hand-idx]')
          if (!card) return
          const idx = parseInt(card.dataset.handIdx, 10)
          if (selectedIdx === null) {
            selectedIdx = idx
            renderBoard(meta, mine)
          } else if (selectedIdx === idx) {
            selectedIdx = null
            renderBoard(meta, mine)
          } else {
            const newOrder = [...myHand]
            ;[newOrder[selectedIdx], newOrder[idx]] = [newOrder[idx], newOrder[selectedIdx]]
            selectedIdx = null
            omReorderHand(newOrder)
          }
        }, { once: true })
      }
    }
  }

  // ── Shuffle toggle ───────────────────────────────────────
  const shuffleEl = document.getElementById('om-shuffle-toggle')
  if (shuffleEl && !eliminated.includes(myId) && myHand.length > 0) {
    const isManual = myShuffleMode === 'manual'
    shuffleEl.innerHTML = `
      <span class="om-shuffle-label">Card order:</span>
      <button class="btn om-shuffle-btn ${!isManual ? 'om-shuffle-active' : ''}" id="om-mode-auto">🔀 Auto</button>
      <button class="btn om-shuffle-btn ${isManual  ? 'om-shuffle-active' : ''}" id="om-mode-manual">✋ Manual</button>
    `
    shuffleEl.style.display = ''
    document.getElementById('om-mode-auto')?.addEventListener('click',   () => omSetShuffleMode('auto'))
    document.getElementById('om-mode-manual')?.addEventListener('click', () => omSetShuffleMode('manual'))
  } else if (shuffleEl) {
    shuffleEl.style.display = 'none'
  }

  // ── Manual reorder hint ──────────────────────────────────
  const hintEl = document.getElementById('om-reorder-hint')
  if (hintEl) {
    hintEl.style.display = myShuffleMode === 'manual' && !eliminated.includes(myId) && myHand.length > 1 ? '' : 'none'
  }

  // ── Last action ──────────────────────────────────────────
  const lastEl = document.getElementById('om-last')
  if (lastEl) lastEl.textContent = lastAction || ''

  // ── Finished state ───────────────────────────────────────
  if (phase === 'finished') {
    document.getElementById('om-hand-footer')?.style.setProperty('display', 'none')
  }
}

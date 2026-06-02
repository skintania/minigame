import { state, cfg } from '../../state.js'
import { omPick, omSetShuffleMode, omReorderHand } from './actions.js'

const SUIT_NAMES = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' }
const CARD_BASE  = () => `${cfg.url}/assets/cards/standard-deck`

let prevMatchId = null
let selectedIdx = null
let prevMeta    = null

function cardImgSrc(card) {
  if (card === 'Joker') return `${CARD_BASE()}/red-joker.svg`
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

function messyTransform(idx) {
  const angle = ((idx * 73 + 11) % 62) - 31
  const tx    = ((idx * 47 + 7)  % 60) - 30
  const ty    = ((idx * 31 + 13) % 50) - 25
  return `rotate(${angle}deg) translate(${tx}px, ${ty}px)`
}

// Fly a card element from one screen rect to another, then fade out
function flyCard(fromRect, toRect, cardSrc, delay = 0, w = 28, h = 40) {
  if (!fromRect || !toRect) return

  const sx = fromRect.left + fromRect.width  / 2 - w / 2
  const sy = fromRect.top  + fromRect.height / 2 - h / 2
  const ex = toRect.left   + toRect.width    / 2 - w / 2
  const ey = toRect.top    + toRect.height   / 2 - h / 2

  const el = document.createElement('div')
  el.style.cssText = `position:fixed;left:${sx}px;top:${sy}px;width:${w}px;height:${h}px;border-radius:5px;z-index:9999;pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,0.6);`

  if (cardSrc) {
    el.innerHTML = `<img src="${cardSrc}" style="width:100%;height:100%;object-fit:contain;border-radius:4px;display:block">`
  } else {
    el.style.cssText += 'background:linear-gradient(135deg,#1a2060,#2d3590);border:1.5px solid rgba(255,255,255,0.2);'
  }

  document.body.appendChild(el)

  const go = () => {
    el.getBoundingClientRect()  // force reflow so transition fires
    el.style.transition = 'left 0.4s cubic-bezier(0.4,0,0.2,1),top 0.4s cubic-bezier(0.4,0,0.2,1),opacity 0.15s 0.32s'
    requestAnimationFrame(() => {
      el.style.left    = `${ex}px`
      el.style.top     = `${ey}px`
      el.style.opacity = '0'
    })
    setTimeout(() => el.remove(), 550)
  }

  delay > 0 ? setTimeout(go, delay) : requestAnimationFrame(() => requestAnimationFrame(go))
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
  if (isNewMatch) { prevMatchId = state.matchId; selectedIdx = null; prevMeta = null }

  const isActive      = phase === 'playing'
  const pickTarget    = mine ? turnOrder.find(id => id !== myId && !eliminated.includes(id)) : null
  const myHand        = hands[myId] || []
  const myShuffleMode = shuffleMode[myId] || 'auto'

  // ── Animation detection (must run before any DOM mutations) ──
  const newCardIndices = new Set()

  if (prevMeta && !isNewMatch) {
    const prevMyHand    = prevMeta.hands?.[myId]          || []
    const prevDiscCount = prevMeta.discarded?.[myId]?.length || 0
    const currDiscCount = discarded[myId]?.length           || 0

    // Pair discarded → two face-up cards fly from hand to pile
    if (currDiscCount > prevDiscCount) {
      const newPair = discarded[myId]?.[currDiscCount - 1]
      const fromEl  = document.getElementById('om-my-hand')
      const toEl    = document.getElementById('om-discard-pile')
      if (fromEl && toEl && newPair) {
        const from = fromEl.getBoundingClientRect()
        const to   = toEl.getBoundingClientRect()
        flyCard(from, to, cardImgSrc(newPair[0]), 0,  42, 61)
        flyCard(from, to, cardImgSrc(newPair[1]), 90, 42, 61)
      }
    }

    // Detect newly arrived cards so we can play the arrive animation
    const prevSet = new Set(prevMyHand)
    myHand.forEach((c, i) => { if (!prevSet.has(c)) newCardIndices.add(i) })
  }

  prevMeta = meta

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
        ? `<div class="om-seat-pairs">${pairs.length} pair${pairs.length > 1 ? 's' : ''} discarded</div>`
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
        // Fly a card back immediately from the tapped button to the player's hand
        const handEl = document.getElementById('om-my-hand')
        if (handEl) flyCard(btn.getBoundingClientRect(), handEl.getBoundingClientRect(), null)
        omPick(parseInt(btn.dataset.pick, 10))
      }, { once: true })
    }
  }

  // ── Discard pile on table ───────────────────────────────
  const pileEl  = document.getElementById('om-discard-pile')
  const emptyEl = document.getElementById('om-discard-empty')
  if (pileEl) {
    const allCards = []
    for (const pairs of Object.values(discarded)) {
      for (const pair of pairs) allCards.push(...pair)
    }
    if (emptyEl) emptyEl.style.display = allCards.length > 0 ? 'none' : ''
    pileEl.innerHTML = allCards.map((card, idx) => {
      const src   = cardImgSrc(card)
      const style = `style="transform:${messyTransform(idx)};z-index:${idx}"`
      if (!src) return `<div class="om-table-card-face" ${style}>🃏</div>`
      return `<img class="om-table-card" src="${src}" alt="${card}" ${style} onerror="this.style.opacity='0'">`
    }).join('')
  }

  // ── Center info ──────────────────────────────────────────
  const centerEl = document.getElementById('om-center-info')
  if (centerEl) {
    if (phase === 'finished') {
      centerEl.innerHTML = loser
        ? `<div class="om-finished-msg">😿 ${names[loser] || loser.slice(0,8)} holds the Joker!</div>`
        : `<div class="om-finished-msg">Game ended — a player disconnected.</div>`
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
      const isManual = myShuffleMode === 'manual'
      handEl.innerHTML = myHand.map((card, i) => {
        const isJoker    = card === 'Joker'
        const isSelected = isManual && selectedIdx === i
        const isNew      = newCardIndices.has(i)
        return `<div class="om-hand-card ${isJoker ? 'om-hand-joker' : ''} ${isSelected ? 'om-hand-selected' : ''} ${isNew ? 'om-card-arrive' : ''}" data-hand-idx="${i}">
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

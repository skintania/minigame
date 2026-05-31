import { state, cfg } from '../../state.js'
import { orderedOpponents } from '../utils.js'

const SUIT_NAMES  = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' }
const RANK_EMOJIS = { President: '🥇', 'Vice President': '🥈', Citizen: '', 'Vice Slave': '🔴', Slave: '💀' }
const RANK_ORDER  = { '3':0,'4':1,'5':2,'6':3,'7':4,'8':5,'9':6,'10':7,'J':8,'Q':9,'K':10,'A':11,'2':12 }
const SUIT_ORDER  = { '♣':0,'♦':1,'♥':2,'♠':3 }

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

let _selectedIndices = []
let _lastHandKey     = ''

function parseCard(card) {
  return { suit: card.slice(-1), rank: card.slice(0, -1) }
}

function cardSrc(card) {
  const { rank, suit } = parseCard(card)
  const suitName = SUIT_NAMES[suit] || 'spades'
  return `${cfg.url}/assets/cards/standard-deck/${rank.toLowerCase()}-${suitName}.svg`
}

function cardImgHTML(card, extraCls = '') {
  const src = cardSrc(card)
  const cls = ['slv-card-img', extraCls].filter(Boolean).join(' ')
  return `<img class="${cls}" src="${src}" alt="${card}">`
}

// Return original hand indices sorted by rank then suit (3 lowest → 2 highest)
function sortedHandIndices(hand) {
  return hand
    .map((_, i) => i)
    .sort((a, b) => {
      const ca = parseCard(hand[a]), cb = parseCard(hand[b])
      const rv = (RANK_ORDER[ca.rank] ?? 99) - (RANK_ORDER[cb.rank] ?? 99)
      return rv !== 0 ? rv : (SUIT_ORDER[ca.suit] ?? 0) - (SUIT_ORDER[cb.suit] ?? 0)
    })
}


export function renderBoard(meta, mine, onPlay, onPass) {
  const names           = state.gameState.playerNames || {}
  const hands           = meta.hands || {}
  const trick           = meta.trick || null
  const finishOrder     = meta.finishOrder || []
  const ranks           = meta.ranks || {}
  const isFinished      = meta.phase === 'between-rounds'
  const turnOrder       = meta.turnOrder || state.gameState.turnOrder || []
  const currentPlayer   = turnOrder[0] || null
  const passedThisTrick = meta.passedThisTrick || []
  const iHavePassed     = passedThisTrick.includes(state.sessionId)

  const opponents = orderedOpponents(
    { ...meta, turnOrder },
    state.sessionId,
    state.gameState.players || []
  )

  // ── Opponents ──────────────────────────────────────────────
  const oppContainer = document.getElementById('slv-opponents')
  if (oppContainer) {
    const seats = SEAT_MAP[Math.min(opponents.length, 7)] || SEAT_MAP[7]
    oppContainer.innerHTML = opponents.slice(0, 7).map((id, i) => {
      const name      = names[id] || id.slice(0, 8)
      const hand      = hands[id] || []
      const isCurrent  = currentPlayer === id && !isFinished
      const finishPos  = finishOrder.indexOf(id)
      const rankTitle  = ranks[id] || ''
      const hasPassed  = passedThisTrick.includes(id) && trick !== null && !isFinished
      const seat       = seats[i] || 'top-center'

      const FINISH_MEDALS = ['🥇', '🥈', '🥉']
      const finishTag = finishPos >= 0
        ? (FINISH_MEDALS[finishPos] ?? `#${finishPos + 1}`)
        : ''

      const cardsHTML = hand.length === 0
        ? (finishPos >= 0 || isFinished ? '<span class="slv-done-mark">✓</span>' : '')
        : Array(Math.min(hand.length, 5)).fill(
            `<div class="slv-card-back mini"></div>`
          ).join('')

      const cls = ['slv-opp-slot',
        isCurrent  ? 'turn-active'   : '',
        hasPassed  ? 'passed'        : '',
        finishPos === 0 && !isFinished ? 'winner-flash' : '',
      ].filter(Boolean).join(' ')

      const badgeContent = isFinished && rankTitle
        ? `<span class="slv-rank-badge">${RANK_EMOJIS[rankTitle] || ''} ${rankTitle}</span>`
        : (!isFinished && finishPos >= 0
            ? `<span class="slv-rank-badge done">${finishTag} Done</span>`
            : hasPassed
              ? `<span class="slv-passed-badge">Passed</span>`
              : '')

      return `<div class="${cls}" data-seat="${seat}">
        <div class="slv-opp-badge">
          ${isCurrent ? '<span class="slv-turn-dot"></span>' : ''}
          <span class="slv-opp-name">${name}</span>
          ${badgeContent}
          <span class="slv-opp-count-pill">${hand.length}</span>
        </div>
        ${cardsHTML ? `<div class="slv-opp-cards">${cardsHTML}</div>` : ''}
      </div>`
    }).join('')
  }

  // ── Trick area ─────────────────────────────────────────────
  const trickInfoEl  = document.getElementById('slv-trick-info')
  const trickCardsEl = document.getElementById('slv-trick-cards')

  if (trickInfoEl) {
    if (isFinished) {
      trickInfoEl.innerHTML = ''
    } else if (!trick) {
      const leaderName = currentPlayer === state.sessionId
        ? 'Your turn to lead'
        : `${names[currentPlayer] || '…'} leads`
      trickInfoEl.innerHTML = `<span class="slv-lead-label">${leaderName}</span>`
    } else {
      const playedByName = trick.playedBy === state.sessionId
        ? 'You'
        : (names[trick.playedBy] || 'Opponent')
      trickInfoEl.innerHTML =
        `<span class="slv-trick-label">${playedByName}: ${trick.count}× <strong>${trick.value}</strong></span>`
    }
  }

  if (trickCardsEl) {
    if (trick?.cards?.length) {
      trickCardsEl.innerHTML = trick.cards.map(c => cardImgHTML(c, 'trick')).join('')
    } else {
      trickCardsEl.innerHTML = ''
    }
  }

  // ── Player hand ────────────────────────────────────────────
  const myHand = hands[state.sessionId] || []
  const handEl = document.getElementById('slv-hand')
  if (handEl) {
    const handKey = myHand.join(',') + '|' + mine + '|' + iHavePassed
    if (handKey !== _lastHandKey) {
      _lastHandKey     = handKey
      _selectedIndices = []
      renderHand(handEl, myHand, mine, isFinished, iHavePassed)
    }

    handEl.onclick = (mine && !isFinished && !iHavePassed) ? e => {
      const el = e.target.closest('[data-slv-idx]')
      if (!el) return
      const idx  = parseInt(el.dataset.slvIdx)
      const card = el.dataset.slvCard
      toggleSelection(idx, card, myHand)
      refreshHandClasses(handEl, myHand)
      updateActionButtons(meta, mine, onPlay, onPass, myHand, iHavePassed)
    } : null
  }

  updateActionButtons(meta, mine, onPlay, onPass, myHand, iHavePassed)

  // ── Last action ────────────────────────────────────────────
  const lastEl = document.getElementById('slv-last')
  if (lastEl) {
    lastEl.textContent = Object.entries(names).reduce(
      (s, [id, n]) => s.replaceAll(id, n), meta.lastAction || ''
    )
  }
}

function renderHand(handEl, myHand, mine, isFinished, iHavePassed = false) {
  const sortedIdxs = sortedHandIndices(myHand)
  if (isFinished) {
    handEl.innerHTML = sortedIdxs.map(i => cardImgHTML(myHand[i], 'slv-hand-card')).join('')
    return
  }
  handEl.innerHTML = sortedIdxs.map(origIdx => {
    const card    = myHand[origIdx]
    const stateCls = iHavePassed ? 'dimmed' : mine ? 'selectable' : ''
    const cls     = ['slv-card-img', 'slv-hand-card', stateCls].filter(Boolean).join(' ')
    return `<img class="${cls}" src="${cardSrc(card)}" alt="${card}" ` +
           `data-slv-idx="${origIdx}" data-slv-card="${card}">`
  }).join('')
}

function refreshHandClasses(handEl, myHand) {
  handEl.querySelectorAll('[data-slv-idx]').forEach(el => {
    const idx  = parseInt(el.dataset.slvIdx)
    const card = el.dataset.slvCard
    const isSel  = _selectedIndices.includes(idx)
    const canSel = canAddToSelection(card, idx, myHand)
    el.className = ['slv-card-img', 'slv-hand-card',
      isSel ? 'selected' : (canSel ? 'selectable' : 'dimmed'),
    ].filter(Boolean).join(' ')
  })
}

function updateActionButtons(meta, mine, onPlay, onPass, myHand, iHavePassed = false) {
  const trick      = meta.trick || null
  const isFinished = meta.phase === 'between-rounds'
  const canAct     = mine && !isFinished && !iHavePassed

  const playBtn = document.getElementById('btn-slave-play')
  if (playBtn) {
    playBtn.style.display = canAct ? '' : 'none'
    playBtn.disabled      = _selectedIndices.length === 0
    playBtn.onclick = () => {
      const cards = _selectedIndices.map(i => myHand[i]).filter(Boolean)
      if (cards.length && onPlay) { _selectedIndices = []; onPlay(cards) }
    }
  }

  const passBtn = document.getElementById('btn-slave-pass')
  if (passBtn) {
    passBtn.style.display = (canAct && trick !== null) ? '' : 'none'
    passBtn.onclick = () => { if (onPass) { _selectedIndices = []; onPass() } }
  }
}

function canAddToSelection(card, idx, myHand) {
  if (_selectedIndices.includes(idx)) return true
  if (_selectedIndices.length >= 4)   return false
  if (_selectedIndices.length === 0)  return true
  const { rank: firstRank } = parseCard(myHand[_selectedIndices[0]] || '')
  const { rank }             = parseCard(card)
  return rank !== '' && rank === firstRank
}

function toggleSelection(idx, card, myHand) {
  if (_selectedIndices.includes(idx)) {
    _selectedIndices = _selectedIndices.filter(i => i !== idx)
  } else if (canAddToSelection(card, idx, myHand)) {
    _selectedIndices = [..._selectedIndices, idx].sort((a, b) => a - b)
  }
}

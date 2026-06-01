import { state, cfg } from '../../state.js'
import { orderedOpponents } from '../utils.js'
import { showToast } from '../../ui/toast.js'

const SUIT_NAMES = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' }
const RANK_ORDER = { '2':0,'3':1,'4':2,'5':3,'6':4,'7':5,'8':6,'9':7,'10':8,'J':9,'Q':10,'K':11,'A':12 }
const SUIT_ORDER = { '♣':0,'♦':1,'♥':2,'♠':3 }

const SEAT_MAP = [
  [],
  ['top-center'],
  ['top-left', 'top-right'],
  ['left', 'top-center', 'right'],
  ['left', 'top-left', 'top-right', 'right'],
]

let _selectedIndices  = []
let _fakMode          = false
let _discardTargetIdx = -1
let _lastHandKey      = ''
let _lastDiscardKey   = ''
let _lastPenalties    = {}
let _lastPenaltyRound = -1
let _penaltyRiskCards = new Set()

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
  const cls = ['dmy-card-img', extraCls].filter(Boolean).join(' ')
  return `<img class="${cls}" src="${src}" alt="${card}" data-card="${card}">`
}

function sortedHandIndices(hand) {
  return hand.map((_, i) => i).sort((a, b) => {
    const ca = parseCard(hand[a]), cb = parseCard(hand[b])
    const rv = (RANK_ORDER[ca.rank] ?? 99) - (RANK_ORDER[cb.rank] ?? 99)
    return rv !== 0 ? rv : (SUIT_ORDER[ca.suit] ?? 0) - (SUIT_ORDER[cb.suit] ?? 0)
  })
}

// ── Meld validation ───────────────────────────────────────
function isValidSet(cards) {
  if (cards.length < 3 || cards.length > 4) return false
  const rank = parseCard(cards[0]).rank
  return cards.every(c => parseCard(c).rank === rank)
}

function isValidRun(cards) {
  if (cards.length < 3) return false
  const { suit } = parseCard(cards[0])
  if (!cards.every(c => parseCard(c).suit === suit)) return false
  const ranks = cards.map(c => RANK_ORDER[parseCard(c).rank] ?? -1).sort((a, b) => a - b)
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] !== ranks[i - 1] + 1) return false
  }
  return true
}

export function isValidMeld(cards) {
  return cards.length >= 3 && (isValidSet(cards) || isValidRun(cards))
}

// ── Main render ───────────────────────────────────────────
export function renderBoard(meta, mine, actions) {
  const names      = state.gameState?.playerNames || {}
  const hands      = meta.hands || {}
  const myHand     = hands[state.sessionId] || []
  const pile       = meta.discardPile || []
  const melds      = meta.melds || []
  const isFinished = meta.phase === 'between-rounds'
  const drewThis   = !!meta.drewThisTurn
  const drawTarget = meta.drewDiscardTarget || null
  const hasLaid    = (meta.hasLaidDown || {})[state.sessionId] || false
  const curPlayer  = meta.currentPlayer || null

  // ── Opponents ─────────────────────────────────────────
  const oppEl = document.getElementById('dmy-opponents')
  if (oppEl) {
    const opponents = orderedOpponents({ ...meta }, state.sessionId, state.gameState?.players || [])
    const seats = SEAT_MAP[Math.min(opponents.length, 4)] || SEAT_MAP[4]
    oppEl.innerHTML = opponents.slice(0, 4).map((id, i) => {
      const name    = names[id] || id.slice(0, 8)
      const hand    = hands[id] || []
      const isCurr  = curPlayer === id && !isFinished
      const score   = (meta.totalScores || {})[id] ?? 0
      const hasLaidOpp = (meta.hasLaidDown || {})[id] || false
      const seat    = seats[i] || 'top-center'
      const cls     = ['dmy-opp-slot', isCurr ? 'turn-active' : ''].filter(Boolean).join(' ')
      const revealedCards = isFinished && hand.length > 0 && hand.every(c => c !== 'hidden')
      const cardsHTML = revealedCards
        ? hand.slice(0, 5).map(c => cardImgHTML(c, 'dmy-opp-card')).join('')
        : Array(Math.min(hand.length, 5)).fill(`<div class="dmy-card-back mini"></div>`).join('')
      return `<div class="${cls}" data-seat="${seat}">
        <div class="dmy-opp-badge">
          ${isCurr ? '<span class="dmy-turn-dot"></span>' : ''}
          <span class="dmy-opp-name">${name}</span>
          ${hasLaidOpp && !isFinished ? '<span class="dmy-laid-badge">Laid</span>' : ''}
          <span class="dmy-opp-score">${score}pt</span>
          <span class="dmy-opp-count-pill">${hand.length}</span>
        </div>
        ${cardsHTML ? `<div class="dmy-opp-cards">${cardsHTML}</div>` : ''}
      </div>`
    }).join('')
  }

  // ── Round label ───────────────────────────────────────
  const roundLbl = document.getElementById('dmy-round-lbl')
  if (roundLbl) {
    roundLbl.textContent = meta.totalRounds
      ? `Round ${meta.currentRound ?? 1} / ${meta.totalRounds}`
      : `Round ${meta.currentRound ?? 1}`
  }

  // ── Penalty notifications ─────────────────────────────
  const curRound = meta.currentRound ?? 1
  if (curRound !== _lastPenaltyRound) {
    _lastPenalties    = {}
    _lastPenaltyRound = curRound
  }
  const penalties = meta.discardPenalties || {}
  for (const [id, total] of Object.entries(penalties)) {
    if (total > (_lastPenalties[id] ?? 0)) {
      const pName = names[id] || id.slice(0, 8)
      showToast(`⚠️ ${pName} got a −50 penalty for discarding a playable card!`, 6000)
    }
  }
  _lastPenalties = { ...penalties }

  // ── Live scoreboard ───────────────────────────────────
  renderLiveScores(meta)

  // ── Stock pile ────────────────────────────────────────
  const stockEl     = document.getElementById('dmy-stock')
  const stockCntEl  = document.getElementById('dmy-stock-count')
  const canDrawStock = mine && !drewThis && !isFinished
  if (stockEl) {
    stockEl.classList.toggle('drawable', canDrawStock)
    stockEl.onclick = canDrawStock ? () => { _discardTargetIdx = -1; actions.draw() } : null
  }
  if (stockCntEl) stockCntEl.textContent = `${meta.stockCount ?? 0}`

  // ── Discard pile ──────────────────────────────────────
  const pileKey = pile.join(',')
  if (pileKey !== _lastDiscardKey) {
    _lastDiscardKey    = pileKey
    _discardTargetIdx  = -1
  }
  renderDiscardPile(pile, mine, drewThis, isFinished, meta.openingCard, actions)

  // ── Melds ─────────────────────────────────────────────
  renderMelds(melds, mine, drewThis, hasLaid, actions)

  // ── My hand ───────────────────────────────────────────
  const handEl = document.getElementById('dmy-hand')
  if (handEl) {
    const handKey = myHand.join(',') + '|' + mine + '|' + drewThis + '|' + (drawTarget || '') + '|' + isFinished
    if (handKey !== _lastHandKey) {
      _lastHandKey     = handKey
      _selectedIndices = []
      _fakMode         = false
      renderHand(handEl, myHand, mine, drewThis, drawTarget, isFinished)
    }
    handEl.onclick = (mine && !isFinished && drewThis) ? e => {
      const el = e.target.closest('[data-hand-idx]')
      if (!el) return
      const idx = parseInt(el.dataset.handIdx)
      if (_fakMode) {
        _selectedIndices = _selectedIndices.includes(idx) ? [] : [idx]
      } else {
        toggleHandSelection(idx)
      }
      refreshHandClasses(handEl, myHand, drawTarget)
      updateButtons(meta, mine, actions, myHand)
      if (_fakMode) renderMelds(meta.melds || [], mine, drewThis, hasLaid, actions)
    } : null
  }

  // ── Target warning ────────────────────────────────────
  const statusEl = document.getElementById('dmy-target-indicator')
  if (statusEl) {
    if (drawTarget && mine && drewThis) {
      statusEl.textContent = `Must lay ${drawTarget} before discarding`
      statusEl.style.display = ''
    } else {
      statusEl.style.display = 'none'
    }
  }

  updateButtons(meta, mine, actions, myHand)

  // ── Last action ───────────────────────────────────────
  const lastEl = document.getElementById('dmy-last')
  if (lastEl) {
    lastEl.textContent = Object.entries(names).reduce(
      (s, [id, n]) => s.replaceAll(id, n), meta.lastAction || ''
    )
  }
}

function renderDiscardPile(pile, mine, drewThis, isFinished, openingCard, actions) {
  const el = document.getElementById('dmy-discard')
  if (!el) return
  const canDrawFrom = mine && !drewThis && !isFinished && pile.length > 0

  el.innerHTML = pile.map((card, i) => {
    const isTarget  = i === _discardTargetIdx
    const inRange   = _discardTargetIdx >= 0 && i >= _discardTargetIdx
    const isOpening = i === 0 && card === openingCard
    const cls = ['dmy-dp-card',
      isOpening              ? 'opening-card' : 'landscape',
      isTarget               ? 'dp-target'    : '',
      inRange && !isTarget   ? 'dp-range'     : '',
      canDrawFrom            ? 'dp-drawable'  : '',
    ].filter(Boolean).join(' ')
    return `<div class="${cls}" data-dp-idx="${i}">
      <img class="dp-img" src="${cardSrc(card)}" alt="${card}">
    </div>`
  }).join('')

  // On mobile the pile scrolls — keep newest card in view
  el.scrollLeft = el.scrollWidth

  el.onclick = canDrawFrom ? e => {
    const item = e.target.closest('[data-dp-idx]')
    if (!item) return
    const idx = parseInt(item.dataset.dpIdx)
    _discardTargetIdx = (_discardTargetIdx === idx) ? -1 : idx
    renderDiscardPile(pile, mine, drewThis, isFinished, openingCard, actions)
    syncDrawDiscardBtn(pile, actions)
  } : null

  syncDrawDiscardBtn(pile, actions)
}

function canCardBeLaid(card, hand, melds, hasLaid) {
  // Can extend an existing meld via ฝาก (only after first lay)
  if (hasLaid) {
    for (const meld of melds) {
      const mc = Array.isArray(meld) ? meld : (meld.cards || [])
      if (isValidMeld([...mc, card])) return true
    }
  }

  // Can form a new set: need 2+ other cards of the same rank in hand
  const { rank, suit } = parseCard(card)
  if (hand.filter(c => parseCard(c).rank === rank).length >= 2) return true

  // Can form a new run: need 2 adjacent cards of same suit
  const cardR   = RANK_ORDER[rank] ?? -1
  const suitSet = new Set(
    hand.filter(c => parseCard(c).suit === suit).map(c => RANK_ORDER[parseCard(c).rank] ?? -1)
  )
  if (suitSet.has(cardR + 1) && suitSet.has(cardR + 2)) return true
  if (suitSet.has(cardR - 1) && suitSet.has(cardR + 1)) return true
  if (suitSet.has(cardR - 1) && suitSet.has(cardR - 2)) return true

  return false
}

function syncDrawDiscardBtn(pile, actions) {
  const btn    = document.getElementById('btn-dmy-draw-discard')
  const warnEl = document.getElementById('dmy-discard-draw-warn')
  if (!btn) return

  if (_discardTargetIdx >= 0 && _discardTargetIdx < pile.length) {
    const count      = pile.length - _discardTargetIdx
    const targetCard = pile[_discardTargetIdx]
    btn.style.display = ''
    btn.textContent   = `Draw ${count}`
    btn.onclick = () => {
      if (_discardTargetIdx >= 0) {
        actions.drawDiscard(pile[_discardTargetIdx])
        _discardTargetIdx = -1
      }
    }

    // Warn if target card can't be played with current hand
    if (warnEl) {
      const meta    = state.gameState?.metadata || {}
      const myHand  = (meta.hands || {})[state.sessionId] || []
      const hasLaid = (meta.hasLaidDown || {})[state.sessionId] || false
      const melds   = meta.melds || []
      const playable = canCardBeLaid(targetCard, myHand, melds, hasLaid)
      warnEl.style.display = playable ? 'none' : ''
    }
  } else {
    btn.style.display = 'none'
    if (warnEl) warnEl.style.display = 'none'
  }
}

function renderMelds(melds, mine, drewThis, hasLaid, actions) {
  const el = document.getElementById('dmy-melds')
  if (!el) return

  if (!melds.length) {
    el.innerHTML = '<div class="dmy-melds-empty">No melds on the table yet</div>'
    el.onclick   = null
    return
  }

  const canFak  = _fakMode && mine && drewThis && hasLaid && _selectedIndices.length === 1
  const pNames  = state.gameState?.playerNames || {}

  el.innerHTML = melds.map((meld, i) => {
    const cards         = Array.isArray(meld) ? meld : (meld.cards || [])
    const owner         = Array.isArray(meld) ? null : (meld.owner || null)
    const contribArr    = Array.isArray(meld) ? [] : (meld.contributions || [])

    // Build per-player card groups preserving meld card order
    const byPlayer = {}
    if (contribArr.length) {
      for (const { player, card } of contribArr) {
        if (!byPlayer[player]) byPlayer[player] = []
        byPlayer[player].push(card)
      }
    } else {
      // No contribution data — all cards belong to owner
      if (owner) byPlayer[owner] = [...cards]
    }

    // Owner group first, then fak contributors
    const ownerName  = owner ? (pNames[owner] || owner.slice(0, 8)) : ''
    const ownerCards = byPlayer[owner] || cards
    const ownerGroup = `<div class="dmy-meld-group">
      ${ownerName ? `<div class="dmy-meld-glabel">${ownerName}</div>` : ''}
      <div class="dmy-meld-gcards">${ownerCards.map(c => cardImgHTML(c, 'meld-card')).join('')}</div>
    </div>`

    const fakGroups = Object.entries(byPlayer)
      .filter(([pid]) => pid !== owner)
      .map(([fakOwner, fakCards]) => {
        const fakName = pNames[fakOwner] || fakOwner.slice(0, 8)
        return `<div class="dmy-meld-sep"></div>
        <div class="dmy-meld-group dmy-meld-fak-group">
          <div class="dmy-meld-glabel dmy-meld-fak-lbl">${fakName}</div>
          <div class="dmy-meld-gcards">${fakCards.map(c => cardImgHTML(c, 'meld-card')).join('')}</div>
        </div>`
      }).join('')

    return `<div class="dmy-meld${canFak ? ' fak-target' : ''}" data-meld-idx="${i}">
      ${ownerGroup}${fakGroups}
    </div>`
  }).join('')

  el.onclick = canFak ? e => {
    const item = e.target.closest('[data-meld-idx]')
    if (!item) return
    const meldIndex = parseInt(item.dataset.meldIdx)
    const myHand    = (state.gameState?.metadata?.hands || {})[state.sessionId] || []
    const card      = myHand[_selectedIndices[0]]
    if (card) {
      actions.fak(card, meldIndex)
      _selectedIndices = []
      _fakMode         = false
    }
  } : null
}

function renderHand(handEl, myHand, mine, drewThis, drawTarget, isFinished) {
  const sortedIdxs = sortedHandIndices(myHand)
  if (isFinished || !mine) {
    handEl.innerHTML = sortedIdxs.map(i => cardImgHTML(myHand[i], 'dmy-hand-card')).join('')
    return
  }
  handEl.innerHTML = sortedIdxs.map(origIdx => {
    const card      = myHand[origIdx]
    const isTarget  = drawTarget && card === drawTarget
    const isRisk    = drewThis && !isTarget && _penaltyRiskCards.has(card)
    const cls = ['dmy-card-img', 'dmy-hand-card',
      drewThis ? 'selectable' : 'not-turn',
      isTarget ? 'must-lay' : isRisk ? 'penalty-risk' : '',
    ].filter(Boolean).join(' ')
    return `<img class="${cls}" src="${cardSrc(card)}" alt="${card}" data-hand-idx="${origIdx}" data-card="${card}">`
  }).join('')
}

function refreshHandClasses(handEl, myHand, drawTarget) {
  handEl.querySelectorAll('[data-hand-idx]').forEach(el => {
    const idx      = parseInt(el.dataset.handIdx)
    const card     = el.dataset.card
    const isSel    = _selectedIndices.includes(idx)
    const isTarget = drawTarget && card === drawTarget
    const isRisk   = !isSel && !isTarget && _penaltyRiskCards.has(card)
    el.className   = ['dmy-card-img', 'dmy-hand-card',
      isSel ? 'selected' : 'selectable',
      isTarget ? 'must-lay' : isRisk ? 'penalty-risk' : '',
    ].filter(Boolean).join(' ')
  })
}

function toggleHandSelection(idx) {
  if (_selectedIndices.includes(idx)) {
    _selectedIndices = _selectedIndices.filter(i => i !== idx)
  } else {
    _selectedIndices = [..._selectedIndices, idx].sort((a, b) => a - b)
  }
}

function updateButtons(meta, mine, actions, myHand) {
  const drewThis   = !!meta.drewThisTurn
  const drawTarget = meta.drewDiscardTarget || null
  const hasLaid    = (meta.hasLaidDown || {})[state.sessionId] || false
  const isFinished = meta.phase === 'between-rounds'
  const canAct     = mine && !isFinished

  const selCards = _selectedIndices.map(i => myHand[i]).filter(Boolean)
  const validLay  = isValidMeld(selCards)

  // Change 2: first lay requires having drawn from discard
  const canFirstLay = hasLaid || !!drawTarget

  // Change 3: compute penalty-risk cards (extend an existing meld, only after hasLaid)
  const melds = meta.melds || []
  _penaltyRiskCards = new Set()
  if (hasLaid && drewThis && canAct) {
    for (const card of myHand) {
      for (const meld of melds) {
        const meldCards = Array.isArray(meld) ? meld : (meld.cards || [])
        if (isValidMeld([...meldCards, card])) {
          _penaltyRiskCards.add(card)
          break
        }
      }
    }
  }

  // Draw stock
  const drawBtn = document.getElementById('btn-dmy-draw')
  if (drawBtn) {
    drawBtn.style.display = (canAct && !drewThis) ? '' : 'none'
    drawBtn.onclick = () => actions.draw()
  }

  // Lay — disabled on first lay unless drew from discard
  const layBtn = document.getElementById('btn-dmy-lay')
  if (layBtn) {
    layBtn.style.display = (canAct && drewThis) ? '' : 'none'
    layBtn.disabled      = !validLay || !canFirstLay
    layBtn.onclick = () => {
      if (validLay && canFirstLay) {
        actions.lay(selCards)
        _selectedIndices = []
        _fakMode         = false
      }
    }
  }

  // Lay hint: shown when drew from stock with no prior lay
  const layHintEl = document.getElementById('dmy-lay-hint')
  if (layHintEl) {
    layHintEl.style.display = (canAct && drewThis && !hasLaid && !drawTarget) ? '' : 'none'
  }

  // ฝาก
  const fakBtn = document.getElementById('btn-dmy-fak')
  if (fakBtn) {
    fakBtn.style.display = (canAct && drewThis && hasLaid) ? '' : 'none'
    fakBtn.textContent   = _fakMode ? 'Cancel' : 'ฝาก'
    fakBtn.onclick = () => {
      _fakMode = !_fakMode
      _selectedIndices = []
      updateButtons(meta, mine, actions, myHand)
      const handEl = document.getElementById('dmy-hand')
      if (handEl) refreshHandClasses(handEl, myHand, drawTarget)
      renderMelds(meta.melds || [], mine, drewThis, hasLaid, actions)
    }
  }

  // Discard
  const discBtn = document.getElementById('btn-dmy-discard')
  if (discBtn) {
    discBtn.style.display = (canAct && drewThis) ? '' : 'none'
    discBtn.disabled      = _selectedIndices.length !== 1 || !!drawTarget
    discBtn.onclick = () => {
      if (_selectedIndices.length === 1 && !drawTarget) {
        const card = myHand[_selectedIndices[0]]
        if (card) {
          actions.discard(card)
          _selectedIndices = []
          _fakMode         = false
        }
      }
    }
  }

  // Update hand card risk highlights after computing _penaltyRiskCards
  const handEl = document.getElementById('dmy-hand')
  if (handEl && drewThis) refreshHandClasses(handEl, myHand, drawTarget)
}

function renderLiveScores(meta) {
  const el = document.getElementById('dmy-live-scores')
  if (!el) return
  const names      = state.gameState?.playerNames || {}
  const players    = state.gameState?.players || []
  const scores     = meta.totalScores || {}
  const hasLaid    = meta.hasLaidDown || {}
  const curPlayer  = meta.currentPlayer || null
  const isFinished = meta.phase === 'between-rounds'

  const sorted = [...players].sort((a, b) => (scores[a] ?? 0) - (scores[b] ?? 0))
  el.innerHTML = sorted.map(id => {
    const name    = names[id] || id.slice(0, 8)
    const score   = scores[id] ?? 0
    const laid    = hasLaid[id]
    const isMe    = id === state.sessionId
    const isCurr  = id === curPlayer && !isFinished
    return `<div class="dmy-ls-row${isMe ? ' dmy-ls-me' : ''}${isCurr ? ' dmy-ls-active' : ''}">
      <span class="dmy-ls-name">${name}</span>
      ${laid ? '<span class="dmy-ls-laid">Laid ✓</span>' : ''}
      <span class="dmy-ls-score">${score}pt</span>
    </div>`
  }).join('')
}

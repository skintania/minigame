import { state, cfg } from '../../state.js'
import { bluffPlay, bluffChallenge } from './actions.js'

const SUIT_NAMES = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' }
const CARD_BASE  = () => `${cfg.url}/assets/cards/standard-deck`

let selectedCards   = []
let challengeTimer  = null
let prevMatchId     = null
let prevLastChallenge = null

function cardImgSrc(card) {
  if (!card || card === 'hidden') return null
  const suit = SUIT_NAMES[card.slice(-1)]
  const rank = card.slice(0, -1)
  if (!suit) return null
  return `${CARD_BASE()}/${rank.toLowerCase()}-${suit}.svg`
}

function cardHtml(card, cls = '') {
  if (card === 'hidden') {
    return `<div class="bluff-card-back ${cls}"></div>`
  }
  const src = cardImgSrc(card)
  if (!src) return `<div class="bluff-card-face ${cls}">${card}</div>`
  return `<img class="bluff-card ${cls}" src="${src}" alt="${card}" onerror="this.style.opacity='0'">`
}

function suitColor(card) {
  const suit = card?.slice(-1)
  return (suit === '♥' || suit === '♦') ? 'red' : ''
}

export function renderBoard(meta, mine) {
  if (!meta) return

  const gs         = state.gameState
  const myId       = state.sessionId
  const players    = gs?.players     || []
  const names      = gs?.playerNames || {}
  const turnOrder  = gs?.turnOrder   || players

  const {
    phase, hands = {}, pileSize = 0,
    currentPlayer, currentRank, lastPlay, lastChallenge, winner,
  } = meta

  const isNewMatch = state.matchId !== prevMatchId
  if (isNewMatch) {
    prevMatchId = state.matchId
    selectedCards = []
    prevLastChallenge = ''
    clearTimeout(challengeTimer)
    challengeTimer = null
    const overlay = document.getElementById('bluff-challenge-overlay')
    if (overlay) overlay.style.display = 'none'
  }

  const myHand     = hands[myId] || []
  const isActive   = phase === 'playing'

  // ── Challenge result overlay ──────────────────────────────
  const overlay = document.getElementById('bluff-challenge-overlay')
  const challengeKey = lastChallenge
    ? `${lastChallenge.challengerId}:${lastChallenge.playerId}:${lastChallenge.pileSize}:${lastChallenge.actualCards?.join(',')}`
    : null
  if (overlay && challengeKey && challengeKey !== prevLastChallenge) {
    prevLastChallenge = challengeKey
    clearTimeout(challengeTimer)

    const challengerName = names[lastChallenge.challengerId] || lastChallenge.challengerId.slice(0, 8)
    const playerName     = names[lastChallenge.playerId]     || lastChallenge.playerId.slice(0, 8)
    const loserName      = names[lastChallenge.loserId]      || lastChallenge.loserId.slice(0, 8)
    const cardsHtml      = lastChallenge.actualCards.map(c =>
      `<span class="bluff-inline-card ${suitColor(c)}">${c}</span>`
    ).join(' ')

    const card = overlay.querySelector('.bluff-challenge-card')
    if (lastChallenge.success) {
      card.innerHTML = `
        <div class="bluff-overlay-icon">🚨</div>
        <div class="bluff-overlay-title">BLUFF CAUGHT!</div>
        <div class="bluff-overlay-body">
          <strong>${playerName}</strong> played ${cardsHtml}<br>
          claimed <strong>${lastChallenge.claimedRank}s</strong>
        </div>
        <div class="bluff-overlay-penalty"><strong>${loserName}</strong> takes ${lastChallenge.pileSize} cards</div>
      `
    } else {
      card.innerHTML = `
        <div class="bluff-overlay-icon">✅</div>
        <div class="bluff-overlay-title">HONEST!</div>
        <div class="bluff-overlay-body">
          <strong>${playerName}</strong> really played ${cardsHtml}
        </div>
        <div class="bluff-overlay-penalty"><strong>${challengerName}</strong> takes ${lastChallenge.pileSize} cards</div>
      `
    }
    overlay.style.display = 'flex'
    challengeTimer = setTimeout(() => {
      overlay.style.display = 'none'
      challengeTimer = null
    }, 3000)
  }

  // ── Opponents ─────────────────────────────────────────────
  const oppEl = document.getElementById('bluff-opponents')
  if (oppEl) {
    const opponents = turnOrder.filter(id => id !== myId)
    oppEl.innerHTML = opponents.map(id => {
      const hand      = hands[id] || []
      const isCurrent = id === currentPlayer && isActive
      return `<div class="bluff-seat ${isCurrent ? 'bluff-seat-active' : ''}">
        <div class="bluff-seat-name">${names[id] || id.slice(0, 8)}</div>
        <div class="bluff-seat-cards">${hand.map(() => `<div class="bluff-card-back bluff-opp-card"></div>`).join('')}</div>
        <div class="bluff-seat-count">${hand.length} card${hand.length !== 1 ? 's' : ''}</div>
      </div>`
    }).join('')
  }

  // ── Last play banner ──────────────────────────────────────
  const bannerEl = document.getElementById('bluff-last-play')
  if (bannerEl) {
    if (lastPlay) {
      const pName = names[lastPlay.playerId] || lastPlay.playerId.slice(0, 8)
      bannerEl.textContent = `${pName} played ${lastPlay.count} ${lastPlay.claimedRank}${lastPlay.count > 1 ? 's' : ''}`
      bannerEl.style.display = ''
    } else {
      bannerEl.style.display = 'none'
    }
  }

  // ── Pile ──────────────────────────────────────────────────
  const pileEl = document.getElementById('bluff-pile')
  if (pileEl) {
    const stackCount = Math.min(pileSize, 5)
    let stackHtml = ''
    for (let i = 0; i < stackCount; i++) {
      stackHtml += `<div class="bluff-pile-card" style="bottom:${i * 3}px;right:${i * 2}px"></div>`
    }
    pileEl.innerHTML = `
      <div class="bluff-pile-stack">${stackHtml || '<div class="bluff-pile-empty">—</div>'}</div>
      <div class="bluff-pile-label">${pileSize} card${pileSize !== 1 ? 's' : ''} in pile</div>
    `
  }

  // ── Rank hint ─────────────────────────────────────────────
  const hintEl = document.getElementById('bluff-rank-hint')
  if (hintEl && isActive) {
    hintEl.textContent = `Play your ${currentRank}s`
    hintEl.style.display = ''
  } else if (hintEl) {
    hintEl.style.display = 'none'
  }

  // ── My hand ───────────────────────────────────────────────
  const handEl = document.getElementById('bluff-my-hand')
  if (handEl) {
    if (winner === myId) {
      handEl.innerHTML = `<div class="bluff-winner-msg">🏆 You win!</div>`
    } else if (myHand.length === 0 && isActive) {
      handEl.innerHTML = `<div class="bluff-hand-empty">No cards</div>`
    } else {
      handEl.innerHTML = myHand.map((card, i) => {
        const isSelected = selectedCards.includes(card + ':' + i)
        return `<div class="bluff-hand-card ${isSelected ? 'bluff-hand-selected' : ''}" data-card="${card}" data-idx="${i}">
          ${cardHtml(card, 'bluff-hand-card-img')}
          <div class="bluff-card-label ${suitColor(card)}">${card}</div>
        </div>`
      }).join('')

      handEl.addEventListener('click', e => {
        if (!mine) return
        const cardEl = e.target.closest('[data-card]')
        if (!cardEl) return
        const key = cardEl.dataset.card + ':' + cardEl.dataset.idx
        const idx  = selectedCards.indexOf(key)
        if (idx === -1) {
          if (selectedCards.length < 4) selectedCards.push(key)
        } else {
          selectedCards.splice(idx, 1)
        }
        renderBoard(meta, mine)
      }, { once: true })
    }
  }

  // ── Action buttons ────────────────────────────────────────
  const playBtn      = document.getElementById('btn-bluff-play')
  const challengeBtn = document.getElementById('btn-bluff-challenge')

  const canChallenge = mine && lastPlay !== null && lastPlay?.playerId !== myId
  const canPlay      = mine && selectedCards.length >= 1 && selectedCards.length <= 4

  if (challengeBtn) {
    challengeBtn.style.display = canChallenge ? '' : 'none'
  }

  if (playBtn) {
    playBtn.style.display   = mine ? '' : 'none'
    playBtn.disabled        = !canPlay
    playBtn.textContent     = selectedCards.length > 0
      ? `Play ${selectedCards.length} as ${currentRank}s`
      : `Play as ${currentRank}s`
  }

  // ── Turn status ───────────────────────────────────────────
  const statusEl = document.getElementById('bluff-turn-status')
  if (statusEl) {
    if (winner) {
      const wName = names[winner] || winner.slice(0, 8)
      statusEl.textContent = winner === myId ? '🏆 You win!' : `${wName} wins!`
    } else if (mine) {
      statusEl.textContent = 'Your turn — play cards or call Bluff!'
    } else {
      const cp = currentPlayer ? (names[currentPlayer] || currentPlayer.slice(0, 8)) : '—'
      statusEl.textContent = `Waiting for ${cp}…`
    }
  }
}

export function bindBluffActions() {
  document.getElementById('btn-bluff-play')?.addEventListener('click', () => {
    if (selectedCards.length < 1) return
    const cards = selectedCards.map(key => key.split(':')[0])
    selectedCards = []
    bluffPlay(cards)
  })
  document.getElementById('btn-bluff-challenge')?.addEventListener('click', () => {
    bluffChallenge()
  })
}

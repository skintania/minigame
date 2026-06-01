import { state, cfg } from '../../state.js'

const SUIT_NAMES = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' }

function cardSrc(card) {
  const suit = card.slice(-1)
  const rank = card.slice(0, -1)
  return `${cfg.url}/assets/cards/standard-deck/${rank.toLowerCase()}-${SUIT_NAMES[suit]}.svg`
}

function cardHTML(card, small = false) {
  const sz = small ? ' small' : ''
  if (card === 'hidden') return `<div class="pd-card-back${sz}"></div>`
  return `<img class="pd-card${sz}" src="${cardSrc(card)}" alt="${card}">`
}

// Pok Deng: A=1, 2-9=face, 10/J/Q/K=0, total mod 10
function handValue(cards) {
  let total = 0
  for (const c of cards) {
    if (!c || c === 'hidden') continue
    const rank = c.slice(0, -1)
    if (['10', 'J', 'Q', 'K'].includes(rank)) total += 0
    else if (rank === 'A')                     total += 1
    else                                       total += parseInt(rank, 10) || 0
  }
  return total % 10
}

function _renderBetUI(myChips) {
  const shortcuts = [10, 25, 50, 100, 200, 500].filter(v => v <= myChips)
  const btnsEl    = document.getElementById('pd-chip-btns')
  if (btnsEl) {
    btnsEl.innerHTML = shortcuts.map(v =>
      `<button class="btn pd-chip-btn" data-pd-amt="${v}">${v}</button>`
    ).join('')
    btnsEl.onclick = e => {
      const btn = e.target.closest('[data-pd-amt]')
      if (!btn) return
      const input = document.getElementById('pd-bet-input')
      if (input) { input.value = btn.dataset.pdAmt; input.focus() }
    }
  }
}

function _updateActionButtons(hand) {
  const val     = handValue(hand.filter(c => c !== 'hidden'))
  const canDraw = hand.length === 2 && val <= 5
  const show    = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none' }
  show('btn-pd-draw',  canDraw)
  show('btn-pd-stand', true)
}

export function renderBoard(meta, mine) {
  const myId       = state.sessionId
  const names      = state.gameState?.playerNames || {}
  const phase      = meta.phase
  const chips      = meta.chips || {}
  const betsPlaced = meta.betsPlaced || {}
  const bets       = meta.bets || {}
  const hands      = meta.hands || {}
  const botHand    = meta.botHand || []
  const results    = meta.results || {}
  const isBetween  = phase === 'between-rounds' || phase === 'finished'
  const isSpect    = state.gameState?.myRole === 'spectator'
  const isRotate   = meta.bankerMode === 'rotate'
  const bankerId   = meta.bankerId || null
  const isMyBanker = isRotate && myId === bankerId

  const myChips     = chips[myId] ?? 0
  const myBetPlaced = betsPlaced[myId] === true
  const myHand      = hands[myId] || []
  const myBet       = bets[myId] ?? 0

  // Banker's hand: bot uses botHand; rotate uses the banker player's hand entry
  const bankerHand = isRotate ? (hands[bankerId] || []) : botHand

  // My chips
  const myChipsEl = document.getElementById('pd-my-chips')
  if (myChipsEl) myChipsEl.textContent = myChips

  // Banker indicator (I am the banker in rotate mode)
  const bankerIndicatorEl = document.getElementById('pd-banker-indicator')
  if (bankerIndicatorEl) bankerIndicatorEl.style.display = isMyBanker ? '' : 'none'

  // Banker zone label
  const bankerLabelEl = document.getElementById('pd-banker-label')
  if (bankerLabelEl) {
    if (isRotate && bankerId) {
      const bName = bankerId === myId ? (state.username || 'You') : (names[bankerId] || bankerId.slice(0, 8))
      bankerLabelEl.textContent = `${bName} · Banker`
    } else {
      bankerLabelEl.textContent = 'Banker'
    }
  }

  // Banker hand cards
  const bankerHandEl = document.getElementById('pd-banker-hand')
  if (bankerHandEl) bankerHandEl.innerHTML = bankerHand.map(c => cardHTML(c)).join('')

  // Banker value (only shown when fully revealed)
  const bankerValEl = document.getElementById('pd-banker-value')
  if (bankerValEl) {
    const visible = bankerHand.filter(c => c !== 'hidden')
    bankerValEl.textContent = visible.length && visible.length === bankerHand.length && bankerHand.length
      ? `${handValue(bankerHand)}`
      : ''
  }

  // Rotate info (current banker name shown in table area)
  const rotateInfoEl = document.getElementById('pd-rotate-info')
  if (rotateInfoEl) {
    if (isRotate && bankerId) {
      const bName = bankerId === myId ? (state.username || 'You') : (names[bankerId] || bankerId.slice(0, 8))
      rotateInfoEl.textContent = `Banker: ${bName}`
      rotateInfoEl.style.display = ''
    } else {
      rotateInfoEl.style.display = 'none'
    }
  }

  // Opponents: everyone except me, and in rotate mode also exclude the banker (shown in banker zone)
  _renderOpponents(meta, names, myId, hands, bets, betsPlaced, chips, results, isBetween, isRotate, bankerId)

  // My section
  const betUI   = document.getElementById('pd-bet-ui')
  const waitMsg = document.getElementById('pd-wait-msg')
  const handEl  = document.getElementById('pd-my-hand')
  const footer  = document.getElementById('pd-hand-footer')

  if (phase === 'betting' && !isSpect) {
    if (!isMyBanker && !myBetPlaced) {
      if (betUI) { betUI.style.display = ''; _renderBetUI(myChips) }
      if (waitMsg) waitMsg.style.display = 'none'
    } else {
      if (betUI) betUI.style.display = 'none'
      if (waitMsg) {
        waitMsg.textContent   = isMyBanker ? 'You are the Banker — waiting for players…' : 'Waiting for others to bet…'
        waitMsg.style.display = ''
      }
    }
    if (handEl) handEl.innerHTML = ''
    if (footer) footer.style.display = 'none'
  } else if (phase === 'drawing' || isBetween) {
    if (betUI) betUI.style.display = 'none'

    if (!mine && !isBetween) {
      const cur     = meta.currentPlayer
      const curName = cur
        ? (cur === myId ? 'You' : (names[cur] || cur.slice(0, 8)))
        : ''
      if (waitMsg) {
        waitMsg.textContent   = curName ? `${curName}'s turn…` : 'Waiting…'
        waitMsg.style.display = ''
      }
    } else {
      if (waitMsg) waitMsg.style.display = 'none'
    }

    // If I'm the banker in rotate mode my hand shows in the banker zone — skip duplicate here
    if (!isMyBanker) {
      if (handEl) handEl.innerHTML = _renderMyHand(myHand, myBet, results[myId], isBetween)
    } else {
      if (handEl) handEl.innerHTML = ''
    }

    if (footer) footer.style.display = (mine && !isBetween) ? '' : 'none'
    if (mine && !isBetween) _updateActionButtons(isMyBanker ? bankerHand : myHand)
  } else {
    if (betUI)   betUI.style.display   = 'none'
    if (waitMsg) waitMsg.style.display = 'none'
    if (footer)  footer.style.display  = 'none'
    if (handEl)  handEl.innerHTML      = ''
  }
}

function _renderOpponents(meta, names, myId, hands, bets, betsPlaced, chips, results, isBetween, isRotate, bankerId) {
  const oppEl = document.getElementById('pd-opponents')
  if (!oppEl) return
  const players   = state.gameState?.players || []
  const opponents = players.filter(id => id !== myId && !(isRotate && id === bankerId))
  if (!opponents.length) { oppEl.innerHTML = ''; return }

  oppEl.innerHTML = opponents.map(id => {
    const name      = names[id] || id.slice(0, 8)
    const pHand     = hands[id] || []
    const pChips    = chips[id] ?? 0
    const pBet      = bets[id] ?? 0
    const hasBet    = betsPlaced[id] === true
    const pResult   = results[id]
    const isCurrent = meta.currentPlayer === id

    const handHTML = pHand.length
      ? pHand.map(c => cardHTML(c, true)).join('')
      : (hasBet ? Array(2).fill(null).map(() => cardHTML('hidden', true)).join('') : '')

    const visible    = pHand.filter(c => c !== 'hidden')
    const valBadge   = isBetween && visible.length === pHand.length && pHand.length
      ? `<span class="pd-hand-val">${handValue(pHand)}</span>` : ''
    const resBadge   = isBetween && pResult
      ? `<span class="pd-result-badge ${pResult.outcome}">${pResult.outcome.toUpperCase()}</span>` : ''
    const dengBadge  = isBetween && pResult?.playerDeng > 1
      ? `<span class="pd-deng-badge">×${pResult.playerDeng}</span>` : ''
    const payoutEl   = isBetween && pResult
      ? `<span class="pd-payout ${pResult.payout >= 0 ? 'positive' : 'negative'}">${pResult.payout >= 0 ? '+' : ''}${pResult.payout}</span>` : ''
    const betPill    = hasBet && pBet ? `<span class="pd-bet-pill">♥ ${pBet}</span>` : ''

    return `<div class="pd-opp-slot${isCurrent ? ' turn-active' : ''}">
      <div class="pd-opp-name">${name}</div>
      <div class="pd-opp-chips">♥ ${pChips}</div>
      ${betPill}
      <div class="pd-opp-hand">${handHTML}</div>
      <div class="pd-opp-meta">${valBadge}${resBadge}${dengBadge}${payoutEl}</div>
    </div>`
  }).join('')
}

function _renderMyHand(myHand, myBet, result, isBetween) {
  if (!myHand.length) return ''
  const visible    = myHand.filter(c => c !== 'hidden')
  const val        = visible.length ? handValue(visible) : '?'
  const betPill    = myBet ? `<span class="pd-bet-pill">Bet: ${myBet}</span>` : ''
  const valBadge   = `<span class="pd-hand-val-main">${val}</span>`
  const resBadge   = isBetween && result
    ? `<span class="pd-result-badge ${result.outcome}">${result.outcome.toUpperCase()}</span>` : ''
  const dengBadge  = isBetween && result?.playerDeng > 1
    ? `<span class="pd-deng-badge">×${result.playerDeng}</span>` : ''
  const payoutEl   = isBetween && result
    ? `<div class="pd-net-chips ${result.payout >= 0 ? 'positive' : 'negative'}">${result.payout >= 0 ? '+' : ''}${result.payout}</div>` : ''

  return `
    <div class="pd-my-hand-inner">
      <div class="pd-hand-meta-row">${betPill}${valBadge}${resBadge}${dengBadge}</div>
      <div class="pd-hand-cards">${myHand.map(c => cardHTML(c)).join('')}</div>
    </div>
    ${payoutEl}
  `
}

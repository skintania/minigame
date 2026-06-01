import { state, cfg } from '../../state.js'

const SUIT_NAMES = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' }

function cardSrc(card) {
  const suit = card.slice(-1)
  const rank = card.slice(0, -1)
  return `${cfg.url}/assets/cards/standard-deck/${rank.toLowerCase()}-${SUIT_NAMES[suit]}.svg`
}

function cardHTML(card, small = false) {
  const sz = small ? ' small' : ''
  if (card === 'hidden') return `<div class="bj-card-back${sz}"></div>`
  return `<img class="bj-card${sz}" src="${cardSrc(card)}" alt="${card}">`
}

function handValue(cards) {
  let total = 0, aces = 0
  for (const c of cards) {
    if (!c || c === 'hidden') continue
    const rank = c.slice(0, -1)
    if (rank === 'A')                          { aces++; total += 11 }
    else if (['K','Q','J','10'].includes(rank)) total += 10
    else                                        total += parseInt(rank, 10) || 0
  }
  while (total > 21 && aces > 0) { total -= 10; aces-- }
  return { total, soft: aces > 0 }
}

function valueLabel(cards) {
  const visible = cards.filter(c => c !== 'hidden')
  if (!visible.length) return ''
  if (visible.length < cards.length) {
    const { total } = handValue(visible)
    return `${total} + ?`
  }
  const { total, soft } = handValue(cards)
  return soft ? `Soft ${total}` : `${total}`
}

function cardRankValue(card) {
  if (!card || card === 'hidden') return 0
  const r = card.slice(0, -1)
  if (['K','Q','J','10'].includes(r)) return 10
  if (r === 'A') return 11
  return parseInt(r, 10) || 0
}

export function renderBoard(meta, mine) {
  const myId       = state.sessionId
  const names      = state.gameState?.playerNames || {}
  const phase      = meta.phase
  const chips      = meta.chips || {}
  const betsPlaced = meta.betsPlaced || {}
  const hands      = meta.hands || {}
  const bets       = meta.bets || {}
  const handStatus = meta.handStatus || {}
  const activeIdx  = meta.activeHandIndex || {}
  const dealerHand = meta.dealerHand || []
  const results    = meta.results || {}
  const netChips   = meta.netChips || {}
  const isBetween  = phase === 'between-rounds' || phase === 'finished'
  const isSpect    = state.gameState?.myRole === 'spectator'

  const myChips     = chips[myId] ?? 0
  const myBetPlaced = betsPlaced[myId] === true
  const myHands     = hands[myId] || []
  const myBets      = bets[myId] || []
  const myStatus    = handStatus[myId] || []
  const myActive    = activeIdx[myId] ?? 0

  // Deck size
  const deckEl = document.getElementById('bj-deck-size')
  if (deckEl) deckEl.textContent = meta.deckSize ?? '—'

  // My chip count (always visible)
  const myChipsEl = document.getElementById('bj-my-chips')
  if (myChipsEl) myChipsEl.textContent = myChips

  // Dealer
  const dealerEl    = document.getElementById('bj-dealer-hand')
  const dealerValEl = document.getElementById('bj-dealer-value')
  if (dealerEl)    dealerEl.innerHTML           = dealerHand.map(c => cardHTML(c)).join('')
  if (dealerValEl) dealerValEl.textContent       = dealerHand.length ? valueLabel(dealerHand) : ''

  // Opponents
  _renderOpponents(meta, names, myId, hands, bets, handStatus, activeIdx, betsPlaced, chips, results, isBetween)

  // My section
  const betUI   = document.getElementById('bj-bet-ui')
  const waitMsg = document.getElementById('bj-wait-msg')
  const handsEl = document.getElementById('bj-my-hands')
  const footer  = document.getElementById('bj-hand-footer')

  if (phase === 'betting' && !isSpect) {
    if (!myBetPlaced) {
      if (betUI) { betUI.style.display = ''; _renderBetUI(myChips) }
      if (waitMsg) waitMsg.style.display = 'none'
    } else {
      if (betUI)   betUI.style.display   = 'none'
      if (waitMsg) waitMsg.style.display = ''
    }
    if (handsEl) handsEl.innerHTML     = ''
    if (footer)  footer.style.display  = 'none'
  } else if (phase === 'playing' || isBetween) {
    if (betUI)   betUI.style.display   = 'none'
    if (waitMsg) waitMsg.style.display = 'none'
    if (handsEl) handsEl.innerHTML     = _renderMyHands(myHands, myBets, myStatus, myActive, mine && !isBetween, results[myId], netChips[myId])
    if (footer)  footer.style.display  = (mine && !isBetween) ? '' : 'none'
    if (mine && !isBetween) _updateActionButtons(myHands, myBets, myStatus, myActive, myChips)
  } else {
    if (betUI)   betUI.style.display   = 'none'
    if (waitMsg) waitMsg.style.display = 'none'
    if (footer)  footer.style.display  = 'none'
  }
}

function _renderOpponents(meta, names, myId, hands, bets, handStatus, activeIdx, betsPlaced, chips, results, isBetween) {
  const oppEl = document.getElementById('bj-opponents')
  if (!oppEl) return
  const players   = state.gameState?.players || []
  const opponents = players.filter(id => id !== myId)
  if (!opponents.length) { oppEl.innerHTML = ''; return }

  oppEl.innerHTML = opponents.map(id => {
    const name     = names[id] || id.slice(0, 8)
    const pHands   = hands[id] || []
    const pBets    = bets[id] || []
    const pStatus  = handStatus[id] || []
    const pChips   = chips[id] ?? 0
    const pActive  = activeIdx[id] ?? 0
    const pResults = results[id] || []
    const isCurrent = meta.currentPlayer === id
    const hasBet   = betsPlaced[id] === true

    const handsHTML = pHands.length
      ? pHands.map((h, hi) => {
          const st    = pStatus[hi] || 'active'
          const { total } = handValue(h)
          const stCls = st === 'bust' ? 'bust' : st === 'blackjack' ? 'bj-bj' : st === 'stood' ? 'stood'
                      : (isCurrent && hi === pActive ? 'active' : '')
          const badge = isBetween && pResults[hi]
            ? `<span class="bj-result-badge ${pResults[hi]}">${pResults[hi].toUpperCase()}</span>` : ''
          return `<div class="bj-hand-group ${stCls}">
            <div class="bj-hand-cards">${h.map(c => cardHTML(c, true)).join('')}</div>
            <div class="bj-hand-meta"><span class="bj-hand-val">${total}</span>${badge}</div>
          </div>`
        }).join('')
      : hasBet
          ? `<div class="bj-opp-waiting">${cardHTML('hidden', true)}${cardHTML('hidden', true)}</div>`
          : ''

    const betHtml = hasBet ? `<span class="bj-bet-pill">&#9885; ${pBets[0] ?? '?'}</span>` : ''
    return `<div class="bj-opp-slot${isCurrent ? ' turn-active' : ''}">
      <div class="bj-opp-name">${name}</div>
      <div class="bj-opp-chips">&#9885; ${pChips}</div>
      ${betHtml}
      <div class="bj-opp-hands">${handsHTML}</div>
    </div>`
  }).join('')
}

function _renderBetUI(myChips) {
  const shortcuts = [10, 25, 50, 100, 200, 500].filter(v => v <= myChips)
  const btnsEl    = document.getElementById('bj-chip-btns')
  if (btnsEl) {
    btnsEl.innerHTML = shortcuts.map(v =>
      `<button class="btn bj-chip-btn" data-bj-amt="${v}">${v}</button>`
    ).join('')
    btnsEl.onclick = e => {
      const btn = e.target.closest('[data-bj-amt]')
      if (!btn) return
      const input = document.getElementById('bj-bet-input')
      if (input) { input.value = btn.dataset.bjAmt; input.focus() }
    }
  }
}

function _renderMyHands(myHands, myBets, myStatus, myActive, isMyTurn, myResults, netChipChange) {
  if (!myHands.length) return ''
  const parts = myHands.map((hand, hi) => {
    const isActive = hi === myActive && isMyTurn
    const st       = myStatus[hi] || 'active'
    const bet      = myBets[hi] ?? 0
    const { total, soft } = handValue(hand)
    const valTxt   = soft ? `Soft ${total}` : `${total}`
    const result   = myResults?.[hi]
    const stCls    = st === 'bust' ? 'bust' : st === 'blackjack' ? 'bj-bj' : st === 'stood' ? 'stood' : isActive ? 'active' : ''
    const badge    = result ? `<span class="bj-result-badge ${result}">${result.toUpperCase()}</span>` : ''
    return `<div class="bj-my-hand-group ${stCls}">
      <div class="bj-hand-label">
        <span class="bj-bet-pill">Bet: ${bet}</span>
        <span class="bj-hand-val">${valTxt}</span>
        ${badge}
      </div>
      <div class="bj-hand-cards">${hand.map(c => cardHTML(c)).join('')}</div>
    </div>`
  })
  const netEl = netChipChange != null
    ? `<div class="bj-net-chips ${netChipChange >= 0 ? 'positive' : 'negative'}">${netChipChange >= 0 ? '+' : ''}${netChipChange}</div>`
    : ''
  return `<div class="bj-my-hands-inner">${parts.join('')}</div>${netEl}`
}

function _updateActionButtons(myHands, myBets, myStatus, myActive, myChips) {
  const hand   = myHands[myActive] || []
  const bet    = myBets[myActive] ?? 0
  const st     = myStatus[myActive] || 'active'
  const canAct = st === 'active'

  const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none' }
  show('btn-bj-hit',    canAct)
  show('btn-bj-stand',  canAct)
  show('btn-bj-double', canAct && hand.length === 2 && myChips >= bet)
  show('btn-bj-split',  canAct && hand.length === 2 && myChips >= bet &&
    myHands.length < 4 && cardRankValue(hand[0]) === cardRankValue(hand[1]))
}

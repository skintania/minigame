import { state, cfg } from '../../state.js'
import {
  dmChooseBuddy, dmReportLoser, dmSetKRule,
  dmReportGestureLoser,
} from './actions.js'

const SUIT_NAMES = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' }
const CARD_BASE  = () => `${cfg.url}/assets/cards/standard-deck`

// Module-level state
let prevDrinks        = {}
let prevMatchId       = null
let prevDrawnCard     = null
let drinkOverlayTimer = null
let cardRevealTimer   = null

const CARD_EFFECTS = {
  'A': '🍺 1 sip',  '2': '🍺 2 sips',  '3': '🍺 3 sips', '4': '🍺 4 sips',
  '5': '🤝 Pick a buddy!', '6': '📂 Category game!', '7': '7️⃣ Number 7!',
  '8': '🚽 Bathroom pass', '9': '⬅️ Left drinks',   '10': '➡️ Right drinks',
  'J': '⚡ Gesture power!', 'Q': '🤐 Silenced!',     'K': '👑 Rule!',
}

function showCardReveal(card, isPersistent) {
  const overlay = document.getElementById('dm-card-reveal')
  const wrap    = document.getElementById('dm-reveal-wrap')
  if (!overlay || !wrap) return
  clearTimeout(cardRevealTimer)

  const imgEl    = document.getElementById('dm-reveal-card-img')
  const labelEl  = document.getElementById('dm-reveal-effect-label')
  if (imgEl)   imgEl.innerHTML   = cardHtml(card, 'dm-reveal-card-img-el')
  if (labelEl) labelEl.textContent = CARD_EFFECTS[card.slice(0, -1)] || card

  overlay.style.display = 'flex'
  wrap.classList.remove('dm-reveal-in', 'dm-reveal-fly-right', 'dm-reveal-fly-up')
  void wrap.offsetWidth
  wrap.classList.add('dm-reveal-in')

  cardRevealTimer = setTimeout(() => {
    wrap.classList.remove('dm-reveal-in')
    wrap.classList.add(isPersistent ? 'dm-reveal-fly-up' : 'dm-reveal-fly-right')
    setTimeout(() => {
      overlay.style.display = 'none'
      wrap.classList.remove('dm-reveal-fly-right', 'dm-reveal-fly-up')
    }, 700)
  }, 2800)
}

function showDrinkOverlay(drinkers) {
  const overlay  = document.getElementById('dm-drink-overlay')
  if (!overlay) return
  clearTimeout(drinkOverlayTimer)

  const names  = drinkers.map(d => d.name).join(' & ')
  const delta  = drinkers.reduce((max, d) => Math.max(max, d.delta), 1)
  const sipTxt = delta === 1 ? '1 sip' : `${delta} sips`

  const whoEl    = document.getElementById('dm-drink-who')
  const amountEl = document.getElementById('dm-drink-amount')
  if (whoEl)    whoEl.textContent    = names
  if (amountEl) amountEl.textContent = `🍺 × ${sipTxt}!`

  overlay.style.display = 'flex'
  overlay.classList.remove('dm-splash-out')
  void overlay.offsetWidth               // force reflow so animation restarts
  overlay.classList.add('dm-splash-in')

  drinkOverlayTimer = setTimeout(() => {
    overlay.classList.remove('dm-splash-in')
    overlay.classList.add('dm-splash-out')
    setTimeout(() => {
      overlay.style.display = 'none'
      overlay.classList.remove('dm-splash-out')
    }, 600)
  }, 3500)
}

function cardImgSrc(card) {
  if (!card) return null
  const suit = SUIT_NAMES[card.slice(-1)]
  const rank = card.slice(0, -1)
  if (!suit) return null
  return `${CARD_BASE()}/${rank.toLowerCase()}-${suit}.svg`
}

function cardHtml(card, cls = '') {
  const src = cardImgSrc(card)
  if (!src) return `<div class="dm-card-back"></div>`
  return `<img class="dm-card ${cls}" src="${src}" alt="${card}" onerror="this.style.opacity='0'">`
}

function cardPassPower(passes) {
  const src = cardImgSrc('8♠')
  return src
    ? `<div class="dm-power-wrap">${cardHtml('8♠', 'dm-power-card')}<span class="dm-power-badge">×${passes}</span></div>`
    : `<div class="dm-passes">×${passes}</div>`
}

function pName(id) {
  return state.gameState?.playerNames?.[id] || id.slice(0, 8)
}

// Returns array of arrays — each sub-array is one buddy chain
function buildChains(buddies) {
  const visited = new Set()
  const chains  = []
  for (const id of Object.keys(buddies)) {
    if (visited.has(id)) continue
    const chain = [id]; visited.add(id)
    let cur = buddies[id]
    while (cur && !visited.has(cur)) {
      chain.push(cur); visited.add(cur)
      cur = buddies[cur]
    }
    if (chain.length > 1) chains.push(chain)
  }
  return chains
}

const CHAIN_COLORS = ['#ff8fcb', '#6fd4ff', '#7affb0', '#ffd46f', '#c87fff']

export function renderBoard(meta, mine) {
  if (!meta) return

  const gs        = state.gameState
  const myId      = state.sessionId
  const players   = gs?.players    || []
  const names     = gs?.playerNames || {}
  const turnOrder = gs?.turnOrder  || players

  const {
    phase, deckSize, discardPile, drawnCard, currentPlayer,
    drinks = {}, bathroomPasses = {}, buddies = {}, silenced,
    jHolder, gesturePending, kRules = {}, pendingMinigame, lastAction,
  } = meta

  const isActive  = phase !== 'waiting' && phase !== 'finished'
  const chains    = buildChains(buddies)

  // ── Match-reset guard ────────────────────────────────────
  const isNewMatch = state.matchId !== prevMatchId
  if (isNewMatch) { prevDrinks = {}; prevMatchId = state.matchId; prevDrawnCard = null }

  // ── Deck ─────────────────────────────────────────────────
  const deckCountEl = document.getElementById('dm-deck-count')
  if (deckCountEl) deckCountEl.textContent = deckSize ?? '?'

  // ── Discard / drawn card ─────────────────────────────────
  const discardTopEl = document.getElementById('dm-discard-top')
  if (discardTopEl) {
    const top = discardPile?.length ? discardPile[discardPile.length - 1] : null
    discardTopEl.innerHTML = top
      ? cardHtml(top, 'dm-discard-card')
      : `<div class="dm-discard-empty">—</div>`
  }

  // ── K-rules display ──────────────────────────────────────
  const kEl = document.getElementById('dm-k-rules')
  if (kEl) {
    const parts = []
    if (kRules.what)    parts.push(`WHAT: "${kRules.what}"`)
    if (kRules.where)   parts.push(`WHERE: "${kRules.where}"`)
    if (kRules.howLong) parts.push(`HOW: "${kRules.howLong}"`)
    kEl.innerHTML = parts.length
      ? `<div class="dm-k-rule-row">${parts.map(p => `<span class="dm-k-part">${p}</span>`).join('<span class="dm-k-sep">/</span>')}</div>`
      : ''
  }

  // ── Player seats ─────────────────────────────────────────
  const reverseBuddies = {}
  for (const [pickerId, pickedId] of Object.entries(buddies)) {
    reverseBuddies[pickedId] = pickerId
  }

  const playersEl = document.getElementById('dm-players')
  if (playersEl) {
    playersEl.innerHTML = turnOrder.map(id => {
      const isCurrent  = id === currentPlayer && isActive
      const isSilenced = silenced === id
      const isJHolder  = jHolder  === id
      const isMe       = id === myId
      const drinkCount = drinks[id] || 0
      const passes     = bathroomPasses[id] || 0
      const buddyId    = buddies[id]
      const buddiedBy  = reverseBuddies[id] !== buddyId ? reverseBuddies[id] : null
      const chainIdx   = chains.findIndex(c => c.includes(id))
      const chainColor = chainIdx >= 0 ? CHAIN_COLORS[chainIdx % CHAIN_COLORS.length] : null
      const flashing   = !isNewMatch && (prevDrinks[id] ?? 0) < drinkCount

      const powerCards = []
      if (isJHolder) powerCards.push(
        `<div class="dm-power-wrap">${cardHtml('J♠', 'dm-power-card')}<span class="dm-power-badge">⚡</span></div>`
      )
      if (isSilenced) powerCards.push(
        `<div class="dm-power-wrap">${cardHtml('Q♠', 'dm-power-card')}<span class="dm-power-badge">🤐</span></div>`
      )
      if (passes > 0) powerCards.push(cardPassPower(passes))

      const gestureFlash = gesturePending ? `<div class="dm-gesture-pulse">🕺</div>` : ''

      return `<div class="dm-seat ${isCurrent ? 'dm-seat-active' : ''} ${isMe ? 'dm-seat-me' : ''}">
        <div class="dm-seat-name">
          ${pName(id)}
          ${isMe ? '<span class="dm-you-tag">You</span>' : ''}
        </div>
        ${isSilenced ? `<div class="dm-silenced-banner">🤐 Silenced</div>` : ''}
        ${powerCards.length > 0 ? `<div class="dm-power-cards-row">${powerCards.join('')}</div>` : ''}
        ${gestureFlash}
        <div class="dm-drink-count ${flashing ? 'dm-drink-flash' : ''}">
          🍺×${drinkCount}
        </div>
        ${buddyId    ? `<div class="dm-buddy" ${chainColor ? `style="color:${chainColor}"` : ''}>🔗 ${pName(buddyId)}</div>`    : ''}
        ${buddiedBy  ? `<div class="dm-buddy" ${chainColor ? `style="color:${chainColor}"` : ''}>🔗 ${pName(buddiedBy)}</div>` : ''}
      </div>`
    }).join('')
  }

  // ── Card reveal + drink overlay ──────────────────────────
  if (!isNewMatch) {
    const drinkers = turnOrder
      .filter(id => (drinks[id] || 0) > (prevDrinks[id] ?? 0))
      .map(id => ({ name: pName(id), delta: (drinks[id] || 0) - (prevDrinks[id] ?? 0) }))

    const drawnCardChanged = drawnCard && drawnCard !== prevDrawnCard
    if (drawnCardChanged) {
      const rank         = drawnCard.slice(0, -1)
      const isPersistent = rank === 'J' || rank === 'Q'
      showCardReveal(drawnCard, isPersistent)
      // Delay drink overlay until card flies away
      if (drinkers.length > 0) setTimeout(() => showDrinkOverlay(drinkers), 3600)
    } else if (drinkers.length > 0) {
      showDrinkOverlay(drinkers)
    }
  }

  // Update prevDrinks and prevDrawnCard
  turnOrder.forEach(id => { prevDrinks[id] = drinks[id] || 0 })
  if (drawnCard) prevDrawnCard = drawnCard

  // ── Last action ──────────────────────────────────────────
  const lastEl = document.getElementById('dm-last')
  if (lastEl) lastEl.textContent = lastAction || ''

  // ── Phase action area ────────────────────────────────────
  _renderPhaseArea(meta, mine, players, turnOrder, names, myId)

  // ── Persistent button visibility ─────────────────────────
  const myPasses = bathroomPasses[myId] || 0
  _setDisplay('btn-dm-draw',      mine && phase === 'playing')
  _setDisplay('btn-dm-bathroom',  myPasses > 0 && isActive)
  const bathBtn = document.getElementById('btn-dm-bathroom')
  if (bathBtn) {
    const src = cardImgSrc('8♠')
    bathBtn.innerHTML = src
      ? `<img src="${src}" style="width:24px;height:34px;vertical-align:middle;margin-right:6px;border-radius:3px"> Use Pass`
      : 'Use Pass'
  }
  _setDisplay('btn-dm-pointing',  isActive)
  _setDisplay('btn-dm-talking',   !!(silenced && isActive))
  _setDisplay('btn-dm-gesture',   jHolder === myId && phase === 'playing' && !gesturePending)

  // ── Finished state ───────────────────────────────────────
  if (phase === 'finished' || gs?.matchStatus === 'finished') {
    _renderFinished(meta, turnOrder, names)
  }
}

function _setDisplay(id, visible) {
  const el = document.getElementById(id)
  if (el) el.style.display = visible ? '' : 'none'
}

function _renderPhaseArea(meta, mine, players, turnOrder, names, myId) {
  const { phase, currentPlayer, pendingMinigame, kRules = {}, gesturePending, silenced } = meta
  const phaseEl = document.getElementById('dm-phase-area')
  if (!phaseEl) return

  let html = ''

  // ── pending-buddy ─────────────────────────────────────────
  if (phase === 'pending-buddy') {
    if (currentPlayer === myId) {
      const others = players.filter(id => id !== myId)
      html = `<div class="dm-phase-card">
        <div class="dm-phase-title">🤝 Pick your buddy!</div>
        <div class="dm-picker-grid" id="dm-buddy-picks">
          ${others.map(id => `<button class="btn btn-blue dm-pick-btn" data-buddy="${id}">${names[id] || id.slice(0,8)}</button>`).join('')}
        </div>
      </div>`
    } else {
      html = `<div class="dm-phase-card">
        <div class="dm-phase-title">🤝 ${names[currentPlayer] || currentPlayer.slice(0,8)} is picking a buddy…</div>
      </div>`
    }
  }

  // ── pending-minigame ──────────────────────────────────────
  else if (phase === 'pending-minigame' && pendingMinigame) {
    const isCategory = pendingMinigame.type === 'category'
    const isGesture  = pendingMinigame.type === 'gesture'
    const title = isCategory
      ? `📂 Category: <strong>${pendingMinigame.topic}</strong>`
      : isGesture
      ? `🕺 Gesture challenge!`
      : `7️⃣ Number 7 game!`
    const desc = isCategory
      ? 'Say items from the category — who ran out?'
      : isGesture
      ? 'Copy the pose! Last one drinks!'
      : 'Count aloud, skip numbers ending in 7 or divisible by 7. Who messed up?'
    html = `<div class="dm-phase-card">
      <div class="dm-phase-title">${title}</div>
      <div class="dm-phase-desc">${desc}</div>
      <div class="dm-phase-subtitle">Report the loser:</div>
      <div class="dm-picker-grid" id="dm-loser-picks">
        ${players.map(id => `<button class="btn btn-ghost dm-pick-btn" data-loser="${id}">${names[id] || id.slice(0,8)}</button>`).join('')}
      </div>
    </div>`
  }

  // ── pending-k-rule ────────────────────────────────────────
  else if (phase === 'pending-k-rule') {
    const count   = kRules.count || 1
    const prompts = [
      'What is the rule? (the activity)',
      'Where does the rule happen?',
      'How long / how does it happen?',
    ]
    const prompt = prompts[(count - 1)] || prompts[0]
    if (currentPlayer === myId) {
      html = `<div class="dm-phase-card">
        <div class="dm-phase-title">👑 K-Rule — Part ${count} of 3</div>
        <div class="dm-phase-desc">${prompt}</div>
        <div class="dm-k-input-row">
          <input type="text" id="dm-k-text" class="bet-field" placeholder="Type here…" style="flex:1;min-width:0">
          <button class="btn btn-pink" id="btn-dm-set-k" style="width:auto">Set</button>
        </div>
      </div>`
    } else {
      html = `<div class="dm-phase-card">
        <div class="dm-phase-title">👑 K-Rule — ${names[currentPlayer] || currentPlayer.slice(0,8)} is typing Part ${count}…</div>
      </div>`
    }
  }

  // ── Gesture challenge pending (non-blocking) ──────────────
  if (gesturePending && phase !== 'pending-minigame') {
    html += `<div class="dm-phase-card dm-gesture-card">
      <div class="dm-phase-title">🕺 Pose challenge! Copy it — last one drinks!</div>
      <div class="dm-phase-subtitle">Report the loser:</div>
      <div class="dm-picker-grid" id="dm-gesture-picks">
        ${players.map(id => `<button class="btn btn-ghost dm-pick-btn" data-gesture="${id}">${names[id] || id.slice(0,8)}</button>`).join('')}
      </div>
    </div>`
  }

  const focused = document.activeElement
  if (phaseEl.contains(focused) && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) return

  phaseEl.innerHTML = html

  // Bind event listeners after setting innerHTML
  phaseEl.querySelector('#dm-buddy-picks')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-buddy]')
    if (btn) dmChooseBuddy(btn.dataset.buddy)
  })
  phaseEl.querySelector('#dm-loser-picks')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-loser]')
    if (btn) dmReportLoser(btn.dataset.loser)
  })
  phaseEl.querySelector('#dm-gesture-picks')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-gesture]')
    if (btn) dmReportGestureLoser(btn.dataset.gesture)
  })

  const setKBtn = phaseEl.querySelector('#btn-dm-set-k')
  if (setKBtn) {
    setKBtn.addEventListener('click', () => {
      const text = phaseEl.querySelector('#dm-k-text')?.value?.trim()
      if (text) dmSetKRule(text)
    })
    phaseEl.querySelector('#dm-k-text')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') setKBtn.click()
    })
  }
}

function _renderFinished(meta, players, names) {
  const { drinks = {} } = meta
  const phaseEl = document.getElementById('dm-phase-area')
  if (!phaseEl) return

  const sorted = [...players].sort((a, b) => (drinks[b] || 0) - (drinks[a] || 0))
  phaseEl.innerHTML = `<div class="dm-phase-card dm-finished-card">
    <div class="dm-phase-title">🎉 Game Over!</div>
    <div class="dm-finish-list">
      ${sorted.map((id, i) => {
        const isMe = id === state.sessionId
        return `<div class="dm-finish-row ${isMe ? 'dm-finish-me' : ''}">
          <span class="dm-finish-rank">${i + 1}</span>
          <span class="dm-finish-name">${names[id] || id.slice(0, 8)}${isMe ? ' <span class="dm-you-tag">You</span>' : ''}</span>
          <span class="dm-finish-drinks">🍺×${drinks[id] || 0}</span>
        </div>`
      }).join('')}
    </div>
  </div>`
}

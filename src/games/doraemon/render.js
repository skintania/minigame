import { state, cfg } from '../../state.js'
import {
  dmChooseBuddy, dmReportLoser, dmSetKRule,
  dmReportGestureLoser,
} from './actions.js'

const SUIT_NAMES = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' }
const CARD_BASE  = () => `${cfg.url}/assets/cards/standard-deck`

// Module-level state for drink-flash tracking
let prevDrinks = {}

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

  const isActive = phase !== 'waiting' && phase !== 'finished'
  const chains   = buildChains(buddies)

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
      const buddyName  = buddyId ? pName(buddyId) : null
      const chainIdx   = chains.findIndex(c => c.includes(id))
      const chainColor = chainIdx >= 0 ? CHAIN_COLORS[chainIdx % CHAIN_COLORS.length] : null
      const flashing   = (prevDrinks[id] ?? 0) < drinkCount

      let powerCard = ''
      if (isSilenced) {
        // Show Q card with silenced badge
        powerCard = `<div class="dm-power-wrap">
          ${cardHtml('Q♠', 'dm-power-card')}
          <span class="dm-power-badge dm-silenced-icon">🤐</span>
        </div>`
      } else if (isJHolder) {
        // Show J card with gesture badge
        powerCard = `<div class="dm-power-wrap">
          ${cardHtml('J♠', 'dm-power-card')}
          <span class="dm-power-badge dm-gesture-icon">⚡</span>
        </div>`
      }

      const gestureFlash = gesturePending ? `<div class="dm-gesture-pulse">🕺</div>` : ''

      return `<div class="dm-seat ${isCurrent ? 'dm-seat-active' : ''} ${isMe ? 'dm-seat-me' : ''}">
        <div class="dm-seat-name">
          ${pName(id)}
          ${isMe ? '<span class="dm-you-tag">You</span>' : ''}
        </div>
        ${isSilenced ? `<div class="dm-silenced-banner">🤐 Silenced</div>` : ''}
        ${powerCard}
        ${gestureFlash}
        <div class="dm-drink-count ${flashing ? 'dm-drink-flash' : ''}">
          🍺×${drinkCount}
        </div>
        ${passes > 0 ? `<div class="dm-passes">🚽×${passes}</div>` : ''}
        ${buddyName ? `<div class="dm-buddy" ${chainColor ? `style="color:${chainColor}"` : ''}>🔗 ${buddyName}</div>` : ''}
      </div>`
    }).join('')
  }

  // Update prevDrinks after rendering
  turnOrder.forEach(id => { prevDrinks[id] = drinks[id] || 0 })

  // ── Last action ──────────────────────────────────────────
  const lastEl = document.getElementById('dm-last')
  if (lastEl) lastEl.textContent = lastAction || ''

  // ── Phase action area ────────────────────────────────────
  _renderPhaseArea(meta, mine, players, turnOrder, names, myId)

  // ── Persistent button visibility ─────────────────────────
  const myPasses = bathroomPasses[myId] || 0
  _setDisplay('btn-dm-draw',      mine && phase === 'playing')
  _setDisplay('btn-dm-bathroom',  myPasses > 0 && isActive)
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

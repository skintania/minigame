import { state, cfg } from '../../state.js'

const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }
const SUIT_NAMES   = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' }
const RED_SUITS    = new Set(['hearts', 'diamonds'])
const RED_SYMS     = new Set(['♥', '♦'])
const CARD_BASE    = () => `${cfg.url}/assets/cards/standard-deck`
const CHIP_URL     = () => `${cfg.url}/assets/cards/chips/chip-100.svg`
const AVATAR_URL   = sid => `${cfg.url}/assets/avatars/${sid}.svg`

// ── Animation / render state ──────────────────────────────
let prevPot     = -1
let prevBets    = {}
let prevWinner  = null
let prevFolded  = {}
let prevPhase   = null
let builtOppIds = []   // tracks which opponent slots are in the DOM

const avatarsLoaded = new Set()

function maybeSetAvatar(el, sessionId, fallback) {
  if (!el || !sessionId || avatarsLoaded.has(sessionId)) return
  avatarsLoaded.add(sessionId)
  el.textContent = fallback
  const img = new Image()
  img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%'
  img.onload  = () => { el.style.color = 'transparent'; el.appendChild(img) }
  img.src = AVATAR_URL(sessionId)
}

// Short display label — API doesn't expose opponent usernames
function oppLabel(oppId, idx, total) {
  return total === 1 ? 'Opponent' : `Player ${idx + 2}`
}

// Build or update opponent badge+hand slots inside #pk-opponents
function syncOpponentSlots(oppIds) {
  const container = document.getElementById('pk-opponents')
  if (!container) return

  // Rebuild DOM only when the player list changes
  if (oppIds.join(',') === builtOppIds.join(',')) return
  builtOppIds = [...oppIds]

  container.innerHTML = oppIds.map((id, idx) => {
    const name = oppLabel(id, idx, oppIds.length)
    return `<div class="pk-opp-slot" data-id="${id}">
      <div class="pk-player-badge" id="pk-opp-badge-${id}">
        <div class="pk-avatar" id="pk-opp-avatar-${id}">${name[0]}</div>
        <div class="pk-badge-info">
          <span class="pk-badge-label">${name}</span>
          <span class="pk-chip-count">&#9885; <span id="pk-opp-chips-${id}">—</span></span>
        </div>
      </div>
      <div class="cards-row" id="pk-opp-hand-${id}"></div>
    </div>`
  }).join('')

  oppIds.forEach((id, idx) => {
    const name = oppLabel(id, idx, oppIds.length)
    maybeSetAvatar(document.getElementById(`pk-opp-avatar-${id}`), id, name[0].toUpperCase())
  })
}

function flyChip(fromEl, toEl) {
  if (!fromEl || !toEl) return
  const fr   = fromEl.getBoundingClientRect()
  const tr   = toEl.getBoundingClientRect()
  const SIZE = 36

  const chip = document.createElement('div')
  chip.className = 'flying-chip'
  chip.style.left = `${fr.left + fr.width  / 2 - SIZE / 2}px`
  chip.style.top  = `${fr.top  + fr.height / 2 - SIZE / 2}px`
  chip.style.setProperty('--tx', `${tr.left + tr.width  / 2 - (fr.left + fr.width  / 2)}px`)
  chip.style.setProperty('--ty', `${tr.top  + tr.height / 2 - (fr.top  + fr.height / 2)}px`)

  const img = document.createElement('img')
  img.src    = CHIP_URL()
  img.width  = SIZE
  img.height = SIZE
  img.onerror = () => { const dot = document.createElement('div'); dot.className = 'chip-dot'; img.replaceWith(dot) }
  chip.appendChild(img)
  document.body.appendChild(chip)
  chip.addEventListener('animationend', () => chip.remove(), { once: true })
}

function animateBetToPot(curBets, prev, lastAction) {
  // Primary: find who's bet increased this render
  let bettorId = Object.keys(curBets).find(id => (curBets[id] || 0) > (prev[id] || 0))

  // Fallback: bets were reset to 0 after a round transition (e.g. call ends
  // the street). Parse the lastAction string — server format: "<sessionId> bet N"
  if (!bettorId && lastAction) {
    const actor = lastAction.split(' ')[0]
    if ((state.gameState?.players || []).includes(actor)) bettorId = actor
  }

  if (!bettorId) return
  const fromEl = bettorId === state.sessionId
    ? document.getElementById('pk-my-badge')
    : document.getElementById(`pk-opp-badge-${bettorId}`)
  flyChip(fromEl, document.getElementById('pk-pot-display'))
}

function animatePotToWinner(winnerId) {
  const fromEl = document.getElementById('pk-pot-display')
  const toEl   = winnerId === state.sessionId
    ? document.getElementById('pk-my-badge')
    : document.getElementById(`pk-opp-badge-${winnerId}`)
  for (let i = 0; i < 5; i++) setTimeout(() => flyChip(fromEl, toEl), i * 110)
}

function animateFoldCards(containerId) {
  const container = document.getElementById(containerId)
  if (!container) return
  const cards = [...container.querySelectorAll('.p-card-img, .p-card:not(.placeholder)')]
  cards.forEach((card, i) => {
    const rect  = card.getBoundingClientRect()
    const clone = card.cloneNode(true)
    clone.style.cssText = [
      'position:fixed',
      `left:${rect.left}px`,
      `top:${rect.top}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      'z-index:9998',
      'pointer-events:none',
      `animation:card-fold-out 0.45s ${i * 80}ms cubic-bezier(0.4,0,1,1) forwards`,
    ].join(';')
    document.body.appendChild(clone)
    clone.addEventListener('animationend', () => clone.remove(), { once: true })
  })
}

function animateReveal(containerId) {
  const container = document.getElementById(containerId)
  if (!container) return
  const cards = [...container.querySelectorAll('.p-card-img, .p-card:not(.placeholder):not(.back)')]
  cards.forEach((card, i) => {
    card.style.animation = `card-reveal 0.45s ${i * 150}ms cubic-bezier(0.34,1.56,0.64,1) both`
  })
}

export function renderBoard(meta, mine) {
  const players   = state.gameState.players || []
  const opponents = players.filter(p => p !== state.sessionId)

  // My avatar (once)
  maybeSetAvatar(
    document.getElementById('pk-my-avatar'),
    state.sessionId,
    (state.username || 'Y')[0].toUpperCase()
  )

  // Build/update each opponent's badge + hand slot
  syncOpponentSlots(opponents)

  // Stats
  document.getElementById('pk-pot').textContent  = meta.pot        ?? 0
  document.getElementById('pk-cbet').textContent = meta.currentBet ?? 0
  document.getElementById('pk-mbet').textContent = (meta.bets || {})[state.sessionId] ?? 0
  document.getElementById('pk-last').textContent = meta.lastAction || ''

  // My chip count
  const chips = meta.chips || {}
  document.getElementById('pk-my-chips').textContent = chips[state.sessionId] ?? '—'

  // Opponent chip counts
  opponents.forEach(id => {
    const el = document.getElementById(`pk-opp-chips-${id}`)
    if (el) el.textContent = chips[id] ?? '—'
  })

  // Fold / phase for this render
  const curFolded = meta.folded || {}
  const curPhase  = meta.phase  || ''
  const myFolded  = !!curFolded[state.sessionId]

  // Detect NEW folds — capture positions BEFORE clearing innerHTML
  if (prevPot >= 0) {
    if (!prevFolded[state.sessionId] && myFolded) animateFoldCards('pk-hand')
    opponents.forEach(id => {
      if (!prevFolded[id] && curFolded[id]) animateFoldCards(`pk-opp-hand-${id}`)
    })
  }

  // Folded badges
  document.getElementById('pk-my-badge')?.classList.toggle('folded', myFolded)
  opponents.forEach(id => {
    document.getElementById(`pk-opp-badge-${id}`)?.classList.toggle('folded', !!curFolded[id])
  })

  // Check vs Call label
  const myBet   = (meta.bets || {})[state.sessionId] || 0
  const callAmt = (meta.currentBet || 0) - myBet
  const checkBtn = document.getElementById('btn-check')
  if (callAmt > 0) {
    checkBtn.textContent     = `Call (${callAmt})`
    checkBtn.dataset.action  = 'call'
    checkBtn.dataset.callAmt = callAmt
  } else {
    checkBtn.textContent    = 'Check'
    checkBtn.dataset.action = 'check'
  }

  // Community cards
  const comm = meta.community || []
  document.getElementById('pk-community').innerHTML =
    comm.map(cardHTML).join('') +
    Array(5 - comm.length).fill('<div class="p-card placeholder"></div>').join('')

  // My hand
  const myHand = (meta.hands || {})[state.sessionId] || []
  document.getElementById('pk-hand').innerHTML =
    myFolded ? '' : myHand.map(cardHTML).join('')

  // Each opponent's hand
  opponents.forEach(id => {
    const handEl = document.getElementById(`pk-opp-hand-${id}`)
    if (!handEl) return
    if (curFolded[id]) { handEl.innerHTML = ''; return }
    const hand = (meta.hands || {})[id]
    handEl.innerHTML = hand?.length
      ? hand.map(cardHTML).join('')
      : '<div class="p-card back"></div><div class="p-card back"></div>'
  })

  // Showdown reveal — after real card faces are in the DOM
  if (prevPot >= 0 && prevPhase !== 'showdown' && curPhase === 'showdown') {
    opponents.forEach(id => { if (!curFolded[id]) animateReveal(`pk-opp-hand-${id}`) })
    animateReveal('pk-hand')
  }

  ;['btn-fold', 'btn-check', 'btn-bet'].forEach(id => {
    document.getElementById(id).disabled = !mine
  })
  document.getElementById('bet-amt').disabled = !mine

  // Turn brightness indicator
  document.getElementById('poker-board')?.classList.toggle('turn-mine', mine)

  // Chip / pot animations
  const curPot    = meta.pot    ?? 0
  const curBets   = meta.bets   || {}
  const curWinner = meta.winner ?? null

  if (prevPot >= 0) {
    if (!prevWinner && curWinner) {
      animatePotToWinner(curWinner)
    } else if (!curWinner && curPot > prevPot) {
      animateBetToPot(curBets, prevBets, meta.lastAction)
    }
  }

  prevPot    = curPot
  prevBets   = { ...curBets }
  prevWinner = curWinner
  prevFolded = { ...curFolded }
  prevPhase  = curPhase
}

export function cardHTML(str) {
  if (!str || str === 'hidden') return '<div class="p-card back"></div>'

  // Back of card
  if (str === 'back') {
    const src = `${CARD_BASE()}/back.svg`
    return `<img class="p-card-img" src="${src}" alt="back"
      onerror="this.outerHTML='<div class=&quot;p-card back&quot;></div>'">`
  }

  // Joker cards
  if (str.toLowerCase().includes('joker')) {
    const assetName = str.toLowerCase().includes('red') ? 'red_joker' : 'black_joker'
    const src = `${CARD_BASE()}/${assetName}.svg`
    return `<img class="p-card-img" src="${src}" alt="${str}"
      onerror="this.outerHTML='<div class=&quot;p-card black&quot;><div class=&quot;center&quot;>🃏</div></div>'">`
  }

  // API returns "K-spades" format; R2 files use lowercase rank (k-spades.svg)
  const symMatch = str.match(/^(.+?)([♠♥♦♣])$/)
  const [rank, suit] = symMatch
    ? [symMatch[1], SUIT_NAMES[symMatch[2]]]
    : str.split('-')
  const assetName = `${rank.toLowerCase()}-${suit}`
  const src = `${CARD_BASE()}/${assetName}.svg`
  const safe = cssCard(str).replace(/'/g, '&#39;').replace(/"/g, '&quot;')
  return `<img class="p-card-img" src="${src}" alt="${str}"
    onerror="this.outerHTML='${safe}'">`
}

function cssCard(str) {
  let rank, sym, colorClass

  const symMatch = str.match(/^(.+?)([♠♥♦♣])$/)
  if (symMatch) {
    rank       = symMatch[1]
    sym        = symMatch[2]
    colorClass = RED_SYMS.has(sym) ? 'red' : 'black'
  } else {
    const [r, suit] = str.split('-')
    rank       = r || str
    sym        = SUIT_SYMBOLS[suit] || suit || '?'
    colorClass = RED_SUITS.has(suit) ? 'red' : 'black'
  }

  return `<div class="p-card ${colorClass}">` +
    `<div class="tl"><span class="r">${rank}</span><span class="s">${sym}</span></div>` +
    `<div class="center">${sym}</div>` +
    `<div class="br"><span class="r">${rank}</span><span class="s">${sym}</span></div>` +
    `</div>`
}

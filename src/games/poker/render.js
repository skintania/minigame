import { state, cfg } from '../../state.js'
import { getBestHandName } from './eval.js'

const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }
const SUIT_NAMES   = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' }
const RED_SUITS    = new Set(['hearts', 'diamonds'])
const RED_SYMS     = new Set(['♥', '♦'])
const CARD_BASE    = () => `${cfg.url}/assets/cards/standard-deck`
const CHIP_URL     = () => `${cfg.url}/assets/cards/chips/chip-100.svg`
const AVATAR_URL   = sid => `${cfg.url}/assets/avatars/${sid}.svg`

const sleepR = ms => new Promise(r => setTimeout(r, ms))

// ── Animation / render state ──────────────────────────────
let prevPot                = -1
let prevBets               = {}
let prevWinner             = null
let prevFolded             = {}
let prevPhase              = null
let prevShowdownDecisions  = {}
let builtOppIds            = []   // tracks which opponent slots are in the DOM

// Cache revealed hands + community from showdown so they stay visible during between-rounds
let cachedHands     = {}
let cachedCommunity = []

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

function oppLabel(oppId, idx, total) {
  const names = state.gameState?.playerNames || {}
  return names[oppId] || (total === 1 ? 'Opponent' : `Player ${idx + 2}`)
}

// Seat positions for N opponents (clockwise from top-center)
const SEAT_MAP = [
  ['top-center'],
  ['top-left', 'top-right'],
  ['top-left', 'top-center', 'top-right'],
  ['left', 'top-left', 'top-right', 'right'],
  ['left', 'top-left', 'top-center', 'top-right', 'right'],
  ['left', 'mid-left', 'top-left', 'top-right', 'mid-right', 'right'],
  ['left', 'mid-left', 'top-left', 'top-center', 'top-right', 'mid-right', 'right'],
]

// Build or update opponent badge+hand slots inside #pk-opponents
function syncOpponentSlots(oppIds) {
  const container = document.getElementById('pk-opponents')
  if (!container) return

  // Rebuild DOM only when the player list changes
  if (oppIds.join(',') === builtOppIds.join(',')) return
  builtOppIds = [...oppIds]

  const total = oppIds.length
  const seats = SEAT_MAP[Math.min(total, 7) - 1] || SEAT_MAP[6]

  container.innerHTML = oppIds.map((id, idx) => {
    const name = oppLabel(id, idx, total)
    const seat = seats[idx] || 'top-center'
    return `<div class="pk-opp-slot" data-id="${id}" data-seat="${seat}">
      <div class="pk-player-badge" id="pk-opp-badge-${id}">
        <div class="pk-avatar" id="pk-opp-avatar-${id}">${name[0]}</div>
        <div class="pk-badge-info">
          <span class="pk-badge-label">${name}</span>
          <span class="pk-chip-count">&#9885; <span id="pk-opp-chips-${id}">—</span></span>
        </div>
      </div>
      <div class="cards-row" id="pk-opp-hand-${id}"></div>
      <div class="pk-hand-rank" id="pk-opp-rank-${id}"></div>
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
  const COUNT = 10
  for (let i = 0; i < COUNT; i++) setTimeout(() => flyChip(fromEl, toEl), i * 75)
  // Gold flash on the badge after chips land
  setTimeout(() => {
    toEl?.classList.add('winner-flash')
    setTimeout(() => toEl?.classList.remove('winner-flash'), 900)
  }, COUNT * 75 + 550)
}

function localizeAction(str) {
  const names = state.gameState?.playerNames || {}
  return Object.entries(names).reduce((s, [sid, name]) => s.replaceAll(sid, name), str || '')
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
  const cards = [...container.querySelectorAll('.p-card-img, .p-card:not(.placeholder):not(.back):not(.fold)')]
  cards.forEach((card, i) => {
    card.style.animation = `card-reveal 0.45s ${i * 150}ms cubic-bezier(0.34,1.56,0.64,1) both`
  })
}

// Build a playerStates-shaped map from legacy flat metadata fields.
// Used as a fallback when the server hasn't deployed the playerStates format yet.
function legacyPS(meta, players) {
  const hands    = meta.hands    || {}
  const chips    = meta.chips    || {}
  const bets     = meta.bets     || {}
  const totals   = meta.totalBets || bets
  const folded   = meta.folded   || {}
  const decs     = meta.showdownDecisions || {}
  const dealerId = players[meta.dealerIndex] ?? null
  const sbId     = players[meta.sbIndex]    ?? null
  const bbId     = players[meta.bbIndex]    ?? null
  return Object.fromEntries(players.map(id => [id, {
    cards:            hands[id]    || [],
    chips:            chips[id],
    bet:              bets[id]     ?? 0,
    totalBet:         totals[id]   ?? bets[id] ?? 0,
    status:           folded[id]   ? 'folded' : 'active',
    isCurrentPlayer:  meta.currentPlayer === id,
    isDealer:         dealerId === id,
    isSB:             sbId === id,
    isBB:             bbId === id,
    showdownDecision: decs[id]     || null,
  }]))
}

export function renderBoard(meta, mine) {
  const players   = state.gameState.players || []
  const opponents = players.filter(p => p !== state.sessionId)
  const ps        = meta.playerStates || legacyPS(meta, players)

  const curPhaseEarly = meta.phase || ''

  // Keep cache current throughout showdown so the final show/muck state
  // (which cards are revealed vs hidden) persists into between-rounds.
  // Also persist to sessionStorage so a hard-refresh during between-rounds
  // can restore the revealed hands (server sends hidden for all in that phase).
  if (curPhaseEarly === 'showdown') {
    players.forEach(id => { cachedHands[id] = ps[id]?.cards || [] })
    cachedCommunity = [...(meta.community || [])]
    if (state.matchId) {
      try {
        sessionStorage.setItem(`pk_hands_${state.matchId}`,
          JSON.stringify({ hands: cachedHands, community: cachedCommunity }))
      } catch {}
    }
  }

  // Between-rounds: restore cache from sessionStorage if it was cleared (hard refresh),
  // then merge any real cards the server may have sent (e.g. last-player show/muck
  // transitions directly to between-rounds before this cache block could run).
  if (curPhaseEarly === 'between-rounds') {
    if (!Object.keys(cachedHands).length && state.matchId) {
      try {
        const raw = sessionStorage.getItem(`pk_hands_${state.matchId}`)
        if (raw) {
          const s = JSON.parse(raw)
          if (s?.hands)             cachedHands     = { ...s.hands }
          if (s?.community?.length) cachedCommunity = [...s.community]
        }
      } catch {}
    }
    players.forEach(id => {
      const cards = ps[id]?.cards || []
      if (cards.some(c => c !== 'hidden' && c !== 'back' && c !== 'fold')) {
        cachedHands[id] = cards
      }
    })
    if (meta.community?.length) cachedCommunity = [...meta.community]
  }

  // Clear cache and muck state when a new hand begins
  if (curPhaseEarly === 'preflop' && prevPhase !== 'preflop' && prevPhase !== null) {
    cachedHands            = {}
    cachedCommunity        = []
    prevShowdownDecisions  = {}
    if (state.matchId) {
      try { sessionStorage.removeItem(`pk_hands_${state.matchId}`) } catch {}
    }
    document.querySelectorAll('.pk-player-badge').forEach(el => el.classList.remove('mucked'))
  }

  // During between-rounds, fall back to cached revealed data so cards stay visible
  const isBetween   = curPhaseEarly === 'between-rounds'
  const handsFromPS = Object.fromEntries(players.map(id => [id, ps[id]?.cards || []]))
  const effectHands = (isBetween && Object.keys(cachedHands).length) ? cachedHands : handsFromPS
  const effectComm  = (isBetween && cachedCommunity.length) ? cachedCommunity : (meta.community || [])

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
  document.getElementById('pk-last').textContent = localizeAction(meta.lastAction)

  // Blind info shown under pot during preflop so players know where those chips came from
  const blindInfoEl = document.getElementById('pk-blind-info')
  if (blindInfoEl) {
    if (meta.phase === 'preflop') {
      const sbId  = players.find(id => ps[id]?.isSB)
      const bbId  = players.find(id => ps[id]?.isBB)
      const sbAmt = sbId ? (ps[sbId]?.totalBet ?? 0) : 0
      const bbAmt = bbId ? (ps[bbId]?.totalBet ?? 0) : 0
      blindInfoEl.textContent = sbAmt || bbAmt ? `SB ${sbAmt} · BB ${bbAmt}` : ''
    } else {
      blindInfoEl.textContent = ''
    }
  }

  // Role tags from playerStates flags
  const blindTag = id => {
    const tags = []
    if (ps[id]?.isDealer) tags.push('D')
    if (ps[id]?.isSB)     tags.push('SB')
    if (ps[id]?.isBB)     tags.push('BB')
    return tags.length ? ` (${tags.join('/')})` : ''
  }

  // My chip count + my label with SB/BB
  document.getElementById('pk-my-chips').textContent = ps[state.sessionId]?.chips ?? '—'
  const myLabelEl = document.querySelector('#pk-my-badge .pk-badge-label')
  if (myLabelEl) myLabelEl.textContent = `You${blindTag(state.sessionId)}`

  // Opponent chip counts + name labels with SB/BB
  opponents.forEach((id, idx) => {
    const chipsEl = document.getElementById(`pk-opp-chips-${id}`)
    if (chipsEl) chipsEl.textContent = ps[id]?.chips ?? '—'
    const labelEl = document.querySelector(`#pk-opp-badge-${id} .pk-badge-label`)
    if (labelEl) labelEl.textContent = oppLabel(id, idx, opponents.length) + blindTag(id)
  })

  // Min raise hint
  const minRaiseEl = document.getElementById('pk-min-raise')
  if (minRaiseEl) {
    minRaiseEl.textContent = mine && meta.lastRaiseAmount > 0
      ? `Min raise: ${meta.lastRaiseAmount}`
      : ''
  }

  // Fold / phase for this render — status comes from playerStates
  const curPhase  = meta.phase || ''
  const curFolded = Object.fromEntries(players.map(id => [id, (ps[id]?.status || 'active') === 'folded']))
  const myFolded  = curFolded[state.sessionId]

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
    document.getElementById(`pk-opp-badge-${id}`)?.classList.toggle('folded', curFolded[id])
  })

  // Muck: animate fold cards on first muck decision, then keep badge dimmed
  const myDecision = ps[state.sessionId]?.showdownDecision
  if (prevPot >= 0 && (curPhase === 'showdown' || curPhase === 'between-rounds')) {
    if (myDecision === 'muck' && prevShowdownDecisions[state.sessionId] !== 'muck') {
      animateFoldCards('pk-hand')
    }
    opponents.forEach(id => {
      const dec = ps[id]?.showdownDecision
      if (dec === 'muck' && prevShowdownDecisions[id] !== 'muck') {
        animateFoldCards(`pk-opp-hand-${id}`)
      }
    })
  }
  document.getElementById('pk-my-badge')?.classList.toggle('mucked', myDecision === 'muck')
  opponents.forEach(id => {
    document.getElementById(`pk-opp-badge-${id}`)?.classList.toggle('mucked', ps[id]?.showdownDecision === 'muck')
  })

  // Turn highlight: pink pulse on my badge, blue pulse on current opponent
  const activeBetting = ['preflop', 'flop', 'turn', 'river'].includes(curPhase)
  document.getElementById('pk-my-badge')?.classList.toggle('turn-active', activeBetting && mine)
  opponents.forEach(id => {
    document.getElementById(`pk-opp-badge-${id}`)?.classList.toggle(
      'turn-active', activeBetting && !!(ps[id]?.isCurrentPlayer)
    )
  })

  // Check vs Call label
  // In preflop, use totalBet so the BB isn't charged their blind twice.
  const streetBet = ps[state.sessionId]?.bet ?? 0
  const myBet     = meta.phase === 'preflop'
    ? Math.max(streetBet, ps[state.sessionId]?.totalBet ?? 0)
    : streetBet
  const callAmt = Math.max(0, (meta.currentBet || 0) - myBet)
  document.getElementById('pk-mbet').textContent = myBet
  const checkBtn = document.getElementById('btn-check')
  if (callAmt > 0) {
    checkBtn.textContent     = `Call (${callAmt})`
    checkBtn.dataset.action  = 'call'
    checkBtn.dataset.callAmt = callAmt
  } else {
    checkBtn.textContent    = 'Check'
    checkBtn.dataset.action = 'check'
  }

  // Community cards (use cached during between-rounds)
  document.getElementById('pk-community').innerHTML =
    effectComm.map(cardHTML).join('') +
    Array(Math.max(0, 5 - effectComm.length)).fill('<div class="p-card placeholder"></div>').join('')

  // My hand — ['fold','fold'] from server renders as fold art via cardHTML
  const myHand = effectHands[state.sessionId] || []
  document.getElementById('pk-hand').innerHTML = myHand.map(cardHTML).join('')

  // Each opponent's hand
  opponents.forEach(id => {
    const handEl = document.getElementById(`pk-opp-hand-${id}`)
    if (!handEl) return
    const hand = effectHands[id]
    handEl.innerHTML = hand?.length
      ? hand.map(cardHTML).join('')
      : curPhase === 'waiting' ? '' : '<div class="p-card back"></div><div class="p-card back"></div>'
  })

  // Hand rank labels — use server handRank when playerStates is present; compute locally as fallback
  const showOppRanks = curPhase === 'showdown' || curPhase === 'between-rounds'
  const useServerRank = !!meta.playerStates
  const myRankEl = document.getElementById('pk-my-rank')
  if (myRankEl) {
    myRankEl.textContent = (!myFolded && curPhase !== 'waiting')
      ? (useServerRank ? (ps[state.sessionId]?.handRank || '') : getBestHandName([...myHand, ...effectComm]))
      : ''
  }
  opponents.forEach(id => {
    const rankEl = document.getElementById(`pk-opp-rank-${id}`)
    if (!rankEl) return
    if (!showOppRanks || curFolded[id]) { rankEl.textContent = ''; return }
    if (useServerRank) { rankEl.textContent = ps[id]?.handRank || ''; return }
    const hand = effectHands[id] || []
    const hasRealCards = hand.length > 0 && hand.every(c => c !== 'hidden' && c !== 'back' && c !== 'fold')
    rankEl.textContent = hasRealCards ? getBestHandName([...hand, ...effectComm]) : ''
  })

  // Reveal opponent cards when entering showdown or between-rounds (server may skip straight to between-rounds)
  const enteringReveal = prevPot >= 0
    && prevPhase !== 'showdown' && prevPhase !== 'between-rounds'
    && (curPhase === 'showdown' || curPhase === 'between-rounds')
  if (enteringReveal) {
    opponents.forEach(id => { if (!curFolded[id]) animateReveal(`pk-opp-hand-${id}`) })
    if (!myFolded) animateReveal('pk-hand')
  }

  ;['btn-fold', 'btn-check', 'btn-bet'].forEach(id => {
    document.getElementById(id).disabled = !mine
  })
  document.getElementById('bet-amt').disabled = !mine

  // Turn brightness indicator
  document.getElementById('poker-board')?.classList.toggle('turn-mine', mine)

  // Chip / pot animations
  const curPot    = meta.pot ?? 0
  const curBets   = Object.fromEntries(players.map(id => [id, ps[id]?.bet || 0]))
  const curWinner = meta.handWinner ?? meta.winner ?? null

  if (prevPot >= 0) {
    const leavingShowdown = prevPhase === 'showdown' && curPhase !== 'showdown'
    if (leavingShowdown && curWinner) {
      // Pot flies to winner as showdown ends (after show/muck decisions)
      animatePotToWinner(curWinner)
    } else if (!prevWinner && curWinner && curPhase !== 'showdown') {
      // Winner set outside showdown (e.g. everyone folded) — animate immediately
      animatePotToWinner(curWinner)
    } else if (!curWinner && curPot > prevPot) {
      animateBetToPot(curBets, prevBets, meta.lastAction)
    }
  }

  prevPot               = curPot
  prevBets              = { ...curBets }
  prevWinner            = curWinner
  prevFolded            = { ...curFolded }
  prevPhase             = curPhase
  prevShowdownDecisions = Object.fromEntries(players.map(id => [id, ps[id]?.showdownDecision]))
}

export function cardHTML(str) {
  if (!str || str === 'hidden') return '<div class="p-card back"></div>'
  if (str === 'fold') return '<div class="p-card fold"></div>'

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

// ── All-in runout reveal ──────────────────────────────────
// Called when a player goes all-in and remaining streets run automatically.
// Re-draws community cards from `fromCount` face-down, then reveals each
// street (flop / turn / river) one at a time with pauses.
export async function animateAllinRunout(meta, fromCount) {
  const community = meta.community || []
  if (community.length <= fromCount || community.length === 0) return

  const commEl = document.getElementById('pk-community')
  if (!commEl) return

  let current = fromCount

  // Reset display: previously-seen real cards + remaining face-down backs.
  // This runs synchronously before any await so the browser never paints
  // the intermediate "all 5 cards face-up" state that render() produced.
  commEl.innerHTML = [
    ...community.slice(0, current).map(cardHTML),
    ...Array(5 - current).fill('<div class="p-card back"></div>'),
  ].join('')

  await sleepR(900)  // dramatic pause before the flip begins

  async function revealTo(targetCount) {
    const slots = [...commEl.children]
    for (let i = current; i < targetCount; i++) {
      const slot = slots[i]
      if (!slot) continue
      const tmp = document.createElement('div')
      tmp.innerHTML = cardHTML(community[i])
      const el = tmp.firstChild
      // Stagger reveal within a street (most visible for the 3-card flop)
      el.style.animation =
        `card-reveal 0.5s ${(i - current) * 220}ms cubic-bezier(0.34,1.56,0.64,1) both`
      slot.replaceWith(el)
    }
    current = targetCount
  }

  if (current < 3) { await revealTo(3); await sleepR(2000) }
  if (current < 4) { await revealTo(4); await sleepR(1800) }
  if (current < 5) { await revealTo(5); await sleepR(1200) }
}

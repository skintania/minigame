import { api } from '../api/client.js'
import { state, saveSession, clearGameState } from '../state.js'
import { showToast } from '../ui/toast.js'
import registry from '../games/registry.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

let handResultActive      = false
let showdownInterval      = null
let turnTimerInterval     = null
let betweenRoundsInterval = null
let roomHeartbeatInterval = null
let roomData              = null
let prevCommunityCount    = 0
let prevMyRole            = null
let wrSettings            = { maxPlayers: 8, startingChips: 1000, turnTimeLimit: 0, roundLimit: 0 }
let wrDebounce            = {}

// ── Server-authoritative helpers ──────────────────────────
// Use these everywhere instead of reading state.isHost / state.role directly.

function amHost() {
  if (state.gameState?.hostId) return state.gameState.hostId === state.sessionId
  return !!state.isHost
}

function curRole() {
  return state.gameState?.myRole || state.role || 'spectator'
}

// Called after every state update to detect elimination and sync cached fields.
function applyServerState(gs) {
  if (!gs) return

  // Detect elimination: server switched us from player → spectator
  if (prevMyRole === 'player' && gs.myRole === 'spectator') {
    document.querySelector('.pk-action-bar')?.style.setProperty('display', 'none')
    const { handWinner, winner } = gs.metadata || {}
    if (!handWinner && !winner) showToast('You were eliminated — now spectating.')
  }
  prevMyRole = gs.myRole ?? prevMyRole

  // Sync host button visibility from every server response
  if (gs.hostId) {
    const isNowHost = gs.hostId === state.sessionId
    document.getElementById('btn-end-game').style.display =
      (state.roomCode && isNowHost) ? 'inline-flex' : 'none'
  }
}

// ── Init ──────────────────────────────────────────────────
export function initGame() {
  document.getElementById('btn-continue-match').addEventListener('click', continueMatch)
  document.getElementById('btn-leave-room-win').addEventListener('click', () => leaveRoom())
  document.getElementById('btn-leave-room-br').addEventListener('click',  () => leaveRoom())
  document.getElementById('btn-end-game').addEventListener('click', () => {
    if (confirm('End the game for everyone?')) leaveRoom()
  })
  document.getElementById('btn-next-round').addEventListener('click', hostNextRound)
  document.getElementById('btn-skip-showdown').addEventListener('click', hostNextRound)
  document.getElementById('btn-show-cards').addEventListener('click', showCards)
  document.getElementById('btn-muck-cards').addEventListener('click', muckCards)
  document.getElementById('btn-switch-role').addEventListener('click', switchRole)

  const roomMenuBtn  = document.getElementById('room-menu-btn')
  const roomDropdown = document.getElementById('room-dropdown')
  roomMenuBtn.addEventListener('click', e => {
    e.stopPropagation()
    if (roomDropdown.style.display !== 'none') {
      roomDropdown.style.display = 'none'
    } else {
      const rect = roomMenuBtn.getBoundingClientRect()
      roomDropdown.style.top   = (rect.bottom + 8) + 'px'
      roomDropdown.style.right = (window.innerWidth - rect.right) + 'px'
      roomDropdown.style.display = 'flex'
    }
  })
  document.addEventListener('click', e => {
    if (!e.target.closest('#room-menu-wrap')) roomDropdown.style.display = 'none'
  })

  document.getElementById('wr-copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(state.roomCode || '')
      .then(() => { const b = document.getElementById('wr-copy-btn'); b.textContent = 'Copied!'; setTimeout(() => b.textContent = 'Copy', 2000) })
      .catch(() => showToast('Copy failed.'))
  })
  document.getElementById('wr-join-table').addEventListener('click',  wrJoinTable)
  document.getElementById('wr-leave-table').addEventListener('click', wrLeaveTable)
  document.getElementById('wr-start-round').addEventListener('click', wrStartRound)
  document.getElementById('wr-leave-room').addEventListener('click',  () => leaveRoom())
  document.getElementById('wr-max-minus').addEventListener('click', () => {
    if (wrSettings.maxPlayers > 2) wrPatchSetting('maxPlayers', wrSettings.maxPlayers - 1)
  })
  document.getElementById('wr-max-plus').addEventListener('click', () => {
    if (wrSettings.maxPlayers < 16) wrPatchSetting('maxPlayers', wrSettings.maxPlayers + 1)
  })
  const dp = (key, getter, min, max) => {
    clearTimeout(wrDebounce[key])
    wrDebounce[key] = setTimeout(() => {
      const v = parseInt(getter(), 10)
      if (!isNaN(v) && v >= min && v <= max) wrPatchSetting(key, v)
    }, 800)
  }
  document.getElementById('wr-chips').addEventListener('input',  () => dp('startingChips', () => document.getElementById('wr-chips').value,  100, 1000000))
  document.getElementById('wr-timer').addEventListener('input',  () => dp('turnTimeLimit', () => document.getElementById('wr-timer').value,  0,   300))
  document.getElementById('wr-rounds').addEventListener('input', () => dp('roundLimit',    () => document.getElementById('wr-rounds').value, 0,   1000))
  document.getElementById('wr-players-inner').addEventListener('click', e => {
    const btn = e.target.closest('[data-kick]')
    if (btn) wrKickPlayer(btn.dataset.kick)
  })

  document.addEventListener('game:move', async e => {
    try { await handleMoveResult(e.detail) } catch (err) {
      console.error('[game] move result error:', err)
      showToast(err.message)
    }
  })
}

// ── Enter game ────────────────────────────────────────────
export function enterGame() {
  stopPoll()

  const gameId = state.gameId
  document.getElementById('g-name').textContent        = gameId === 'poker' ? 'Poker' : 'UNO'
  document.getElementById('poker-board').style.display = gameId === 'poker' ? 'flex' : 'none'
  document.getElementById('uno-board').style.display   = gameId === 'uno'   ? 'flex' : 'none'
  document.getElementById('btn-end-game').style.display =
    (state.roomCode && amHost()) ? 'inline-flex' : 'none'

  if (state.roomCode) {
    document.getElementById('wr-code').textContent       = state.roomCode
    document.getElementById('wr-game-badge').textContent = (state.gameId || '—').toUpperCase()
    document.getElementById('room-menu-btn').textContent = state.roomCode + ' ▾'
    document.getElementById('room-menu-wrap').style.display = ''
  }

  if (state.roomCode && !state.gameState) {
    state.gameState = { matchStatus: 'waiting', metadata: { phase: 'waiting' }, players: [], playerNames: {}, myRole: curRole(), hostId: state.hostId }
    render()
  }

  if (state.roomCode) {
    pollRoomHeartbeat()
    roomHeartbeatInterval = setInterval(pollRoomHeartbeat, 15000)
  }

  if (!state.matchId) return

  let fetching = false
  state.poll = setInterval(async () => {
    if (fetching) return
    fetching = true
    try {
      const commBefore = state.gameState?.metadata?.community?.length ?? 0
      const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
      state.gameState = gs
      applyServerState(gs)
      saveSession()
      render()
      if (gs.metadata?.winner) {
        stopPoll()
        prevCommunityCount = commBefore
        onHandEnd(gs.metadata)
      }
    } catch (e) {
      console.error('[game] poll error:', e)
      if (e.message.includes('invalid session')) {
        stopPoll(); showToast('Session expired'); window.location.href = 'index.html'
      }
    } finally {
      fetching = false
    }
  }, 2200)
}

// ── Room heartbeat ────────────────────────────────────────
async function pollRoomHeartbeat() {
  if (!state.roomCode) return
  try {
    const room = await api.getRoomStatus(state.roomCode, state.sessionId)
    roomData = room

    // Keep state.isHost in sync for initial load (before game state arrives)
    if (room.hostId) {
      state.hostId = room.hostId
      state.isHost = room.hostId === state.sessionId
      document.getElementById('btn-end-game').style.display =
        (state.roomCode && amHost()) ? 'inline-flex' : 'none'
      document.getElementById('btn-next-round').style.display = amHost() ? '' : 'none'
    }

    if (state.gameState?.matchStatus === 'waiting' || state.gameState?.metadata?.phase === 'waiting') {
      updateWaitingPanel(state.gameState?.metadata || null)
    }
    updateSpectatorPanel()
  } catch (e) {
    if (e.message.includes('not found') || e.message.includes('invalid session')) {
      stopPoll(); showToast('You were removed from the room.'); window.location.href = 'index.html'
    }
  }
}

// ── Render ────────────────────────────────────────────────
export function render() {
  if (!state.gameState) return
  const meta = state.gameState.metadata
  if (!meta) return

  const isWaiting = state.gameState.matchStatus === 'waiting' || meta.phase === 'waiting'

  document.getElementById('room-menu-wrap').style.display = state.roomCode ? '' : 'none'
  if (state.roomCode) document.getElementById('room-menu-btn').textContent = state.roomCode + ' ▾'

  document.getElementById('wr-join-wrap').style.display = isWaiting ? 'flex' : 'none'

  document.getElementById('pk-my-badge').style.display =
    (isWaiting && curRole() !== 'player') ? 'none' : ''

  document.getElementById('spectator-panel').style.display = state.roomCode ? '' : 'none'
  updateSpectatorPanel()

  if (isWaiting) {
    document.querySelector('.pk-action-bar')?.style.setProperty('display', 'none')
    updateWaitingPanel(meta)
    registry[state.gameId]?.render(meta, false)
    return
  }

  if (meta.phase === 'showdown') {
    document.querySelector('.pk-action-bar')?.style.setProperty('display', 'none')
    updateShowdownBar(meta)
    registry[state.gameId]?.render(meta, false)
    return
  }

  hideShowdownBar()

  if (meta.phase === 'between-rounds') {
    document.querySelector('.pk-action-bar')?.style.setProperty('display', 'none')
    if (!document.getElementById('between-rounds-overlay')?.classList.contains('open')) {
      showBetweenRounds(meta)
    }
    registry[state.gameId]?.render(meta, false)
    return
  }

  hideBetweenRounds()
  document.querySelector('.pk-action-bar')?.style.setProperty('display',
    curRole() === 'spectator' ? 'none' : '')

  const isSpectator = curRole() === 'spectator'
  const mine = state.gameState.isMyTurn === true

  const pill = document.getElementById('turn-pill')
  if (isSpectator) {
    pill.textContent = 'Spectating'; pill.className = 'turn-pill spectator'
  } else {
    pill.textContent = mine ? 'Your Turn' : "Opponent's Turn"
    pill.className   = 'turn-pill ' + (mine ? 'mine' : 'theirs')
  }
  document.getElementById('g-phase').textContent = meta.phase || ''

  const roundEl = document.getElementById('g-round-progress')
  if (meta.roundLimit && meta.currentRound) {
    roundEl.textContent = `${meta.currentRound}/${meta.roundLimit}`; roundEl.style.display = ''
  } else {
    roundEl.style.display = 'none'
  }

  updateTurnTimer(meta, mine)
  registry[state.gameId].render(meta, mine)
}

// ── Spectator panel ───────────────────────────────────────
function updateSpectatorPanel() {
  const gs   = state.gameState
  const room = roomData

  const specNames = gs?.spectatorNames || {}
  const specCount = room?.spectatorCount ?? Object.keys(specNames).length
  document.getElementById('wr-spec-count').textContent = specCount

  const list = document.getElementById('spec-panel-list')
  if (!list) return

  const specs = Object.entries(specNames).map(([id, username]) => ({ sessionId: id, username }))

  if (specs.length === 0) {
    list.innerHTML = `<div class="spec-panel-empty">${specCount > 0 ? `${specCount} watching` : 'None'}</div>`
    return
  }

  list.innerHTML = specs.map(({ sessionId: id, username }) => {
    const isMe = id === state.sessionId
    const name = isMe ? (state.username || username || 'You') : username
    return `<div class="spec-panel-row">${isMe ? `• <strong>${name}</strong>` : `• ${name}`}</div>`
  }).join('')
}

// ── Waiting panel ─────────────────────────────────────────
function updateWaitingPanel(meta) {
  const room    = roomData
  const gs      = state.gameState
  const names   = gs?.playerNames || {}
  const players = gs?.players     || []
  const chips   = gs?.metadata?.chips || {}
  const isPoker = state.gameId === 'poker'
  const role    = curRole()
  const host    = amHost()

  if (room) {
    document.getElementById('wr-player-count').textContent = room.playerCount    ?? '—'
    document.getElementById('wr-max-display').textContent  = room.maxPlayers     ?? '—'
    document.getElementById('wr-spec-count').textContent   = room.spectatorCount ?? 0
    document.getElementById('room-menu-btn').textContent   = (state.roomCode || '——') + ' ▾'
    wrSettings = {
      maxPlayers:    room.maxPlayers    ?? 8,
      startingChips: room.startingChips ?? 1000,
      turnTimeLimit: room.turnTimeLimit ?? 0,
      roundLimit:    room.roundLimit    ?? 0,
    }
  }

  const memberNameMap = {}
  if (Array.isArray(room?.members)) {
    room.members.forEach(m => { memberNameMap[m.sessionId] = m.username })
  }

  const tableMemberIds = Array.isArray(room?.members)
    ? room.members.filter(m => m.role === 'player').map(m => m.sessionId)
    : players

  const hostId = gs?.hostId || room?.hostId || state.hostId

  const inner = document.getElementById('wr-players-inner')
  if (tableMemberIds.length === 0) {
    inner.innerHTML = '<div class="rm-empty">No players at the table yet</div>'
  } else {
    inner.innerHTML = tableMemberIds.map(id => {
      const name    = names[id] || memberNameMap[id] || id.slice(0, 8)
      const isMe    = id === state.sessionId
      const isHostP = id === hostId
      const chipAmt = chips[id] != null ? `<span class="pk-chip-count">&#9885; ${chips[id]}</span>` : ''
      const kickBtn = (host && !isMe)
        ? `<button class="rm-kick-btn" data-kick="${id}">Kick</button>` : ''
      return `<div class="rm-player-row">
        <div class="rm-player-name">
          ${name}
          ${isMe    ? '<span class="rm-badge rm-you-badge">You</span>'   : ''}
          ${isHostP ? '<span class="rm-badge rm-host-badge">Host</span>' : ''}
        </div>
        <div style="display:flex;align-items:center;gap:10px">${chipAmt}${kickBtn}</div>
      </div>`
    }).join('')
  }

  const badge = document.getElementById('wr-role-badge')
  if (role === 'player') {
    badge.textContent = host ? '🎮 Host · Player' : '🎮 Player'
    badge.className   = 'rm-role-badge rm-role-player'
  } else {
    badge.textContent = host ? '👁 Host · Spectating' : '👁 Spectating'
    badge.className   = 'rm-role-badge rm-role-spectator'
  }

  document.getElementById('wr-join-table').style.display  = role === 'spectator' ? '' : 'none'
  document.getElementById('wr-leave-table').style.display = role === 'player'    ? '' : 'none'

  const startBtn = document.getElementById('wr-start-round')
  if (host) {
    startBtn.style.display = ''
    const cnt = room?.playerCount ?? players.length
    startBtn.disabled    = cnt < 2
    startBtn.textContent = cnt >= 2 ? `Start (${cnt})` : 'Need players…'
  } else {
    startBtn.style.display = 'none'
  }

  const settingsEl = document.getElementById('wr-settings')
  settingsEl.style.display = host ? '' : 'none'
  if (host) {
    document.getElementById('wr-max-val').textContent    = wrSettings.maxPlayers
    document.getElementById('wr-chips').value            = wrSettings.startingChips
    document.getElementById('wr-timer').value            = wrSettings.turnTimeLimit
    document.getElementById('wr-rounds').value           = wrSettings.roundLimit
    document.getElementById('wr-chips-row').style.display  = isPoker ? '' : 'none'
    document.getElementById('wr-timer-row').style.display  = isPoker ? '' : 'none'
    document.getElementById('wr-rounds-row').style.display = isPoker ? '' : 'none'
  }
}

// ── Waiting panel actions ─────────────────────────────────
async function wrJoinTable() {
  const btn = document.getElementById('wr-join-table')
  btn.disabled = true
  try {
    await api.switchRole(state.roomCode, state.sessionId, 'player')
    const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
    state.gameState = gs; applyServerState(gs); saveSession()
    showToast('You joined the table!')
    updateWaitingPanel(gs.metadata || null)
    updateSpectatorPanel()
  } catch (e) { showToast(e.message) }
  finally { btn.disabled = false }
}

async function wrLeaveTable() {
  const btn = document.getElementById('wr-leave-table')
  btn.disabled = true
  try {
    await api.switchRole(state.roomCode, state.sessionId, 'spectator')
    const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
    state.gameState = gs; applyServerState(gs); saveSession()
    showToast('You left the table.')
    updateWaitingPanel(gs.metadata || null)
    updateSpectatorPanel()
  } catch (e) { showToast(e.message) }
  finally { btn.disabled = false }
}

async function wrStartRound() {
  const btn = document.getElementById('wr-start-round')
  btn.disabled = true; btn.textContent = 'Starting…'
  try {
    const fn  = state.gameId === 'poker' ? api.pokerStart : api.unoStart
    const res = await fn(state.matchId, state.sessionId)
    state.gameState = res; applyServerState(res); saveSession()
    if (!state.poll) enterGame()
    else render()
  } catch (e) {
    showToast(e.message)
    btn.disabled = false
    btn.textContent = 'Start Round'
  }
}

async function wrPatchSetting(key, value) {
  try {
    const up = await api.patchSettings(state.roomCode, state.sessionId, { [key]: value })
    if (up.maxPlayers    != null) { wrSettings.maxPlayers    = up.maxPlayers;    document.getElementById('wr-max-val').textContent = up.maxPlayers }
    if (up.startingChips != null) { wrSettings.startingChips = up.startingChips; document.getElementById('wr-chips').value = up.startingChips }
    if (up.turnTimeLimit != null) { wrSettings.turnTimeLimit = up.turnTimeLimit; document.getElementById('wr-timer').value = up.turnTimeLimit }
    if (up.roundLimit    != null) { wrSettings.roundLimit    = up.roundLimit;    document.getElementById('wr-rounds').value = up.roundLimit }
  } catch (e) { showToast(e.message) }
}

async function wrKickPlayer(targetId) {
  if (!confirm('Kick this player?')) return
  try {
    await api.kickPlayer(state.roomCode, state.sessionId, targetId)
    showToast('Player kicked.')
  } catch (e) { showToast(e.message) }
}

// ── Move result handler ───────────────────────────────────
async function handleMoveResult(res) {
  const commBefore = state.gameState?.metadata?.community?.length ?? 0
  // Action endpoints return the full unified game response directly
  state.gameState = res
  applyServerState(res)
  saveSession()
  render()
  if (res.status === 'finished' || res.metadata?.winner) {
    stopPoll()
    prevCommunityCount = commBefore
    onHandEnd(res.metadata)
  }
}

function onHandEnd(meta) {
  if (state.gameId === 'poker') showHandResult(meta)
  else showWinner(meta.winner)
}

// ── Showdown bar ──────────────────────────────────────────
function updateShowdownBar(meta) {
  const bar = document.getElementById('showdown-bar')
  if (!bar) return

  const names      = state.gameState?.playerNames || {}
  const handWinner = meta.handWinner
  const won        = handWinner === state.sessionId
  const winnerName = won ? (state.username || 'You') : (names[handWinner] || 'Opponent')
  document.getElementById('sd-winner-text').textContent =
    handWinner ? `${winnerName} wins the hand` : 'Showdown'

  document.getElementById('btn-skip-showdown').style.display = amHost() ? '' : 'none'

  const myDecision = meta.showdownDecisions?.[state.sessionId]
  const canDecide  = myDecision === 'pending'
  document.getElementById('btn-show-cards').style.display = canDecide ? '' : 'none'
  document.getElementById('btn-muck-cards').style.display = canDecide ? '' : 'none'

  if (!bar.classList.contains('open')) {
    // Start local 1s countdown from server value on first open
    let remaining = meta.showdownRemainingSec ?? 5
    document.getElementById('sd-countdown').textContent = remaining
    showdownInterval = setInterval(() => {
      remaining = Math.max(0, remaining - 1)
      document.getElementById('sd-countdown').textContent = remaining
      if (remaining <= 0) { clearInterval(showdownInterval); showdownInterval = null }
    }, 1000)
    bar.classList.add('open')
  }
}

function hideShowdownBar() {
  document.getElementById('showdown-bar')?.classList.remove('open')
  clearInterval(showdownInterval); showdownInterval = null
}

// ── Poker hand winner banner ──────────────────────────────
function showHandWinnerBanner(text) {
  const banner = document.getElementById('pk-hand-winner')
  document.getElementById('pk-hw-text').textContent = text
  banner.classList.remove('fading')
  banner.style.display = ''
}

function hideHandWinnerBanner() {
  const banner = document.getElementById('pk-hand-winner')
  banner.style.display = 'none'
  banner.classList.remove('fading')
}

async function showHandResult(meta) {
  if (handResultActive) return
  handResultActive = true

  hideShowdownBar()
  hideBetweenRounds()

  const community     = meta.community || []
  const isAllinRunout = community.length === 5 && prevCommunityCount < 5
  if (isAllinRunout && registry[state.gameId]?.animateAllinRunout) {
    await registry[state.gameId].animateAllinRunout(meta, prevCommunityCount)
  } else {
    await sleep(800)
  }

  const handWinnerId = meta.handWinner ?? meta.winner
  if (handWinnerId) {
    const names      = state.gameState?.playerNames || {}
    const won        = handWinnerId === state.sessionId
    const winnerName = won ? (state.username || 'You') : (names[handWinnerId] || 'Opponent')
    showHandWinnerBanner(`${winnerName} wins the hand`)
  }

  const players  = state.gameState?.players || []
  const chips    = meta.chips || {}
  const winnerId = meta.winner || players.find(p => (chips[p] || 0) > 0)
  setTimeout(() => {
    hideHandWinnerBanner()
    if (winnerId) showWinner(winnerId)
    handResultActive = false
  }, 2500)
}

// ── Turn timer ────────────────────────────────────────────
function updateTurnTimer(meta, mine) {
  const bar = document.getElementById('turn-timer-bar')
  if (!bar) return
  if (!mine || !meta.turnTimeLimit || !meta.turnStartedAt) {
    bar.style.display = 'none'; clearInterval(turnTimerInterval); turnTimerInterval = null; return
  }
  bar.style.display = ''
  tickTurnTimer(meta)
  if (!turnTimerInterval) turnTimerInterval = setInterval(() => tickTurnTimer(meta), 1000)
}

function tickTurnTimer(meta) {
  const elapsed = (Date.now() - new Date(meta.turnStartedAt)) / 1000
  const left    = Math.max(0, meta.turnTimeLimit - elapsed)
  const fill = document.getElementById('turn-timer-fill')
  const secs = document.getElementById('turn-timer-secs')
  if (fill) fill.style.width = (left / meta.turnTimeLimit * 100) + '%'
  if (secs) secs.textContent = Math.ceil(left) + 's'
  if (left <= 0) { clearInterval(turnTimerInterval); turnTimerInterval = null }
}

// ── Between-rounds overlay ────────────────────────────────
function showBetweenRounds(meta) {
  const overlay = document.getElementById('between-rounds-overlay')
  if (!overlay) return

  const won        = meta.handWinner === state.sessionId
  const names      = state.gameState?.playerNames || {}
  const winnerName = names[meta.handWinner] || (won ? 'You' : 'Opponent')
  const roundInfo  = document.getElementById('br-round-info')

  if (meta.winner) {
    roundInfo.textContent = `Game Over — ${names[meta.winner] || 'Someone'} wins the table!`
  } else if (meta.handWinner) {
    roundInfo.textContent = `${won ? 'You won' : `${winnerName} won`} the hand!`
  } else if (meta.roundLimit && meta.currentRound) {
    roundInfo.textContent = `Round ${meta.currentRound} of ${meta.roundLimit} complete`
  } else {
    roundInfo.textContent = 'Hand complete'
  }

  const switchBtn = document.getElementById('btn-switch-role')
  if (state.roomCode) {
    switchBtn.style.display = ''
    switchBtn.textContent   = curRole() === 'spectator' ? 'Join Table' : 'Leave Table'
  } else {
    switchBtn.style.display = 'none'
  }

  document.getElementById('btn-next-round').style.display = amHost() ? '' : 'none'
  overlay.classList.add('open')

  if (!betweenRoundsInterval && meta.betweenRoundsUntil) {
    tickBetweenRounds(meta)
    betweenRoundsInterval = setInterval(() => tickBetweenRounds(meta), 1000)
  }
}

function tickBetweenRounds(meta) {
  if (!meta.betweenRoundsUntil) return
  const left = Math.ceil((new Date(meta.betweenRoundsUntil) - Date.now()) / 1000)
  const el   = document.getElementById('br-countdown')
  if (el) el.textContent = Math.max(0, left)
  if (left <= 0) { clearInterval(betweenRoundsInterval); betweenRoundsInterval = null }
}

function hideBetweenRounds() {
  document.getElementById('between-rounds-overlay')?.classList.remove('open')
  clearInterval(betweenRoundsInterval); betweenRoundsInterval = null
}

// ── Showdown decisions ────────────────────────────────────
async function showCards() {
  const btn = document.getElementById('btn-show-cards')
  btn.disabled = true
  try {
    const res = await api.pokerShow(state.matchId, state.sessionId)
    document.dispatchEvent(new CustomEvent('game:move', { detail: res }))
  } catch (e) { showToast(e.message) }
  finally { btn.disabled = false }
}

async function muckCards() {
  const btn = document.getElementById('btn-muck-cards')
  btn.disabled = true
  try {
    const res = await api.pokerMuck(state.matchId, state.sessionId)
    document.dispatchEvent(new CustomEvent('game:move', { detail: res }))
  } catch (e) { showToast(e.message) }
  finally { btn.disabled = false }
}

// ── Between-rounds actions ────────────────────────────────
async function hostNextRound() {
  const btn     = document.getElementById('btn-next-round')
  const skipBtn = document.getElementById('btn-skip-showdown')
  if (btn)     btn.disabled     = true
  if (skipBtn) skipBtn.disabled = true
  try {
    const res = await api.pokerNextRound(state.matchId, state.sessionId)
    state.gameState = res; applyServerState(res); saveSession(); render()
  } catch (e) { showToast(e.message) }
  finally {
    if (btn)     btn.disabled     = false
    if (skipBtn) skipBtn.disabled = false
  }
}

async function switchRole() {
  const newRole = curRole() === 'spectator' ? 'player' : 'spectator'
  const btn = document.getElementById('btn-switch-role')
  btn.disabled = true
  try {
    await api.switchRole(state.roomCode, state.sessionId, newRole)
    const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
    state.gameState = gs; applyServerState(gs); saveSession()
    btn.textContent = curRole() === 'spectator' ? 'Join Table' : 'Leave Table'
    document.querySelector('.pk-action-bar')?.style.setProperty('display', curRole() === 'spectator' ? 'none' : '')
    showToast(newRole === 'player' ? 'You joined the table!' : 'You left the table.')
  } catch (e) { showToast(e.message) }
  finally { btn.disabled = false }
}

// ── Leave Room ────────────────────────────────────────────
async function leaveRoom() {
  stopPoll()
  if (state.roomCode) {
    try { await api.leaveRoom(state.roomCode, state.sessionId) } catch { /* ignore */ }
  }
  clearGameState(); window.location.href = 'index.html'
}

// ── Winner overlay ────────────────────────────────────────
function showWinner(winnerId) {
  const won = winnerId === state.sessionId
  document.getElementById('w-emoji').textContent = won ? '🏆' : '😔'
  document.getElementById('w-title').textContent = won ? 'You Win!' : 'You Lose'
  document.getElementById('w-title').className   = 'winner-title ' + (won ? 'win' : 'lose')
  document.getElementById('w-sub').textContent   = won ? 'Congratulations!' : 'Better luck next time.'
  // Winner goes back to the room; loser stays to spectate
  document.getElementById('btn-continue-match').textContent = won ? 'Back to Room' : 'Continue Match'
  document.getElementById('winner-overlay').classList.add('open')
}

// ── Poll stop / navigation ────────────────────────────────
export function stopPoll() {
  clearInterval(state.poll);            state.poll            = null
  clearInterval(turnTimerInterval);     turnTimerInterval     = null
  clearInterval(betweenRoundsInterval); betweenRoundsInterval = null
  clearInterval(showdownInterval);      showdownInterval      = null
  clearInterval(roomHeartbeatInterval); roomHeartbeatInterval = null
}

function continueMatch() {
  document.getElementById('winner-overlay').classList.remove('open')
  handResultActive = false
  // Clear match so the poll doesn't re-detect meta.winner and loop the overlay
  state.matchId   = null
  state.gameState = null
  saveSession()
  // Re-enter the page as a spectator; room heartbeat keeps the waiting panel live
  enterGame()
}

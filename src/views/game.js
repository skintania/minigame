import { api } from '../api/client.js'
import { state, saveSession, clearGameState } from '../state.js'
import { showToast } from '../ui/toast.js'
import registry from '../games/registry.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

let handResultTimer       = null
let handResultActive      = false
let turnTimerInterval     = null
let betweenRoundsInterval = null
let roomHeartbeatInterval = null
let roomData              = null   // latest GET /rooms/:code response
let prevCommunityCount    = 0      // community card count before last state update (all-in detection)
let wrSettings            = { maxPlayers: 8, startingChips: 1000, turnTimeLimit: 0, roundLimit: 0 }
let wrDebounce            = {}

// ── Init ──────────────────────────────────────────────────
export function initGame() {
  // Overlay close buttons
  document.getElementById('btn-back-to-room-win').addEventListener('click', goLobby)
  document.getElementById('btn-leave-room-win').addEventListener('click', () => leaveRoom())
  document.getElementById('btn-leave-room-br').addEventListener('click', () => leaveRoom())
  document.getElementById('btn-end-game').addEventListener('click', () => {
    if (confirm('End the game for everyone?')) leaveRoom()
  })
  document.getElementById('btn-next-round').addEventListener('click', hostNextRound)
  document.getElementById('btn-switch-role').addEventListener('click', switchRole)

  // Room menu dropdown
  const roomMenuBtn = document.getElementById('room-menu-btn')
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

  // Room menu / waiting panel actions
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
    (state.roomCode && state.isHost) ? 'inline-flex' : 'none'

  // Pre-fill room dropdown before first poll lands
  if (state.roomCode) {
    document.getElementById('wr-code').textContent       = state.roomCode
    document.getElementById('wr-game-badge').textContent = (state.gameId || '—').toUpperCase()
    document.getElementById('room-menu-btn').textContent = state.roomCode + ' ▾'
    document.getElementById('room-menu-wrap').style.display = ''
  }

  // If in a room with no game state yet, show waiting panel immediately
  if (state.roomCode && !state.gameState) {
    state.gameState = { metadata: { phase: 'waiting' }, players: [], playerNames: {} }
    render()
  }

  // Room heartbeat (15s)
  if (state.roomCode) {
    pollRoomHeartbeat()
    roomHeartbeatInterval = setInterval(pollRoomHeartbeat, 15000)
  }

  // Game state poll (2.2s) — only when matchId is known
  if (!state.matchId) return

  let fetching = false
  state.poll = setInterval(async () => {
    if (fetching) return
    fetching = true
    try {
      const commBefore = state.gameState?.metadata?.community?.length ?? 0
      state.gameState = await api.getState(state.gameId, state.matchId, state.sessionId)
      saveSession()
      detectElimination()
      render()
      if (state.gameState?.metadata?.handWinner ?? state.gameState?.metadata?.winner) {
        stopPoll()
        prevCommunityCount = commBefore
        onHandEnd(state.gameState.metadata)
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

    if (room.hostId && room.hostId !== state.hostId) {
      state.hostId = room.hostId
      state.isHost = room.hostId === state.sessionId
      saveSession()
      document.getElementById('btn-end-game').style.display =
        (state.roomCode && state.isHost) ? 'inline-flex' : 'none'
      document.getElementById('btn-next-round').style.display = state.isHost ? '' : 'none'
    }

    // Refresh dropdown and spectator panel from latest room data
    if (state.gameState?.metadata?.phase === 'waiting') {
      updateWaitingPanel(state.gameState?.metadata || null)
    }
    updateSpectatorPanel()
  } catch (e) {
    if (e.message.includes('not found') || e.message.includes('invalid session')) {
      stopPoll(); showToast('You were removed from the room.'); window.location.href = 'index.html'
    }
  }
}

// ── Elimination detection ─────────────────────────────────
function detectElimination() {
  if (state.role !== 'player') return
  const players = state.gameState?.players || []
  if (players.length > 0 && !players.includes(state.sessionId)) {
    state.role = 'spectator'
    saveSession()
    document.querySelector('.pk-action-bar')?.style.setProperty('display', 'none')
    showToast('You were eliminated — now spectating.')
  }
}

// ── Render ────────────────────────────────────────────────
export function render() {
  if (!state.gameState) return
  const meta = state.gameState.metadata
  if (!meta) return

  const isWaiting = meta.phase === 'waiting'

  // Room menu button (always visible in a room)
  document.getElementById('room-menu-wrap').style.display = state.roomCode ? '' : 'none'
  if (state.roomCode) document.getElementById('room-menu-btn').textContent = state.roomCode + ' ▾'

  // Join wrap only during waiting
  document.getElementById('wr-join-wrap').style.display = isWaiting ? 'flex' : 'none'

  // Hide player badge when waiting and not at the table yet
  document.getElementById('pk-my-badge').style.display =
    (isWaiting && state.role !== 'player') ? 'none' : ''

  // Spectator panel: show whenever in a room
  document.getElementById('spectator-panel').style.display = state.roomCode ? '' : 'none'
  updateSpectatorPanel()

  document.querySelector('.pk-action-bar')?.style.setProperty('display',
    isWaiting ? 'none' : (state.role === 'spectator' ? 'none' : ''))

  if (isWaiting) {
    updateWaitingPanel(meta)
    registry[state.gameId]?.render(meta, false)
    return
  }

  // Between-rounds — render final board (reveals cards) but skip the popup
  if (meta.phase === 'between-rounds') {
    hideBetweenRounds()
    registry[state.gameId]?.render(meta, false)
    return
  }
  hideBetweenRounds()

  const isSpectator = state.role === 'spectator'
  const mine = !isSpectator && meta.currentPlayer === state.sessionId

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
  const room = roomData
  const gs   = state.gameState

  const specCount = room?.spectatorCount ?? 0
  document.getElementById('wr-spec-count').textContent = specCount

  const list = document.getElementById('spec-panel-list')
  if (!list) return

  // Primary: room heartbeat now includes members[] with sessionId+username+role
  // Fallback: spectatorNames from game state, then add self if spectating
  let specs = []
  if (Array.isArray(room?.members) && room.members.length) {
    specs = room.members.filter(m => m.role === 'spectator')
  } else {
    const specNames = gs?.spectatorNames || {}
    specs = Object.entries(specNames).map(([id, username]) => ({ sessionId: id, username }))
    if (state.role === 'spectator' && state.sessionId && !specs.find(s => s.sessionId === state.sessionId)) {
      specs.unshift({ sessionId: state.sessionId, username: state.username || 'You' })
    }
  }

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
  const amHost  = state.sessionId === (room?.hostId || state.hostId)
  const isPoker = state.gameId === 'poker'
  const role    = state.role || 'spectator'

  // Counts from room poll
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

  // Player list — use room.members for names (covers waiting phase where playerNames is empty)
  const memberNameMap = {}
  if (Array.isArray(room?.members)) {
    room.members.forEach(m => { memberNameMap[m.sessionId] = m.username })
  }

  // Authoritative player list: room members with player role when available, else game state
  const tableMemberIds = Array.isArray(room?.members)
    ? room.members.filter(m => m.role === 'player').map(m => m.sessionId)
    : players

  const inner = document.getElementById('wr-players-inner')
  if (tableMemberIds.length === 0) {
    inner.innerHTML = '<div class="rm-empty">No players at the table yet</div>'
  } else {
    inner.innerHTML = tableMemberIds.map(id => {
      const name   = names[id] || memberNameMap[id] || id.slice(0, 8)
      const isMe   = id === state.sessionId
      const isHost = id === (room?.hostId || state.hostId)
      const chipAmt = chips[id] != null ? `<span class="pk-chip-count">&#9885; ${chips[id]}</span>` : ''
      const kickBtn = (amHost && !isMe)
        ? `<button class="rm-kick-btn" data-kick="${id}">Kick</button>` : ''
      return `<div class="rm-player-row">
        <div class="rm-player-name">
          ${name}
          ${isMe   ? '<span class="rm-badge rm-you-badge">You</span>'   : ''}
          ${isHost ? '<span class="rm-badge rm-host-badge">Host</span>' : ''}
        </div>
        <div style="display:flex;align-items:center;gap:10px">${chipAmt}${kickBtn}</div>
      </div>`
    }).join('')
  }

  // Role badge
  const badge = document.getElementById('wr-role-badge')
  if (role === 'player') {
    badge.textContent = amHost ? '🎮 Host · Player' : '🎮 Player'
    badge.className   = 'rm-role-badge rm-role-player'
  } else {
    badge.textContent = amHost ? '👁 Host · Spectating' : '👁 Spectating'
    badge.className   = 'rm-role-badge rm-role-spectator'
  }

  // Join/Leave table
  document.getElementById('wr-join-table').style.display  = role === 'spectator' ? '' : 'none'
  document.getElementById('wr-leave-table').style.display = role === 'player'    ? '' : 'none'

  // Start Round (host only)
  const startBtn = document.getElementById('wr-start-round')
  if (amHost) {
    startBtn.style.display = ''
    const cnt = room?.playerCount ?? players.length
    startBtn.disabled    = cnt < 2
    startBtn.textContent = cnt >= 2 ? `Start (${cnt})` : 'Need players…'
  } else {
    startBtn.style.display = 'none'
  }

  // Settings (host only)
  const settingsEl = document.getElementById('wr-settings')
  settingsEl.style.display = amHost ? '' : 'none'
  if (amHost) {
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
    state.role = 'player'; saveSession()
    showToast('You joined the table!')
    updateWaitingPanel(state.gameState?.metadata || null)
  } catch (e) { showToast(e.message) }
  finally { btn.disabled = false }
}

async function wrLeaveTable() {
  const btn = document.getElementById('wr-leave-table')
  btn.disabled = true
  try {
    await api.switchRole(state.roomCode, state.sessionId, 'spectator')
    state.role = 'spectator'; saveSession()
    showToast('You left the table.')
    updateWaitingPanel(state.gameState?.metadata || null)
  } catch (e) { showToast(e.message) }
  finally { btn.disabled = false }
}

async function wrStartRound() {
  const btn = document.getElementById('wr-start-round')
  btn.disabled = true; btn.textContent = 'Starting…'
  try {
    const res = await api.move(state.gameId, state.sessionId, state.matchId, { type: 'start' })
    // If matchId was missing, the move response may carry the state we need
    if (res?.state) {
      state.gameState = res.state
      if (!state.matchId && res.matchId) { state.matchId = res.matchId; saveSession() }
    }
    // Start polling now that we have a matchId (re-enter if poll wasn't running)
    if (!state.poll && state.matchId) enterGame()
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
  if (res.state) state.gameState = res.state
  else state.gameState = await api.getState(state.gameId, state.matchId, state.sessionId)
  render()
  if (res.status === 'round-complete' || res.status === 'finished' ||
      state.gameState?.metadata?.handWinner || state.gameState?.metadata?.winner) {
    stopPoll()
    prevCommunityCount = commBefore
    onHandEnd(state.gameState.metadata)
  }
}

function onHandEnd(meta) {
  if (state.gameId === 'poker') showHandResult(meta)
  else showWinner(meta.winner)
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

  // Detect all-in runout: community jumped to 5 cards in one state update
  // (server runs out remaining streets automatically when no action is needed).
  const community     = meta.community || []
  const isAllinRunout = community.length === 5 && prevCommunityCount < 5
  if (isAllinRunout && registry[state.gameId]?.animateAllinRunout) {
    await registry[state.gameId].animateAllinRunout(meta, prevCommunityCount)
  } else {
    await sleep(800)
  }

  const handWinnerId = meta.handWinner ?? meta.winner
  const names        = state.gameState?.playerNames || {}
  const winnerName   = handWinnerId === state.sessionId
    ? (state.username || 'You')
    : (names[handWinnerId] || 'Opponent')

  showHandWinnerBanner(`${winnerName} wins the hand`)

  // Game over (someone busted): just leave the banner up — no auto-advance
  const chips  = meta.chips || {}
  const busted = Object.values(chips).some(c => c === 0)
  if (busted) {
    handResultActive = false
    return
  }

  // Non-host in a room: poll until host starts next hand
  if (state.roomCode && !state.isHost) {
    state.poll = setInterval(async () => {
      try {
        const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
        if (!gs?.metadata?.handWinner && !gs?.metadata?.winner && gs?.metadata?.phase !== 'showdown') {
          stopPoll()
          hideHandWinnerBanner()
          state.gameState = gs; handResultActive = false; enterGame()
        }
      } catch { /* keep polling */ }
    }, 2200)
    return
  }

  // Host / no room: auto-advance after 1.5 seconds
  handResultTimer = setTimeout(() => {
    handResultTimer = null
    const banner = document.getElementById('pk-hand-winner')
    banner.classList.add('fading')
    setTimeout(startNextHand, 600)
  }, 1500)
}

async function startNextHand() {
  hideHandWinnerBanner()
  try {
    const res = await api.move(state.gameId, state.sessionId, state.matchId, { type: 'next-round' })
    if (res?.state) state.gameState = res.state
  } catch (e) { console.log('[game] next hand start:', e.message) }
  for (let i = 0; i < 12; i++) {
    if (!state.gameState?.metadata?.handWinner && !state.gameState?.metadata?.winner) break
    await sleep(350)
    try {
      const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
      if (!gs?.metadata?.handWinner && !gs?.metadata?.winner) { state.gameState = gs; break }
    } catch { /* keep trying */ }
  }
  handResultActive = false; enterGame()
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
    switchBtn.textContent   = state.role === 'spectator' ? 'Join Table' : 'Leave Table'
  } else {
    switchBtn.style.display = 'none'
  }

  document.getElementById('btn-next-round').style.display = state.isHost ? '' : 'none'
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

// ── Between-rounds actions ────────────────────────────────
async function hostNextRound() {
  const btn = document.getElementById('btn-next-round')
  btn.disabled = true
  try {
    const res = await api.move(state.gameId, state.sessionId, state.matchId, { type: 'next-round' })
    if (res?.state) state.gameState = res.state; render()
  } catch (e) { showToast(e.message) }
  finally { btn.disabled = false }
}

async function switchRole() {
  const newRole = state.role === 'spectator' ? 'player' : 'spectator'
  const btn = document.getElementById('btn-switch-role')
  btn.disabled = true
  try {
    await api.switchRole(state.roomCode, state.sessionId, newRole)
    state.role = newRole; saveSession()
    btn.textContent = newRole === 'spectator' ? 'Join Table' : 'Leave Table'
    document.querySelector('.pk-action-bar')?.style.setProperty('display', newRole === 'spectator' ? 'none' : '')
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

// ── UNO winner overlay ────────────────────────────────────
function showWinner(winnerId) {
  const won = winnerId === state.sessionId
  document.getElementById('w-emoji').textContent = won ? '🏆' : '😔'
  document.getElementById('w-title').textContent = won ? 'You Win!' : 'You Lose'
  document.getElementById('w-title').className   = 'winner-title ' + (won ? 'win' : 'lose')
  document.getElementById('w-sub').textContent   = won ? 'Congratulations!' : 'Better luck next time.'
  document.getElementById('winner-overlay').classList.add('open')
}

// ── Poll stop / navigation ────────────────────────────────
export function stopPoll() {
  clearInterval(state.poll);           state.poll            = null
  clearTimeout(handResultTimer);       handResultTimer       = null
  clearInterval(turnTimerInterval);    turnTimerInterval     = null
  clearInterval(betweenRoundsInterval);betweenRoundsInterval = null
  clearInterval(roomHeartbeatInterval);roomHeartbeatInterval = null
}

function goLobby() {
  stopPoll(); window.location.href = 'lobby.html'
}

import { api } from '../api/client.js'
import { state, saveSession, clearGameState } from '../state.js'
import { showToast } from '../ui/toast.js'
import registry from '../games/registry.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

let handResultActive            = false
let showdownInterval            = null
let turnTimerInterval           = null
let betweenRoundsInterval       = null
let gameOverCountdown           = null
let roomHeartbeatInterval       = null
let localTurnRemaining          = null
let localBetweenRoundsRemaining = null
let roomData                    = null
let prevCommunityCount          = 0
let prevMyRole                  = null
let prevMatchStatus             = null
let wrSettings                  = { maxPlayers: 8, startingChips: 1000, turnTimeLimit: 0, roundLimit: 0 }
let wrDebounce                  = {}

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

  // Detect role change player → spectator during an active match
  if (prevMyRole === 'player' && gs.myRole === 'spectator' && gs.matchStatus === 'active') {
    if (state.gameId === 'uno' || state.gameId === 'slave' || state.gameId === 'dummy') {
      // These games have no bust — keep the player at the table and silently re-join
      gs.myRole = 'player'
      api.switchRole(state.roomCode, state.sessionId, 'player').catch(() => {})
    } else {
      const myChips = (gs.metadata?.playerStates?.[state.sessionId]?.chips
        ?? gs.metadata?.chips?.[state.sessionId]
        ?? 0)
      if (myChips > 0) {
        showToast('You were removed due to inactivity.')
        showRejoinPrompt()
      }
      // myChips === 0: natural chip bust — winner overlay / hand result handles messaging
    }
  }
  if (gs.myRole === 'player') hideRejoinPrompt()
  prevMyRole = gs.myRole ?? prevMyRole

  // Detect room reset: active game → waiting (all players busted)
  if (prevMatchStatus === 'active' && gs.matchStatus === 'waiting') {
    hideBetweenRounds()
    hideShowdownBar()
    document.getElementById('winner-overlay')?.classList.remove('open')
    showToast('All players busted out. Room reset.')
  }
  prevMatchStatus = gs.matchStatus ?? prevMatchStatus

  // Sync host button visibility from every server response
  if (gs.hostId) {
    const isNowHost = gs.hostId === state.sessionId
    document.getElementById('btn-end-game').style.display =
      (state.roomCode && isNowHost) ? 'inline-flex' : 'none'
  }
}

// ── Role buttons (dropdown + overlay exit rows, always in sync) ──────────
function updateRoleButtons() {
  if (!state.roomCode) return
  const isPlayer = curRole() === 'player'
  const join  = document.getElementById('rd-join-table')
  const leave = document.getElementById('rd-leave-table')
  if (join)  join.style.display  = isPlayer ? 'none' : ''
  if (leave) leave.style.display = isPlayer ? ''     : 'none'
}

// ── Theme ─────────────────────────────────────────────────
function applyTheme(name) {
  if (name) {
    document.documentElement.dataset.theme = name
  } else {
    delete document.documentElement.dataset.theme
  }
  localStorage.setItem('sk_theme', name || '')
  document.querySelectorAll('.rd-theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === (name || ''))
  })
}

// ── Init ──────────────────────────────────────────────────
export function initGame() {
  document.getElementById('btn-continue-match').addEventListener('click', continueMatch)
  document.getElementById('btn-leave-room-win').addEventListener('click', () => leaveRoom())
  document.getElementById('btn-leave-room-br').addEventListener('click',  () => leaveRoom())
  document.getElementById('btn-end-game').addEventListener('click', async () => {
    if (!confirm('End the game for everyone?')) return
    if (state.gameId === 'uno' && state.matchId) {
      try { await api.unoEndGame(state.matchId, state.sessionId); leaveRoom() } catch (e) { showToast(e.message) }
    } else if (state.gameId === 'slave' && state.matchId) {
      try { await api.slaveEndGame(state.matchId, state.sessionId); leaveRoom() } catch (e) { showToast(e.message) }
    } else if (state.gameId === 'dummy' && state.matchId) {
      try { await api.dummyEndGame(state.matchId, state.sessionId); leaveRoom() } catch (e) { showToast(e.message) }
    } else if (state.gameId === 'blackjack' && state.matchId) {
      try { await api.blackjackEndGame(state.matchId, state.sessionId); leaveRoom() } catch (e) { showToast(e.message) }
    } else if (state.gameId === 'pokdeng' && state.matchId) {
      try { await api.pokdengEndGame(state.matchId, state.sessionId); leaveRoom() } catch (e) { showToast(e.message) }
    } else {
      leaveRoom()
    }
  })
  document.getElementById('btn-next-round').addEventListener('click', hostNextRound)
  document.getElementById('btn-skip-showdown').addEventListener('click', hostNextRound)
  document.getElementById('btn-show-cards').addEventListener('click', showCards)
  document.getElementById('btn-muck-cards').addEventListener('click', muckCards)
  document.getElementById('btn-rejoin-inactivity').addEventListener('click', wrJoinTable)
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
  document.getElementById('rd-join-table')?.addEventListener('click',  wrJoinTable)
  document.getElementById('rd-leave-table')?.addEventListener('click', wrLeaveTable)
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

  // Theme picker — init active state + bind clicks
  const savedTheme = localStorage.getItem('sk_theme') || ''
  document.querySelectorAll('.rd-theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === savedTheme)
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme))
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
  document.getElementById('g-name').textContent            = gameId === 'poker' ? 'Poker' : gameId === 'uno' ? 'UNO' : gameId === 'slave' ? 'Slave' : gameId === 'blackjack' ? 'Blackjack' : gameId === 'pokdeng' ? 'Pok Deng' : 'Dummy'
  document.getElementById('poker-board').style.display      = gameId === 'poker'      ? 'flex' : 'none'
  document.getElementById('uno-board').style.display        = gameId === 'uno'        ? 'flex' : 'none'
  document.getElementById('slave-board').style.display      = gameId === 'slave'      ? 'flex' : 'none'
  document.getElementById('dummy-board').style.display      = gameId === 'dummy'      ? 'flex' : 'none'
  document.getElementById('blackjack-board').style.display  = gameId === 'blackjack'  ? 'flex' : 'none'
  document.getElementById('pokdeng-board').style.display    = gameId === 'pokdeng'    ? 'flex' : 'none'

  // Move join-wrap into whichever board is active (it lives in poker board by default)
  if (gameId === 'uno') {
    const wrap = document.getElementById('wr-join-wrap')
    document.querySelector('.uno-player-zone')?.appendChild(wrap)
  } else if (gameId === 'slave') {
    const wrap = document.getElementById('wr-join-wrap')
    document.querySelector('.slv-player-zone')?.appendChild(wrap)
  } else if (gameId === 'dummy') {
    const wrap = document.getElementById('wr-join-wrap')
    document.querySelector('.dmy-player-zone')?.appendChild(wrap)
  } else if (gameId === 'blackjack') {
    const wrap = document.getElementById('wr-join-wrap')
    document.querySelector('.bj-player-zone')?.appendChild(wrap)
  } else if (gameId === 'pokdeng') {
    const wrap = document.getElementById('wr-join-wrap')
    document.querySelector('.pd-player-zone')?.appendChild(wrap)
  }
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
      if (['uno', 'slave', 'dummy', 'blackjack', 'pokdeng'].includes(state.gameId) && gs.matchStatus === 'finished') {
        stopPoll(); startGameOverCountdown()
      } else if (state.gameId === 'poker' && gs.metadata?.winner && gs.revealRemainingSec == null) {
        stopPoll()
        prevCommunityCount = commBefore
        onHandEnd(gs.metadata)
      }
    } catch (e) {
      console.error('[game] poll error:', e)
      if (e.message.includes('invalid session')) {
        stopPoll(); showToast('Session expired.'); window.location.href = 'index.html'
      } else if (e.message.includes('not found')) {
        stopPoll(); showToast('Room has closed.'); window.location.href = 'index.html'
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

    // Sync matchId — required after continueMatch() clears it so the host can start the next game
    if (room.matchId) {
      state.matchId = room.matchId
      state.gameId  = room.gameId || state.gameId
      saveSession()
    }

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

  updateRoleButtons()

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
    document.querySelector('.uno-hand-footer')?.style.setProperty('display', 'none')
    document.querySelector('.dmy-hand-footer')?.style.setProperty('display', 'none')
    document.querySelector('.bj-hand-footer')?.style.setProperty('display', 'none')
    document.querySelector('.pd-hand-footer')?.style.setProperty('display', 'none')
    updateWaitingPanel(meta)
    registry[state.gameId]?.render(meta, false)
    return
  }

  if (meta.phase === 'showdown') {
    document.getElementById('g-phase').textContent = 'Showdown'
    updateShowdownBar(meta)
    registry[state.gameId]?.render(meta, false)
    return
  }

  hideShowdownBar()

  if (meta.phase === 'between-rounds') {
    document.querySelector('.pk-action-bar')?.style.setProperty('display', 'none')
    document.querySelector('.uno-hand-footer')?.style.setProperty('display', 'none')
    document.querySelector('.dmy-hand-footer')?.style.setProperty('display', 'none')
    document.querySelector('.bj-hand-footer')?.style.setProperty('display', 'none')
    document.querySelector('.pd-hand-footer')?.style.setProperty('display', 'none')

    if (state.gameId === 'slave') {
      document.getElementById('g-phase').textContent = 'Round Over'
      registry['slave']?.render(meta, false)
      const isGameOver = state.gameState?.matchStatus === 'finished'
      showSlaveScorePanel(meta, isGameOver)
      showBetweenRounds(meta)
    } else if (state.gameId === 'uno') {
      document.getElementById('g-phase').textContent = 'Round Over'
      registry['uno']?.render(meta, false)
      if (state.gameState?.revealRemainingSec == null) {
        const isGameOver = state.gameState?.matchStatus === 'finished'
        showUnoScorePanel(meta, isGameOver)
        showBetweenRounds(meta)
      }
    } else if (state.gameId === 'dummy') {
      document.getElementById('g-phase').textContent = 'Round Over'
      registry['dummy']?.render(meta, false)
      const isGameOver = state.gameState?.matchStatus === 'finished'
      showDummyScorePanel(meta, isGameOver)
      showBetweenRounds(meta)
    } else if (state.gameId === 'blackjack') {
      document.getElementById('g-phase').textContent = 'Round Over'
      registry['blackjack']?.render(meta, false)
      const isGameOver = state.gameState?.matchStatus === 'finished'
      showBlackjackScorePanel(meta, isGameOver)
      showBetweenRounds(meta)
    } else if (state.gameId === 'pokdeng') {
      document.getElementById('g-phase').textContent = 'Round Over'
      registry['pokdeng']?.render(meta, false)
      const isGameOver = state.gameState?.matchStatus === 'finished'
      showPokdengScorePanel(meta, isGameOver)
      showBetweenRounds(meta)
    } else {
      // Poker: between-rounds countdown panel
      document.getElementById('g-phase').textContent = 'Between Rounds'
      showBetweenRounds(meta)
      registry[state.gameId]?.render(meta, false)
    }
    return
  }

  hideBetweenRounds()
  document.querySelector('.pk-action-bar')?.style.setProperty('display',
    curRole() === 'spectator' ? 'none' : '')
  document.querySelector('.uno-hand-footer')?.style.setProperty('display',
    curRole() === 'spectator' ? 'none' : '')
  document.querySelector('.dmy-hand-footer')?.style.setProperty('display',
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
  const isPoker   = state.gameId === 'poker'
  const hasChips  = isPoker || state.gameId === 'blackjack' || state.gameId === 'pokdeng'
  const role      = curRole()
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
    const minPlayers = state.gameId === 'slave' ? 3 : 2
    startBtn.disabled    = cnt < minPlayers
    startBtn.textContent = cnt >= minPlayers ? `Start (${cnt})` : `Need ${minPlayers}+ players…`
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
    document.getElementById('wr-chips-row').style.display  = hasChips ? '' : 'none'
    document.getElementById('wr-timer-row').style.display  = isPoker  ? '' : 'none'
    document.getElementById('wr-rounds-row').style.display = hasChips ? '' : 'none'
    const bankerRow = document.getElementById('wr-banker-row')
    if (bankerRow) bankerRow.style.display = (state.gameId === 'blackjack' || state.gameId === 'pokdeng') ? '' : 'none'
  }
}

// ── Waiting panel actions ─────────────────────────────────
async function wrJoinTable() {
  const btns = ['wr-join-table', 'rd-join-table'].map(id => document.getElementById(id)).filter(Boolean)
  btns.forEach(b => b.disabled = true)
  try {
    await api.switchRole(state.roomCode, state.sessionId, 'player')
    const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
    state.gameState = gs; applyServerState(gs); saveSession()
    showToast('You joined the table!')
    updateRoleButtons()
    updateWaitingPanel(gs.metadata || null)
    updateSpectatorPanel()
  } catch (e) { showToast(e.message) }
  finally { btns.forEach(b => b.disabled = false) }
}

async function wrLeaveTable() {
  const btns = ['wr-leave-table', 'rd-leave-table'].map(id => document.getElementById(id)).filter(Boolean)
  btns.forEach(b => b.disabled = true)
  try {
    await api.switchRole(state.roomCode, state.sessionId, 'spectator')
    const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
    state.gameState = gs; applyServerState(gs); saveSession()
    showToast('You left the table.')
    updateRoleButtons()
    updateWaitingPanel(gs.metadata || null)
    updateSpectatorPanel()
  } catch (e) { showToast(e.message) }
  finally { btns.forEach(b => b.disabled = false) }
}

async function wrStartRound() {
  const btn = document.getElementById('wr-start-round')
  btn.disabled = true; btn.textContent = 'Starting…'
  try {
    if (state.gameId === 'blackjack' || state.gameId === 'pokdeng') {
      const bankerEl   = document.querySelector('input[name="wr-banker-mode"]:checked')
      const bankerMode = bankerEl?.value || 'bot'
      if (state.gameId === 'blackjack') await api.blackjackStart(state.matchId, state.sessionId, bankerMode)
      else                              await api.pokdengStart(state.matchId, state.sessionId, bankerMode)
    } else {
      const fn = state.gameId === 'poker'  ? api.pokerStart
               : state.gameId === 'uno'    ? api.unoStart
               : state.gameId === 'dummy'  ? api.dummyStart
               : api.slaveStart
      await fn(state.matchId, state.sessionId)
    }
    const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
    state.gameState = gs; applyServerState(gs); saveSession()
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
  state.gameState = res
  applyServerState(res)
  saveSession()
  render()
  if (res.metadata?.winner && res.revealRemainingSec == null) {
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

  // Show/Muck row in the action bar — visible when this player must decide.
  const allPS      = meta.playerStates || {}
  const myPS       = allPS[state.sessionId] || {
    status:           (meta.folded || {})[state.sessionId] ? 'folded' : 'active',
    showdownDecision: (meta.showdownDecisions || {})[state.sessionId] || null,
  }
  const folded     = myPS.status === 'folded'
  const myDecision = myPS.showdownDecision
  const canDecide  = myDecision === 'pending' ||
    (myDecision == null && !folded && curRole() === 'player')
  const actionBar       = document.querySelector('.pk-action-bar')
  const normalActions   = document.getElementById('pk-normal-actions')
  const showdownActions = document.getElementById('pk-showdown-actions')
  if (actionBar)       actionBar.style.display       = canDecide ? '' : 'none'
  if (normalActions)   normalActions.style.display   = 'none'
  if (showdownActions) showdownActions.style.display = canDecide ? '' : 'none'

  if (!bar.classList.contains('open')) {
    let remaining = state.gameState?.showdownRemainingSec ?? 10
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
  // Restore normal action row for the next active phase
  hideRejoinPrompt()
  const normalActions   = document.getElementById('pk-normal-actions')
  const showdownActions = document.getElementById('pk-showdown-actions')
  if (normalActions)   normalActions.style.display   = ''
  if (showdownActions) showdownActions.style.display = 'none'
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

  document.querySelector('.pk-action-bar')?.style.setProperty('display', 'none')
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

  const winnerId = meta.winner
  setTimeout(() => {
    hideHandWinnerBanner()
    if (winnerId) showWinner(winnerId)
    handResultActive = false
  }, 2500)
}

// ── Turn timer ────────────────────────────────────────────
function updateTurnTimer(meta, mine) {
  const bar     = document.getElementById('turn-timer-bar')
  if (!bar) return
  const svrLeft = state.gameState?.turnRemainingSec ?? null
  const limit   = meta.turnTimeLimit ?? 0
  if (!mine || svrLeft == null) {
    bar.style.display = 'none'
    clearInterval(turnTimerInterval); turnTimerInterval = null
    localTurnRemaining = null
    return
  }
  bar.style.display = ''
  // Resync local countdown when server value differs by > 2s (new player's turn)
  if (localTurnRemaining == null || Math.abs(localTurnRemaining - svrLeft) > 2) {
    clearInterval(turnTimerInterval); turnTimerInterval = null
    localTurnRemaining = svrLeft
  }
  if (!turnTimerInterval) {
    turnTimerInterval = setInterval(() => {
      localTurnRemaining = Math.max(0, (localTurnRemaining ?? 0) - 1)
      _renderTurnTimer(limit || localTurnRemaining)
      if (localTurnRemaining <= 0) { clearInterval(turnTimerInterval); turnTimerInterval = null }
    }, 1000)
  }
  _renderTurnTimer(limit || svrLeft)
}

function _renderTurnTimer(limit) {
  const left = localTurnRemaining ?? 0
  const fill = document.getElementById('turn-timer-fill')
  const secs = document.getElementById('turn-timer-secs')
  if (fill) fill.style.width = (limit > 0 ? left / limit * 100 : 0) + '%'
  if (secs) secs.textContent = Math.ceil(Math.max(0, left)) + 's'
}

// ── Slave scoreboard panel (top-right, non-blocking) ─────
function showSlaveScorePanel(meta, isGameOver) {
  const panel = document.getElementById('slv-score-panel')
  if (!panel) return

  const names       = state.gameState?.playerNames || {}
  const ranks       = meta.ranks || {}
  const roundWins   = meta.roundWins || {}
  const finishOrder = meta.finishOrder || []
  const RANK_ORDER  = ['President', 'Vice President', 'Citizen', 'Vice Slave', 'Slave']
  const RANK_EMOJIS = { President: '🥇', 'Vice President': '🥈', Citizen: '', 'Vice Slave': '🔴', Slave: '💀' }

  const presidentId = Object.entries(ranks).find(([, t]) => t === 'President')?.[0]
  const winnerId    = presidentId || finishOrder[0]
  const isMe        = winnerId === state.sessionId
  const winnerName  = isMe ? (state.username || 'You') : (names[winnerId] || 'Opponent')

  document.getElementById('slv-sp-emoji').textContent = isGameOver ? '🎉' : (isMe ? '🥇' : '🎴')
  document.getElementById('slv-sp-title').textContent = isGameOver
    ? 'Game Over!'
    : (isMe ? "You're the President!" : `${winnerName} is the President!`)

  const bodyEl = document.getElementById('slv-sp-body')
  if (bodyEl) {
    const allIds  = [...new Set([...(state.gameState?.players || []), ...Object.keys(ranks), ...Object.keys(roundWins)])]
    const entries = allIds.map(id => ({
      id, wins: roundWins[id] || 0, title: ranks[id] || '',
    })).sort((a, b) => b.wins - a.wins || RANK_ORDER.indexOf(a.title) - RANK_ORDER.indexOf(b.title))

    const standMedals = ['🥇', '🥈', '🥉']
    bodyEl.innerHTML = entries.map(({ id, wins, title }, i) => {
      const n     = id === state.sessionId ? (state.username || names[id] || 'You') : (names[id] || id.slice(0, 8))
      const emoji = RANK_EMOJIS[title] ?? ''
      return `<div class="sp-row${id === state.sessionId ? ' me' : ''}">
        <span class="sp-rank">${standMedals[i] ?? i + 1}</span>
        <span class="sp-name">${n}</span>
        ${title ? `<span class="slv-rank-pill">${emoji} ${title}</span>` : ''}
        <span class="sp-wins">${wins}W</span>
      </div>`
    }).join('')
  }

  panel.style.display = 'flex'
}

function hideSlaveScorePanel() {
  const panel = document.getElementById('slv-score-panel')
  if (panel) panel.style.display = 'none'
}

// ── UNO scoreboard panel (top-right, non-blocking) ───────
function showUnoScorePanel(meta, isGameOver) {
  const panel = document.getElementById('uno-score-panel')
  if (!panel) return

  const names       = state.gameState?.playerNames || {}
  const finishOrder = meta.finishOrder || []
  const roundWins   = meta.roundWins   || {}
  const winnerId    = finishOrder[0] || meta.winner
  const isMe        = winnerId === state.sessionId
  const winnerName  = isMe ? (state.username || 'You') : (names[winnerId] || 'Opponent')

  document.getElementById('uno-sp-emoji').textContent = isGameOver ? '🎉' : (isMe ? '🏆' : '🎴')
  document.getElementById('uno-sp-title').textContent = isGameOver
    ? 'Game Over!'
    : (isMe ? 'You Won the Round!' : `${winnerName} Won!`)

  const bodyEl = document.getElementById('uno-sp-body')
  if (bodyEl) {
    const posMap  = Object.fromEntries(finishOrder.map((id, i) => [id, i]))
    const allIds  = [...new Set([...Object.keys(roundWins), ...finishOrder])]
    const entries = allIds
      .map(id => ({ id, wins: roundWins[id] || 0, pos: posMap[id] ?? 999 }))
      .sort((a, b) => b.wins - a.wins || a.pos - b.pos)

    const standMedals = ['🥇', '🥈', '🥉']
    const roundLabels = ['🥇', '🥈', '🥉']

    bodyEl.innerHTML = entries.map(({ id, wins, pos }, i) => {
      const n      = id === state.sessionId ? (state.username || names[id] || 'You') : (names[id] || id.slice(0, 8))
      const rLabel = !isGameOver && pos < 999
        ? (pos === finishOrder.length - 1 && finishOrder.length > 1 ? '💀' : (roundLabels[pos] ?? `#${pos + 1}`))
        : ''
      const winsText = rLabel ? `${rLabel} · ${wins}W` : `${wins}W`
      return `<div class="sp-row${id === state.sessionId ? ' me' : ''}">
        <span class="sp-rank">${standMedals[i] ?? i + 1}</span>
        <span class="sp-name">${n}</span>
        <span class="sp-wins">${winsText}</span>
      </div>`
    }).join('')
  }

  panel.style.display = 'flex'
}

function hideUnoScorePanel() {
  const panel = document.getElementById('uno-score-panel')
  if (panel) panel.style.display = 'none'
}

// ── Dummy scoreboard panel (top-right, non-blocking) ─────
function showDummyScorePanel(meta, isGameOver) {
  const panel = document.getElementById('dmy-score-panel')
  if (!panel) return

  const names       = state.gameState?.playerNames || {}
  const totalScores = meta.totalScores || {}
  const roundScores = meta.roundScores || {}
  const roundWinner = meta.roundWinner
  const isMe        = roundWinner === state.sessionId
  const winnerName  = isMe ? (state.username || 'You') : (names[roundWinner] || 'Opponent')

  document.getElementById('dmy-sp-emoji').textContent = isGameOver ? '🎉' : (isMe ? '🏆' : '🎴')
  document.getElementById('dmy-sp-title').textContent = isGameOver
    ? 'Game Over!'
    : (roundWinner ? (isMe ? 'You went out!' : `${winnerName} went out!`) : 'Round complete')

  const bodyEl = document.getElementById('dmy-sp-body')
  if (bodyEl) {
    const allIds  = [...new Set([...(state.gameState?.players || []), ...Object.keys(totalScores)])]
    const hasRound = Object.keys(roundScores).length > 0
    const entries = allIds
      .map(id => ({ id, total: totalScores[id] ?? 0, round: roundScores[id] ?? 0 }))
      .sort((a, b) => b.total - a.total)

    const medals = ['🥇', '🥈', '🥉']
    bodyEl.innerHTML = entries.map(({ id, total, round }, i) => {
      const n         = id === state.sessionId ? (state.username || names[id] || 'You') : (names[id] || id.slice(0, 8))
      const roundText = hasRound ? ` (${round >= 0 ? '+' : ''}${round})` : ''
      return `<div class="sp-row${id === state.sessionId ? ' me' : ''}">
        <span class="sp-rank">${medals[i] ?? i + 1}</span>
        <span class="sp-name">${n}</span>
        <span class="sp-wins">${total}${roundText}</span>
      </div>`
    }).join('')
  }

  panel.style.display = 'flex'
}

function hideDummyScorePanel() {
  const panel = document.getElementById('dmy-score-panel')
  if (panel) panel.style.display = 'none'
}

// ── Blackjack scoreboard panel (top-right, non-blocking) ──
function showBlackjackScorePanel(meta, isGameOver) {
  const panel = document.getElementById('bj-score-panel')
  if (!panel) return

  const names    = state.gameState?.playerNames || {}
  const chips    = meta.chips    || {}
  const netChips = meta.netChips || {}
  const players  = state.gameState?.players || []

  const sorted  = [...players].sort((a, b) => (chips[b] ?? 0) - (chips[a] ?? 0))
  const winnerId = meta.winner || sorted[0]
  const isMe     = winnerId === state.sessionId
  const winName  = isMe ? (state.username || 'You') : (names[winnerId] || 'Opponent')

  document.getElementById('bj-sp-emoji').textContent = isGameOver ? '🎉' : '🃏'
  document.getElementById('bj-sp-title').textContent = isGameOver
    ? `Game Over — ${isMe ? 'You win' : winName + ' wins'}!`
    : 'Round Complete'

  const bodyEl = document.getElementById('bj-sp-body')
  if (bodyEl) {
    const medals   = ['🥇', '🥈', '🥉']
    const dealerId = meta.dealerId
    bodyEl.innerHTML = sorted.map((id, i) => {
      const n   = id === state.sessionId ? (state.username || names[id] || 'You') : (names[id] || id.slice(0, 8))
      const net = netChips[id]
      const chp = chips[id] ?? 0
      const netText    = net != null ? ` (${net >= 0 ? '+' : ''}${net})` : ''
      const dealerBadge = (meta.bankerMode === 'rotate' && id === dealerId)
        ? ' <span class="bj-dealer-badge">Dealer</span>' : ''
      return `<div class="sp-row${id === state.sessionId ? ' me' : ''}">
        <span class="sp-rank">${medals[i] ?? i + 1}</span>
        <span class="sp-name">${n}${dealerBadge}</span>
        <span class="sp-wins">&#9885; ${chp}${netText}</span>
      </div>`
    }).join('')
  }

  panel.style.display = 'flex'
}

function hideBlackjackScorePanel() {
  const panel = document.getElementById('bj-score-panel')
  if (panel) panel.style.display = 'none'
}

// ── Pok Deng scoreboard panel (top-right, non-blocking) ───
function showPokdengScorePanel(meta, isGameOver) {
  const panel = document.getElementById('pd-score-panel')
  if (!panel) return

  const names   = state.gameState?.playerNames || {}
  const chips   = meta.chips   || {}
  const results = meta.results || {}
  const players = state.gameState?.players || []

  const sorted   = [...players].sort((a, b) => (chips[b] ?? 0) - (chips[a] ?? 0))
  const winnerId = meta.winner || sorted[0]
  const isMe     = winnerId === state.sessionId
  const winName  = isMe ? (state.username || 'You') : (names[winnerId] || 'Opponent')

  document.getElementById('pd-sp-emoji').textContent = isGameOver ? '🎉' : '🃏'
  document.getElementById('pd-sp-title').textContent = isGameOver
    ? `Game Over — ${isMe ? 'You win' : winName + ' wins'}!`
    : 'Round Complete'

  const bodyEl = document.getElementById('pd-sp-body')
  if (bodyEl) {
    const medals = ['🥇', '🥈', '🥉']
    bodyEl.innerHTML = sorted.map((id, i) => {
      const n       = id === state.sessionId ? (state.username || names[id] || 'You') : (names[id] || id.slice(0, 8))
      const chp     = chips[id] ?? 0
      const res     = results[id]
      const payout  = res?.payout
      const deng    = res?.playerDeng
      const outcome = res?.outcome
      const payText  = payout  != null ? ` (${payout >= 0 ? '+' : ''}${payout})` : ''
      const dengSpan = deng && deng > 1 ? ` <span class="pd-deng-badge">×${deng}</span>` : ''
      const resSpan  = outcome
        ? `<span class="pd-result-badge ${outcome}" style="margin-left:4px">${outcome.toUpperCase()}</span>` : ''
      return `<div class="sp-row${id === state.sessionId ? ' me' : ''}">
        <span class="sp-rank">${medals[i] ?? i + 1}</span>
        <span class="sp-name">${n}${dengSpan}${resSpan}</span>
        <span class="sp-wins">&#9885; ${chp}${payText}</span>
      </div>`
    }).join('')
  }

  panel.style.display = 'flex'
}

function hidePokdengScorePanel() {
  const panel = document.getElementById('pd-score-panel')
  if (panel) panel.style.display = 'none'
}

// ── Between-rounds overlay ────────────────────────────────
function showBetweenRounds(meta) {
  const overlay = document.getElementById('between-rounds-overlay')
  if (!overlay) return

  const names      = state.gameState?.playerNames || {}
  const roundInfo  = document.getElementById('br-round-info')
  const isGameOver = state.gameState?.matchStatus === 'finished' && state.gameId !== 'poker'

  if (state.gameId === 'slave') {
    const ranks       = meta.ranks || {}
    const finishOrder = meta.finishOrder || []
    const presidentId = Object.entries(ranks).find(([, t]) => t === 'President')?.[0]
    const winnerId    = presidentId || finishOrder[0]
    const isMe        = winnerId === state.sessionId
    const winnerName  = isMe ? (state.username || 'You') : (names[winnerId] || 'Opponent')
    roundInfo.textContent = isGameOver ? 'Game Over' :
      (isMe ? "You're the President!" : `${winnerName} is the President!`)
  } else if (state.gameId === 'uno') {
    const finishOrder = meta.finishOrder || []
    const roundWins   = meta.roundWins   || {}
    const winnerId    = finishOrder[0]
    const isMe        = winnerId === state.sessionId
    const winnerName  = isMe ? (state.username || 'You') : (names[winnerId] || 'Opponent')
    if (isGameOver) {
      const top     = Object.entries(roundWins).sort(([, a], [, b]) => b - a)[0]
      const topId   = top?.[0]
      const topIsMe = topId === state.sessionId
      roundInfo.textContent = topId
        ? `Game Over — ${topIsMe ? 'You win' : (names[topId] || 'Opponent') + ' wins'}!`
        : 'Game Over!'
    } else {
      roundInfo.textContent = isMe ? 'You Won the Round!' : `${winnerName} Won the Round!`
    }
  } else if (state.gameId === 'dummy') {
    const roundWinner = meta.roundWinner
    const isMe        = roundWinner === state.sessionId
    const winnerName  = isMe ? (state.username || 'You') : (names[roundWinner] || 'Opponent')
    if (isGameOver) {
      const top     = Object.entries(meta.totalScores || {}).sort(([, a], [, b]) => b - a)[0]
      const topId   = top?.[0]
      const topIsMe = topId === state.sessionId
      roundInfo.textContent = topId
        ? `Game Over — ${topIsMe ? 'You win' : (names[topId] || 'Opponent') + ' wins'}!`
        : 'Game Over!'
    } else {
      roundInfo.textContent = roundWinner
        ? (isMe ? 'You went out!' : `${winnerName} went out!`)
        : 'Round complete'
    }
  } else if (state.gameId === 'blackjack' || state.gameId === 'pokdeng') {
    if (isGameOver) {
      const winnerId = meta.winner
      const isMe     = winnerId === state.sessionId
      roundInfo.textContent = winnerId
        ? `Game Over — ${isMe ? 'You win' : (names[winnerId] || 'Opponent') + ' wins'}!`
        : 'Game Over!'
    } else {
      roundInfo.textContent = 'Round complete'
    }
  } else {
    const won        = meta.handWinner === state.sessionId
    const winnerName = names[meta.handWinner] || (won ? 'You' : 'Opponent')
    if (meta.winner) {
      roundInfo.textContent = `Game Over — ${names[meta.winner] || 'Someone'} wins the table!`
    } else if (meta.handWinner) {
      roundInfo.textContent = `${won ? 'You won' : `${winnerName} won`} the hand!`
    } else if (meta.roundLimit && meta.currentRound) {
      roundInfo.textContent = `Round ${meta.currentRound} of ${meta.roundLimit} complete`
    } else {
      roundInfo.textContent = 'Hand complete'
    }
  }

  const switchBtn = document.getElementById('btn-switch-role')
  if (state.roomCode && !isGameOver) {
    switchBtn.style.display = ''
    switchBtn.textContent   = curRole() === 'spectator' ? 'Join Table' : 'Leave Table'
  } else {
    switchBtn.style.display = 'none'
  }

  document.getElementById('btn-next-round').style.display = (amHost() && !isGameOver) ? '' : 'none'
  overlay.classList.add('open')

  const remSec   = state.gameState?.betweenRoundsRemainingSec ?? null
  const brNextEl = document.querySelector('#between-rounds-overlay .br-next')
  if (brNextEl) brNextEl.style.display = remSec != null ? '' : 'none'

  if (!betweenRoundsInterval && remSec != null) {
    localBetweenRoundsRemaining = remSec
    tickBetweenRounds()
    betweenRoundsInterval = setInterval(tickBetweenRounds, 1000)
  }
}

function tickBetweenRounds() {
  if (localBetweenRoundsRemaining == null) return
  const el = document.getElementById('br-countdown')
  if (el) el.textContent = Math.max(0, Math.ceil(localBetweenRoundsRemaining))
  localBetweenRoundsRemaining = Math.max(0, localBetweenRoundsRemaining - 1)
  if (localBetweenRoundsRemaining <= 0) { clearInterval(betweenRoundsInterval); betweenRoundsInterval = null }
}

function hideBetweenRounds() {
  document.getElementById('between-rounds-overlay')?.classList.remove('open')
  hideSlaveScorePanel()
  hideUnoScorePanel()
  hideDummyScorePanel()
  hideBlackjackScorePanel()
  hidePokdengScorePanel()
  clearInterval(betweenRoundsInterval); betweenRoundsInterval = null
  localBetweenRoundsRemaining = null
}

// ── Inactivity rejoin prompt ──────────────────────────────
function showRejoinPrompt() {
  if (!state.roomCode) return
  const bar = document.querySelector('.pk-action-bar')
  if (bar) bar.style.removeProperty('display')
  document.getElementById('pk-normal-actions').style.display   = 'none'
  document.getElementById('pk-showdown-actions').style.display = 'none'
  document.getElementById('pk-rejoin-actions').style.display   = ''
}

function hideRejoinPrompt() {
  document.getElementById('pk-rejoin-actions').style.display = 'none'
}

// ── Showdown decisions ────────────────────────────────────
async function showCards() {
  const btn = document.getElementById('btn-show-cards')
  btn.disabled = true
  try {
    await api.pokerShow(state.matchId, state.sessionId)
    const res = await api.getState(state.gameId, state.matchId, state.sessionId)
    document.dispatchEvent(new CustomEvent('game:move', { detail: res }))
  } catch (e) { showToast(e.message) }
  finally { btn.disabled = false }
}

async function muckCards() {
  const btn = document.getElementById('btn-muck-cards')
  btn.disabled = true
  try {
    await api.pokerMuck(state.matchId, state.sessionId)
    const res = await api.getState(state.gameId, state.matchId, state.sessionId)
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
    if (state.gameId === 'slave') {
      await api.slaveNextRound(state.matchId, state.sessionId)
    } else if (state.gameId === 'uno') {
      await api.unoNextRound(state.matchId, state.sessionId)
    } else if (state.gameId === 'dummy') {
      await api.dummyNextRound(state.matchId, state.sessionId)
    } else if (state.gameId === 'blackjack') {
      await api.blackjackNextRound(state.matchId, state.sessionId)
    } else if (state.gameId === 'pokdeng') {
      await api.pokdengNextRound(state.matchId, state.sessionId)
    } else {
      await api.pokerNextRound(state.matchId, state.sessionId)
    }
    const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
    state.gameState = gs; applyServerState(gs); saveSession()
    hideBetweenRounds()
    render()
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
  if (handResultActive) return
  handResultActive = true
  const won = winnerId === state.sessionId
  document.getElementById('w-emoji').textContent = won ? '🏆' : '😔'
  document.getElementById('w-title').textContent = won ? 'You Win!' : 'You Lose'
  document.getElementById('w-title').className   = 'winner-title ' + (won ? 'win' : 'lose')
  document.getElementById('w-sub').textContent   = won ? 'Congratulations!' : 'Better luck next time.'
  // UNO: everyone stays as players — "Play Again" makes sense for both outcomes
  const btnLabel = state.gameId === 'uno' ? 'Play Again' : (won ? 'Back to Room' : 'Continue Match')
  document.getElementById('btn-continue-match').textContent = btnLabel
  document.getElementById('winner-overlay').classList.add('open')
}

// ── Game-over auto-redirect (non-host players) ───────────
function startGameOverCountdown() {
  const brNextEl = document.querySelector('#between-rounds-overlay .br-next')
  if (brNextEl) {
    brNextEl.innerHTML = 'Returning to lobby in <span id="br-countdown">12</span>s'
    brNextEl.style.display = ''
  }
  let remaining = 12
  gameOverCountdown = setInterval(() => {
    remaining = Math.max(0, remaining - 1)
    const el = document.getElementById('br-countdown')
    if (el) el.textContent = remaining
    if (remaining <= 0) {
      clearInterval(gameOverCountdown)
      gameOverCountdown = null
      leaveRoom()
    }
  }, 1000)
}

// ── Poll stop / navigation ────────────────────────────────
export function stopPoll() {
  clearInterval(state.poll);            state.poll                    = null
  clearInterval(turnTimerInterval);     turnTimerInterval             = null
  clearInterval(betweenRoundsInterval); betweenRoundsInterval         = null
  clearInterval(showdownInterval);      showdownInterval              = null
  clearInterval(roomHeartbeatInterval); roomHeartbeatInterval         = null
  clearInterval(gameOverCountdown);     gameOverCountdown             = null
  localTurnRemaining          = null
  localBetweenRoundsRemaining = null
  prevMatchStatus             = null
}

async function continueMatch() {
  document.getElementById('winner-overlay').classList.remove('open')
  handResultActive = false
  // Clear match so the poll doesn't re-detect meta.winner and loop the overlay
  state.matchId   = null
  state.gameState = null
  saveSession()
  enterGame()
}

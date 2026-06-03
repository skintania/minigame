import { api } from '../api/client.js'
import { state, saveSession } from '../state.js'
import { showToast } from '../ui/toast.js'

let hostId        = null
let roomSettings  = { maxPlayers: 8, startingChips: 1000, turnTimeLimit: 0, roundLimit: 0 }
let heartbeat     = null
let stateTimer    = null

// ── Init ──────────────────────────────────────────────────
export function initLobby() {
  document.getElementById('rm-code').textContent      = state.roomCode || '——'
  document.getElementById('rm-game-badge').textContent = (state.gameId || '—').toUpperCase()

  document.getElementById('rm-copy-btn').addEventListener('click', copyCode)
  document.getElementById('btn-join-table').addEventListener('click', joinTable)
  document.getElementById('btn-leave-table').addEventListener('click', leaveTable)
  document.getElementById('btn-start-round').addEventListener('click', startRound)
  document.getElementById('btn-leave-room').addEventListener('click', confirmLeaveRoom)

  // Settings (host only)
  document.getElementById('rm-max-minus').addEventListener('click', () => {
    if (roomSettings.maxPlayers > 2) patchSetting('maxPlayers', roomSettings.maxPlayers - 1)
  })
  document.getElementById('rm-max-plus').addEventListener('click', () => {
    if (roomSettings.maxPlayers < 16) patchSetting('maxPlayers', roomSettings.maxPlayers + 1)
  })

  let debounce = {}
  const debouncedPatch = (key, getter, min, max) => {
    clearTimeout(debounce[key])
    debounce[key] = setTimeout(() => {
      const val = parseInt(getter(), 10)
      if (!isNaN(val) && val >= min && val <= max) patchSetting(key, val)
    }, 800)
  }
  document.getElementById('rm-chips').addEventListener('input',  () => debouncedPatch('startingChips', () => document.getElementById('rm-chips').value,  100, 1000000))
  document.getElementById('rm-timer').addEventListener('input',  () => debouncedPatch('turnTimeLimit', () => document.getElementById('rm-timer').value,  0,   300))
  document.getElementById('rm-rounds').addEventListener('input', () => debouncedPatch('roundLimit',    () => document.getElementById('rm-rounds').value, 0,   1000))

  // Kick via event delegation
  document.getElementById('rm-players-inner').addEventListener('click', e => {
    const btn = e.target.closest('[data-kick]')
    if (btn) kickPlayer(btn.dataset.kick)
  })

  // Start heartbeat + try to get player names
  pollRoom()
  heartbeat  = setInterval(pollRoom,     15000)
  stateTimer = setInterval(pollGameState, 4000)
}

// ── Room heartbeat (15s) ─────────────────────────────────
async function pollRoom() {
  try {
    const room = await api.getRoomStatus(state.roomCode, state.sessionId)
    applyRoomData(room)

    if (room.status === 'active') {
      stopTimers()
      saveSession()
      window.location.href = 'game.html'
    }
  } catch (e) {
    console.error('[lobby] heartbeat error:', e)
    if (e.message.includes('invalid session') || e.message.includes('not found')) {
      showToast('Room unavailable — returning to home.', 'info')
      goHome()
    }
  }
}

// ── Game state poll (4s) — for player names ──────────────
async function pollGameState() {
  if (!state.matchId || !state.gameId) return
  try {
    const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
    state.gameState = gs
    renderPlayerList()
  } catch { /* game not started yet — ignore */ }
}

// ── Apply room status data to UI ─────────────────────────
function applyRoomData(room) {
  hostId = room.hostId
  state.hostId = room.hostId
  const amHost = state.sessionId === hostId

  roomSettings = {
    maxPlayers:    room.maxPlayers    ?? 8,
    startingChips: room.startingChips ?? 1000,
    turnTimeLimit: room.turnTimeLimit ?? 0,
    roundLimit:    room.roundLimit    ?? 0,
  }

  document.getElementById('rm-player-count').textContent = room.playerCount    ?? '—'
  document.getElementById('rm-max-display').textContent  = room.maxPlayers     ?? '—'
  document.getElementById('rm-spec-count').textContent   = room.spectatorCount ?? '—'

  renderPlayerList()
  renderRoleBadge(amHost)
  renderButtons(room, amHost)
  renderSettings(room, amHost)
}

// ── Player list ──────────────────────────────────────────
function renderPlayerList() {
  const gs      = state.gameState
  const names   = gs?.playerNames || {}
  const players = gs?.players     || []
  const chips   = gs?.metadata?.chips || {}
  const inner   = document.getElementById('rm-players-inner')
  const amHost  = state.sessionId === hostId

  if (players.length === 0) {
    inner.innerHTML = '<div class="rm-empty">No players at the table yet</div>'
    return
  }

  inner.innerHTML = players.map(id => {
    const name   = names[id] || id.slice(0, 8)
    const isMe   = id === state.sessionId
    const isHost = id === hostId
    const chipAmt = chips[id] != null ? `<span class="pk-chip-count">&#9885; ${chips[id]}</span>` : ''
    const kickBtn = (amHost && !isMe)
      ? `<button class="rm-kick-btn" data-kick="${id}">Kick</button>`
      : ''
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

// ── Role badge ───────────────────────────────────────────
function renderRoleBadge(amHost) {
  const badge = document.getElementById('rm-role-badge')
  const role  = state.role || 'spectator'
  if (role === 'player') {
    badge.textContent = amHost ? '🎮 Host · Player' : '🎮 Player'
    badge.className   = 'rm-role-badge rm-role-player'
  } else {
    badge.textContent = amHost ? '👁 Host · Spectating' : '👁 Spectating'
    badge.className   = 'rm-role-badge rm-role-spectator'
  }
}

// ── Action buttons ───────────────────────────────────────
function renderButtons(room, amHost) {
  const waiting = room.status === 'waiting'
  const role    = state.role || 'spectator'

  document.getElementById('btn-join-table').style.display  = (role === 'spectator' && waiting) ? '' : 'none'
  document.getElementById('btn-leave-table').style.display = (role === 'player'    && waiting) ? '' : 'none'

  const startBtn = document.getElementById('btn-start-round')
  if (amHost && waiting) {
    startBtn.style.display = ''
    const enough = room.playerCount >= 2
    startBtn.disabled    = !enough
    startBtn.textContent = enough
      ? `Start Round  (${room.playerCount} players)`
      : 'Waiting for players…'
  } else {
    startBtn.style.display = 'none'
  }
}

// ── Host settings panel ──────────────────────────────────
function renderSettings(room, amHost) {
  const panel   = document.getElementById('rm-settings')
  const isPoker = state.gameId === 'poker'
  const waiting = room.status === 'waiting'

  panel.style.display = (amHost && waiting) ? '' : 'none'
  if (!amHost || !waiting) return

  document.getElementById('rm-max-val').textContent    = roomSettings.maxPlayers
  document.getElementById('rm-chips').value            = roomSettings.startingChips
  document.getElementById('rm-timer').value            = roomSettings.turnTimeLimit
  document.getElementById('rm-rounds').value           = roomSettings.roundLimit
  document.getElementById('rm-chips-row').style.display  = isPoker ? '' : 'none'
  document.getElementById('rm-timer-row').style.display  = isPoker ? '' : 'none'
  document.getElementById('rm-rounds-row').style.display = isPoker ? '' : 'none'
}

// ── Join / Leave table ───────────────────────────────────
async function joinTable() {
  const btn = document.getElementById('btn-join-table')
  btn.disabled = true
  try {
    await api.switchRole(state.roomCode, state.sessionId, 'player')
    state.role = 'player'
    state.isHost = state.sessionId === hostId
    saveSession()
    showToast('You joined the table!', 'success')
    renderRoleBadge(state.isHost)
    document.getElementById('btn-join-table').style.display  = 'none'
    document.getElementById('btn-leave-table').style.display = ''
  } catch (e) {
    showToast(e.message)
  } finally {
    btn.disabled = false
  }
}

async function leaveTable() {
  const btn = document.getElementById('btn-leave-table')
  btn.disabled = true
  try {
    await api.switchRole(state.roomCode, state.sessionId, 'spectator')
    state.role = 'spectator'
    saveSession()
    showToast('You left the table.', 'success')
    renderRoleBadge(state.sessionId === hostId)
    document.getElementById('btn-join-table').style.display  = ''
    document.getElementById('btn-leave-table').style.display = 'none'
  } catch (e) {
    showToast(e.message)
  } finally {
    btn.disabled = false
  }
}

// ── Start Round ──────────────────────────────────────────
async function startRound() {
  const btn = document.getElementById('btn-start-round')
  btn.disabled    = true
  btn.textContent = 'Starting…'
  try {
    const fn = state.gameId === 'poker' ? api.pokerStart : api.unoStart
    await fn(state.matchId, state.sessionId)
    // heartbeat will detect status=active and redirect to game.html
  } catch (e) {
    showToast(e.message)
    btn.disabled    = false
    btn.textContent = 'Start Round'
  }
}

// ── Patch setting ────────────────────────────────────────
async function patchSetting(key, value) {
  try {
    const updated = await api.patchSettings(state.roomCode, state.sessionId, { [key]: value })
    if (updated.maxPlayers    != null) { roomSettings.maxPlayers    = updated.maxPlayers;    document.getElementById('rm-max-val').textContent = updated.maxPlayers }
    if (updated.startingChips != null) { roomSettings.startingChips = updated.startingChips; document.getElementById('rm-chips').value = updated.startingChips }
    if (updated.turnTimeLimit != null) { roomSettings.turnTimeLimit = updated.turnTimeLimit; document.getElementById('rm-timer').value = updated.turnTimeLimit }
    if (updated.roundLimit    != null) { roomSettings.roundLimit    = updated.roundLimit;    document.getElementById('rm-rounds').value = updated.roundLimit }
  } catch (e) {
    showToast(e.message)
  }
}

// ── Kick player ──────────────────────────────────────────
async function kickPlayer(targetId) {
  if (!confirm('Kick this player from the room?')) return
  try {
    await api.kickPlayer(state.roomCode, state.sessionId, targetId)
    showToast('Player kicked.', 'success')
    pollGameState()
  } catch (e) {
    showToast(e.message)
  }
}

// ── Leave Room ───────────────────────────────────────────
async function confirmLeaveRoom() {
  if (!confirm('Leave the room and return to home?')) return
  stopTimers()
  try { await api.leaveRoom(state.roomCode, state.sessionId) } catch { /* ignore */ }
  state.matchId   = null
  state.gameId    = null
  state.roomCode  = null
  state.gameState = null
  state.role      = 'spectator'
  state.isHost    = false
  saveSession()
  goHome()
}

// ── Copy code ────────────────────────────────────────────
function copyCode() {
  navigator.clipboard.writeText(state.roomCode || '')
    .then(() => {
      const btn = document.getElementById('rm-copy-btn')
      btn.textContent = 'Copied!'
      setTimeout(() => { btn.textContent = 'Copy Code' }, 2000)
    })
    .catch(() => showToast('Copy failed — share the code manually.'))
}

// ── Helpers ──────────────────────────────────────────────
function stopTimers() {
  clearInterval(heartbeat)
  clearInterval(stateTimer)
  heartbeat  = null
  stateTimer = null
}

function goHome() {
  window.location.href = 'index.html'
}

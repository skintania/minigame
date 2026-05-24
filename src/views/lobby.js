import { api } from '../api/client.js'
import { state, saveSession } from '../state.js'
import { showToast } from '../ui/toast.js'

const SCREEN = { GRID: 'grid', MODE: 'mode', WAITING: 'waiting' }
let currentScreen = SCREEN.GRID

// Local room settings state (host only)
let roomSettings = { maxPlayers: 8, startingChips: 1000 }

// ── DOM refs ──────────────────────────────────────────────
const el = {
  backBtn:      () => document.getElementById('lobby-back-btn'),
  gameGrid:     () => document.getElementById('game-grid'),
  joinSection:  () => document.getElementById('join-section'),
  modeSelect:   () => document.getElementById('mode-select'),
  roomCreated:  () => document.getElementById('room-created'),
  hostControls: () => document.getElementById('host-controls'),
  waitingBox:   () => document.getElementById('waiting-box'),
  modeLabel:    () => document.getElementById('mode-game-label'),
  rcCode:       () => document.getElementById('rc-code'),
  waitLabel:    () => document.getElementById('waiting-label'),
  waitMeta:     () => document.getElementById('waiting-meta'),
  codeInput:    () => document.getElementById('room-code-input'),
  startBtn:     () => document.getElementById('btn-start-game'),
  dispMax:      () => document.getElementById('disp-max-players'),
  inpChips:     () => document.getElementById('inp-chips'),
  chipsRow:     () => document.getElementById('chips-row'),
}

// ── Init ──────────────────────────────────────────────────
export function initLobby() {
  document.getElementById('lobby-name').textContent = state.username || 'Player'

  document.getElementById('game-grid').addEventListener('click', e => {
    const tile = e.target.closest('.game-tile[data-game]')
    if (tile) showModeSelect(tile.dataset.game)
  })

  document.getElementById('lobby-back-btn').addEventListener('click', handleBack)
  document.getElementById('btn-quick-match').addEventListener('click', quickMatch)
  document.getElementById('btn-create-room').addEventListener('click', createRoom)
  document.getElementById('btn-join-room').addEventListener('click', () => joinRoom('player'))
  document.getElementById('btn-watch-room').addEventListener('click', () => joinRoom('spectator'))
  document.getElementById('rc-copy-btn').addEventListener('click', copyRoomCode)

  document.getElementById('room-code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') joinRoom()
  })

  // Host controls
  document.getElementById('btn-start-game').addEventListener('click', hostStartGame)

  document.getElementById('btn-max-minus').addEventListener('click', () => {
    if (roomSettings.maxPlayers > 2) patchSetting('maxPlayers', roomSettings.maxPlayers - 1)
  })
  document.getElementById('btn-max-plus').addEventListener('click', () => {
    if (roomSettings.maxPlayers < 16) patchSetting('maxPlayers', roomSettings.maxPlayers + 1)
  })

  let chipsTimer = null
  document.getElementById('inp-chips').addEventListener('input', () => {
    clearTimeout(chipsTimer)
    chipsTimer = setTimeout(() => {
      const val = parseInt(document.getElementById('inp-chips').value, 10)
      if (val >= 100 && val <= 1000000) patchSetting('startingChips', val)
    }, 800)
  })
}

// ── Back button ───────────────────────────────────────────
function handleBack() {
  if (currentScreen === SCREEN.MODE) backToGameGrid()
  else if (currentScreen === SCREEN.WAITING) cancelWait()
}

function setScreen(screen) {
  currentScreen = screen
  el.backBtn().classList.toggle('visible', screen !== SCREEN.GRID)
}

// ── Game select → mode select ─────────────────────────────
function showModeSelect(gameId) {
  state.gameId = gameId
  el.gameGrid().style.display    = 'none'
  el.joinSection().style.display = 'none'
  el.modeSelect().style.display  = 'flex'
  el.modeLabel().textContent     = gameId.toUpperCase()
  setScreen(SCREEN.MODE)
}

function backToGameGrid() {
  el.modeSelect().style.display  = 'none'
  el.gameGrid().style.display    = 'flex'
  el.joinSection().style.display = 'flex'
  state.gameId = null
  setScreen(SCREEN.GRID)
}

// ── Quick Match ───────────────────────────────────────────
async function quickMatch() {
  showWaiting('Finding a match…', 'Searching for a public game')
  state.isHost = false
  try {
    const { matchId } = await api.join(state.sessionId, state.gameId)
    state.matchId  = matchId
    state.roomCode = null
    el.waitLabel().textContent = 'Waiting for opponent…'
    el.waitMeta().textContent  = 'Will start when a second player joins'
    startStartPoll()
  } catch (e) {
    console.error('[lobby] quick match failed:', e)
    showToast(e.message)
    resetLobby()
  }
}

// ── Create Room ───────────────────────────────────────────
async function createRoom() {
  showWaiting('Creating room…', '')
  state.isHost = true
  try {
    const { matchId, roomCode } = await api.createRoom(state.sessionId, state.gameId)
    state.matchId  = matchId
    state.roomCode = roomCode

    roomSettings = { maxPlayers: 8, startingChips: 1000 }
    el.dispMax().textContent  = roomSettings.maxPlayers
    el.inpChips().value       = roomSettings.startingChips
    el.chipsRow().style.display = state.gameId === 'poker' ? 'flex' : 'none'

    el.rcCode().textContent         = roomCode
    el.roomCreated().style.display  = 'flex'
    el.hostControls().style.display = 'flex'
    el.waitLabel().textContent      = 'Waiting for players…'
    el.waitMeta().textContent       = 'Share the code with your friends'

    startRoomPoll(roomCode)
  } catch (e) {
    console.error('[lobby] create room failed:', e)
    showToast(e.message)
    resetLobby()
  }
}

function copyRoomCode() {
  const code = el.rcCode().textContent
  navigator.clipboard.writeText(code)
    .then(() => {
      const btn = document.getElementById('rc-copy-btn')
      btn.textContent = 'Copied!'
      setTimeout(() => { btn.textContent = 'Copy Code' }, 2000)
    })
    .catch(() => showToast('Copy failed — share the code manually.'))
}

// ── Host: patch a room setting ────────────────────────────
async function patchSetting(key, value) {
  try {
    const updated = await api.patchSettings(state.roomCode, state.sessionId, { [key]: value })
    if (updated.maxPlayers    !== undefined) { roomSettings.maxPlayers    = updated.maxPlayers;    el.dispMax().textContent = updated.maxPlayers }
    if (updated.startingChips !== undefined) { roomSettings.startingChips = updated.startingChips; el.inpChips().value = updated.startingChips }
  } catch (e) {
    showToast(e.message)
  }
}

// ── Host: start game button ───────────────────────────────
async function hostStartGame() {
  el.startBtn().disabled    = true
  el.startBtn().textContent = 'Starting…'
  try {
    const res = await api.move(state.gameId, state.sessionId, state.matchId, { type: 'start' })
    await goToGame(res.state)
  } catch (e) {
    console.error('[lobby] host start failed:', e)
    showToast(e.message)
    el.startBtn().disabled    = false
    el.startBtn().textContent = `Start Game (${roomSettings.maxPlayers} max)`
  }
}

// ── Join Room ─────────────────────────────────────────────
async function joinRoom(role = 'player') {
  const code = el.codeInput().value.trim()
  if (!code) { showToast('Please enter a room code.'); return }
  if (code.length !== 6 || !/^\d+$/.test(code)) { showToast('Room code must be 6 digits.'); return }

  showWaiting('Joining room…', '')
  state.isHost = false
  state.role = role
  try {
    const { matchId, gameId } = await api.joinRoom(state.sessionId, code, role)
    state.matchId  = matchId
    state.gameId   = gameId
    state.roomCode = code

    el.waitLabel().textContent = role === 'spectator' ? 'Watching!' : 'Joined!'
    el.waitMeta().textContent  = role === 'spectator'
      ? `Spectating ${gameId.toUpperCase()} — waiting for game to start`
      : `Playing ${gameId.toUpperCase()} — waiting for host to start`

    startRoomPoll(code)
  } catch (e) {
    console.error('[lobby] join room failed:', e)
    showToast(e.message)
    resetLobby()
  }
}

// ── Room poll (host + guest) ──────────────────────────────
function startRoomPoll(roomCode) {
  state.waiting = true
  pollRoom(roomCode)
  state.poll = setInterval(() => pollRoom(roomCode), 2200)
}

async function pollRoom(roomCode) {
  if (!state.waiting) return
  try {
    const room = await api.getRoomStatus(roomCode, state.sessionId)
    el.waitMeta().textContent = `${room.playerCount}/${room.maxPlayers} players joined`

    if (state.isHost) {
      // Sync settings display with server values
      if (room.maxPlayers    !== roomSettings.maxPlayers)    { roomSettings.maxPlayers    = room.maxPlayers;    el.dispMax().textContent = room.maxPlayers }
      if (room.startingChips !== roomSettings.startingChips) { roomSettings.startingChips = room.startingChips; el.inpChips().value = room.startingChips }

      // Enable start button once there are at least 2 players
      const enough = room.playerCount >= 2
      el.startBtn().disabled    = !enough
      el.startBtn().textContent = enough
        ? `Start Game  (${room.playerCount} players)`
        : 'Waiting for players…'
    } else {
      // Guest: poll game state to detect when host has started
      try {
        const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
        if (gs?.metadata?.phase && gs.metadata.phase !== 'waiting') {
          await goToGame(gs)
        }
      } catch { /* game not started yet */ }
    }
  } catch (e) {
    console.error('[lobby] room poll error:', e)
    if (e.message.includes('invalid session')) handleSessionExpired()
  }
}

// ── Quick match: both players send start until one succeeds ──
function startStartPoll() {
  state.waiting = true
  tryStart()
  state.poll = setInterval(tryStart, 2200)
}

async function tryStart() {
  if (!state.waiting) return
  try {
    const res = await api.move(state.gameId, state.sessionId, state.matchId, { type: 'start' })
    if (res.status !== 'waiting') await goToGame(res.state)
  } catch (e) {
    if (e.message.includes('invalid session')) {
      handleSessionExpired()
    } else if (e.message.includes('not your turn') || e.message.includes('already started')) {
      await goToGame(null)
    } else if (e.message.includes('Only the room creator')) {
      // Not the host — poll state until host starts the game
      try {
        const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
        if (gs?.metadata?.phase && gs.metadata.phase !== 'waiting') await goToGame(gs)
      } catch { /* keep polling */ }
    } else if (!e.message.includes('At least 2 players')) {
      console.error('[lobby] unexpected error in tryStart:', e)
    }
  }
}

// ── Navigate to game ──────────────────────────────────────
async function goToGame(initialState) {
  state.waiting   = false
  stopLobbyPoll()
  state.gameState = initialState || await api.getState(state.gameId, state.matchId, state.sessionId)
  saveSession()
  window.location.href = 'game.html'
}

// ── Shared helpers ────────────────────────────────────────
function showWaiting(label, meta) {
  el.modeSelect().style.display     = 'none'
  el.gameGrid().style.display       = 'none'
  el.joinSection().style.display    = 'none'
  el.hostControls().style.display   = 'none'
  el.waitingBox().style.display     = 'flex'
  el.waitLabel().textContent        = label
  el.waitMeta().textContent         = meta
  setScreen(SCREEN.WAITING)
}

function handleSessionExpired() {
  console.error('[lobby] session expired')
  showToast('Session expired — please log in again.')
  state.waiting = false
  stopLobbyPoll()
  window.location.href = 'index.html'
}

export function cancelWait() {
  state.waiting  = false
  state.roomCode = null
  state.isHost   = false
  stopLobbyPoll()
  state.matchId = null
  state.gameId  = null
  resetLobby()
}

export function resetLobby() {
  el.gameGrid().style.display       = 'flex'
  el.joinSection().style.display    = 'flex'
  el.modeSelect().style.display     = 'none'
  el.roomCreated().style.display    = 'none'
  el.hostControls().style.display   = 'none'
  el.waitingBox().style.display     = 'none'
  el.codeInput().value              = ''
  setScreen(SCREEN.GRID)
}

function stopLobbyPoll() {
  clearInterval(state.poll)
  state.poll = null
}

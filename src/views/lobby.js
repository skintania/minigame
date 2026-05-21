import { api } from '../api/client.js'
import { state } from '../state.js'
import { showView } from '../router.js'
import { showToast } from '../ui/toast.js'

// Lobby sub-states for back-button routing
const SCREEN = { GRID: 'grid', MODE: 'mode', WAITING: 'waiting' }
let currentScreen = SCREEN.GRID

// ── DOM refs ──────────────────────────────────────────────
const el = {
  backBtn:     () => document.getElementById('lobby-back-btn'),
  gameGrid:    () => document.getElementById('game-grid'),
  joinSection: () => document.getElementById('join-section'),
  modeSelect:  () => document.getElementById('mode-select'),
  roomCreated: () => document.getElementById('room-created'),
  waitingBox:  () => document.getElementById('waiting-box'),
  modeLabel:   () => document.getElementById('mode-game-label'),
  rcCode:      () => document.getElementById('rc-code'),
  waitLabel:   () => document.getElementById('waiting-label'),
  waitMeta:    () => document.getElementById('waiting-meta'),
  codeInput:   () => document.getElementById('room-code-input'),
}

// ── Init ──────────────────────────────────────────────────
export function initLobby() {
  document.getElementById('game-grid').addEventListener('click', e => {
    const tile = e.target.closest('.game-tile[data-game]')
    if (tile) showModeSelect(tile.dataset.game)
  })

  document.getElementById('lobby-back-btn').addEventListener('click', handleBack)
  document.getElementById('btn-quick-match').addEventListener('click', quickMatch)
  document.getElementById('btn-create-room').addEventListener('click', createRoom)
  document.getElementById('btn-join-room').addEventListener('click', joinRoom)
  document.getElementById('rc-copy-btn').addEventListener('click', copyRoomCode)

  document.getElementById('room-code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') joinRoom()
  })
}

// ── Universal back button ─────────────────────────────────
function handleBack() {
  if (currentScreen === SCREEN.MODE) {
    backToGameGrid()
  } else if (currentScreen === SCREEN.WAITING) {
    cancelWait()
  }
}

function setScreen(screen) {
  currentScreen = screen
  const backBtn = el.backBtn()
  backBtn.classList.toggle('visible', screen !== SCREEN.GRID)
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
  try {
    const { matchId, roomCode } = await api.createRoom(state.sessionId, state.gameId)
    state.matchId  = matchId
    state.roomCode = roomCode

    el.rcCode().textContent        = roomCode
    el.roomCreated().style.display = 'flex'
    el.waitLabel().textContent     = 'Waiting for opponent…'
    el.waitMeta().textContent      = 'Share the code with a friend'

    startRoomPoll(roomCode)
  } catch (e) {
    console.error('[lobby] create room failed:', e)
    showToast(e.message)
    resetLobby()
  }
}

function copyRoomCode() {
  const code = el.rcCode().textContent
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById('rc-copy-btn')
    btn.textContent = 'Copied!'
    setTimeout(() => { btn.textContent = 'Copy Code' }, 2000)
  }).catch(() => showToast('Copy failed — share the code manually.'))
}

// ── Join Room ─────────────────────────────────────────────
async function joinRoom() {
  const code = el.codeInput().value.trim()
  if (!code) { showToast('Please enter a room code.'); return }
  if (code.length !== 6 || !/^\d+$/.test(code)) {
    showToast('Room code must be 6 digits.')
    return
  }

  showWaiting('Joining room…', '')
  try {
    const { matchId, gameId } = await api.joinRoom(state.sessionId, code)
    state.matchId  = matchId
    state.gameId   = gameId
    state.roomCode = code

    el.waitLabel().textContent = 'Joined!'
    el.waitMeta().textContent  = `Playing ${gameId.toUpperCase()} — waiting for host to start`

    startRoomPoll(code)
  } catch (e) {
    console.error('[lobby] join room failed:', e)
    showToast(e.message)
    resetLobby()
  }
}

// ── Polling: private room ─────────────────────────────────
function startRoomPoll(roomCode) {
  state.waiting = true
  pollRoom(roomCode)
  state.poll = setInterval(() => pollRoom(roomCode), 2200)
}

async function pollRoom(roomCode) {
  if (!state.waiting) return
  try {
    const room = await api.getRoomStatus(roomCode)
    el.waitMeta().textContent = `${room.playerCount}/2 players joined`
    if (room.playerCount >= 2) {
      stopLobbyPoll()
      startStartPoll()
    }
  } catch (e) {
    console.error('[lobby] room poll error:', e)
    if (e.message.includes('invalid session')) handleSessionExpired()
  }
}

// ── Polling: send start until game begins ─────────────────
function startStartPoll() {
  state.waiting = true
  tryStart()
  state.poll = setInterval(tryStart, 2200)
}

async function tryStart() {
  if (!state.waiting) return
  try {
    const res = await api.move(state.gameId, state.sessionId, state.matchId, { type: 'start' })
    if (res.status !== 'waiting') {
      await enterGame(res.state)
    }
  } catch (e) {
    if (e.message.includes('invalid session')) {
      handleSessionExpired()
    } else if (e.message.includes('not your turn')) {
      // Other player already started — fetch state and enter
      await enterGame(null)
    } else if (!e.message.includes('At least 2 players')) {
      console.error('[lobby] unexpected error in tryStart:', e)
    }
  }
}

async function enterGame(initialState) {
  state.waiting   = false
  stopLobbyPoll()
  state.gameState = initialState || await api.getState(state.gameId, state.matchId, state.sessionId)
  const { enterGame: goToGame } = await import('./game.js')
  goToGame()
}

// ── Shared helpers ────────────────────────────────────────
function showWaiting(label, meta) {
  el.modeSelect().style.display   = 'none'
  el.gameGrid().style.display     = 'none'
  el.joinSection().style.display  = 'none'
  el.waitingBox().style.display   = 'flex'
  el.waitLabel().textContent      = label
  el.waitMeta().textContent       = meta
  setScreen(SCREEN.WAITING)
}

function handleSessionExpired() {
  console.error('[lobby] session expired')
  showToast('Session expired — please log in again.')
  state.waiting = false
  stopLobbyPoll()
  resetLobby()
  showView('view-login')
}

export function cancelWait() {
  state.waiting  = false
  state.roomCode = null
  stopLobbyPoll()
  state.matchId = null
  state.gameId  = null
  resetLobby()
}

export function resetLobby() {
  el.gameGrid().style.display    = 'flex'
  el.joinSection().style.display = 'flex'
  el.modeSelect().style.display  = 'none'
  el.roomCreated().style.display = 'none'
  el.waitingBox().style.display  = 'none'
  el.codeInput().value           = ''
  setScreen(SCREEN.GRID)
}

function stopLobbyPoll() {
  clearInterval(state.poll)
  state.poll = null
}

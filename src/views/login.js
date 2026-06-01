import { api } from '../api/client.js'
import { cfg, state, loadSession, saveSession } from '../state.js'
import { showToast } from '../ui/toast.js'
import { showView } from '../router.js'

export async function initLogin() {
  loadSession()

  const urlInput      = document.getElementById('worker-url')
  const btn           = document.getElementById('login-btn')
  const usernameInput = document.getElementById('username-input')

  if (cfg.url) urlInput.value = cfg.url
  if (state.username) usernameInput.value = state.username

  btn.addEventListener('click', doLogin)
  usernameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin() })
  document.getElementById('config-link').addEventListener('click', toggleConfig)

  // Home screen buttons
  document.getElementById('btn-go-create').addEventListener('click', () => showView('view-create'))
  document.getElementById('btn-go-join').addEventListener('click', toggleJoinInput)
  document.getElementById('btn-join-submit').addEventListener('click', doJoinRoom)
  document.getElementById('home-code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doJoinRoom()
  })

  // Game picker screen
  document.getElementById('create-back-btn').addEventListener('click', () => showView('view-home'))
  document.getElementById('btn-create-poker').addEventListener('click', () => doCreateRoom('poker'))
  document.getElementById('btn-create-uno').addEventListener('click',   () => doCreateRoom('uno'))
  document.getElementById('btn-create-slave').addEventListener('click', () => doCreateRoom('slave'))
  document.getElementById('btn-create-dummy').addEventListener('click',      () => doCreateRoom('dummy'))
  document.getElementById('btn-create-blackjack').addEventListener('click', () => doCreateRoom('blackjack'))

  // Auto-reconnect
  if (state.sessionId) {
    btn.disabled    = true
    btn.textContent = 'Reconnecting…'
    try {
      const { session, activeMatches } = await api.resume(state.sessionId)
      state.sessionId = session.sessionId
      state.username  = session.username
      saveSession()

      const active = (activeMatches || []).find(m => m.status === 'active' || m.roomCode)
      if (active) {
        state.matchId  = active.matchId
        state.gameId   = active.gameId
        state.roomCode = active.roomCode || null
        saveSession()
        window.location.href = 'game.html'
        return
      }
      goHome()
    } catch {
      state.sessionId = null
      btn.disabled    = false
      btn.textContent = 'Enter the Arena'
    }
  }
}

function toggleConfig() {
  const row = document.getElementById('config-row')
  row.style.display = row.style.display === 'none' ? 'block' : 'none'
}

function goHome() {
  document.getElementById('home-username').textContent = state.username || 'Player'
  showView('view-home')
}

async function doLogin() {
  const urlVal = document.getElementById('worker-url').value.trim()
  if (urlVal) cfg.url = urlVal

  if (!cfg.url) {
    showToast('Please configure the Worker URL first.')
    document.getElementById('config-row').style.display = 'block'
    return
  }

  const username = document.getElementById('username-input').value.trim()
  if (!username) { showToast('Please enter a username.'); return }

  const btn = document.getElementById('login-btn')
  btn.disabled    = true
  btn.textContent = 'Connecting…'

  try {
    const { session } = await api.auth(username)
    state.sessionId = session.sessionId
    state.username  = session.username
    saveSession()
    goHome()
  } catch (e) {
    console.error('[login] auth failed:', e)
    showToast(e.message)
    btn.disabled    = false
    btn.textContent = 'Enter the Arena'
  }
}

function toggleJoinInput() {
  const row = document.getElementById('join-input-row')
  const isHidden = row.style.display === 'none'
  row.style.display = isHidden ? 'flex' : 'none'
  if (isHidden) document.getElementById('home-code-input').focus()
}

async function doJoinRoom() {
  const code = document.getElementById('home-code-input').value.trim()
  if (!code) { showToast('Please enter a room code.'); return }
  if (code.length !== 6 || !/^\d+$/.test(code)) { showToast('Room code must be 6 digits.'); return }

  const btn = document.getElementById('btn-join-submit')
  btn.disabled    = true
  btn.textContent = 'Joining…'

  try {
    const { matchId, gameId } = await api.joinRoom(state.sessionId, code, 'spectator')
    state.matchId  = matchId
    state.gameId   = gameId
    state.roomCode = code
    state.role     = 'spectator'
    saveSession()
    window.location.href = 'game.html'
  } catch (e) {
    console.error('[login] join room failed:', e)
    showToast(e.message)
    btn.disabled    = false
    btn.textContent = 'Join'
  }
}

async function doCreateRoom(gameId) {
  const btnId = `btn-create-${gameId}`
  const btn = document.getElementById(btnId)
  btn.style.opacity = '0.6'
  btn.style.pointerEvents = 'none'

  const opts = { maxPlayers: 8, ...(gameId === 'poker' && { startingChips: 1000 }) }
  try {
    const { matchId, roomCode } = await api.createRoom(state.sessionId, gameId, opts)
    state.matchId  = matchId
    state.gameId   = gameId
    state.roomCode = roomCode
    state.isHost   = true
    state.role     = 'spectator'
    saveSession()
    window.location.href = 'game.html'
  } catch (e) {
    console.error('[login] create room failed:', e)
    showToast(e.message)
    btn.style.opacity = ''
    btn.style.pointerEvents = ''
  }
}

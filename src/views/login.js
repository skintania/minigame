import { api } from '../api/client.js'
import { cfg, state, loadSession, saveSession } from '../state.js'
import { showToast } from '../ui/toast.js'

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

  if (state.sessionId) {
    btn.disabled    = true
    btn.textContent = 'Reconnecting…'
    try {
      const { session } = await api.resume(state.sessionId)
      state.sessionId = session.sessionId
      state.username  = session.username
      saveSession()
      window.location.href = 'lobby.html'
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
    window.location.href = 'lobby.html'
  } catch (e) {
    console.error('[login] auth failed:', e)
    showToast(e.message)
    btn.disabled    = false
    btn.textContent = 'Enter the Arena'
  }
}

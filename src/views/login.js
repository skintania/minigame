import { api } from '../api/client.js'
import { cfg, state, saveSession } from '../state.js'
import { showToast } from '../ui/toast.js'

export function initLogin() {
  const urlInput = document.getElementById('worker-url')
  const btn      = document.getElementById('login-btn')

  if (cfg.url) urlInput.value = cfg.url

  btn.addEventListener('click', doLogin)
  document.getElementById('username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin()
  })
  document.getElementById('config-link').addEventListener('click', toggleConfig)
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

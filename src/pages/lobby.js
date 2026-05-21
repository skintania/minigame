import { state, loadSession } from '../state.js'
import { initLobby } from '../views/lobby.js'

loadSession()
if (!state.sessionId) {
  window.location.replace('index.html')
} else {
  document.getElementById('lobby-name').textContent = state.username || 'Player'
  initLobby()
}

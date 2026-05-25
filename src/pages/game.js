import { state, loadSession } from '../state.js'
import { initGame, enterGame } from '../views/game.js'
import registry from '../games/registry.js'

loadSession()
if (!state.sessionId || (!state.matchId && !state.roomCode)) {
  window.location.replace('index.html')
} else {
  Object.values(registry).forEach(g => g.init())
  initGame()
  enterGame()
}

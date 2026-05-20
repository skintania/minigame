import { initLogin }  from './views/login.js'
import { initLobby }  from './views/lobby.js'
import { initGame }   from './views/game.js'
import registry       from './games/registry.js'

initLogin()
initLobby()
initGame()

// Init all registered games (binds their action buttons once on load)
Object.values(registry).forEach(game => game.init())

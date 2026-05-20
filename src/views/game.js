import { api } from '../api/client.js'
import { state } from '../state.js'
import { showView } from '../router.js'
import { showToast } from '../ui/toast.js'
import { resetLobby } from './lobby.js'
import registry from '../games/registry.js'

export function initGame() {
  document.getElementById('btn-play-again').addEventListener('click', goLobby)

  // Game modules dispatch this event after every API move
  document.addEventListener('game:move', async e => {
    try {
      await handleMoveResult(e.detail)
    } catch (err) {
      console.error('[game] move result error:', err)
      showToast(err.message)
    }
  })
}

export function enterGame() {
  showView('view-game')

  document.getElementById('g-name').textContent         = state.gameId === 'poker' ? 'Poker' : 'UNO'
  document.getElementById('poker-board').style.display  = state.gameId === 'poker' ? 'flex' : 'none'
  document.getElementById('uno-board').style.display    = state.gameId === 'uno'   ? 'flex' : 'none'

  render()

  state.poll = setInterval(async () => {
    try {
      state.gameState = await api.getState(state.gameId, state.matchId)
      render()
      if (state.gameState?.metadata?.winner) { stopPoll(); showWinner(state.gameState.metadata.winner) }
    } catch (e) {
      console.error('[game] state poll error:', e)
      if (e.message.includes('invalid session')) { stopPoll(); showToast('Session expired'); showView('view-login') }
    }
  }, 2200)
}

export function render() {
  if (!state.gameState) return
  const meta = state.gameState.metadata
  const mine = meta.currentPlayer === state.sessionId

  const pill = document.getElementById('turn-pill')
  pill.textContent = mine ? 'Your Turn' : "Opponent's Turn"
  pill.className   = 'turn-pill ' + (mine ? 'mine' : 'theirs')
  document.getElementById('g-phase').textContent = meta.phase || ''

  registry[state.gameId].render(meta, mine)
}

async function handleMoveResult(res) {
  if (res.state) state.gameState = res.state
  else state.gameState = await api.getState(state.gameId, state.matchId)
  render()
  if (res.status === 'finished' || state.gameState?.metadata?.winner) {
    stopPoll()
    showWinner(state.gameState.metadata.winner)
  }
}

export function stopPoll() {
  clearInterval(state.poll)
  state.poll = null
}

function showWinner(winnerId) {
  const won = winnerId === state.sessionId
  document.getElementById('w-emoji').textContent  = won ? '🏆' : '😔'
  document.getElementById('w-title').textContent  = won ? 'You Win!' : 'You Lose'
  document.getElementById('w-title').className    = 'winner-title ' + (won ? 'win' : 'lose')
  document.getElementById('w-sub').textContent    = won ? 'Congratulations! 🎊' : 'Better luck next time.'
  document.getElementById('winner-overlay').classList.add('open')
}

function goLobby() {
  stopPoll()
  document.getElementById('winner-overlay').classList.remove('open')
  state.matchId   = null
  state.gameId    = null
  state.gameState = null
  state.waiting   = false
  resetLobby()
  showView('view-lobby')
}

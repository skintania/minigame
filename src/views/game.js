import { api } from '../api/client.js'
import { state, saveSession, clearGameState } from '../state.js'
import { showToast } from '../ui/toast.js'
import registry from '../games/registry.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

let handResultTimer       = null
let handResultActive      = false
let turnTimerInterval     = null
let betweenRoundsInterval = null
let roomHeartbeatInterval = null

// ── Init (bind static buttons once) ──────────────────────
export function initGame() {
  document.getElementById('btn-back-to-room').addEventListener('click', goLobby)
  document.getElementById('btn-leave-room-hr').addEventListener('click', () => leaveRoom())
  document.getElementById('btn-back-to-room-win').addEventListener('click', goLobby)
  document.getElementById('btn-leave-room-win').addEventListener('click', () => leaveRoom())
  document.getElementById('btn-leave-room-br').addEventListener('click', () => leaveRoom())
  document.getElementById('btn-end-game').addEventListener('click', () => {
    if (confirm('End the game for everyone and return to lobby?')) leaveRoom()
  })
  document.getElementById('btn-next-round').addEventListener('click', hostNextRound)
  document.getElementById('btn-switch-role').addEventListener('click', switchRole)

  document.addEventListener('game:move', async e => {
    try { await handleMoveResult(e.detail) } catch (err) {
      console.error('[game] move result error:', err)
      showToast(err.message)
    }
  })
}

// ── Enter game (called after navigation) ─────────────────
export function enterGame() {
  stopPoll()

  const gameId = state.gameId
  document.getElementById('g-name').textContent        = gameId === 'poker' ? 'Poker' : 'UNO'
  document.getElementById('poker-board').style.display = gameId === 'poker' ? 'flex' : 'none'
  document.getElementById('uno-board').style.display   = gameId === 'uno'   ? 'flex' : 'none'

  // End Game button: only for room host
  document.getElementById('btn-end-game').style.display =
    (state.roomCode && state.isHost) ? 'inline-flex' : 'none'

  // Spectator: hide poker action bar
  const actionBar = document.querySelector('.pk-action-bar')
  if (actionBar) actionBar.style.display = state.role === 'spectator' ? 'none' : ''

  render()

  // ── Room heartbeat (15s) — keeps session alive, detects new host ──
  if (state.roomCode) {
    pollRoomHeartbeat()
    roomHeartbeatInterval = setInterval(pollRoomHeartbeat, 15000)
  }

  // ── Game state poll (2.2s) ──
  let fetching = false
  state.poll = setInterval(async () => {
    if (fetching) return
    fetching = true
    try {
      state.gameState = await api.getState(state.gameId, state.matchId, state.sessionId)
      saveSession()
      detectElimination()
      render()
      if (state.gameState?.metadata?.handWinner ?? state.gameState?.metadata?.winner) {
        stopPoll()
        onHandEnd(state.gameState.metadata)
      }
    } catch (e) {
      console.error('[game] state poll error:', e)
      if (e.message.includes('invalid session')) {
        stopPoll()
        showToast('Session expired')
        window.location.href = 'index.html'
      }
    } finally {
      fetching = false
    }
  }, 2200)
}

// ── Room heartbeat ────────────────────────────────────────
async function pollRoomHeartbeat() {
  if (!state.roomCode) return
  try {
    const room = await api.getRoomStatus(state.roomCode, state.sessionId)
    // Track host changes
    if (room.hostId && room.hostId !== state.hostId) {
      state.hostId  = room.hostId
      state.isHost  = room.hostId === state.sessionId
      saveSession()
      document.getElementById('btn-end-game').style.display =
        (state.roomCode && state.isHost) ? 'inline-flex' : 'none'
      // Update between-rounds host button if overlay is open
      const nextBtn = document.getElementById('btn-next-round')
      if (nextBtn) nextBtn.style.display = state.isHost ? '' : 'none'
    }
  } catch (e) {
    if (e.message.includes('not found') || e.message.includes('invalid session')) {
      stopPoll()
      showToast('You were removed from the room.')
      window.location.href = 'index.html'
    }
  }
}

// ── Eliminated player detection ───────────────────────────
function detectElimination() {
  if (state.role !== 'player') return
  const players = state.gameState?.players || []
  if (players.length > 0 && !players.includes(state.sessionId)) {
    state.role = 'spectator'
    saveSession()
    const actionBar = document.querySelector('.pk-action-bar')
    if (actionBar) actionBar.style.display = 'none'
    showToast('You were eliminated — now spectating.')
  }
}

// ── Render ────────────────────────────────────────────────
export function render() {
  if (!state.gameState) return
  const meta = state.gameState.metadata
  if (!meta) return

  if (meta.phase === 'between-rounds') {
    showBetweenRounds(meta)
    return
  }
  hideBetweenRounds()

  const isSpectator = state.role === 'spectator'
  const mine = !isSpectator && meta.currentPlayer === state.sessionId

  const pill = document.getElementById('turn-pill')
  if (isSpectator) {
    pill.textContent = 'Spectating'
    pill.className   = 'turn-pill spectator'
  } else {
    pill.textContent = mine ? 'Your Turn' : "Opponent's Turn"
    pill.className   = 'turn-pill ' + (mine ? 'mine' : 'theirs')
  }
  document.getElementById('g-phase').textContent = meta.phase || ''

  const roundEl = document.getElementById('g-round-progress')
  if (meta.roundLimit && meta.currentRound) {
    roundEl.textContent  = `${meta.currentRound}/${meta.roundLimit}`
    roundEl.style.display = ''
  } else {
    roundEl.style.display = 'none'
  }

  updateTurnTimer(meta, mine)
  registry[state.gameId].render(meta, mine)
}

// ── Move result handler ───────────────────────────────────
async function handleMoveResult(res) {
  if (res.state) state.gameState = res.state
  else state.gameState = await api.getState(state.gameId, state.matchId, state.sessionId)
  render()
  if (res.status === 'round-complete') {
    if (res.message) showToast(res.message)
  } else if (res.status === 'finished' || state.gameState?.metadata?.handWinner || state.gameState?.metadata?.winner) {
    stopPoll()
    onHandEnd(state.gameState.metadata)
  }
}

function onHandEnd(meta) {
  if (state.gameId === 'poker') showHandResult(meta)
  else showWinner(meta.winner)
}

// ── Poker hand result overlay ─────────────────────────────
async function showHandResult(meta) {
  if (handResultActive) return
  handResultActive = true

  const oppId  = (state.gameState.players || []).find(p => p !== state.sessionId)
  const chips  = meta.chips || {}
  const won    = (meta.handWinner ?? meta.winner) === state.sessionId

  await sleep(2000)

  const handWinnerId = meta.handWinner ?? meta.winner
  const playerNames  = state.gameState?.playerNames || {}
  const winnerName   = playerNames[handWinnerId] || (won ? 'You' : 'Opponent')

  document.getElementById('hr-emoji').textContent = won ? '🏆' : '😔'
  const titleEl = document.getElementById('hr-title')
  titleEl.textContent = won ? 'You Win!' : `${winnerName} wins!`
  titleEl.className   = 'winner-title ' + (won ? 'win' : 'lose')

  const myChips  = chips[state.sessionId] ?? 0
  const oppChips = oppId ? (chips[oppId] ?? 0) : 1
  document.getElementById('hr-my-chips').textContent  = myChips
  document.getElementById('hr-opp-chips').textContent = oppChips

  const statusEl = document.getElementById('hr-status')
  const busted   = myChips === 0 || oppChips === 0

  if (busted) {
    statusEl.textContent = myChips === 0
      ? "You're out of chips — game over!"
      : 'Opponent is out of chips — you win the table!'
    document.getElementById('hand-result-overlay').classList.add('open')
    handResultActive = false
    return
  }

  const isPrivateRoom = !!state.roomCode
  if (isPrivateRoom && !state.isHost) {
    statusEl.textContent = 'Waiting for host to start next hand…'
    document.getElementById('hand-result-overlay').classList.add('open')
    state.poll = setInterval(async () => {
      try {
        const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
        if (!gs?.metadata?.handWinner && !gs?.metadata?.winner && gs?.metadata?.phase !== 'showdown') {
          stopPoll()
          document.getElementById('hand-result-overlay').classList.remove('open')
          state.gameState = gs
          handResultActive = false
          enterGame()
        }
      } catch { /* keep polling */ }
    }, 2200)
    return
  }

  let secs = 5
  statusEl.textContent = `Next hand in ${secs}s…`
  document.getElementById('hand-result-overlay').classList.add('open')
  handResultTimer = setInterval(() => {
    secs--
    if (secs > 0) {
      statusEl.textContent = `Next hand in ${secs}s…`
    } else {
      clearInterval(handResultTimer)
      handResultTimer = null
      startNextHand()
    }
  }, 1000)
}

async function startNextHand() {
  document.getElementById('hand-result-overlay').classList.remove('open')
  try {
    const res = await api.move(state.gameId, state.sessionId, state.matchId, { type: 'start' })
    if (res?.state) state.gameState = res.state
  } catch (e) {
    console.log('[game] next hand start:', e.message)
  }
  for (let i = 0; i < 12; i++) {
    if (!state.gameState?.metadata?.handWinner && !state.gameState?.metadata?.winner) break
    await sleep(350)
    try {
      const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
      if (!gs?.metadata?.handWinner && !gs?.metadata?.winner) { state.gameState = gs; break }
    } catch { /* keep trying */ }
  }
  handResultActive = false
  enterGame()
}

// ── Turn timer ────────────────────────────────────────────
function updateTurnTimer(meta, mine) {
  const bar = document.getElementById('turn-timer-bar')
  if (!bar) return
  if (!mine || !meta.turnTimeLimit || !meta.turnStartedAt) {
    bar.style.display = 'none'
    clearInterval(turnTimerInterval)
    turnTimerInterval = null
    return
  }
  bar.style.display = ''
  tickTurnTimer(meta)
  if (!turnTimerInterval) {
    turnTimerInterval = setInterval(() => tickTurnTimer(meta), 1000)
  }
}

function tickTurnTimer(meta) {
  const elapsed = (Date.now() - new Date(meta.turnStartedAt)) / 1000
  const left    = Math.max(0, meta.turnTimeLimit - elapsed)
  const pct     = (left / meta.turnTimeLimit) * 100
  const fill    = document.getElementById('turn-timer-fill')
  const secs    = document.getElementById('turn-timer-secs')
  if (fill) fill.style.width = pct + '%'
  if (secs) secs.textContent = Math.ceil(left) + 's'
  if (left <= 0) { clearInterval(turnTimerInterval); turnTimerInterval = null }
}

// ── Between-rounds overlay ────────────────────────────────
function showBetweenRounds(meta) {
  const overlay = document.getElementById('between-rounds-overlay')
  if (!overlay) return

  const roundInfo = document.getElementById('br-round-info')
  const won       = meta.handWinner === state.sessionId
  const names     = state.gameState?.playerNames || {}
  const winnerName = names[meta.handWinner] || (won ? 'You' : 'Opponent')

  if (meta.winner) {
    roundInfo.textContent = `Game Over — ${names[meta.winner] || 'Someone'} wins the table!`
  } else if (meta.handWinner) {
    roundInfo.textContent = `${won ? 'You won' : `${winnerName} won`} the hand!`
  } else if (meta.roundLimit && meta.currentRound) {
    roundInfo.textContent = `Round ${meta.currentRound} of ${meta.roundLimit} complete`
  } else {
    roundInfo.textContent = 'Hand complete'
  }

  // Switch-role button: Join/Leave Table depending on current role
  const switchBtn = document.getElementById('btn-switch-role')
  if (state.roomCode) {
    switchBtn.style.display  = ''
    switchBtn.textContent    = state.role === 'spectator' ? 'Join Table' : 'Leave Table'
  } else {
    switchBtn.style.display  = 'none'
  }

  document.getElementById('btn-next-round').style.display = state.isHost ? '' : 'none'

  overlay.classList.add('open')

  if (!betweenRoundsInterval && meta.betweenRoundsUntil) {
    tickBetweenRounds(meta)
    betweenRoundsInterval = setInterval(() => tickBetweenRounds(meta), 1000)
  }
}

function tickBetweenRounds(meta) {
  if (!meta.betweenRoundsUntil) return
  const left = Math.ceil((new Date(meta.betweenRoundsUntil) - Date.now()) / 1000)
  const el   = document.getElementById('br-countdown')
  if (el) el.textContent = Math.max(0, left)
  if (left <= 0) { clearInterval(betweenRoundsInterval); betweenRoundsInterval = null }
}

function hideBetweenRounds() {
  document.getElementById('between-rounds-overlay')?.classList.remove('open')
  clearInterval(betweenRoundsInterval)
  betweenRoundsInterval = null
}

// ── Between-rounds actions ────────────────────────────────
async function hostNextRound() {
  const btn = document.getElementById('btn-next-round')
  btn.disabled = true
  try {
    const res = await api.move(state.gameId, state.sessionId, state.matchId, { type: 'next-round' })
    if (res?.state) state.gameState = res.state
    render()
  } catch (e) {
    showToast(e.message)
  } finally {
    btn.disabled = false
  }
}

async function switchRole() {
  const newRole = state.role === 'spectator' ? 'player' : 'spectator'
  const btn     = document.getElementById('btn-switch-role')
  btn.disabled  = true
  try {
    await api.switchRole(state.roomCode, state.sessionId, newRole)
    state.role = newRole
    saveSession()
    btn.textContent = newRole === 'spectator' ? 'Join Table' : 'Leave Table'
    const actionBar = document.querySelector('.pk-action-bar')
    if (actionBar) actionBar.style.display = newRole === 'spectator' ? 'none' : ''
    showToast(newRole === 'player' ? 'You joined the table!' : 'You left the table.')
  } catch (e) {
    showToast(e.message)
  } finally {
    btn.disabled = false
  }
}

// ── Leave Room ────────────────────────────────────────────
async function leaveRoom() {
  stopPoll()
  if (state.roomCode) {
    try { await api.leaveRoom(state.roomCode, state.sessionId) } catch { /* ignore */ }
  }
  clearGameState()
  window.location.href = 'index.html'
}

// ── UNO winner overlay ────────────────────────────────────
function showWinner(winnerId) {
  const won = winnerId === state.sessionId
  document.getElementById('w-emoji').textContent = won ? '🏆' : '😔'
  document.getElementById('w-title').textContent = won ? 'You Win!' : 'You Lose'
  document.getElementById('w-title').className   = 'winner-title ' + (won ? 'win' : 'lose')
  document.getElementById('w-sub').textContent   = won ? 'Congratulations!' : 'Better luck next time.'
  document.getElementById('winner-overlay').classList.add('open')
}

// ── Shared ────────────────────────────────────────────────
export function stopPoll() {
  clearInterval(state.poll)
  state.poll = null
  clearInterval(handResultTimer)
  handResultTimer = null
  clearInterval(turnTimerInterval)
  turnTimerInterval = null
  clearInterval(betweenRoundsInterval)
  betweenRoundsInterval = null
  clearInterval(roomHeartbeatInterval)
  roomHeartbeatInterval = null
}

function goLobby() {
  stopPoll()
  window.location.href = 'lobby.html'
}

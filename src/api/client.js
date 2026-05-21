import { cfg } from '../state.js'

async function request(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const r = await fetch(cfg.url + path, opts)
  let d
  try { d = await r.json() } catch { d = {} }
  if (!r.ok) {
    console.error(`[api] ${method} ${path} → ${r.status}`, d)
    throw new Error(d.error || 'Server error')
  }
  return d
}

export const api = {
  // Auth
  auth:           username         => request('POST', '/auth', { username }),

  // Public matchmaking
  join:           (sid, gid)       => request('POST', '/lobby/join', { sessionId: sid, gameId: gid }),

  // Private rooms
  createRoom:     (sid, gid)       => request('POST', '/rooms/create', { sessionId: sid, gameId: gid }),
  joinRoom:       (sid, roomCode)  => request('POST', '/rooms/join',   { sessionId: sid, roomCode }),
  getRoomStatus:  (roomCode)       => request('GET',  `/rooms/${roomCode}`),

  // Game
  move:           (gid, sid, mid, action) =>
    request('POST', `/games/${gid}/move`, { sessionId: sid, matchId: mid, action }),
  getState:       (gid, mid)       => request('GET', `/games/${gid}/state?matchId=${mid}`),
}

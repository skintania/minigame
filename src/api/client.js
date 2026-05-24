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
  resume:         sessionId        => request('POST', '/auth', { sessionId }),

  // Public matchmaking
  join:           (sid, gid)       => request('POST', '/lobby/join', { sessionId: sid, gameId: gid }),

  // Private rooms
  createRoom:     (sid, gid, opts = {}) => request('POST', '/rooms/create', { sessionId: sid, gameId: gid, ...opts }),
  joinRoom:       (sid, roomCode, role)  => request('POST', '/rooms/join',   { sessionId: sid, roomCode, role }),
  getRoomStatus:  (roomCode, sid)       => request('GET',  `/rooms/${roomCode}${sid ? `?sessionId=${encodeURIComponent(sid)}` : ''}`),
  switchRole:     (code, sid, role)     => request('PATCH', `/rooms/${code}/role`, { sessionId: sid, role }),
  patchSettings:  (code, sid, settings) => request('PATCH', `/rooms/${code}/settings`, { sessionId: sid, ...settings }),

  // Game
  move:           (gid, sid, mid, action) =>
    request('POST', `/games/${gid}/move`, { sessionId: sid, matchId: mid, action }),
  getState:       (gid, mid, sid)  => request('GET', `/games/${gid}/state?matchId=${mid}&sessionId=${sid}`),
}

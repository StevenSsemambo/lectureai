// Things a student did while offline (quiz answers, "I'm lost" taps, session summaries) wait here and are
// sent when the connection comes back, instead of being lost.
//
// Stored in localStorage (small rows) under one key. Capped, so a long offline stretch cannot fill the
// device, and every send removes only what was actually accepted.

const KEY = "semai_pending_v1";
const MAX_ROWS = 600;

function read(storage) {
  try { const raw = storage.getItem(KEY); const v = raw ? JSON.parse(raw) : null; return v && typeof v === "object" ? { events: v.events || [], sessions: v.sessions || [] } : { events: [], sessions: [] }; }
  catch (e) { return { events: [], sessions: [] }; }
}
function write(storage, q) {
  try { storage.setItem(KEY, JSON.stringify(q)); return true; } catch (e) { return false; }
}
const defaultStorage = () => (typeof localStorage !== "undefined" ? localStorage : null);

export function queueEvents(rows, storage = defaultStorage()) {
  if (!storage || !Array.isArray(rows) || !rows.length) return 0;
  const q = read(storage);
  q.events = [...q.events, ...rows].slice(-MAX_ROWS); // keep the newest
  write(storage, q);
  return q.events.length;
}
export function queueSession(row, storage = defaultStorage()) {
  if (!storage || !row) return 0;
  const q = read(storage);
  if (!q.sessions.some((s) => s.id && s.id === row.id)) q.sessions.push(row);
  q.sessions = q.sessions.slice(-40);
  write(storage, q);
  return q.sessions.length;
}
export function pendingCount(storage = defaultStorage()) {
  if (!storage) return 0;
  const q = read(storage);
  return q.events.length + q.sessions.length;
}

// sendEvents(rows) / sendSession(row) resolve true when the server accepted them.
export async function drainQueue({ sendEvents, sendSession }, storage = defaultStorage(), batch = 40) {
  if (!storage) return { events: 0, sessions: 0 };
  let sentEvents = 0, sentSessions = 0;
  for (;;) {
    const q = read(storage);
    if (!q.events.length) break;
    const chunk = q.events.slice(0, batch);
    let ok = false;
    try { ok = await sendEvents(chunk); } catch (e) { ok = false; }
    if (!ok) return { events: sentEvents, sessions: sentSessions, stopped: true };
    const fresh = read(storage);
    fresh.events = fresh.events.slice(chunk.length);
    write(storage, fresh);
    sentEvents += chunk.length;
  }
  for (;;) {
    const q = read(storage);
    if (!q.sessions.length) break;
    const row = q.sessions[0];
    let ok = false;
    try { ok = await sendSession(row); } catch (e) { ok = false; }
    if (!ok) return { events: sentEvents, sessions: sentSessions, stopped: true };
    const fresh = read(storage);
    fresh.sessions = fresh.sessions.slice(1);
    write(storage, fresh);
    sentSessions += 1;
  }
  return { events: sentEvents, sessions: sentSessions };
}

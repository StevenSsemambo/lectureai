// Defensive shaping of data that comes from outside the app (the database, the on-device copy, the AI).
// Rule: whatever arrives, the rest of the app only ever sees well-formed courses, modules and slides,
// so one bad row can never take the whole screen down.

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v, fallback = "") => (typeof v === "string" ? v : v == null ? fallback : typeof v === "number" ? String(v) : fallback);
const num = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback);

// Keeps only slide objects. A module saved with slides = null, a string, or null entries becomes a clean list.
export function cleanSlideList(slides) {
  return Array.isArray(slides) ? slides.filter(isPlainObject) : [];
}

export function cleanModule(m) {
  if (!isPlainObject(m) || !m.id) return null;
  const created = new Date(m.created_at != null ? m.created_at : m.createdAt).getTime();
  return {
    id: String(m.id),
    unit: str(m.unit, "Untitled module") || "Untitled module",
    durationMinutes: num(m.duration_minutes != null ? m.duration_minutes : m.durationMinutes, 45),
    pace: str(m.pace, "standard") || "standard",
    allowLiveCode: m.allow_live_code != null ? m.allow_live_code !== false : m.allowLiveCode !== false,
    slides: cleanSlideList(m.slides),
    createdAt: Number.isFinite(created) ? created : 0,
  };
}

// Rows from the database -> the course objects the app uses. Throws only when the response is not the
// expected shape at all (so the caller's normal "load failed" path runs); individual bad rows are dropped.
export function rowsToCourses(courseRows, moduleRows) {
  if (!Array.isArray(courseRows) || !Array.isArray(moduleRows)) throw new Error("Unexpected response from the database");
  const modulesByCourse = new Map();
  for (const row of moduleRows) {
    if (!isPlainObject(row) || row.course_id == null) continue;
    const m = cleanModule(row);
    if (!m) continue;
    const key = String(row.course_id);
    if (!modulesByCourse.has(key)) modulesByCourse.set(key, []);
    modulesByCourse.get(key).push(m);
  }
  const out = [];
  for (const c of courseRows) {
    if (!isPlainObject(c) || !c.id) continue;
    out.push({
      id: String(c.id),
      code: str(c.code),
      title: str(c.title),
      institution: str(c.institution),
      tone: c.tone,
      voiceProvider: c.voice_provider,
      elevenLabsApiKey: "", // deliberately never fetched
      elevenLabsVoiceId: str(c.elevenlabs_voice_id),
      ownerId: c.owner_id || null,
      lecturerName: str(c.lecturer_name),
      lecturerPersona: str(c.lecturer_persona),
      lecturerStyleNote: str(c.lecturer_style_note),
      modules: modulesByCourse.get(String(c.id)) || [],
    });
  }
  return out;
}

// The copy saved on the device might come from an older app version or be damaged: re-shape it the same way.
export function cleanCourseList(courses) {
  if (!Array.isArray(courses)) return [];
  const out = [];
  for (const c of courses) {
    if (!isPlainObject(c) || !c.id) continue;
    out.push({
      ...c,
      id: String(c.id),
      code: str(c.code),
      title: str(c.title),
      institution: str(c.institution),
      elevenLabsApiKey: "",
      modules: (Array.isArray(c.modules) ? c.modules : []).map((m) => cleanModuleShape(m)).filter(Boolean),
    });
  }
  return out;
}
function cleanModuleShape(m) {
  if (!isPlainObject(m) || !m.id) return null;
  return {
    ...m,
    id: String(m.id),
    unit: str(m.unit, "Untitled module") || "Untitled module",
    durationMinutes: num(m.durationMinutes, 45),
    pace: str(m.pace, "standard") || "standard",
    allowLiveCode: m.allowLiveCode !== false,
    slides: cleanSlideList(m.slides),
    createdAt: Number.isFinite(m.createdAt) ? m.createdAt : 0,
  };
}

// A list of rows from the database: anything that is not an array of objects becomes a clean (possibly empty) list.
export const rowList = (x) => (Array.isArray(x) ? x.filter(isPlainObject) : []);

export const hasSlides = (curriculum) => !!(curriculum && Array.isArray(curriculum.slides) && curriculum.slides.length > 0);

// The course list on the device, so students can open lectures with no connection.
// Course and module content is public in the database, so nothing private is stored here. Teacher-only
// fields are never saved (the ElevenLabs key is never fetched in the first place).

const KEY = "courses:v1";

export async function saveCoursesSnapshot(store, courses, now = Date.now()) {
  if (!store || !Array.isArray(courses) || !courses.length) return null;
  const slim = courses.map((c) => ({ ...c, elevenLabsApiKey: "" }));
  return store.set(KEY, { savedAt: now, courses: slim });
}

export async function loadCoursesSnapshot(store) {
  try {
    const v = await store.get(KEY);
    if (v && Array.isArray(v.courses) && v.courses.length) return { courses: v.courses, savedAt: v.savedAt || null };
  } catch (e) { /* none */ }
  return null;
}

export function ageLabel(savedAt, now = Date.now()) {
  if (!savedAt) return "";
  const mins = Math.max(0, Math.round((now - savedAt) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 36) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

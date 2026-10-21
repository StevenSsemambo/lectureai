// Student voice preferences for the AI lecturer: speed, and a male / female choice.
//
// Browsers do not say whether a voice is male or female, so classifyVoice() recognises the
// common built-in voices by name (Google, Microsoft and Apple). Anything it doesn't recognise is
// "unknown": it still appears in the full voice list and is picked for "Any".

export const DEFAULT_PREFS = { rate: 1, gender: "any", voiceURI: "" };
export const RATE_MIN = 0.6;
export const RATE_MAX = 1.6;
export const RATE_PRESETS = [0.75, 1, 1.25, 1.5];
const STORAGE_KEY = "semai_voice_prefs";

export function clampRate(r) {
  const n = Number(r);
  if (!isFinite(n)) return 1;
  return Math.round(Math.min(RATE_MAX, Math.max(RATE_MIN, n)) * 20) / 20;
}

const FEMALE = /\b(female|woman|zira|hazel|susan|aria|jenny|sonia|libby|natasha|emma|michelle|ava|ana|heera|catherine|linda|samantha|karen|moira|tessa|victoria|fiona|allison|zoe|kate|serena|veena|nicky|joelle|amelie|anna|elsa|helena|paulina|sabina|laura|monica|luciana|ioana|ines|clara|yuna|kyoko|mei-jia|ting-ting|sin-ji|milena|yelda|zuzana|lekha|alice|alva|carmit|damayanti|ellen|jorge-f|kanya|lana|maged-f|melina|sara|tarik-f|vani)\b/i;
const MALE = /\b(male|man|david|mark|george|richard|james|guy|ryan|davis|brian|christopher|eric|roger|steffan|ravi|sean|alex|daniel|fred|tom|oliver|thomas|aaron|arthur|gordon|rishi|lee|evan|nathan|jorge|diego|juan|luca|xander|yannick|markus|stefan|hemant|kalpana-m|mikhail|pablo|rocko|reed|eddy|albert|bruce|ralph|junior|ivan|jacques|maged|tarik|thomas|henri|henrik|magnus|nils|oskar|felix|bernard)\b/i;

export function classifyVoice(voice) {
  const name = String((voice && voice.name) || "");
  // "Female" / "Male" in the name is the clearest signal; check Female first ("female" contains "male").
  if (/\bfemale\b/i.test(name)) return "female";
  if (/\bmale\b/i.test(name)) return "male";
  const f = FEMALE.test(name), m = MALE.test(name);
  if (f && !m) return "female";
  if (m && !f) return "male";
  return "unknown";
}

const langOf = (v) => String((v && v.lang) || "").toLowerCase().replace("_", "-");

// Voices worth offering: the same language as the page/browser, best first.
export function voicesForLanguage(voices, lang = "en") {
  const want = String(lang || "en").toLowerCase().split("-")[0];
  const list = (voices || []).filter((v) => langOf(v).split("-")[0] === want);
  const base = list.length ? list : voices || [];
  return base.slice().sort((a, b) => Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name));
}

// Pick the voice to speak with. An explicit choice wins; otherwise the best match for the gender.
export function chooseVoice(voices, prefs, lang = "en") {
  const all = voices || [];
  if (!all.length) return null;
  if (prefs && prefs.voiceURI) {
    const exact = all.find((v) => v.voiceURI === prefs.voiceURI);
    if (exact) return exact;
  }
  const pool = voicesForLanguage(all, lang);
  if (prefs && (prefs.gender === "female" || prefs.gender === "male")) {
    const match = pool.find((v) => classifyVoice(v) === prefs.gender);
    if (match) return match;
  }
  return null; // let the browser use its default voice
}

export function genderAvailable(voices, gender, lang = "en") {
  return voicesForLanguage(voices, lang).some((v) => classifyVoice(v) === gender);
}

export function sanitizePrefs(p) {
  const o = p && typeof p === "object" ? p : {};
  return {
    rate: clampRate(o.rate === undefined ? 1 : o.rate),
    gender: o.gender === "female" || o.gender === "male" ? o.gender : "any",
    voiceURI: typeof o.voiceURI === "string" ? o.voiceURI.slice(0, 200) : "",
  };
}

export function loadPrefs() {
  try { return sanitizePrefs(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")); } catch (e) { return { ...DEFAULT_PREFS }; }
}
export function savePrefs(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizePrefs(p))); } catch (e) { /* storage unavailable */ }
}

export function rateLabel(r) {
  return `${clampRate(r).toFixed(2).replace(/\.?0+$/, "")}×`;
}

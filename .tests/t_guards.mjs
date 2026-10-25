// Tests for src/dataGuards.js and src/safeStorage.js (run: node .tests/t_guards.mjs)
import { cleanSlideList, cleanModule, rowsToCourses, cleanCourseList, rowList, hasSlides } from "../src/dataGuards.js";
import { safeLocalStorage, safeIndexedDB } from "../src/safeStorage.js";
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("FAIL:", m)); };
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };

// ---- slides ----
ok(JSON.stringify(cleanSlideList([{ a: 1 }, null, 1, "x", [], undefined, { b: 2 }])) === '[{"a":1},{"b":2}]', "keeps only slide objects");
ok(cleanSlideList(null).length === 0 && cleanSlideList("abc").length === 0 && cleanSlideList({}).length === 0 && cleanSlideList(undefined).length === 0, "non-arrays become []");
ok(hasSlides({ slides: [{}] }) && !hasSlides({ slides: [] }) && !hasSlides(null) && !hasSlides({ slides: "x" }), "hasSlides");

// ---- modules ----
let m = cleanModule({ id: "m1", unit: null, duration_minutes: "abc", pace: null, slides: null, created_at: "bad" });
ok(m && m.unit === "Untitled module" && m.durationMinutes === 45 && m.pace === "standard" && Array.isArray(m.slides) && m.slides.length === 0 && m.createdAt === 0, "bad module fields get safe defaults");
ok(cleanModule({ unit: "no id" }) === null && cleanModule(null) === null && cleanModule(5) === null, "modules without an id are dropped");
m = cleanModule({ id: "m2", unit: "U", duration_minutes: 30, pace: "fast", allow_live_code: false, slides: [{ type: "concept" }], created_at: "2026-01-01" });
ok(m.durationMinutes === 30 && m.pace === "fast" && m.allowLiveCode === false && m.slides.length === 1 && m.createdAt === Date.parse("2026-01-01"), "good module passes through unchanged");

// ---- rows -> courses ----
const goodCourse = { id: "c1", code: "CS1", title: "Intro", institution: "U", tone: "warm", voice_provider: "browser", owner_id: "o1", lecturer_name: "Dr A", elevenlabs_voice_id: null };
let out = rowsToCourses([goodCourse], [{ id: "m1", course_id: "c1", unit: "U1", slides: [{ type: "concept" }], created_at: "2026-01-01" }]);
ok(out.length === 1 && out[0].code === "CS1" && out[0].ownerId === "o1" && out[0].modules.length === 1 && out[0].elevenLabsApiKey === "", "good rows map exactly as before");
ok(out[0].lecturerName === "Dr A" && out[0].voiceProvider === "browser" && out[0].tone === "warm", "all course fields carried over");
out = rowsToCourses([null, 7, {}, { id: null }, { id: "c2" }], [null, "x", { id: "m", course_id: null }, { id: "m", course_id: "other" }]);
ok(out.length === 1 && out[0].id === "c2" && out[0].modules.length === 0 && out[0].code === "", "junk rows are dropped, not fatal");
ok(throws(() => rowsToCourses({ message: "x" }, [])) && throws(() => rowsToCourses([], null)), "wrong response shape throws so the load-failed path runs");

// ---- on-device copy ----
out = cleanCourseList([{ id: "c1", code: "A", modules: [{ id: "m", slides: "bad" }, null, { slides: [] }] }, null, { code: "no id" }, 5]);
ok(out.length === 1 && out[0].modules.length === 1 && Array.isArray(out[0].modules[0].slides), "damaged saved copy is repaired");
ok(cleanCourseList(null).length === 0 && cleanCourseList("x").length === 0, "non-array saved copy -> []");

// ---- row lists ----
ok(rowList([{ a: 1 }, null, 2, "s", [], { b: 1 }]).length === 2 && rowList(null).length === 0 && rowList({ x: 1 }).length === 0, "rowList");

// ---- storage that throws just from being touched ----
globalThis.localStorage = undefined; delete globalThis.localStorage;
ok(safeLocalStorage() === null && safeIndexedDB() === null, "absent storage -> null");
Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
Object.defineProperty(globalThis, "indexedDB", { configurable: true, get() { throw new Error("SecurityError"); } });
ok(safeLocalStorage() === null && safeIndexedDB() === null, "storage that throws on access -> null, not a crash");
console.log(`guards: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

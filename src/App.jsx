import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { PrivacyPolicyScreen, TermsScreen, LegalLinks } from "./legal.jsx";
import SplashScreen, { VersionTag } from "./SplashScreen.jsx";
import SlideView from "./slideKit/SlideView.jsx";
import { Rich } from "./slideKit/MathText.jsx";
import CodePane from "./slideKit/CodePane.jsx";
import { SECTION_SYSTEM, sectionPrompt, MODULE_SYSTEM, modulePrompt, normalizeSectionNotes, normalizeModuleNotes, fallbackSectionNotes, fallbackModuleNotes } from "./slideKit/notesContent.js";
import { normalizeSlide, slideToPlainContext, TYPE_LABELS, LANGUAGE_LABELS } from "./slideKit/schema.js";
import { generateDeck } from "./slideKit/generate.js";
import { DEMO_SHOWCASE_SLIDES } from "./slideKit/demoSlides.js";
import { validateSlide } from "./slideKit/validate.js";
import { buildLectureNotesPdf } from "./slideKit/notesPdf.js";
import { scrollTopForBlock } from "./slideKit/scroll.js";
import { extractBlocks, matchSentenceToBlock } from "./slideKit/focus.js";
import { logTiming, getTimingSummary } from "./telemetry.js";
import { logClientError, Boundary } from "./errorLogging.jsx";
import { startTracking, track, flushEvents, stopTracking, getStudentKey, slideKeyFor, postStandaloneEvents, flushQueuedEvents } from "./analytics.js";
import { attentionScore, heatLevel, whyFlagged, formatDwell } from "./slideKit/insights.js";
import CheckCard from "./slideKit/CheckCard.jsx";
import { estimateMastery, estimateWithClaims, calibration as studentCalibration, conceptsToRevise } from "./learning/mastery.js";
import { summarizeBreakdown, commonMisconceptions, weakConcepts } from "./learning/misconceptions.js";
import { pickCorrections, correctionsPromptBlock } from "./learning/corrections.js";
import { ConceptTable, MisconceptionList } from "./learning/ClassInsights.jsx";
import MasteryPanel from "./learning/MasteryPanel.jsx";
import RosterPanel from "./learning/RosterPanel.jsx";
import TeachingEffectPanel from "./learning/TeachingEffectPanel.jsx";
import VoicePanel from "./voice/VoicePanel.jsx";
import StylePanel from "./persona/StylePanel.jsx";
import FeelPanel from "./persona/FeelPanel.jsx";
import { createConversation, recordExchange, conversationBlock, avoidOpenings } from "./persona/conversation.js";
import { extractAnswer, createChunker, createSSEParser, trimToSentence, continuesFrom } from "./persona/streaming.js";
import { milestoneFor, milestoneLine, MAX_MILESTONES_PER_LECTURE } from "./persona/milestones.js";
import { FEEL_CHOICES, feelThanks } from "./persona/feel.js";
import { loadPrefs as loadVoicePrefs, savePrefs as saveVoicePrefs, chooseVoice, clampRate } from "./voice/voicePrefs.js";
import { createSessionManager, SessionExpiredError } from "./authSession.js";
import { offlineStore } from "./offline/store.js";
import { narrationFallback, saveNarration, hasNarration } from "./offline/narration.js";
import { saveCoursesSnapshot, loadCoursesSnapshot, ageLabel } from "./offline/courseCache.js";
import { queueSession } from "./offline/eventQueue.js";
import { moduleToSetup, applyModuleSave, removeModule, duplicateModule, moveItem, blankSlide, courseDeleteConfirmed, nextActiveCourseId } from "./courseCrud.js";
import { looksLikeEmail, accountLabel, recoveryCodeLooksValid, passwordError, recoveryCodeFile, friendlyAccountError } from "./accountHelpers.js";
import { usernameError, normalizeUsername, fullNameError, cleanFullName, suggestUsername, friendlySignupError } from "./studentProfile.js";
import PracticePanel from "./learning/PracticePanel.jsx";
import { planForSlide, adaptationPrompt, adaptWordBudget, adaptationLabel, emptySession, conceptsMatch, EXPLAIN_REQUESTS } from "./learning/adaptation.js";
import { generatePractice } from "./learning/practice.js";
import { pickDiagnostic, diagnosticLead, diagnosticNoGap, diagnosticGapPrompt, diagnosticGapFallback } from "./learning/diagnose.js";
import { welcomeBackLine, createPauseTracker, breakNudgeDue, BREAK_NUDGE_TEXT, pauseHotspot, engagementSummary, focusRhythmText } from "./learning/pauses.js";
import FlagReviewCard from "./learning/FlagReviewCard.jsx";
import DetourBoard from "./detour/DetourBoard.jsx";
import { rowsToCourses, cleanCourseList, cleanSlideList, hasSlides, rowList } from "./dataGuards.js";
import { withTimeout } from "./net.js";
import { originCore, originDetail, originFallbackAnswer, isOriginQuestion } from "./persona/origin.js";
import { VISUAL_PROMPT, parseAnswerWithVisual, buildDetourBoard, checkBoard, cleanMermaid, mermaidRepairPrompt, holdMs, detoursEnabled, boardContext, createDetourController } from "./detour/detour.js";
import { PERSONAS, PERSONA_IDS, MAX_NAME, MAX_NOTE, DEFAULT_PERSONA, resolvePersona, lecturerIdentityFor, introPreview, introGuidance, sanitizeName, sanitizeStyleNote } from "./persona/persona.js";
import { quizFeedback, questionAck } from "./persona/feedback.js";
import { careDue, careLine, careReply, CARE_CHOICES } from "./persona/care.js";
import { loadPrefs, savePrefs, feedbackCharacter, styleLine, FEEDBACK_STYLES } from "./persona/studentPrefs.js";
import { buildWelcomeFacts, welcomeGuidance } from "./persona/welcome.js";
import { newCheckState, chooseOption as chooseCheckState, finishCheck as finishCheckState, skipCheck as skipCheckState } from "./slideKit/checkFlow.js";
import {
  Pause, Play, Hand, MessageSquare, PhoneOff, Code2, PresentationIcon, Send,
  ChevronRight, ChevronLeft, Video, VideoOff, Loader2, Volume2, Upload,
  Sparkles, Trash2, ArrowRight, GraduationCap, Users, Settings2, RotateCcw,
  AlertTriangle, Clock, FileDown, Maximize2, Minimize2, Flag, CheckCircle2, Download, MoreHorizontal, X, } from "lucide-react";

// ---------------------------------------------------------------------------
// No npm install needed for PPTX/PDF parsing below — it's implemented with
// zero external dependencies (no jszip, no pdfjs-dist), only native browser
// APIs. This keeps the file runnable both in a normal React project and
// inside sandboxed artifact previews that only allow a fixed library list.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// DEMO CURRICULUM — used until a lecturer generates a real one, and as the
// "just show me something" fallback from the setup screen.
// ---------------------------------------------------------------------------
const DEFAULT_CURRICULUM = {
  code: "TDIT 214",
  title: "Object-Oriented Programming with Java I",
  unit: "Module 1 — Introduction to Java",
  slides: [
    {
      title: "What is Java?",
      bullets: [
        "A general-purpose, object-oriented programming language used across web, mobile, and enterprise software",
        "\"Write once, run anywhere\" — compiled code runs on any device with a Java Virtual Machine (JVM)",
        "Created by Sun Microsystems in 1995; now maintained by Oracle under active development",
        "Statically typed and strongly object-oriented, which encourages organized, maintainable code",
      ],
      detail:
        "Java's defining design goal was portability: rather than compiling directly to a specific machine's instructions, Java compiles to an intermediate form called bytecode, which the JVM interprets on whatever device it's running on. This is why the same compiled .class file runs unmodified on Windows, macOS, Linux, or Android. That design choice, combined with strict object-oriented structure, made Java a common default for large, long-lived enterprise systems where portability and maintainability matter more than raw execution speed.",
      notes:
        "Explain what Java is, why it was designed to be platform-independent, and what the JVM does in plain terms a first-year student would understand. Be warm and conversational, like a lecturer speaking out loud, not a textbook.",
      hasCode: false,
    },
    {
      title: "Setting Up: JDK & Compiling",
      bullets: [
        "JDK = Java Development Kit — bundles the compiler, JVM, and standard libraries",
        "javac compiles human-readable .java source files into .class bytecode files",
        "The java command loads that bytecode and runs it on the JVM",
        "This two-step compile-then-run cycle is fundamental to every Java program you'll write",
      ],
      detail:
        "It helps to think of this as two distinct stages with two distinct tools. Compiling with javac checks your syntax and translates it into bytecode — it doesn't run anything yet, it just produces a file. Running with java is a separate step that hands that bytecode to the JVM, which interprets it line by line (or increasingly, compiles hot paths to native code on the fly for speed). Beginners often expect one command to do both, so it's worth being explicit that these are always two separate steps.",
      notes:
        "Explain the compile-then-run workflow for Java (javac then java) and what bytecode is, in plain simple terms. Conversational lecturer tone.",
      hasCode: false,
    },
    {
      title: "Your First Program",
      bullets: [
        "Every runnable Java app needs a class containing a main method",
        "public static void main(String[] args) is the fixed entry point the JVM looks for",
        "System.out.println() writes a line of text to the console",
        "Class name must exactly match the filename — HelloWorld lives in HelloWorld.java",
      ],
      detail:
        "The exact signature of main matters more than it might seem: public so the JVM (outside your class) can call it, static so it can be called without first creating an instance of the class, void because it doesn't return a value back to the JVM, and String[] args to receive command-line arguments if any are passed in. Getting any part of that signature wrong means the JVM won't recognize it as an entry point at all, which is a common early debugging trap.",
      notes:
        "Walk the student through the classic HelloWorld.java program shown in the code editor. Explain what 'public class', 'public static void main', and 'System.out.println' each do, briefly, like you're pointing at the code while talking. Conversational lecturer tone.",
      hasCode: true,
      code: `public class HelloWorld {
    public static void main(String[] args) {
        // Prints a message to the console
        System.out.println("Hello, world!");
    }
}`,
    },
    ...DEMO_SHOWCASE_SLIDES,
  ],
};

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// A COURSE holds the lecturer's persona (tone, voice) and identity (code,
// title, institution) — things that should stay consistent across every
// session. A MODULE is one uploaded/generated set of slides — one lecture's
// worth of content — saved independently so a lecturer can come back later
// and add more without redoing any of this. Neither is persisted beyond
// this browser tab/session; there's no backend here, only in-memory state.
const DEFAULT_COURSE = {
  id: "course-demo",
  code: "TDIT 214",
  title: "Object-Oriented Programming with Java I",
  institution: "",
  tone: "conversational",
  voiceProvider: "browser",
  elevenLabsApiKey: "",
  elevenLabsVoiceId: "",
  modules: [
    {
      id: "module-demo",
      unit: "Module 1 — Introduction to Java",
      durationMinutes: 45,
      pace: "standard",
      allowLiveCode: true,
      slides: DEFAULT_CURRICULUM.slides,
      createdAt: Date.now(),
    },
  ],
};

// Flattens a (course, module) pair into the {curriculum, settings} shape
// LectureRoom already expects — course fields carry the lecturer's
// persona/voice, module fields carry this specific session's content/pacing.
function buildRoomData(course, module) {
  return {
    courseId: course.id,
    moduleId: module.id,
    curriculum: { code: course.code, title: course.title, unit: module.unit, slides: cleanSlideList(module.slides).map((sl, i) => normalizeSlide(sl, i)) },
    settings: {
      courseCode: course.code,
      courseTitle: course.title,
      unitTitle: module.unit,
      institution: course.institution,
      durationMinutes: module.durationMinutes,
      pace: module.pace,
      tone: course.tone,
      allowLiveCode: module.allowLiveCode,
      voiceProvider: course.voiceProvider,
      elevenLabsApiKey: course.elevenLabsApiKey,
      elevenLabsVoiceId: course.elevenLabsVoiceId,
      lecturerName: course.lecturerName || "",
      lecturerPersona: course.lecturerPersona || "",
      lecturerStyleNote: course.lecturerStyleNote || "",
    },
  };
}

// Streaming answers can be switched off for one browser with localStorage "semai_stream" = "0" (a safety valve).
function streamingOn() {
  try {
    if (typeof ReadableStream === "undefined" || typeof TextDecoder === "undefined") return false;
    return localStorage.getItem("semai_stream") !== "0";
  } catch (e) {
    return true;
  }
}

const DEFAULT_MODULE_DRAFT_SETTINGS = { unitTitle: "", durationMinutes: 45, pace: "standard", allowLiveCode: true };

// Shared across every prompt whose output gets spoken aloud. The single
// biggest thing that makes generated lecture text sound "read aloud" rather
// than "spoken" is uniform sentence length and zero verbal filler — real
// lecturers vary their rhythm, think out loud occasionally, and contract
// words. This nudges the model that direction without making it sloppy.
const NATURAL_SPEECH_STYLE = `Write exactly as you'd actually say it out loud, not as prose to be read. Use contractions (it's, we're, let's, don't). Vary sentence length — mix short punchy sentences with longer ones, the way real speech flows, instead of uniform textbook sentences. It's fine to think out loud occasionally ("so", "now", "here's the thing") but don't overdo it — one or two per response, not one per sentence. Never use markdown, bullet points, headers, or asterisks — this is spoken text only.`;

// ---------------------------------------------------------------------------
// Pacing & tone — these aren't cosmetic. They compute an actual word budget
// that gets fed into every system prompt at lecture time, so "45 minutes,
// concise" really does produce shorter explanations than "90 minutes, deep".
// ---------------------------------------------------------------------------
const PACE_OPTIONS = [
  { id: "concise", label: "Concise", hint: "Hit the key points fast, minimal tangents" },
  { id: "standard", label: "Standard", hint: "Balanced explanation with one worked example" },
  { id: "deep", label: "In-depth", hint: "Slower pace, more context and examples" },
];
// Base spoken length per slide at "normal" pacing (~5 min of lecture time
// per slide). Pace shifts this up/down directly; duration/slide-count only
// nudges it, because each slide explanation is ONE uninterrupted TTS block
// here, not a multi-minute monologue — dividing total minutes evenly across
// slides produces numbers meant for a continuous lecture, not one utterance.
const PACE_BASE_WORDS = { concise: 70, standard: 110, deep: 160 };

const TONE_OPTIONS = [
  { id: "conversational", label: "Conversational", desc: "warm, informal, and approachable — like chatting with students, not reading a script" },
  { id: "formal", label: "Formal", desc: "precise, formal, and academically rigorous" },
  { id: "energetic", label: "Energetic", desc: "upbeat, enthusiastic, and encouraging" },
];

const AVG_SPEAKING_WPM = 165;
const REFERENCE_MINUTES_PER_SLIDE = 5;

function computeWordBudget(durationMinutes, slideCount, pace) {
  const base = PACE_BASE_WORDS[pace] || PACE_BASE_WORDS.standard;
  const avgMinutesPerSlide = Math.max(0.1, Number(durationMinutes) || 45) / Math.max(1, slideCount);
  const densityFactor = Math.min(1.6, Math.max(0.6, avgMinutesPerSlide / REFERENCE_MINUTES_PER_SLIDE));
  return Math.round(Math.min(200, Math.max(50, base * densityFactor)));
}

// ---------------------------------------------------------------------------
// Claude API helper — shared "brain" for both curriculum generation and the
// live lecture (explanations + Q&A).
// ---------------------------------------------------------------------------
// Browsers require a real user gesture before they'll let JS-triggered
// audio play. A click (Join / Launch) qualifies; an autopilot loop that
// starts itself from a useEffect after that click has already returned
// does NOT, in most browsers, and will be silently blocked. Call this from
// an actual onClick handler to "warm up" both audio paths for the rest of
// the session — a near-silent utterance unlocks speechSynthesis, and a
// muted play() unlocks HTMLMediaElement autoplay for later Audio() objects
// (ElevenLabs playback) that aren't themselves triggered by a click.
function primeAudioForVoice() {
  try {
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      const warm = new SpeechSynthesisUtterance(" ");
      warm.volume = 0;
      window.speechSynthesis.speak(warm);
    }
  } catch (e) {
    /* best-effort */
  }
  try {
    const a = new Audio();
    a.muted = true;
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
  } catch (e) {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------------
// PERSISTENCE — optional Supabase backend. Fill these in with your own
// project's URL and anon/publishable key (Project Settings > API in the
// Supabase dashboard) to make courses/modules survive a page refresh. Leave
// them blank and the app works exactly as before — everything in-memory,
// gone on refresh — so this is safe to leave unconfigured.
//
// Implemented as plain fetch() calls against Supabase's auto-generated
// PostgREST REST API rather than the @supabase/supabase-js SDK, for the
// same reason the PPTX/PDF parsing has no dependencies: no npm install
// step, and it still works inside sandboxed previews that only allow a
// fixed library list.
//
// SECURITY NOTE: an ElevenLabs API key is never written to the database.
// Course rows are readable by anyone with the anon key (that's how
// students' Join screen lists them) — persisting a secret key there would
// leak it to every visitor. Voice provider + voice ID are safe to store;
// the actual key stays local to the browser tab that entered it and must
// be re-entered after a refresh. A production version of this would proxy
// TTS calls through a server function instead, so the key never reaches
// the client at all.
// ---------------------------------------------------------------------------
export const SUPABASE_URL = "https://rodwpttdegrfwqioyoci.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvZHdwdHRkZWdyZndxaW95b2NpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NDQwOTYsImV4cCI6MjEwMDQyMDA5Nn0.clDK1TdN36pyrKltE0PrY3Q_QdwMcZoOA4mskyI38hQ";

const supabaseEnabled = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

async function supabaseRequest(path, options = {}, accessToken = null) {
  // Reads and anonymous writes use the anon key. Authenticated writes (course/
  // module create/update) need the LECTURER'S OWN session token here instead —
  // that's what lets Postgres RLS resolve auth.uid() to the right user and
  // enforce "you can only write your own courses." The anon key alone always
  // resolves auth.uid() to null, which is why RLS treats it as anonymous.
  return withTimeout(async (signal) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
      ...options,
      signal: options.signal || signal,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Supabase request failed (${res.status}): ${text.slice(0, 200)}`);
    }
    if (res.status === 204) return null;
    // Prefer: return=minimal yields a 201 with an empty body — don't try to parse it.
    const bodyText = await res.text();
    return bodyText ? JSON.parse(bodyText) : null;
  }, 25000);
}

// ---------------------------------------------------------------------------
// Supabase Auth (GoTrue) — plain REST calls, same no-SDK approach as the
// database layer. Email/password only for now; the goal here is just
// "lecturers are uniquely identified and own their own courses," not a full
// account system.
// ---------------------------------------------------------------------------
async function authRequest(path, body) {
  return withTimeout(async (signal) => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.msg || data.error_description || data.error || `Auth request failed (${res.status})`);
    }
    return data;
  }, 25000);
}

async function signUpUser(email, password, metadata = null) {
  const data = await authRequest("/signup", metadata ? { email, password, data: metadata } : { email, password });
  // If email confirmation is required, Supabase returns a user object with
  // no access_token yet — the account exists but can't sign in until
  // confirmed. Both cases are handled by the caller.
  return data.access_token
    ? { session: toSession(data), needsConfirmation: false }
    : { session: null, needsConfirmation: true };
}

async function signInUser(email, password) {
  const data = await authRequest("/token?grant_type=password", { email, password });
  return toSession(data);
}

async function refreshUserSession(refreshToken) {
  const data = await authRequest("/token?grant_type=refresh_token", { refresh_token: refreshToken });
  return toSession(data);
}

async function signOutUser(accessToken) {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    /* best-effort — clearing local session is what actually matters */
  }
}

// ---- Student profiles: real full name + unique username -------------------
// Returns true/false, or null when the database can't say (so the form never blocks on it).
async function checkUsernameAvailable(username) {
  try {
    const r = await supabaseRequest("/rpc/username_available", { method: "POST", body: JSON.stringify({ p_username: username }) });
    return typeof r === "boolean" ? r : null;
  } catch (e) {
    return null;
  }
}
// A profile object, null when the student has none yet, or undefined when it couldn't be checked.
async function fetchStudentProfile(session) {
  try {
    const rows = await supabaseRequest(`/student_profiles?select=username,full_name&user_id=eq.${session.user.id}`, {}, session.accessToken);
    return Array.isArray(rows) && rows.length ? { username: rows[0].username, fullName: rows[0].full_name } : null;
  } catch (e) {
    return undefined;
  }
}
async function createStudentProfile(session, { username, fullName }) {
  try {
    await supabaseRequest("/student_profiles", { method: "POST", body: JSON.stringify({ user_id: session.user.id, username: normalizeUsername(username), full_name: cleanFullName(fullName), role: "student" }), headers: { Prefer: "return=minimal" } }, session.accessToken);
    return { ok: true };
  } catch (e) {
    return { ok: false, taken: /409|23505|duplicate/i.test(String(e && e.message)), message: String((e && e.message) || "") };
  }
}

// Calls the `account` Edge Function (sign-up, username sign-in, password reset by recovery code).
async function accountRequest(action, body) {
  let res;
  let data;
  try {
    ({ res, data } = await withTimeout(async (signal) => {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/account`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
        signal,
      });
      return { res: r, data: await r.json().catch(() => ({})) };
    }, 25000));
  } catch (e) {
    const err = new Error(e && e.message ? e.message : "Failed to fetch");
    err.status = 0;
    throw err;
  }
  if (!res.ok) {
    const err = new Error((data.error || `Request failed (${res.status})`) + (data.detail ? ` [${String(data.detail).slice(0, 120)}]` : ""));
    err.status = res.status;
    throw err;
  }
  return data;
}

function toSession(data) {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    user: { id: data.user.id, email: data.user.email },
  };
}

// Session persistence. This only matters for the real deployed app (a
// browser tab, not the Claude.ai artifact preview, where localStorage isn't
// available) — wrapped defensively so it degrades to "just sign in again"
// rather than crashing if storage is blocked or unavailable.
const LECTURER_SESSION_STORAGE_KEY = "semai_lecturer_session";
const STUDENT_SESSION_STORAGE_KEY = "semai_student_session";
function saveSessionLocally(session, key = LECTURER_SESSION_STORAGE_KEY) {
  try {
    if (session) localStorage.setItem(key, JSON.stringify(session));
    else localStorage.removeItem(key);
  } catch (e) {
    /* storage unavailable — session just won't survive a refresh */
  }
}
function loadSessionLocally(key = LECTURER_SESSION_STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

async function fetchCoursesFromSupabase() {
  const [courseRows, moduleRows] = await Promise.all([
    supabaseRequest("/courses?select=*&order=created_at.asc"),
    supabaseRequest("/modules?select=*&order=created_at.asc"),
  ]);
  return rowsToCourses(courseRows, moduleRows);
}

async function saveCourseToSupabase(course, accessToken) {
  await supabaseRequest(
    "/courses",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([
        {
          id: course.id,
          code: course.code,
          title: course.title,
          institution: course.institution || null,
          tone: course.tone,
          voice_provider: course.voiceProvider,
          elevenlabs_voice_id: course.elevenLabsVoiceId || null,
          owner_id: course.ownerId,
          lecturer_name: sanitizeName(course.lecturerName) || null,
          lecturer_persona: course.lecturerPersona || null,
          lecturer_style_note: sanitizeStyleNote(course.lecturerStyleNote) || null,
        },
      ]),
    },
    accessToken
  );
}

async function saveModuleToSupabase(courseId, module, accessToken) {
  await supabaseRequest(
    "/modules",
    {
      method: "POST",
      // Upsert: saving an edited module must update the existing row, not collide on its id.
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([
        {
          id: module.id,
          course_id: courseId,
          unit: module.unit,
          duration_minutes: module.durationMinutes,
          pace: module.pace,
          allow_live_code: module.allowLiveCode,
          slides: module.slides,
        },
      ]),
    },
    accessToken
  );
}

// Row-level security makes a delete of someone else's row (or a missing one) succeed with
// zero rows, so ask for the deleted rows back and treat "none" as a failure.
async function deleteRowFromSupabase(table, id, accessToken) {
  const rows = await supabaseRequest(`/${table}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }, accessToken);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Nothing was deleted. You can only delete courses and modules you own.");
}
const deleteModuleFromSupabase = (id, token) => deleteRowFromSupabase("modules", id, token);
const deleteCourseFromSupabase = (id, token) => deleteRowFromSupabase("courses", id, token);

// AI confidence/escalation: when the AI isn't confident in an answer, the
// question gets written here (public insert — students have no login) for
// the owning lecturer to review later (authenticated read/update, RLS-
// scoped to their own courses). Never blocks the spoken response — always
// called fire-and-forget, since a failed flag write shouldn't disrupt the
// live lecture.
async function flagQuestionForLecturer(courseId, moduleId, studentName, question, answer, slideTitle) {
  if (!supabaseEnabled() || !courseId || !moduleId) return;
  try {
    await supabaseRequest("/flagged_questions", {
      method: "POST",
      // return=minimal: an anonymous student can INSERT but not SELECT this
      // row under RLS, so asking Postgres to read it back would fail the write.
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        {
          id: makeId("flag"),
          course_id: courseId,
          module_id: moduleId,
          student_name: studentName || null,
          slide_title: slideTitle || null,
          question,
          ai_answer: answer || null,
        },
      ]),
    });
  } catch (e) {
    console.error("Failed to flag question for lecturer review:", e);
  }
}

async function fetchFlaggedQuestions(courseId, accessToken) {
  return rowList(await supabaseRequest(`/flagged_questions?course_id=eq.${encodeURIComponent(courseId)}&select=*&order=created_at.desc`, {}, accessToken));
}

async function resolveFlaggedQuestion(flagId, accessToken) {
  await supabaseRequest(
    `/flagged_questions?id=eq.${encodeURIComponent(flagId)}`,
    { method: "PATCH", body: JSON.stringify({ resolved: true }) },
    accessToken
  );
}

// Lecturer-approved answers to earlier flagged questions for this module (the AI lecturer uses them).
// Public on purpose: the database function returns ONLY approved question/answer pairs, never raw student questions.
async function fetchModuleCorrections(moduleId) {
  if (!supabaseEnabled() || !moduleId) return [];
  try {
    const r = await supabaseRequest("/rpc/module_corrections", { method: "POST", body: JSON.stringify({ p_module_id: moduleId }) });
    return Array.isArray(r) ? r : [];
  } catch (e) {
    return [];
  }
}

async function approveFlaggedQuestion(flagId, question, answer, accessToken) {
  await supabaseRequest(
    `/flagged_questions?id=eq.${encodeURIComponent(flagId)}`,
    { method: "PATCH", body: JSON.stringify({ approved_question: question, lecturer_answer: answer, approved_at: new Date().toISOString(), resolved: true }) },
    accessToken
  );
}

// A student's own quiz answers (row-level security returns only their own).
async function fetchMyCheckEvents(studentId, accessToken) {
  const rows = await supabaseRequest(
    `/learning_events?student_id=eq.${encodeURIComponent(studentId)}&event_type=in.(check_answer,practice_answer)&select=created_at,module_id,course_id,payload&order=created_at.asc&limit=2000`,
    {},
    accessToken
  );
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({ concept: r.payload && r.payload.concept, correct: r.payload && (r.payload.correct === true || r.payload.correct === "true"), confidence: r.payload && r.payload.confidence, ts: Date.parse(r.created_at), moduleId: r.module_id, courseId: r.course_id }))
    .filter((e) => e.concept && typeof e.correct === "boolean");
}

// A student's finished-session totals (their own only), for the focus-rhythm note.
// What the student told SEMAI about themselves: { "concept": "know" | "struggle" }. Private to the student.
async function fetchConceptNotes(studentId, accessToken) {
  const rows = await supabaseRequest(`/student_concept_notes?student_id=eq.${encodeURIComponent(studentId)}&select=concept,claim&limit=500`, {}, accessToken);
  const out = {};
  for (const r of Array.isArray(rows) ? rows : []) if (r && r.concept && (r.claim === "know" || r.claim === "struggle")) out[r.concept] = r.claim;
  return out;
}
async function saveConceptNote(studentId, concept, claim, accessToken) {
  if (!claim) {
    await supabaseRequest(`/student_concept_notes?student_id=eq.${encodeURIComponent(studentId)}&concept=eq.${encodeURIComponent(concept)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }, accessToken);
    return;
  }
  await supabaseRequest(
    "/student_concept_notes",
    { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ student_id: studentId, concept: String(concept).slice(0, 80), claim, updated_at: new Date().toISOString() }]) },
    accessToken
  );
}

async function fetchMySessionTotals(studentId, accessToken) {
  const rows = await supabaseRequest(
    `/learning_events?student_id=eq.${encodeURIComponent(studentId)}&event_type=eq.session_end&select=payload&order=created_at.desc&limit=20`,
    {},
    accessToken
  );
  return (Array.isArray(rows) ? rows : []).map((r) => r.payload || {});
}

// AI advice for a slide that is confusing students (on demand; plain text).
async function suggestSlideImprovements(slide, evidence) {
  const system = "You are an expert in teaching and instructional design advising a university lecturer. Be concrete and brief. Plain text only: no markdown, no asterisks, no headings.";
  const prompt = `A slide in an AI-delivered lecture is confusing students.\n\nThe slide:\n${slideToPlainContext(slide)}\n\nEvidence from students:\n${evidence}\n\nGive exactly 3 specific changes the lecturer could make to this slide (for example: add a worked example, split the slide in two, replace an abstract explanation with an analogy, reorder the points, define a term earlier), each in one or two sentences, numbered 1 to 3. Then add one final line starting with "Try saying:" containing a clearer two-sentence explanation of the idea students most likely misunderstand. Under 170 words in total.`;
  return callAI(system, prompt, 700, undefined, "suggest");
}

// Written once, at the end of a session (either it completes naturally or
// the student leaves early) — public insert, no login required, same
// reasoning as flagging a question. Fire-and-forget; a failed write
// shouldn't block anyone from leaving the room.
function sessionRow(session) {
  return {
    id: session.id || makeId("session"),
    course_id: session.courseId,
    module_id: session.moduleId,
    student_id: session.studentId || null,
    student_name: session.studentName || null,
    completed: session.completed,
    slides_reached: session.slidesReached,
    total_slides: session.totalSlides,
    question_count: session.questionCount,
    transcript: session.transcript,
    summary: session.summary || null,
    started_at: session.startedAt,
    research_consent: !!session.researchConsent,
  };
}

async function recordSession(session, accessToken) {
  if (!supabaseEnabled() || !session.courseId || !session.moduleId) return;
  const row = sessionRow(session);
  try {
    await supabaseRequest(
      "/sessions",
      {
        method: "POST",
        // return=minimal: anonymous sessions (student_id null) can't be read
        // back by the inserter under RLS, so don't request the row back.
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify([row]),
      },
      accessToken
    );
  } catch (e) {
    console.error("Failed to record session:", e);
    // no connection (or the server is struggling): keep the summary and send it when we're back online
    if (!/\((4\d\d)\)/.test(String((e && e.message) || "")) || /\((408|429)\)/.test(String((e && e.message) || ""))) queueSession(row);
  }
}

// Quiz answers and the help given around them, for the "what helped students recover" panel.
async function fetchCourseLearningEvents(courseId, accessToken) {
  return rowList(await supabaseRequest(
    `/learning_events?course_id=eq.${encodeURIComponent(courseId)}&event_type=in.(check_answer,adapt_applied,adapt_request,signal)&select=session_id,student_id,student_key,event_type,slide_index,created_at,payload&order=created_at.asc&limit=1000`,
    {},
    accessToken
  ));
}

async function fetchSessions(courseId, accessToken) {
  return rowList(await supabaseRequest(`/sessions?course_id=eq.${encodeURIComponent(courseId)}&select=*&order=ended_at.desc`, {}, accessToken));
}

// Hides (or restores) sessions on the lecturer's dashboard only. Server-side function checks course
// ownership; students keep their own history and learning analytics are untouched.
async function setSessionsCleared(courseId, ids, clear, accessToken) {
  return supabaseRequest("/rpc/lecturer_clear_sessions", { method: "POST", body: JSON.stringify({ p_course_id: courseId, p_session_ids: ids, p_clear: clear }) }, accessToken);
}

// A signed-in student's own session history — embeds the course's code/
// title/institution via PostgREST's foreign-table syntax so the history
// view doesn't need a second round trip per session to make sense of it.
async function fetchMySessions(studentId, accessToken) {
  return rowList(await supabaseRequest(
    `/sessions?student_id=eq.${encodeURIComponent(studentId)}&select=*,courses(code,title,institution)&order=ended_at.desc`,
    {},
    accessToken
  ));
}

// ---------------------------------------------------------------------------
// Account data controls (roadmap Phase 5): export + delete. Both run under the
// signed-in user's OWN token, so RLS guarantees they only ever touch their own
// rows. Deletion goes through the delete-account Edge Function because removing
// the auth user itself needs admin rights no browser key can hold. Foreign keys
// cascade, so deleting a lecturer also removes their courses, modules, flags and
// the session records attached to those courses (the UI says so before confirming).
// ---------------------------------------------------------------------------
async function exportMyData(session, kind) {
  const token = session.accessToken;
  const uid = encodeURIComponent(session.user.id);
  const out = {
    exportedAt: new Date().toISOString(),
    accountType: kind,
    account: { id: session.user.id, email: session.user.email },
  };
  if (kind === "lecturer") {
    const courses = await supabaseRequest(`/courses?owner_id=eq.${uid}&select=*`, {}, token);
    out.courses = courses;
    const ids = courses.map((c) => c.id);
    if (ids.length > 0) {
      const list = encodeURIComponent(`(${ids.map((i) => `"${i}"`).join(",")})`);
      out.modules = await supabaseRequest(`/modules?course_id=in.${list}&select=*`, {}, token);
      out.flagged_questions = await supabaseRequest(`/flagged_questions?course_id=in.${list}&select=*`, {}, token);
      out.sessions = await supabaseRequest(`/sessions?course_id=in.${list}&select=*`, {}, token);
    } else {
      out.modules = [];
      out.flagged_questions = [];
      out.sessions = [];
    }
  } else {
    out.sessions = await supabaseRequest(`/sessions?student_id=eq.${uid}&select=*,courses(code,title,institution)`, {}, token);
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `semai-my-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function deleteMyAccount(session) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || data.message || `Account deletion failed (${res.status}). Sign out, sign in again and retry.`);
  }
}

// ---------------------------------------------------------------------------
// AI backend — routes through the Supabase Edge Function proxy, which holds
// the real Gemini API key server-side (see supabase/functions/gemini-proxy).
// No direct-to-provider fallback here on purpose: an earlier version of this
// tried api.anthropic.com directly whenever AI_PROXY_URL was unset, which
// only ever worked inside the Claude.ai artifact preview (never in a real
// deployed browser tab) and silently produced "Failed to fetch" everywhere
// else. Failing loudly with a clear config error is much easier to debug
// than a network request that was doomed from the start.
// ---------------------------------------------------------------------------
const AI_PROXY_URL = "https://rodwpttdegrfwqioyoci.supabase.co/functions/v1/gemini-proxy";

// The full (non-lite) model — used only for the rare, high-value generation
// calls (curriculum authoring, post-lecture notes) where content richness
// matters more than the per-call cost/speed that the lite default optimizes
// for live, real-time lecture delivery.
const GEMINI_MODEL_STRONG = "gemini-3.5-flash";

// Every AI call is timed (duration only, never the text) so slow spots show up in data.
async function callAI(systemPrompt, userPrompt, maxTokens, model, kind = "ai") {
  const t0 = performance.now();
  // Writing a whole lecture or notes can legitimately take a while; a live answer should not.
  const meta = { timeoutMs: ["generate", "notes", "summary"].includes(kind) ? 150000 : 35000 };
  try {
    const text = await callAIRaw(systemPrompt, userPrompt, maxTokens, model, meta);
    logTiming(kind, { provider: meta.provider, model: meta.model || model || "default", ok: true, status: meta.status, client_ms: performance.now() - t0, server_ms: meta.serverMs, chars: text.length });
    return text;
  } catch (e) {
    logTiming(kind, { provider: meta.provider, model: model || "default", ok: false, status: meta.status || 0, client_ms: performance.now() - t0, server_ms: meta.serverMs });
    throw e;
  }
}

async function callAIRaw(systemPrompt, userPrompt, maxTokens, model, meta) {
  if (!AI_PROXY_URL) {
    throw new Error("AI_PROXY_URL isn't configured — deploy the Edge Function and set it near the top of App.jsx.");
  }
  let response;
  let data;
  try {
    ({ response, data } = await withTimeout(async (signal) => {
      const r = await fetch(AI_PROXY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // The proxy is a Supabase Edge Function, which requires a valid
          // project JWT to invoke — the anon key satisfies that.
          ...(SUPABASE_ANON_KEY ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY } : {}),
        },
        body: JSON.stringify({ system: systemPrompt, prompt: userPrompt, ...(maxTokens ? { maxTokens } : {}), ...(model ? { model } : {}) }),
        signal,
      });
      return { response: r, data: await r.json() };
    }, (meta && meta.timeoutMs) || 35000));
  } catch (e) {
    if (e && e.timeout) { meta.status = 0; e.message = "The AI took too long to answer."; }
    throw e;
  }
  return interpretAIJson(response, data, meta);
}

// The ordinary (non-streamed) reply: pick out the text, or raise the same friendly errors as ever.
function interpretAIJson(response, data, meta) {
  meta.status = response.status;
  meta.provider = data && data.provider;
  meta.model = data && data.model;
  meta.serverMs = data && data.serverMs;
  if (data && data.rateLimited) {
    const err = new Error("The AI is getting too many requests right now. Wait a minute, then try again.");
    err.rateLimited = true;
    throw err;
  }
  if ([500, 502, 503, 504].includes(response.status)) {
    // Google's AI service has short "high demand" spikes; say so plainly and mark it retryable.
    const err = new Error("The AI service is very busy right now (this is on Google's side, not your setup). Wait a minute and try again. Your text is still here.");
    err.busy = true;
    throw err;
  }
  if (response.status >= 400) {
    throw new Error((data && data.error) || `AI request failed (${response.status})`);
  }
  const text = (data.content || [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();
  return text || "";
}


// Same request, but the answer arrives in pieces so the lecturer can start speaking before it is finished.
// onText(textSoFar) is called as it grows. If the server answers normally (not as a stream), this behaves like
// callAIRaw. Resolves with the full text; a stream that breaks after some text returns what arrived.
async function callAIStream(systemPrompt, userPrompt, { onText, kind = "qa_stream" } = {}) {
  if (!AI_PROXY_URL) throw new Error("AI_PROXY_URL isn't configured — deploy the Edge Function and set it near the top of App.jsx.");
  const t0 = performance.now();
  const meta = {};
  let text = "";
  let firstMs = null;
  // A stalled connection must never freeze the lecturer: give up if nothing arrives for a while (20 s for the first
  // piece, 12 s between pieces) or if the whole answer takes over a minute. Anything that already arrived is still used.
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let idleTimer = null;
  const arm = (ms) => { clearTimeout(idleTimer); if (controller) idleTimer = setTimeout(() => controller.abort(), ms); };
  const hardTimer = controller ? setTimeout(() => controller.abort(), 60000) : null;
  try {
    arm(20000);
    const response = await fetch(AI_PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SUPABASE_ANON_KEY ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY } : {}),
      },
      body: JSON.stringify({ system: systemPrompt, prompt: userPrompt, stream: true }),
      ...(controller ? { signal: controller.signal } : {}),
    });
    const ct = (response.headers && typeof response.headers.get === "function" && response.headers.get("content-type")) || "";
    if (!/text\/event-stream/i.test(ct) || !response.body || typeof response.body.getReader !== "function") {
      const data = await response.json();
      meta.status = response.status; meta.provider = data && data.provider; meta.model = data && data.model; meta.serverMs = data && data.serverMs;
      text = interpretAIJson(response, data, meta);
      return text;
    }
    meta.status = response.status;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = createSSEParser();
    let failed = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm(12000);
      for (const ev of parser.push(decoder.decode(value, { stream: true }))) {
        if (typeof ev.t === "string") {
          text += ev.t;
          if (firstMs === null) firstMs = performance.now() - t0;
          if (onText) { try { onText(text); } catch (e) { /* a display problem must not break the answer */ } }
        } else if (ev.done) { meta.provider = ev.provider; meta.model = ev.model; meta.serverMs = ev.serverMs; }
        else if (ev.error) failed = true;
      }
    }
    if (!text.trim()) {
      const err = new Error(failed ? "The AI service is very busy right now." : "The AI sent an empty answer.");
      err.busy = true;
      throw err;
    }
    return text.trim();
  } catch (e) {
    if (text.trim()) return text.trim(); // some of the answer arrived: use it
    logTiming(kind, { provider: meta.provider, ok: false, status: meta.status || 0, client_ms: performance.now() - t0 });
    if (e && e.name === "AbortError") { const err = new Error("The AI took too long to answer."); err.timeout = true; throw err; }
    throw e;
  } finally {
    clearTimeout(idleTimer);
    clearTimeout(hardTimer);
    if (text.trim()) logTiming(kind, { provider: meta.provider, model: meta.model, ok: true, status: meta.status, client_ms: performance.now() - t0, first_chunk_ms: firstMs, server_ms: meta.serverMs, chars: text.length });
  }
}

// ---------------------------------------------------------------------------
// Post-lecture notes — expanded written explanations for each slide,
// generated once autopilot finishes teaching. One AI call per slide rather
// than one big call for the whole lecture: each response stays small and
// predictable (won't get silently truncated mid-JSON the way one giant
// combined request could), and if a single slide's call fails or hits a
// free-tier rate limit, the rest still succeed instead of losing everything.
// ---------------------------------------------------------------------------
async function generateLectureNotes(curriculum, onProgress, upToCount) {
  const sections = [];
  // Only the slides the student actually reached — notes cover what they attended.
  const count = Math.max(1, Math.min(upToCount || curriculum.slides.length, curriculum.slides.length));
  const withRetry = async (system, prompt, maxTokens, label) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await callAI(system, prompt, maxTokens, GEMINI_MODEL_STRONG, "notes");
      } catch (e) {
        // free-tier limits are per minute: wait and retry instead of losing this section
        if (!(e.rateLimited || e.busy) || attempt === 2) throw e;
        onProgress && onProgress(`The AI is busy — retrying "${label}" in a few seconds…`);
        await new Promise((r) => setTimeout(r, attempt === 0 ? 5000 : 12000));
      }
    }
    throw new Error("empty response");
  };
  for (let i = 0; i < count; i++) {
    const slide = curriculum.slides[i];
    onProgress && onProgress(`Organising notes for "${slide.title}" (${i + 1}/${count})…`);
    // Structured JSON (summary, key points, explanation, terms, pitfalls, review). Not fed
    // slide.notes (spoken narration) so the result reads as study notes, not a transcript.
    let notes = null;
    try {
      const raw = await withRetry(SECTION_SYSTEM(curriculum), sectionPrompt(slide, slideToPlainContext(slide)), 1800, slide.title);
      notes = normalizeSectionNotes(raw);
    } catch (e) { /* fall through to notes built from the slide */ }
    if (!notes) notes = fallbackSectionNotes(slide);
    sections.push({ title: slide.title, notes, explanation: notes.explanation.join("\n\n"), code: slide.hasCode ? slide.code : null, slide });
  }
  onProgress && onProgress("Writing the module overview and summary…");
  let moduleNotes = null;
  try {
    moduleNotes = normalizeModuleNotes(await withRetry(MODULE_SYSTEM(curriculum), modulePrompt(curriculum, sections), 1200, "module summary"));
  } catch (e) { /* use fallback */ }
  const fb = fallbackModuleNotes(curriculum, sections);
  sections.module = moduleNotes ? { ...fb, ...Object.fromEntries(Object.entries(moduleNotes).filter(([, v]) => v && (!Array.isArray(v) || v.length))) } : fb;
  return sections;
}

// Deliberately on the default (lite) model, unlike curriculum/notes
// generation — this runs once per completed STUDENT session, not once per
// module a lecturer authors, so volume scales with class size rather than
// lecturer actions. A 30-student lecture means 30 of these; using the
// stronger model here would meaningfully increase both cost and exposure
// to free-tier rate limits for no real accuracy benefit on a short summary.
async function generateSessionSummary(curriculum, messages) {
  if (!messages || messages.length === 0) return "";
  const transcript = messages.map((m) => `${m.speaker === "lecturer" ? "Lecturer" : "Student"}: ${m.text}`).join("\n");
  const system = `You are summarizing a completed AI-led lecture session for the instructor who owns this course, to skim on a dashboard. Write 2-4 concise sentences covering: what was taught, what the student asked about (if anything), and anything notable (e.g. the AI was uncertain about something and flagged it). Plain prose, no markdown, written for a busy instructor, not the student.`;
  const prompt = `Course: ${curriculum.code} — ${curriculum.unit}. Full session transcript:\n${transcript.slice(0, 6000)}`;
  try {
    return await callAI(system, prompt, 300, undefined, "summary");
  } catch (e) {
    return "";
  }
}

async function downloadLectureNotesPdf(curriculum, sections) {
  const doc = await buildLectureNotesPdf(curriculum, sections, sections.module);
  const safeName = `${curriculum.code}-${curriculum.unit}`.replace(/[^a-z0-9\-_. ]/gi, "").replace(/\s+/g, "_");
  doc.save(`${safeName}-notes.pdf`);
}

// Very small Java syntax highlighter — good enough for a skeleton IDE pane.
// Splits spoken text into sentence-sized chunks so an explanation can be
// interrupted and later RESUMED at sentence granularity, instead of either
// losing the rest of the explanation or having to guess a mid-utterance cut
// point (browser TTS and audio playback don't expose reliable enough
// position tracking for that). Deliberately simple: only splits where
// punctuation is followed by whitespace and then a capital letter/digit/
// quote — this avoids false splits on decimals, initials, and dotted code
// identifiers like "System.out.println" (none of which are followed by a
// new capitalized word), at the minor cost of occasionally under-splitting
// a sentence that starts with a lowercase word. Good enough for
// interruption/TTS chunking; not meant to be grammatically perfect.
// Slides that carry their own scripted delivery (worked examples and code
// walkthroughs) are taught unit by unit: each spoken unit reveals a step or
// highlights code lines. Returns null for ordinary slides.
function buildStructuredUnits(s) {
  if (s.type === "worked_example" && s.steps && s.steps.length) {
    const units = [{ say: s.problemSay || "Let's work through this problem step by step.", reveal: 0 }];
    s.steps.forEach((st, i) => units.push({ say: st.say || st.label || `Step ${i + 1}.`, reveal: i + 1 }));
    if (s.finalAnswer) units.push({ say: s.finalSay || "And that gives us our answer.", reveal: s.steps.length + 1 });
    return units;
  }
  if (s.hasCode && s.codeSteps && s.codeSteps.length) {
    const units = [];
    if (s.introSay) units.push({ say: s.introSay, lines: null });
    s.codeSteps.forEach((c) => units.push({ say: c.say, lines: c.lines }));
    return units;
  }
  return null;
}

function splitIntoSentences(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return [text || ""];
  const parts = trimmed.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/);
  const sentences = parts.map((s) => s.trim()).filter(Boolean);
  return sentences.length > 0 ? sentences : [trimmed];
}

function highlightJava(code) {
  const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const KEYWORDS = /\b(public|private|protected|class|static|void|main|String|new|return|if|else|for|while|int|double|boolean|import|package)\b/g;
  return escaped
    .replace(/(\/\/.*)/g, '<span class="tok-comment">$1</span>')
    .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="tok-string">$1</span>')
    .replace(KEYWORDS, '<span class="tok-keyword">$1</span>');
}

// ---------------------------------------------------------------------------
// INGESTION — turn an uploaded file into an ordered list of raw text "units"
// (one per slide or page). This is the part that was entirely missing
// before: a real path from "lecturer's own file" to structured content.
//
// .pptx and .pdf parsing below are implemented with zero external
// dependencies (no jszip, no pdfjs-dist) — just native browser APIs
// (DataView, DecompressionStream, DOMParser, TextDecoder) — so this file
// has no npm install step and works inside sandboxed artifact previews
// that only allow a fixed set of libraries.
// ---------------------------------------------------------------------------

// .pptx is a zip file. Rather than pull in a zip library, we read the
// central directory ourselves (it's a small, simple binary format) and
// decompress each entry we need with the native Compression Streams API.
async function readZipEntries(bytes, filterFn) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  const searchStart = Math.max(0, bytes.length - 22 - 65536);
  for (let i = bytes.length - 22; i >= searchStart; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Not a valid .pptx file (couldn't find its zip directory) — is it corrupted or actually a different format?");
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  const results = {};
  let ptr = cdOffset;
  const CFH_SIG = 0x02014b50;
  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(ptr, true) !== CFH_SIG) break;
    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);
    const name = new TextDecoder().decode(bytes.slice(ptr + 46, ptr + 46 + nameLen));

    if (filterFn(name)) {
      const lfNameLen = view.getUint16(localHeaderOffset + 26, true);
      const lfExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + lfNameLen + lfExtraLen;
      results[name] = { compressionMethod, data: bytes.slice(dataStart, dataStart + compressedSize) };
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return results;
}

async function inflateZipEntry(entry) {
  if (entry.compressionMethod === 0) return entry.data; // stored, no compression
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([entry.data]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function extractPptxUnits(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = await readZipEntries(bytes, (name) =>
    /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/.test(name)
  );

  const slideNums = Object.keys(entries)
    .map((name) => name.match(/^ppt\/slides\/slide(\d+)\.xml$/))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10))
    .sort((a, b) => a - b);

  if (slideNums.length === 0) {
    throw new Error("Couldn't find any slides in that .pptx — is the file corrupted or password-protected?");
  }

  const parser = new DOMParser();
  const readTextRuns = async (path) => {
    const entry = entries[path];
    if (!entry) return "";
    const xmlBytes = await inflateZipEntry(entry);
    const xml = new TextDecoder().decode(xmlBytes);
    const doc = parser.parseFromString(xml, "application/xml");
    return Array.from(doc.getElementsByTagName("a:t"))
      .map((n) => n.textContent)
      .join("\n")
      .trim();
  };

  const units = [];
  for (const n of slideNums) {
    const slideText = await readTextRuns(`ppt/slides/slide${n}.xml`);
    // Speaker notes are gold here — they're often literally what the
    // lecturer intends to say, which beats us guessing from bullets alone.
    const notesText = await readTextRuns(`ppt/notesSlides/notesSlide${n}.xml`);
    const combined = [
      slideText && `[Slide ${n} content]\n${slideText}`,
      notesText && `[Speaker notes for slide ${n}]\n${notesText}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    if (combined.trim()) units.push(combined);
  }

  if (units.length === 0) {
    throw new Error("That .pptx has slides but no readable text — image-only slides aren't supported yet.");
  }
  return units;
}

async function inflateZlib(bytes) {
  const ds = new DecompressionStream("deflate");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Byte-sequence search (ASCII needle) — deliberately NOT done via string
// decode/re-encode. TextDecoder("latin1") is actually windows-1252 per the
// WHATWG spec, which remaps several high bytes to different Unicode
// codepoints. Position alignment survives that (still 1 byte in -> 1 char
// out), but VALUE does not — so any code that tried to reconstruct raw
// bytes from decoded characters would silently corrupt binary stream data.
// We sidestep the issue entirely by searching raw bytes directly and only
// decoding to string for content we intend to read, never to rebuild.
function indexOfBytes(haystack, needleStr, fromIndex = 0) {
  const n = needleStr.length;
  const end = haystack.length - n;
  outer: for (let i = Math.max(0, fromIndex); i <= end; i++) {
    for (let j = 0; j < n; j++) {
      if (haystack[i + j] !== needleStr.charCodeAt(j)) continue outer;
    }
    return i;
  }
  return -1;
}

function hexToUnicodeString(hex) {
  let s = "";
  for (let i = 0; i < hex.length; i += 4) {
    const codeUnit = parseInt(hex.slice(i, i + 4), 16);
    if (!isNaN(codeUnit)) s += String.fromCharCode(codeUnit);
  }
  return s;
}

function parseCMapStream(text) {
  const map = new Map();
  const bfcharRe = /beginbfchar([\s\S]*?)endbfchar/g;
  let m;
  while ((m = bfcharRe.exec(text)) !== null) {
    const pairRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let p;
    while ((p = pairRe.exec(m[1])) !== null) map.set(p[1].toUpperCase().padStart(4, "0"), hexToUnicodeString(p[2]));
  }
  const bfrangeRe = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = bfrangeRe.exec(text)) !== null) {
    const simpleRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let p;
    while ((p = simpleRe.exec(m[1])) !== null) {
      const start = parseInt(p[1], 16), end = parseInt(p[2], 16), dstStart = parseInt(p[3], 16);
      const codeLen = p[1].length;
      for (let c = start; c <= end && c - start < 65536; c++) {
        const code = c.toString(16).toUpperCase().padStart(codeLen, "0").padStart(4, "0");
        const dst = (dstStart + (c - start)).toString(16).toUpperCase().padStart(p[3].length, "0");
        map.set(code, hexToUnicodeString(dst));
      }
    }
  }
  return map;
}

// Merges every /ToUnicode CMap found in the document into one lookup table.
// Deliberate simplification: correctly scoping each CMap to the specific
// font that uses it requires resolving the page/resource/font object graph,
// which this lightweight parser doesn't do. With multiple embedded fonts
// whose glyph codes overlap (common — subset fonts often number from 1),
// this can occasionally misattribute a character. Good enough to recover
// real words from most single/few-font slide decks; not a substitute for a
// real PDF text layer.
async function buildGlobalCMap(bytes) {
  const map = new Map();
  let searchFrom = 0;
  while (true) {
    const idx = indexOfBytes(bytes, "/ToUnicode", searchFrom);
    if (idx === -1) break;
    const tail = new TextDecoder("latin1").decode(bytes.slice(idx + 10, idx + 40));
    const refMatch = tail.match(/^\s*(\d+)\s+\d+\s+R/);
    if (refMatch) {
      const objIdx = indexOfBytes(bytes, `${refMatch[1]} 0 obj`, 0);
      if (objIdx !== -1) {
        const streamIdx = indexOfBytes(bytes, "stream", objIdx);
        const endObjIdx = indexOfBytes(bytes, "endobj", objIdx);
        if (streamIdx !== -1 && (endObjIdx === -1 || streamIdx < endObjIdx)) {
          let dataStart = streamIdx + 6;
          if (bytes[dataStart] === 13) dataStart++;
          if (bytes[dataStart] === 10) dataStart++;
          const endIdx = indexOfBytes(bytes, "endstream", dataStart);
          if (endIdx !== -1) {
            let dataEnd = endIdx;
            while (dataEnd > dataStart && (bytes[dataEnd - 1] === 10 || bytes[dataEnd - 1] === 13)) dataEnd--;
            let decoded;
            try {
              decoded = await inflateZlib(bytes.slice(dataStart, dataEnd));
            } catch {
              decoded = bytes.slice(dataStart, dataEnd);
            }
            const text = new TextDecoder("latin1").decode(decoded);
            for (const [k, v] of parseCMapStream(text)) if (!map.has(k)) map.set(k, v);
          }
        }
      }
    }
    searchFrom = idx + 10;
  }
  return map;
}

function decodeHexGlyphs(hex, cmap) {
  if (!cmap || cmap.size === 0) {
    let s = "";
    for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) || 0);
    return s;
  }
  const countHits = (width) => {
    let hits = 0;
    for (let i = 0; i + width <= hex.length; i += width) if (cmap.has(hex.slice(i, i + width).toUpperCase().padStart(4, "0"))) hits++;
    return hits;
  };
  const width = countHits(4) >= countHits(2) ? 4 : 2;
  let s = "";
  for (let i = 0; i < hex.length; i += width) {
    s += cmap.get(hex.slice(i, i + width).toUpperCase().padStart(4, "0")) || "";
  }
  return s;
}

function unescapePdfString(s) {
  return s
    .replace(/\\n/g, "\n").replace(/\\r/g, "").replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\\/g, "\\");
}

function extractShownStrings(contentStr, cmap) {
  const out = [];
  const literalRe = /\(((?:\\.|[^()\\])*)\)\s*(Tj|'|")/g;
  let m;
  while ((m = literalRe.exec(contentStr)) !== null) out.push(unescapePdfString(m[1]));

  const hexTjRe = /<([0-9A-Fa-f]+)>\s*(Tj|'|")/g;
  while ((m = hexTjRe.exec(contentStr)) !== null) out.push(decodeHexGlyphs(m[1], cmap));

  const arrayRe = /\[((?:[^\[\]])*)\]\s*TJ/g;
  while ((m = arrayRe.exec(contentStr)) !== null) {
    const partRe = /\(((?:\\.|[^()\\])*)\)|<([0-9A-Fa-f]+)>/g;
    let p, piece = "";
    while ((p = partRe.exec(m[1])) !== null) {
      if (p[1] !== undefined) piece += unescapePdfString(p[1]);
      else if (p[2] !== undefined) piece += decodeHexGlyphs(p[2], cmap);
    }
    if (piece) out.push(piece);
  }
  return out.join(" ");
}

// Drops streams our regex parser misidentified as text — most often a raw
// embedded font program whose bytes happened to coincidentally match a
// Tj/TJ pattern.
function looksLikeText(s) {
  if (!s || s.trim().length < 3) return false;
  const readable = (s.match(/[A-Za-z0-9 .,!?;:()'"\-]/g) || []).length;
  return readable / s.length > 0.6;
}

async function extractPdfUnits(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const cmap = await buildGlobalCMap(bytes);
  const units = [];
  let searchFrom = 0;

  while (true) {
    const streamIdx = indexOfBytes(bytes, "stream", searchFrom);
    if (streamIdx === -1) break;
    let dataStart = streamIdx + 6;
    if (bytes[dataStart] === 13) dataStart++;
    if (bytes[dataStart] === 10) dataStart++;

    const endIdx = indexOfBytes(bytes, "endstream", dataStart);
    if (endIdx === -1) break;
    let dataEnd = endIdx;
    while (dataEnd > dataStart && (bytes[dataEnd - 1] === 10 || bytes[dataEnd - 1] === 13)) dataEnd--;

    const rawBytes = bytes.slice(dataStart, dataEnd);
    let decoded;
    try {
      decoded = await inflateZlib(rawBytes);
    } catch {
      decoded = rawBytes; // not flate-compressed, or a binary (image/font) stream we can't use anyway
    }
    const contentStr = new TextDecoder("latin1").decode(decoded);
    const text = extractShownStrings(contentStr, cmap);
    if (looksLikeText(text)) units.push(text.trim());

    searchFrom = endIdx + 9;
  }

  if (units.length === 0) {
    throw new Error("Couldn't extract readable text from this PDF — it may be scanned images or use an encoding this lightweight parser can't handle. Try pasting the outline as text, or upload the original .pptx if you have it.");
  }
  return units;
}

async function extractRawUnits(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pptx")) return extractPptxUnits(file);
  if (name.endsWith(".pdf")) return extractPdfUnits(file);
  if (name.endsWith(".txt") || name.endsWith(".md")) {
    const text = await file.text();
    const units = text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    return units.length ? units : [text.trim()];
  }
  if (name.endsWith(".ppt") || name.endsWith(".doc")) {
    throw new Error("Old .ppt/.doc formats aren't supported — please save as .pptx, .pdf, or plain text.");
  }
  throw new Error("Unsupported file type — upload a .pptx, .pdf, .txt, or .md file, or paste your outline instead.");
}

// ---------------------------------------------------------------------------
// AI curriculum structuring — raw units + lecturer settings -> the
// {code, title, unit, slides[]} shape the lecture room actually runs on.
// ---------------------------------------------------------------------------
function buildCurriculumSystemPrompt(settings, estimatedWordBudget) {
  const tone = TONE_OPTIONS.find((t) => t.id === settings.tone) || TONE_OPTIONS[0];
  const duration = Number(settings.durationMinutes) || 45;
  // Rough floor/ceiling so the AI errs toward a genuinely thorough deck
  // instead of compressing a whole session into a handful of slides —
  // an earlier version left slide count entirely open-ended and the
  // result was consistently too sparse.
  const minSlides = Math.max(5, Math.round(duration / 6));
  const maxSlides = Math.max(9, Math.round(duration / 3));
  return `You are an expert instructional designer building a genuinely thorough, professional slide deck — the kind a real university lecturer would prepare, not a quick summary. You convert raw lecture material (slide text, speaker notes, or an outline) into structured JSON for an AI that will deliver a LIVE, SPOKEN lecture from it.

Return ONLY valid JSON. No markdown code fences, no commentary before or after.

Schema:
{
  "code": string,        // course code, e.g. "TDIT 214" — infer from context if not given
  "title": string,       // course title
  "unit": string,        // this specific session/unit title
  "slides": [
    {
      "title": string,
      "bullets": string[],      // 5-8 substantive bullets, what appears on screen
      "detail": string,         // a short paragraph (3-5 sentences) of on-screen supporting text, shown below the bullets — formal written prose expanding on the topic, NOT a repeat of the bullets in sentence form
      "notes": string,          // INSTRUCTIONS to the AI lecturer for how to narrate this slide out loud (not the narration itself) — what to cover, in what order, specific examples or common misconceptions to mention. Written as guidance, e.g. "Explain X, then contrast it with Y using a short example — many students confuse this with Z, so address that directly."
      "hasCode": boolean,
      "code": string | null     // only if hasCode is true — a clean, correct, well-commented runnable code example
    }
  ]
}

Rules:
- Build a genuinely thorough deck: for a ${duration}-minute session, that's typically around ${minSlides}-${maxSlides} slides. Err toward more, focused slides rather than compressing everything into a few dense ones — split one source topic into several slides (e.g. "definition", "how it works", "worked example") when that gives students a clearer, more complete picture. Don't force a rigid 1-to-1 mapping with the source material either way — split dense source units, merge sparse ones, but the FINAL slide count should reflect real depth, not just how the source happened to be chunked.
- Never settle for the low end of any range given here — treat these as minimums to clear comfortably, not targets. A slide with only 3-4 short bullets and no detail paragraph is a FAILURE case for this task, regardless of how sparse the source material was — if the source is thin, use your own subject-matter knowledge to add genuinely correct, relevant depth (background, context, a standard example) rather than leaving a slide sparse.
- Each slide's "bullets" must be genuinely informative, not telegraphic fragments — write real, complete points (a full sentence or a rich phrase each, roughly 10-20 words), specific enough that a student could understand the core idea from the bullets alone, without hearing the lecture.
- Every slide's "detail" paragraph must add real substance beyond the bullets — background, elaboration, a concrete example, or context for why the concept matters. Do not just reword the bullets into sentences.
- The "notes" field should give the lecturer enough to deliver a full, well-developed explanation — specific examples, common misconceptions worth addressing, or points of emphasis, not just "explain X."
- Every "notes" field must explicitly tell the lecturer to keep the spoken explanation to about ${estimatedWordBudget} words — adjust proportionally if your final slide count differs noticeably from the source unit count.
- The lecturer's tone should be ${tone.desc}.
- If a slide teaches a code example, set hasCode true, put the exact code in "code", and have "notes" instruct the lecturer to narrate it roughly top-to-bottom as if typing it live.
${settings.allowLiveCode ? "" : "- Do not create any code slides (hasCode must be false everywhere) — this lecturer has turned off live code demos.\n"}- If course code / title / unit were provided below, use them as given rather than inventing new ones.`;
}

// Parses the {confidence, answer} JSON the Q&A prompt asks for. If the
// model doesn't follow the format (happens occasionally, especially on
// smaller/faster models), the raw text is treated as the answer itself
// rather than losing the response entirely — confidence just defaults to
// "high" in that case, since we have no signal either way.
function parseAnswerJSON(raw, fallbackAnswer) {
  if (!raw) return { confidence: "high", answer: fallbackAnswer };
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const data = JSON.parse(cleaned);
    if (data && typeof data.answer === "string" && data.answer.trim()) {
      return { confidence: data.confidence === "low" ? "low" : "high", answer: data.answer.trim() };
    }
  } catch (e) {
    /* not valid JSON — fall through to treating it as plain answer text */
  }
  return { confidence: "high", answer: cleaned || fallbackAnswer };
}

function parseCurriculumJSON(raw) {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    throw new Error("The AI's response wasn't valid JSON — try generating again.");
  }
  if (!data || !Array.isArray(data.slides) || data.slides.length === 0) {
    throw new Error("Generated curriculum has no slides — try again, or paste more detailed source material.");
  }
  return {
    code: data.code || "COURSE 000",
    title: data.title || "Untitled Course",
    unit: data.unit || "Session",
    slides: data.slides.map((s, i) => ({
      title: s.title || `Slide ${i + 1}`,
      bullets: Array.isArray(s.bullets) ? s.bullets.filter(Boolean) : [],
      detail: s.detail || "",
      notes: s.notes || "",
      hasCode: !!(s.hasCode && s.code),
      code: s.hasCode ? (s.code || "") : undefined,
    })),
  };
}

async function generateCurriculum(rawUnits, settings, onProgress) {
  const tone = TONE_OPTIONS.find((t) => t.id === settings.tone) || TONE_OPTIONS[0];
  try {
    const deck = await generateDeck({
      rawUnits,
      settings,
      toneDesc: tone.desc,
      allowLiveCode: !!settings.allowLiveCode,
      callAI: (sys, pr, mt, md) => callAI(sys, pr, mt, md, "generate"),
      model: GEMINI_MODEL_STRONG,
      computeWordBudget,
      onProgress,
    });
    const failed = deck.slides.filter((sl) => (sl.warnings || []).some((w) => /couldn't write this slide/.test(w))).length;
    if (failed > deck.slides.length / 2) throw new Error("most slides failed");
    return deck;
  } catch (e) {
    onProgress && onProgress("Using the standard generator…");
    let legacy;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        legacy = await legacyGenerateCurriculum(rawUnits, settings);
        break;
      } catch (err) {
        // a busy AI service usually recovers within a minute: wait and retry before giving up
        if (!(err.busy || err.rateLimited) || attempt === 2) throw err;
        onProgress && onProgress("The AI is busy — trying again in a few seconds…");
        await new Promise((r) => setTimeout(r, attempt === 0 ? 8000 : 20000));
      }
    }
    return { ...legacy, slides: legacy.slides.map((sl, i) => normalizeSlide(sl, i)) };
  }
}

async function legacyGenerateCurriculum(rawUnits, settings) {
  const estimatedBudget = computeWordBudget(settings.durationMinutes, Math.max(1, rawUnits.length), settings.pace);
  const system = buildCurriculumSystemPrompt(settings, estimatedBudget);
  const user = `Course code: ${settings.courseCode || "(infer from content)"}
Course title: ${settings.courseTitle || "(infer from content)"}
Session / unit title: ${settings.unitTitle || "(infer from content)"}
Target total lecture length: ${settings.durationMinutes} minutes.

Source material, in order:

${rawUnits.map((u, i) => `--- Unit ${i + 1} ---\n${u}`).join("\n\n")}`;
  // Full (non-lite) model: curriculum authoring happens once per module,
  // not per lecture turn, so the extra cost is trivial — and this is
  // exactly the kind of "follow an elaborate content-richness instruction"
  // task where the lite-tier model was under-shooting even explicit asks
  // for more detail.
  const raw = await callAI(system, user, 16000, GEMINI_MODEL_STRONG, "generate");
  if (!raw) throw new Error("No response from the AI — check your connection and try again.");
  return parseCurriculumJSON(raw);
}

// ---------------------------------------------------------------------------
// Role select
// ---------------------------------------------------------------------------
function RoleSelectScreen({ onSelectRole, onOpenLegal }) {
  return (
    <div className="join-screen">
      <div className="join-card">
        <div className="join-eyebrow">SEMAI</div>
        <h1 className="join-title">Who's joining?</h1>
        <p className="join-sub">Lecturers build the session. Students attend it.</p>
        <button className="join-btn" onClick={() => onSelectRole("lecturer")}>
          <GraduationCap size={16} /> I'm the lecturer — build a session
        </button>
        <button className="join-btn secondary" onClick={() => onSelectRole("student")}>
          <Users size={16} /> I'm a student — join a session
        </button>
        <LegalLinks onOpen={onOpenLegal} />
        <VersionTag style={{ marginTop: 6 }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lecturer authentication — email/password via Supabase Auth REST calls.
// This is what makes "owner_id = auth.uid()" in the RLS policies mean
// anything: without a real signed-in user, there's no identity for the
// database to scope writes to.
// ---------------------------------------------------------------------------
function AuthScreen({ onAuthenticated, onBack, onOpenLegal, role = "lecturer" }) {
  const [mode, setMode] = useState("signin"); // signin | signup | forgot
  const [identifier, setIdentifier] = useState(""); // sign-in / forgot: username (or an older account's email)
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [usernameState, setUsernameState] = useState(""); // "", checking, free, taken
  const [recovery, setRecovery] = useState(""); // forgot: the recovery code
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [codeScreen, setCodeScreen] = useState(null); // { code, username, session, reason }
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const signup = mode === "signup";

  // Suggest a username from the name until the person types their own.
  useEffect(() => {
    if (signup && !usernameTouched) setUsername(suggestUsername(fullName));
  }, [fullName, signup, usernameTouched]);
  // Check the username is free (after a short pause while typing).
  useEffect(() => {
    if (!signup) return undefined;
    const u = normalizeUsername(username);
    if (usernameError(u)) { setUsernameState(""); return undefined; }
    setUsernameState("checking");
    let cancelled = false;
    const t = setTimeout(() => {
      checkUsernameAvailable(u).then((free) => { if (!cancelled) setUsernameState(free === null ? "" : free ? "free" : "taken"); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [username, signup]);

  const switchMode = (m) => { setMode(m); setError(""); setInfo(""); setPassword(""); };

  const submit = async () => {
    setError(""); setInfo("");
    if (mode === "signin") {
      if (!identifier.trim() || !password) { setError("Enter your username and password."); return; }
      setBusy(true);
      try {
        // Older accounts signed up with a real email and still sign in with it.
        const session = looksLikeEmail(identifier)
          ? await signInUser(identifier.trim(), password)
          : toSession((await accountRequest("signin", { username: normalizeUsername(identifier), password })).session);
        onAuthenticated(session);
      } catch (e) {
        setError(friendlyAccountError(e.message, e.status));
        setBusy(false);
      }
      return;
    }
    if (mode === "signup") {
      const problem = fullNameError(fullName) || usernameError(username) || passwordError(password);
      if (problem) { setError(problem); return; }
      if (usernameState === "taken") { setError("That username is taken. Try another."); return; }
      setBusy(true);
      try {
        const r = await accountRequest("signup", { fullName: cleanFullName(fullName), username: normalizeUsername(username), password, role });
        setCodeScreen({ code: r.recoveryCode, username: r.username, session: r.session ? toSession(r.session) : null, reason: "signup" });
      } catch (e) {
        setError(friendlyAccountError(e.message, e.status));
      }
      setBusy(false);
      return;
    }
    // forgot password
    if (!identifier.trim() || !recoveryCodeLooksValid(recovery)) { setError("Enter your username and your 20-character recovery code."); return; }
    const pw = passwordError(password);
    if (pw) { setError(pw); return; }
    setBusy(true);
    try {
      const r = await accountRequest("reset", { username: normalizeUsername(identifier), recoveryCode: recovery, newPassword: password });
      setCodeScreen({ code: r.recoveryCode, username: normalizeUsername(identifier), session: null, reason: "reset" });
    } catch (e) {
      setError(friendlyAccountError(e.message, e.status));
    }
    setBusy(false);
  };

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(codeScreen.code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) { /* clipboard unavailable */ }
  };
  const downloadCode = () => {
    try {
      const url = URL.createObjectURL(new Blob([recoveryCodeFile(codeScreen.username, codeScreen.code)], { type: "text/plain" }));
      const a = document.createElement("a");
      a.href = url; a.download = `semai-recovery-code-${codeScreen.username}.txt`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { /* download unavailable */ }
  };
  const finishCode = () => {
    const cs = codeScreen;
    setCodeScreen(null); setSaved(false);
    if (cs.session) { onAuthenticated(cs.session); return; }
    setIdentifier(cs.username); setPassword("");
    setMode("signin");
    setInfo(cs.reason === "reset" ? "Password changed. Sign in with your new password." : "Account created. Sign in with your username and password.");
  };

  const title = codeScreen ? (codeScreen.reason === "reset" ? "Password changed" : "Save your recovery code") : mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Sign in";
  const sub = codeScreen
    ? "This is the only way to reset your password if you forget it, because accounts don't use an email."
    : role === "lecturer"
    ? mode === "signup" ? "Choose a username. Your courses stay uniquely yours, and nobody else can edit them." : mode === "forgot" ? "Use the recovery code you saved when you created your account." : "Sign in with your username to see and manage your courses."
    : mode === "signup" ? "Choose a username so your learning history follows you across sessions." : mode === "forgot" ? "Use the recovery code you saved when you created your account." : "Sign in with your username to see your session history.";

  return (
    <div className="join-screen">
      <div className="join-card">
        <div className="join-eyebrow">SEMAI · {role === "lecturer" ? "Lecturer" : "Student"}</div>
        <h1 className="join-title">{title}</h1>
        <p className="join-sub">{sub}</p>

        {codeScreen ? (
          <div>
            <div role="status" aria-label="Recovery code" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 20, letterSpacing: 1.5, padding: "14px 12px", margin: "0 0 12px", background: "#1A1F27", border: "1px solid #2F6F4F", borderRadius: 10, wordBreak: "break-all", userSelect: "all" }}>{codeScreen.code}</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="nav-btn" onClick={copyCode}>{copied ? "Copied" : "Copy"}</button>
              <button className="nav-btn" onClick={downloadCode}>Download as a file</button>
            </div>
            <p className="join-hint" style={{ textAlign: "left" }}>
              Your username is <strong>{codeScreen.username}</strong>. Screenshot or save this code now: it is shown only once. Anyone who has it can reset your password, so keep it private.
            </p>
            <label className="consent-row">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
              <span>I have saved my recovery code.</span>
            </label>
            <button className="join-btn" disabled={!saved} onClick={finishCode}>Continue</button>
          </div>
        ) : (
          <>
            {info && <div className="db-status ok" role="status" style={{ display: "block", textAlign: "left" }}>{info}</div>}

            {signup && (
              <>
                <input className="join-input" placeholder={role === "lecturer" ? "Your full name" : "Your full name (as on your student record)"} aria-label="Full name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                <input className="join-input" placeholder="Choose a username" aria-label="Username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => { setUsernameTouched(true); setUsername(e.target.value); }} />
                <div role="status" style={{ fontSize: 12, margin: "-4px 0 8px", textAlign: "left", color: usernameState === "taken" ? "#FFB4A6" : usernameState === "free" ? "#BFEAD3" : "#8890A0" }}>
                  {usernameState === "checking" ? "Checking…" : usernameState === "free" ? `@${normalizeUsername(username)} is available` : usernameState === "taken" ? "That username is taken" : usernameError(username) && username ? usernameError(username) : "You'll sign in with this username. Use your real name so people know who you are."}
                </div>
              </>
            )}
            {!signup && (
              <input className="join-input" placeholder={mode === "signin" ? "Username" : "Your username"} aria-label="Username or email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            )}
            {mode === "forgot" && (
              <input className="join-input" placeholder="Recovery code (XXXXX-XXXXX-XXXXX-XXXXX)" aria-label="Recovery code" autoCapitalize="characters" spellCheck={false} value={recovery} onChange={(e) => setRecovery(e.target.value)} />
            )}
            <input
              className="join-input"
              type="password"
              placeholder={mode === "forgot" ? "New password (8+ characters)" : signup ? "Password (8+ characters)" : "Password"}
              aria-label={mode === "forgot" ? "New password" : "Password"}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            {error && <div className="setup-error" style={{ justifyContent: "center" }}><AlertTriangle size={13} /> {error}</div>}
            <button className="join-btn" disabled={busy} onClick={submit}>
              {busy ? <Loader2 className="spin" size={14} /> : null} {signup ? "Create account" : mode === "forgot" ? "Set new password" : "Sign in"}
            </button>
            {signup && <div style={{ fontSize: 12, color: "#8890A0", marginTop: 10 }}>No email needed. You'll get a recovery code in the next step. By creating an account you agree to the Terms of Service and Privacy Policy.</div>}
            {onOpenLegal && <LegalLinks onOpen={onOpenLegal} />}
          </>
        )}

        {!codeScreen && (
          <>
            {mode === "signin" && <button className="skip-link" onClick={() => switchMode("forgot")}>Forgot your password?</button>}
            <button className="skip-link" onClick={() => switchMode(signup || mode === "forgot" ? "signin" : "signup")}>
              {signup || mode === "forgot" ? "Already have an account? Sign in" : "New here? Create an account"}
            </button>
            <button className="skip-link" onClick={onBack}>← Back to role select</button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lecturer setup — ingestion + tuning. This is the new core of the workflow.
// ---------------------------------------------------------------------------
function CourseMetaScreen({ draft, editing, onChange, onContinue, onCancel }) {
  return (
    <div className="setup-screen">
      <div className="setup-header">
        <div className="join-eyebrow">{editing ? "Edit course" : "New course"}</div>
        <h1 className="join-title">{editing ? "Course details" : "Set up your course"}</h1>
        <p className="join-sub">These apply to every module in this course — the lecturer's identity and voice stay consistent across sessions.</p>
        <button className="skip-link" onClick={onCancel}>← Back to dashboard</button>
      </div>

      <div className="setup-col narrow">
        <input className="setup-input" placeholder="Course code, e.g. TDIT 214" aria-label="Course code" value={draft.code} onChange={(e) => onChange({ code: e.target.value })} />
        <input className="setup-input" placeholder="Course title" aria-label="Course title" value={draft.title} onChange={(e) => onChange({ title: e.target.value })} />
        <input className="setup-input" placeholder="Institution (optional)" aria-label="Institution" value={draft.institution} onChange={(e) => onChange({ institution: e.target.value })} />

        <div className="setup-label" style={{ marginTop: 14 }} id="tone-label">Tone</div>
        <div className="pill-row" role="group" aria-labelledby="tone-label">
          {TONE_OPTIONS.map((t) => (
            <button key={t.id} className={`pill ${draft.tone === t.id ? "active" : ""}`} onClick={() => onChange({ tone: t.id })} title={t.desc} aria-pressed={draft.tone === t.id}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="setup-label" style={{ marginTop: 18 }} id="lecturer-label">Your AI lecturer</div>
        <div className="setup-optional" style={{ marginTop: -2, marginBottom: 6 }}>
          Give the lecturer a name and a personality so students meet the same character every time. Students are always told it is an AI lecturer. Everything here is optional.
        </div>
        <input className="setup-input" placeholder="Name, e.g. Dr. Amani (optional)" aria-label="AI lecturer name" maxLength={MAX_NAME} value={draft.lecturerName || ""} onChange={(e) => onChange({ lecturerName: e.target.value })} />
        <div className="pill-row" role="group" aria-labelledby="lecturer-label">
          {PERSONA_IDS.map((id) => {
            const on = (draft.lecturerPersona || DEFAULT_PERSONA) === id;
            return (
              <button key={id} className={`pill ${on ? "active" : ""}`} onClick={() => onChange({ lecturerPersona: id })} title={PERSONAS[id].blurb} aria-pressed={on}>
                {PERSONAS[id].label}
              </button>
            );
          })}
        </div>
        <div className="setup-optional" style={{ marginTop: 6 }}>{PERSONAS[draft.lecturerPersona || DEFAULT_PERSONA].blurb}</div>
        <textarea className="setup-input" rows={3} maxLength={MAX_NOTE} placeholder="Anything else about how it should speak (optional), e.g. use football examples, keep it short" aria-label="Lecturer style note" value={draft.lecturerStyleNote || ""} onChange={(e) => onChange({ lecturerStyleNote: e.target.value })} />
        <div className="setup-optional" style={{ marginTop: -2 }}>{(draft.lecturerStyleNote || "").length}/{MAX_NOTE} · this changes how it speaks, not what it teaches.</div>
        <div className="setup-optional" style={{ marginTop: 6, fontStyle: "italic" }}>Sample greeting: “{introPreview(draft.lecturerPersona || DEFAULT_PERSONA, sanitizeName(draft.lecturerName))}”</div>

        <div className="setup-label" style={{ marginTop: 18 }} id="voice-label">Lecturer voice</div>
        <div className="pill-row" role="group" aria-labelledby="voice-label">
          <button className={`pill ${draft.voiceProvider === "browser" ? "active" : ""}`} onClick={() => onChange({ voiceProvider: "browser" })} aria-pressed={draft.voiceProvider === "browser"}>
            Browser (free, robotic)
          </button>
          <button className={`pill ${draft.voiceProvider === "elevenlabs" ? "active" : ""}`} onClick={() => onChange({ voiceProvider: "elevenlabs" })} aria-pressed={draft.voiceProvider === "elevenlabs"}>
            ElevenLabs (natural)
          </button>
        </div>
        {draft.voiceProvider === "elevenlabs" && (
          <>
            <input
              className="setup-input"
              style={{ marginTop: 8 }}
              type="password"
              placeholder="ElevenLabs API key"
              aria-label="ElevenLabs API key"
              value={draft.elevenLabsApiKey}
              onChange={(e) => onChange({ elevenLabsApiKey: e.target.value })}
            />
            <input
              className="setup-input"
              placeholder="Voice ID (optional — leave blank for default)"
              aria-label="ElevenLabs voice ID"
              value={draft.elevenLabsVoiceId}
              onChange={(e) => onChange({ elevenLabsVoiceId: e.target.value })}
            />
            <div className="setup-optional" style={{ marginTop: -2, marginBottom: 4 }}>
              Key stays in this browser tab only — it's never saved to the database (even if one's connected), only the voice selection is. You'll need to re-enter it each session. If a request ever fails, that line falls back to the browser voice automatically.
            </div>
          </>
        )}

        <button className="explain-btn" style={{ marginTop: 18 }} disabled={!draft.code.trim() || !draft.title.trim()} onClick={onContinue}>
          {editing ? "Save course details" : "Create course & add first module"} <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

// One module = one uploaded/generated set of slides. Saving here never
// enters a live session — it just adds the module to the course so students
// can find it later, and so the lecturer can keep coming back to add more.
// ---------------------------------------------------------------------------
// Advanced slide editing (formulas, worked-example steps, diagrams, code steps…)
// Text areas keep local text and commit on blur, so blank lines you type while
// editing aren't swallowed by re-parsing on every keystroke.
// ---------------------------------------------------------------------------
function LineEditor({ label, value, onCommit, rows = 3, placeholder }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="sk-edit-field">
      <span>{label}</span>
      <textarea
        className="slide-card-notes"
        rows={rows}
        value={text}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text !== value) onCommit(text); }}
      />
    </label>
  );
}

const nonEmptyLines = (t) => String(t || "").split("\n").map((l) => l.trim()).filter(Boolean);

function SlideAdvancedEditor({ slide: s, onChange }) {
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState("");
  const isWorked = s.type === "worked_example" || (s.steps && s.steps.length);
  const stepsText = (s.steps || []).map((st) => [st.label || "", st.say || "", st.latex || ""].join(" || ")).join("\n");

  const recheck = async () => {
    setChecking(true);
    setCheckNote("");
    try {
      const { slide: v, issues } = await validateSlide(normalizeSlide(s));
      onChange({ steps: v.steps, warnings: issues });
      setCheckNote(issues.length ? `${issues.length} problem${issues.length > 1 ? "s" : ""} found — see below.` : "All formulas, calculations and diagrams checked out ✓");
    } catch (e) {
      setCheckNote("Couldn't run the check just now.");
    }
    setChecking(false);
  };

  return (
    <details className="sk-advanced">
      <summary>Advanced: formulas, steps, diagram, code walkthrough</summary>

      <LineEditor label="Key formulas — one per line, LaTeX, optional caption after a |" rows={2} placeholder="E = mc^2 | Mass-energy equivalence"
        value={(s.formulas || []).map((f) => (f.caption ? `${f.latex} | ${f.caption}` : f.latex)).join("\n")}
        onCommit={(t) => onChange({ formulas: nonEmptyLines(t).map((l) => { const [latex, ...cap] = l.split("|"); return { latex: latex.trim(), caption: cap.join("|").trim() }; }) })} />

      {isWorked && (
        <>
          <LineEditor label="Problem statement (inline maths between $ signs)" rows={2} value={(s.problem && s.problem.text) || ""}
            onCommit={(t) => onChange({ problem: { text: t.trim(), latex: (s.problem && s.problem.latex) || "" } })} />
          <LineEditor label="Worked steps — one per line:  label || what the lecturer says || LaTeX shown" rows={6} value={stepsText} placeholder="Factor || First we factor the quadratic. || (x-2)(x-3)=0"
            onCommit={(t) => onChange({
              steps: nonEmptyLines(t).map((l, i) => {
                const parts = l.split("||").map((x) => x.trim());
                const [label, say, latex] = parts.length >= 3 ? parts : parts.length === 2 ? ["", parts[0], parts[1]] : ["", parts[0], ""];
                const prev = (s.steps || [])[i];
                return { label, say, latex, verify: prev && prev.latex === latex ? prev.verify : null };
              }),
            })} />
          <LineEditor label="Final answer (text)" rows={1} value={(s.finalAnswer && s.finalAnswer.text) || ""}
            onCommit={(t) => onChange({ finalAnswer: { text: t.trim(), latex: (s.finalAnswer && s.finalAnswer.latex) || "" } })} />
        </>
      )}

      {(s.diagram || s.type === "diagram") && (
        <LineEditor label="Diagram (Mermaid code)" rows={6} value={(s.diagram && s.diagram.code) || ""} placeholder={"flowchart TD\n  A[Start] --> B[End]"}
          onCommit={(t) => onChange({ diagram: { code: t.trim(), caption: (s.diagram && s.diagram.caption) || "" } })} />
      )}

      {s.table && (
        <LineEditor label="Table — one row per line, cells separated by |, first line = headers" rows={5}
          value={[s.table.headers, ...s.table.rows].map((r) => r.join(" | ")).join("\n")}
          onCommit={(t) => { const rows = nonEmptyLines(t).map((l) => l.split("|").map((c) => c.trim())); if (rows.length >= 2) onChange({ table: { headers: rows[0], rows: rows.slice(1) } }); }} />
      )}

      {s.hasCode && (
        <>
          <div className="sk-edit-row">
            <label className="sk-edit-field">
              <span>Language</span>
              <select value={s.language || "text"} onChange={(e) => onChange({ language: e.target.value })} aria-label="Code language">
                {Object.entries(LANGUAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="sk-edit-field">
              <span>File name</span>
              <input className="slide-card-title" value={s.filename || ""} onChange={(e) => onChange({ filename: e.target.value })} aria-label="Code file name" />
            </label>
          </div>
          <LineEditor label="Code walkthrough — one per line:  startLine-endLine | what the lecturer says" rows={5} placeholder="1-3 | We start by declaring the class."
            value={(s.codeSteps || []).map((c) => `${c.lines[0]}-${c.lines[1]} | ${c.say}`).join("\n")}
            onCommit={(t) => onChange({
              codeSteps: nonEmptyLines(t).map((l) => {
                const [range, ...say] = l.split("|");
                const [a, b] = range.split("-").map((x) => parseInt(x, 10));
                return { lines: [a || 1, b || a || 1], say: say.join("|").trim() };
              }).filter((c) => c.say),
            })} />
          <LineEditor label="Expected output (what the program prints)" rows={2} value={s.expectedOutput || ""} onCommit={(t) => onChange({ expectedOutput: t.replace(/\s+$/, "") })} />
        </>
      )}

      {s.type !== "summary" && (
        <>
          <LineEditor label="Quiz question — first line: question; then one option per line, put * before the correct one" rows={6}
            placeholder={"What does javac produce?\nA runnable program\n*Bytecode\nSource code\nA text file"}
            value={s.checks && s.checks[0] ? [s.checks[0].question, ...s.checks[0].options.map((o, k) => (k === s.checks[0].answer ? `*${o}` : o))].join("\n") : ""}
            onCommit={(t) => {
              const lines = nonEmptyLines(t);
              if (lines.length < 4) { onChange({ checks: [] }); return; }
              const options = lines.slice(1).map((l) => l.replace(/^\*\s*/, ""));
              const answer = lines.slice(1).findIndex((l) => l.startsWith("*"));
              onChange({ checks: answer >= 0 ? [{ question: lines[0], options, answer, explanation: (s.checks && s.checks[0] && s.checks[0].explanation) || "", concept: (s.checks && s.checks[0] && s.checks[0].concept) || (s.concepts && s.concepts[0]) || "" }] : [] });
            }} />
          {s.checks && s.checks[0] && (
            <LineEditor label="What the lecturer says after the answer (why it's right, and the tempting mistake)" rows={2} value={s.checks[0].explanation || ""}
              onCommit={(t) => onChange({ checks: [{ ...s.checks[0], explanation: t.trim() }] })} />
          )}
          <LineEditor label="Concepts taught — comma separated (used to track each student's understanding)" rows={1} value={(s.concepts || []).join(", ")}
            onCommit={(t) => onChange({ concepts: t.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 3) })} />
          <LineEditor label="Builds on — earlier ideas students need first, comma separated (if a student keeps missing this slide's quiz, SEMAI checks these first)" rows={1} value={(s.prerequisites || []).join(", ")}
            onCommit={(t) => onChange({ prerequisites: t.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 3) })} />
        </>
      )}

      {(s.takeaways || s.type === "summary") && (
        <LineEditor label="Key takeaways — one per line" rows={4} value={(s.takeaways || []).join("\n")} onCommit={(t) => onChange({ takeaways: nonEmptyLines(t) })} />
      )}

      <div className="sk-edit-row">
        <button className="nav-btn" onClick={recheck} disabled={checking}>
          {checking ? <Loader2 className="spin" size={13} /> : <CheckCircle2 size={13} />} Re-check maths &amp; diagrams
        </button>
        {checkNote && <span className="sk-edit-note" role="status">{checkNote}</span>}
      </div>
      {s.warnings && s.warnings.length > 0 && (
        <div className="sk-warnings" role="note"><strong>Please review</strong><ul>{s.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
      )}
    </details>
  );
}

function ModuleSetupScreen({ course, setup, patchSetup, onSaveModule, onSaveAndPreview, onCancel }) {
  const fileInputRef = useRef(null);
  const { moduleSettings, rawText, fileName, draft, phase, error, editingModuleId, editingCreatedAt } = setup;
  const editing = !!editingModuleId;
  const [genProgress, setGenProgress] = useState("");

  const updateModuleSettings = (patch) => patchSetup({ moduleSettings: { ...moduleSettings, ...patch } });

  const generationSettings = {
    courseCode: course.code,
    courseTitle: course.title,
    tone: course.tone,
    unitTitle: moduleSettings.unitTitle,
    durationMinutes: moduleSettings.durationMinutes,
    pace: moduleSettings.pace,
    allowLiveCode: moduleSettings.allowLiveCode,
  };

  const handleFile = async (file) => {
    patchSetup({ error: "", fileName: file.name, phase: "extracting" });
    try {
      const units = await extractRawUnits(file);
      patchSetup({ rawText: units.join("\n\n"), phase: "input" });
    } catch (e) {
      patchSetup({ error: e.message || "Couldn't read that file.", phase: "input" });
    }
  };

  const handleGenerate = async () => {
    if (!rawText.trim()) {
      patchSetup({ error: "Paste your outline or upload a file first." });
      return;
    }
    patchSetup({ error: "", phase: "generating" });
    try {
      const units = rawText.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
      setGenProgress("Starting…");
      const result = await generateCurriculum(units.length ? units : [rawText], generationSettings, setGenProgress);
      patchSetup({ draft: result, phase: "preview" });
    } catch (e) {
      patchSetup({ error: e.message || "Generation failed — try again.", phase: "input" });
    }
  };

  const editSlide = (idx, patch) => {
    patchSetup({ draft: { ...draft, slides: draft.slides.map((s, i) => (i === idx ? { ...s, ...patch } : s)) } });
  };
  const removeSlide = (idx) => {
    patchSetup({ draft: { ...draft, slides: draft.slides.filter((_, i) => i !== idx) } });
  };

  const buildModuleObject = () => ({
    id: editingModuleId || makeId("module"),
    unit: moduleSettings.unitTitle || draft.unit || "Untitled module",
    durationMinutes: moduleSettings.durationMinutes,
    pace: moduleSettings.pace,
    allowLiveCode: moduleSettings.allowLiveCode,
    slides: draft.slides.map((sl, i) => normalizeSlide(sl, i)),
    createdAt: editingCreatedAt || Date.now(),
  });
  const addSlide = () => patchSetup({ draft: { ...draft, slides: [...draft.slides, blankSlide()] } });
  const moveSlide = (idx, dir) => patchSetup({ draft: { ...draft, slides: moveItem(draft.slides, idx, dir) } });

  const estimatedUnitCount = Math.max(1, rawText.split(/\n{2,}/).filter((s) => s.trim()).length);
  const liveBudget = draft
    ? computeWordBudget(moduleSettings.durationMinutes, draft.slides.length, moduleSettings.pace)
    : computeWordBudget(moduleSettings.durationMinutes, estimatedUnitCount, moduleSettings.pace);

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <div className="join-eyebrow">{course.code} · {editing ? "Edit module" : "Add a module"}</div>
        <h1 className="join-title">{course.title}</h1>
        <p className="join-sub">{editing ? "Change the title, slides, narration notes or code, then save. Students see the new version the next time they join." : "Upload slides or notes for this module, tune the pacing, then review before saving."} Voice and tone come from the course settings.</p>
        <button className="skip-link" onClick={onCancel}>← Back to dashboard</button>
      </div>

      {(phase === "input" || phase === "extracting" || phase === "generating") && (
        <div className="setup-grid">
          <div className="setup-col">
            <div className="setup-label">Source material</div>
            <div
              className="dropzone"
              role="button"
              tabIndex={0}
              aria-label="Upload a file: .pptx, .pdf, .txt, or .md"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files && e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current && fileInputRef.current.click();
                }
              }}
            >
              {phase === "extracting" ? (
                <>
                  <Loader2 className="spin" size={20} />
                  <div>Reading {fileName}…</div>
                </>
              ) : (
                <>
                  <Upload size={20} />
                  <div>{fileName ? `Loaded: ${fileName} — drop another to replace` : "Drop a .pptx, .pdf, .txt, or .md file, or click to browse"}</div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pptx,.pdf,.txt,.md"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files && e.target.files[0];
                  if (file) handleFile(file);
                }}
              />
            </div>
            <div className="setup-or">— or paste it directly —</div>
            <textarea
              className="setup-textarea"
              placeholder="Paste your slide bullets, speaker notes, or a course outline here…"
              aria-label="Source material to build the module from"
              value={rawText}
              onChange={(e) => patchSetup({ rawText: e.target.value, fileName: "" })}
              rows={12}
            />
          </div>

          <div className="setup-col">
            <div className="setup-label" id="module-topic-label">Module details <span className="setup-optional">(topic inferred if left blank)</span></div>
            <input className="setup-input" placeholder="This module's topic" aria-label="Module topic" value={moduleSettings.unitTitle} onChange={(e) => updateModuleSettings({ unitTitle: e.target.value })} />

            <div className="setup-label" style={{ marginTop: 18 }} id="duration-label"><Clock size={13} /> Lecture length: {moduleSettings.durationMinutes} min</div>
            <input
              type="range" min={10} max={120} step={5}
              value={moduleSettings.durationMinutes}
              onChange={(e) => updateModuleSettings({ durationMinutes: Number(e.target.value) })}
              className="setup-slider"
              aria-labelledby="duration-label"
            />

            <div className="setup-label" style={{ marginTop: 14 }} id="pace-label">Pacing</div>
            <div className="pill-row" role="group" aria-labelledby="pace-label">
              {PACE_OPTIONS.map((p) => (
                <button key={p.id} className={`pill ${moduleSettings.pace === p.id ? "active" : ""}`} onClick={() => updateModuleSettings({ pace: p.id })} title={p.hint} aria-pressed={moduleSettings.pace === p.id}>
                  {p.label}
                </button>
              ))}
            </div>

            <label className="setup-checkbox">
              <input type="checkbox" checked={moduleSettings.allowLiveCode} onChange={(e) => updateModuleSettings({ allowLiveCode: e.target.checked })} />
              Allow live code demo slides
            </label>

            <div className="course-context-note">
              Voice: {course.voiceProvider === "elevenlabs" ? "ElevenLabs (natural)" : "Browser"} · Tone: {TONE_OPTIONS.find((t) => t.id === course.tone)?.label} — set at the course level.
            </div>

            <div className="budget-readout">≈ {liveBudget} words per slide at this pace &amp; length</div>

            {error && <div className="setup-error"><AlertTriangle size={13} /> {error}</div>}

            <button className="explain-btn" disabled={phase === "generating"} onClick={handleGenerate}>
              {phase === "generating" ? <Loader2 className="spin" size={14} /> : <Sparkles size={14} />}
              {phase === "generating" ? genProgress || "Generating curriculum…" : "Generate curriculum"}
            </button>
          </div>
        </div>
      )}

      {phase === "preview" && draft && (
        <div className="preview-wrap">
          {editing && (
            <div className="setup-grid" style={{ marginBottom: 12 }}>
              <div className="setup-col">
                <div className="setup-label">Module title</div>
                <input className="setup-input" aria-label="Module title" value={moduleSettings.unitTitle} onChange={(e) => updateModuleSettings({ unitTitle: e.target.value })} />
              </div>
              <div className="setup-col">
                <div className="setup-label">Length (minutes)</div>
                <input className="setup-input" type="number" min={5} max={240} aria-label="Module length in minutes" value={moduleSettings.durationMinutes} onChange={(e) => updateModuleSettings({ durationMinutes: Math.max(5, Math.min(240, Number(e.target.value) || 45)) })} />
              </div>
            </div>
          )}
          <div className="preview-toolbar">
            <div>
              <strong>{course.code}</strong> — {editing ? moduleSettings.unitTitle || draft.unit : draft.unit || moduleSettings.unitTitle}
            </div>
            <div className="budget-readout">≈ {computeWordBudget(moduleSettings.durationMinutes, draft.slides.length, moduleSettings.pace)} words/slide · {draft.slides.length} slides</div>
          </div>

          <div className="slide-card-list">
            {draft.slides.map((s, i) => (
              <div className="slide-card" key={i}>
                <div className="slide-card-head">
                  <span className="sk-type-chip" title="Slide type">{TYPE_LABELS[s.type] || "Concept"}</span>
                  <input className="slide-card-title" aria-label={`Slide ${i + 1} title`} value={typeof s.title === "string" ? s.title : ""} onChange={(e) => editSlide(i, { title: e.target.value })} />
                  <button className="icon-btn" onClick={() => moveSlide(i, -1)} disabled={i === 0} title="Move slide up" aria-label={`Move slide up: ${s.title}`}>↑</button>
                  <button className="icon-btn" onClick={() => moveSlide(i, 1)} disabled={i === draft.slides.length - 1} title="Move slide down" aria-label={`Move slide down: ${s.title}`}>↓</button>
                  <button className="icon-btn" onClick={() => removeSlide(i)} title="Remove slide" aria-label={`Remove slide: ${s.title}`}><Trash2 size={14} /></button>
                </div>
                <textarea
                  className="slide-card-bullets"
                  rows={3}
                  value={(Array.isArray(s.bullets) ? s.bullets : []).join("\n")}
                  onChange={(e) => editSlide(i, { bullets: e.target.value.split("\n") })}
                  placeholder="One bullet per line…"
                  aria-label={`Slide ${i + 1} bullets, one per line`}
                />
                <textarea
                  className="slide-card-notes"
                  rows={2}
                  value={s.detail || ""}
                  onChange={(e) => editSlide(i, { detail: e.target.value })}
                  placeholder="On-screen supporting paragraph shown below the bullets…"
                  aria-label={`Slide ${i + 1} on-screen supporting paragraph`}
                />
                <textarea
                  className="slide-card-notes"
                  rows={3}
                  value={s.notes}
                  onChange={(e) => editSlide(i, { notes: e.target.value })}
                  placeholder="Narration guidance for the AI lecturer…"
                  aria-label={`Slide ${i + 1} narration guidance for the AI lecturer`}
                />
                <label className="setup-checkbox">
                  <input
                    type="checkbox"
                    checked={s.hasCode}
                    onChange={(e) => editSlide(i, { hasCode: e.target.checked, code: e.target.checked ? (s.code || "") : undefined })}
                  />
                  Live code demo on this slide
                </label>
                {s.hasCode && (
                  <textarea className="slide-card-code" aria-label={`Code example for slide: ${s.title}`} rows={5} value={s.code || ""} onChange={(e) => editSlide(i, { code: e.target.value })} />
                )}
                <SlideAdvancedEditor slide={s} onChange={(patch) => editSlide(i, patch)} />
              </div>
            ))}
          </div>

          <button className="skip-link" onClick={addSlide}>+ Add a slide</button>

          {error && <div className="setup-error"><AlertTriangle size={13} /> {error}</div>}

          <div className="preview-actions">
            <button className="nav-btn" onClick={() => { if (editing && !window.confirm("Discard your edits and regenerate this module from new material? The module keeps its place and its student history.")) return; patchSetup({ phase: "input", draft: null }); }}>
              <RotateCcw size={14} /> {editing ? "Regenerate from new material" : "Start over"}
            </button>
            <div className="preview-actions-right">
              <button className="nav-btn" onClick={() => onSaveAndPreview(buildModuleObject())}>
                {editing ? "Save changes & preview" : "Save &amp; preview as student"}
              </button>
              <button className="explain-btn" onClick={() => onSaveModule(buildModuleObject())}>
                {editing ? "Save changes" : "Save module"} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Join screen (students)
// ---------------------------------------------------------------------------
// Students pick a course, then a module within it, then give their name.
// Only courses with at least one saved module show up — a course with zero
// modules is still "being built" and isn't joinable yet.
function JoinScreen({ courses, onJoin, onBack, onOpenLegal, studentSession, studentProfile, onSaveProfile, onStudentSignIn, onStudentSignOut, onViewMyHistory }) {
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [selectedModuleId, setSelectedModuleId] = useState(null);
  const [name, setName] = useState(studentProfile ? studentProfile.fullName : studentSession ? accountLabel(studentSession.user.email) : "");
  useEffect(() => { if (studentProfile) setName(studentProfile.fullName); }, [studentProfile]);
  // A signed-in student with no profile yet picks a real name and username first.
  const needsProfile = !!studentSession && studentProfile === null;
  const [pFull, setPFull] = useState("");
  const [pUser, setPUser] = useState("");
  const [pUserTouched, setPUserTouched] = useState(false);
  const [pErr, setPErr] = useState("");
  const [pBusy, setPBusy] = useState(false);
  useEffect(() => { if (needsProfile && !pUserTouched) setPUser(suggestUsername(pFull)); }, [pFull, needsProfile, pUserTouched]);
  const saveProfile = async () => {
    const problem = fullNameError(pFull) || usernameError(pUser);
    if (problem) { setPErr(problem); return; }
    setPBusy(true); setPErr("");
    const r = await onSaveProfile({ fullName: pFull, username: pUser });
    setPBusy(false);
    if (!r.ok) setPErr(r.taken ? "That username is taken. Try another." : "Couldn't save your profile. Try again.");
  };
  const [research, setResearch] = useState(() => {
    try { return localStorage.getItem("semai_research_consent") === "1"; } catch (e) { return false; }
  });
  const [share, setShare] = useState(() => {
    try { return localStorage.getItem("semai_share_lecturer") !== "0"; } catch (e) { return true; }
  });
  const changeShare = (v) => {
    setShare(v);
    try { localStorage.setItem("semai_share_lecturer", v ? "1" : "0"); } catch (e) { /* ignore */ }
  };
  const changeResearch = (v) => {
    setResearch(v);
    try { localStorage.setItem("semai_research_consent", v ? "1" : "0"); } catch (e) { /* ignore */ }
  };

  const joinable = courses.filter((c) => c.modules.length > 0);

  if (joinable.length === 0) {
    return (
      <div className="join-screen">
        <div className="join-card">
          <div className="join-eyebrow">SEMAI</div>
          <h1 className="join-title">No sessions yet</h1>
          <p className="join-sub">No lecturer has published a module here yet — check back soon.</p>
          <button className="skip-link" onClick={onBack}>← Back to role select</button>
        </div>
      </div>
    );
  }

  const course = joinable.length === 1 ? joinable[0] : joinable.find((c) => c.id === selectedCourseId);

  if (!course) {
    return (
      <div className="join-screen">
        <div className="join-card wide">
          <div className="join-eyebrow">SEMAI</div>
          <h1 className="join-title">Choose a course</h1>
          <div className="pick-list">
            {joinable.map((c) => (
              <button key={c.id} className="pick-row" onClick={() => setSelectedCourseId(c.id)}>
                <strong>{c.code}</strong> — {c.title} <span className="setup-optional">({c.modules.length} module{c.modules.length === 1 ? "" : "s"})</span>
              </button>
            ))}
          </div>
          <button className="skip-link" onClick={onBack}>← Back to role select</button>
        </div>
      </div>
    );
  }

  const module_ = course.modules.length === 1 ? course.modules[0] : course.modules.find((m) => m.id === selectedModuleId);

  if (!module_) {
    return (
      <div className="join-screen">
        <div className="join-card wide">
          <div className="join-eyebrow">{course.code}</div>
          <h1 className="join-title">Choose a module</h1>
          <div className="pick-list">
            {course.modules.map((m) => (
              <button key={m.id} className="pick-row" onClick={() => setSelectedModuleId(m.id)}>
                {m.unit} <span className="setup-optional">· {m.durationMinutes} min</span>
              </button>
            ))}
          </div>
          <button className="skip-link" onClick={() => (joinable.length > 1 ? setSelectedCourseId(null) : onBack())}>
            ← {joinable.length > 1 ? "Choose a different course" : "Back to role select"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="join-screen">
      <div className="join-card">
        <div className="join-eyebrow">{course.code} · Live Session</div>
        <h1 className="join-title">{course.title}</h1>
        <p className="join-sub">{module_.unit}</p>

        {studentSession ? (
          <div className="signed-in-badge">
            {studentProfile ? `Joining as ${studentProfile.fullName} (@${studentProfile.username})` : `Signed in as ${accountLabel(studentSession.user.email)}`}
            <button className="skip-link inline" onClick={onStudentSignOut}>Not you?</button>
          </div>
        ) : null}

        {needsProfile ? (
          <div style={{ marginBottom: 12 }}>
            <p className="join-hint" style={{ textAlign: "left" }}>Before you join, add your real name and choose a unique username. Your lecturer will see both if you share your progress.</p>
            <input className="join-input" placeholder="Your full name" aria-label="Full name" value={pFull} onChange={(e) => setPFull(e.target.value)} />
            <input className="join-input" placeholder="Choose a username" aria-label="Username" autoCapitalize="none" spellCheck={false} value={pUser} onChange={(e) => { setPUserTouched(true); setPUser(e.target.value); }} />
            {pErr && <div className="setup-error" style={{ justifyContent: "center" }}><AlertTriangle size={13} /> {pErr}</div>}
            <button className="join-btn" disabled={pBusy} onClick={saveProfile}>{pBusy ? <Loader2 className="spin" size={14} /> : null} Save and continue</button>
          </div>
        ) : !studentProfile ? (
          <input
            className="join-input"
            placeholder="Your name"
            aria-label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && onJoin(course, module_, name, research, share)}
          />
        ) : null}
        <label className="consent-row">
          <input type="checkbox" checked={share} onChange={(e) => changeShare(e.target.checked)} />
          <span>Let my lecturer see my individual progress (my name, my quiz results and where I felt lost) so they can help me in class. Untick to stay anonymous. You can change this each time you join.</span>
        </label>
        <label className="consent-row">
          <input type="checkbox" checked={research} onChange={(e) => changeResearch(e.target.checked)} />
          <span>Optional: let an anonymised copy of my learning activity be used for education research. You can change this any time.</span>
        </label>
        <div className="join-hint" style={{ textAlign: "left", marginBottom: 16 }}>
          Your lecturer is shown how students interact with each lecture (slides viewed, quiz answers, questions) to improve it, and to personalise your learning. Unless you share your progress above, this never includes your name or email.{" "}
          <button className="skip-link inline" onClick={() => onOpenLegal && onOpenLegal("privacy")}>Privacy Policy</button>
        </div>
        <button className="join-btn" disabled={!name.trim() || needsProfile} onClick={() => onJoin(course, module_, name, research, share)}>
          Join lecture
        </button>
        <div className="join-hint">Mic + speaker recommended. The lecturer speaks aloud and you can interrupt anytime.</div>

        {studentSession ? (
          <button className="skip-link" onClick={onViewMyHistory}>View my learning history</button>
        ) : (
          <button className="skip-link" onClick={onStudentSignIn}>Sign in for a persistent history across sessions</button>
        )}

        <button
          className="skip-link"
          onClick={() => (course.modules.length > 1 ? setSelectedModuleId(null) : joinable.length > 1 ? setSelectedCourseId(null) : onBack())}
        >
          ← {course.modules.length > 1 ? "Choose a different module" : joinable.length > 1 ? "Choose a different course" : "Back to role select"}
        </button>
      </div>
    </div>
  );
}

// A signed-in student's own session history — same underlying data as the
// lecturer's session view, scoped to "sessions I attended" instead of
// "sessions for a course I own."
function AccountDataPanel({ session, kind, onDeleted, onOpenLegal }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  const consequence =
    kind === "lecturer"
      ? "This permanently deletes your account, all your courses and modules, the flagged questions on them, and the session records students saved for those courses. It cannot be undone."
      : "This permanently deletes your account and your saved session history. It cannot be undone.";

  const doExport = async () => {
    setError("");
    setNote("");
    setBusy("export");
    try {
      await exportMyData(session, kind);
      setNote("Your data file was downloaded.");
    } catch (e) {
      setError(e.message || "Couldn't export your data. Sign out, sign in again and retry.");
    }
    setBusy("");
  };

  const doDelete = async () => {
    setError("");
    setBusy("delete");
    try {
      await deleteMyAccount(session);
      onDeleted();
    } catch (e) {
      setError(e.message || "Couldn't delete the account.");
      setBusy("");
    }
  };

  return (
    <section className="account-panel" aria-labelledby="account-data-heading">
      <h2 id="account-data-heading" className="account-title">Your data</h2>
      <p className="account-text">
        You can download a copy of everything stored about you, or delete your account. See the{" "}
        <button className="skip-link inline" onClick={() => onOpenLegal("privacy")}>Privacy Policy</button>.
      </p>
      <div className="account-actions">
        <button className="nav-btn" disabled={busy !== ""} onClick={doExport}>
          {busy === "export" ? <Loader2 className="spin" size={13} /> : <Download size={13} />} Download my data
        </button>
        {!confirming && (
          <button className="nav-btn danger" disabled={busy !== ""} onClick={() => setConfirming(true)}>
            <Trash2 size={13} /> Delete my account
          </button>
        )}
      </div>
      {confirming && (
        <div className="account-confirm" role="alertdialog" aria-label="Confirm account deletion">
          <p className="account-text" style={{ color: "#F2A5A5" }}>{consequence}</p>
          <label className="account-text" htmlFor="delete-confirm-input">Type DELETE to confirm:</label>
          <input
            id="delete-confirm-input"
            className="join-input"
            style={{ maxWidth: 220 }}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
          <div className="account-actions">
            <button className="nav-btn danger" disabled={typed !== "DELETE" || busy !== ""} onClick={doDelete}>
              {busy === "delete" ? <Loader2 className="spin" size={13} /> : <Trash2 size={13} />} Permanently delete
            </button>
            <button className="nav-btn" disabled={busy !== ""} onClick={() => { setConfirming(false); setTyped(""); setError(""); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <div className="setup-error" role="alert"><AlertTriangle size={13} /> {error}</div>}
      {note && <div className="db-status ok" role="status" style={{ display: "block" }}>{note}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// AI health check + speed summary (lecturer dashboard). The check calls the
// proxy with the lecturer's own sign-in, so it can test Gemini AND the Groq
// backup with a tiny live request and report how long each takes.
// ---------------------------------------------------------------------------
const KIND_LABELS = {
  qa: "AI answer to a student question", explain: "AI lecture explanation", live: "Other live AI replies", check: "AI 'did that make sense' line",
  welcome: "AI welcome", notes: "Notes writing (per slide)", generate: "Deck writing (per call)", summary: "Session summary",
  tts_start: "Voice: time until sound starts", qa_ack_start: "Question → 'Yes, Sam?' starts", qa_dead_air: "Silence after 'Yes, Sam?' before the answer",
  qa_to_answer_voice: "Question → answer voice starts",
};
const secs = (ms) => (ms === null || ms === undefined ? "–" : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`);

function AIHealthPanel({ session }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(() => getTimingSummary());

  const run = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(AI_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({ probe: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.probe) throw new Error(data.error || `Health check failed (${res.status}). Sign out, sign in again and retry.`);
      setResult(data);
    } catch (e) {
      setError(e.message || "Couldn't run the health check.");
    }
    setSummary(getTimingSummary());
    setBusy(false);
  };

  const line = (name, r) => {
    if (r.configured === false) return <li><strong>{name}</strong>: not set up (no <code>GROQ_API_KEY</code> secret yet)</li>;
    return (
      <li>
        <strong>{name}</strong> <span style={{ color: "#8890A0" }}>({r.model})</span>:{" "}
        {r.ok ? <span style={{ color: "#6FD3A4" }}>working, replied in {secs(r.ms)}</span> : <span style={{ color: "#F2A5A5" }}>not working (status {r.status || "no connection"})</span>}
      </li>
    );
  };

  return (
    <section className="account-panel" aria-labelledby="ai-health-heading">
      <h2 id="ai-health-heading" className="account-title">AI health and speed</h2>
      <p className="account-text">Tests the main AI (Gemini) and the backup (Groq) with a tiny live request, and shows how fast things have been in this browser.</p>
      <div className="account-actions">
        <button className="nav-btn" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="spin" size={13} /> : <CheckCircle2 size={13} />} Run AI health check
        </button>
        <button className="nav-btn" onClick={() => setSummary(getTimingSummary())}>Refresh speeds</button>
      </div>
      {error && <div className="setup-error" role="alert"><AlertTriangle size={13} /> {error}</div>}
      {result && (
        <ul className="account-text" style={{ paddingLeft: 18 }} role="status">
          {line("Gemini (main)", result.gemini)}
          {line("Groq (backup)", result.groq)}
        </ul>
      )}
      {summary.length > 0 ? (
        <div className="sk-table-wrap">
          <table className="sk-table" style={{ fontSize: 12.5 }}>
            <thead><tr><th scope="col">What</th><th scope="col">Who</th><th scope="col">Times</th><th scope="col">Typical</th><th scope="col">Slow (95%)</th><th scope="col">Failed</th></tr></thead>
            <tbody>
              {summary.map((r) => (
                <tr key={`${r.kind}|${r.provider}`}>
                  <th scope="row">{KIND_LABELS[r.kind] || r.kind}</th><td>{r.provider || "–"}</td><td>{r.n}</td><td>{secs(r.p50)}</td><td>{secs(r.p95)}</td><td>{r.failures || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="account-text">No measurements yet — run a lecture (or the health check) and they'll appear here.</p>
      )}
    </section>
  );
}

function MyHistoryScreen({ session, courses, onBack, onAccountDeleted, onOpenLegal }) {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [learning, setLearning] = useState(null); // { mastery, revise, calibration, events }
  const [notes, setNotes] = useState({}); // what this student said about their own knowledge
  const [notesError, setNotesError] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetchConceptNotes(session.user.id, session.accessToken).then((n) => { if (!cancelled) setNotes(n); }).catch(() => {});
    return () => { cancelled = true; };
  }, [session]);
  const setNote = async (concept, claim) => {
    const prev = notes;
    const next = { ...notes };
    if (claim) next[concept] = claim; else delete next[concept];
    setNotes(next); setNotesError("");
    try { await saveConceptNote(session.user.id, concept, claim, session.accessToken); }
    catch (e) { setNotes(prev); setNotesError("Couldn't save that just now. Please try again."); }
  };
  const [rhythm, setRhythm] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchMySessionTotals(session.user.id, session.accessToken).then((p) => { if (!cancelled) setRhythm(focusRhythmText(engagementSummary(p))); }).catch(() => {});
    return () => { cancelled = true; };
  }, [session]);
  const [practice, setPractice] = useState(null); // { concept, loading | questions | error, courseId, moduleId, sessionId }
  const [reloadTick, setReloadTick] = useState(0);
  const notesRef = useRef({});
  notesRef.current = notes;

  useEffect(() => {
    let cancelled = false;
    fetchMyCheckEvents(session.user.id, session.accessToken)
      .then((events) => {
        if (cancelled) return;
        const mastery = estimateWithClaims(events, notesRef.current);
        setLearning({ mastery, revise: conceptsToRevise(mastery, 3), calibration: studentCalibration(events), events });
      })
      .catch(() => { if (!cancelled) setLearning({ mastery: [], revise: [], calibration: { level: "unknown" }, events: [] }); });
    return () => { cancelled = true; };
  }, [session, reloadTick]);

  // Revision practice: AI-written questions grounded in the lecture that taught the concept
  // re-estimate whenever the student changes what they say about themselves
  const liveMastery = useMemo(() => (learning ? estimateWithClaims(learning.events, notes) : []), [learning, notes]);
  const startPractice = async (c) => {
    const last = [...((learning && learning.events) || [])].reverse().find((e) => e.concept === c.concept);
    const course = (courses || []).find((co) => last && co.id === last.courseId);
    const mod = course && (course.modules || []).find((m) => m.id === last.moduleId);
    setPractice({ concept: c.concept, loading: true });
    try {
      const questions = await generatePractice({
        concept: c.concept,
        slides: mod ? (mod.slides || []).map((sl, i) => normalizeSlide(sl, i)) : [],
        callAI: (sys, pr, mt) => callAI(sys, pr, mt, undefined, "practice"),
      });
      setPractice({ concept: c.concept, questions, courseId: last && last.courseId, moduleId: last && last.moduleId, sessionId: makeId("practice") });
    } catch (e) {
      setPractice({ concept: c.concept, error: e.message || "Couldn't make practice questions just now." });
    }
  };
  const recordPractice = (event) => {
    if (!practice || !practice.moduleId || !practice.courseId) return;
    let consent = false;
    try { consent = localStorage.getItem("semai_research_consent") === "1"; } catch (e) { /* ignore */ }
    postStandaloneEvents({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY }, [{
      client_ts: new Date().toISOString(), session_id: practice.sessionId, course_id: practice.courseId, module_id: practice.moduleId,
      student_id: session.user.id, student_key: getStudentKey(), research_consent: consent, slide_index: null, slide_key: null,
      event_type: "practice_answer", payload: { concept: practice.concept, correct: event.correct, option: event.option, confidence: event.confidence, time_ms: event.time_ms },
    }], session.accessToken);
  };

  useEffect(() => {
    fetchMySessions(session.user.id, session.accessToken)
      .then(setSessions)
      .catch((e) => {
        setError(e.message || "Couldn't load your history.");
        setSessions([]);
      });
  }, [session]);

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <div className="join-eyebrow">SEMAI · {accountLabel(session.user.email)}</div>
        <h1 className="join-title">My learning history</h1>
        <p className="join-sub">Every lecture you've attended, across every course.</p>
        <button className="skip-link" onClick={onBack}>← Back</button>
      </div>

      {error && <div className="setup-error"><AlertTriangle size={13} /> {error}</div>}

      <section className="account-panel" style={{ marginTop: 0, borderTop: "none" }} aria-labelledby="learned-heading">
        <h2 id="learned-heading" className="account-title">What I've learned</h2>
        <p className="account-text">Built from your answers to the quick quiz questions. Recent answers count most, and a confident wrong answer counts more than an honest guess, because those are the mistakes worth fixing. Your lecturer sees class-wide results only.</p>
        {practice && practice.loading && <div className="empty-hint"><Loader2 className="spin" size={14} /> Writing practice questions for “{practice.concept}”…</div>}
        {practice && practice.error && <div className="setup-error"><AlertTriangle size={13} /> {practice.error} <button className="skip-link inline" onClick={() => setPractice(null)}>Close</button></div>}
        {practice && practice.questions ? (
          <Boundary label="practice" title="Practice couldn’t be shown."><PracticePanel concept={practice.concept} questions={practice.questions} onAnswer={recordPractice} onClose={() => { setPractice(null); setReloadTick((n) => n + 1); }} /></Boundary>
        ) : learning === null ? (
          <div className="empty-hint"><Loader2 className="spin" size={14} /> Loading…</div>
        ) : (
          <>
            <Boundary label="mastery" title="Your progress panel couldn’t be shown."><MasteryPanel mastery={liveMastery} revise={conceptsToRevise(liveMastery, 3)} calibration={learning.calibration} notes={notes} onNote={setNote} onPractice={startPractice} /></Boundary>
            {notesError && <div className="setup-error" role="alert"><AlertTriangle size={13} /> {notesError}</div>}
          </>
        )}
        {rhythm && <p className="account-text" style={{ marginTop: 10 }}><strong>Your focus rhythm.</strong> {rhythm} Only you can see this.</p>}
      </section>

      {sessions === null ? (
        <div className="empty-hint"><Loader2 className="spin" size={14} /> Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="empty-hint">Nothing here yet — this fills in once you attend a lecture signed in.</div>
      ) : (
        <div className="flag-list">
          {sessions.map((s) => (
            <div className="flag-card" key={s.id}>
              <div className="flag-card-meta">
                {s.courses ? `${s.courses.code} — ${s.courses.title}` : "Unknown course"} · {new Date(s.ended_at).toLocaleString()} ·{" "}
                <span className={s.completed ? "session-badge complete" : "session-badge incomplete"}>
                  {s.completed ? "Completed" : `Left early (${s.slides_reached}/${s.total_slides} slides)`}
                </span>
              </div>
              {s.summary && <div className="flag-card-answer">{s.summary}</div>}
              <button className="nav-btn" onClick={() => setExpandedId((id) => (id === s.id ? null : s.id))}>
                {expandedId === s.id ? "Hide transcript" : "View transcript"}
              </button>
              {expandedId === s.id && (
                <div className="session-transcript">
                  {(s.transcript || []).map((m, i) => (
                    <div key={i} className="session-transcript-line">
                      <strong>{m.speaker === "lecturer" ? "Lecturer" : m.speaker}:</strong> {m.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <AccountDataPanel session={session} kind="student" onDeleted={onAccountDeleted} onOpenLegal={onOpenLegal} />
    </div>
  );
}

// Lecturer home base: every course they've built, every module saved so
// far, and the two things a lecturer actually needs from here — add
// another module to a course, or preview one as a student would see it.
// Saving a module always lands back here, never in a live session.
function LecturerDashboard({ courses, dbStatus, lecturerEmail, account, onAccountDeleted, onOpenLegal, onNewCourse, onEditCourse, onAddModule, onPreviewModule, onEditModule, onDuplicateModule, onDeleteModule, onDeleteCourse, notice, onDismissNotice, onBack, onSignOut, onViewInsights }) {
  const [confirm, setConfirm] = useState(null); // { kind: "module" | "course", id }
  const [typedCode, setTypedCode] = useState("");
  const [busyId, setBusyId] = useState(null);
  const runDelete = async (kind, course, module_) => {
    setBusyId(kind === "course" ? course.id : module_.id);
    try { await (kind === "course" ? onDeleteCourse(course) : onDeleteModule(course, module_)); } finally { setBusyId(null); setConfirm(null); setTypedCode(""); }
  };
  const statusLabel = {
    connected: { text: "Connected to Supabase — courses persist across refreshes", cls: "ok" },
    loading: { text: "Connecting to Supabase…", cls: "loading" },
    offline: { text: "You're offline — showing courses saved on this device. Changes can't be saved until you're back online.", cls: "warn" },
    error: { text: "Couldn't reach Supabase — working locally this session only", cls: "warn" },
    local: { text: "No database configured — changes are lost on refresh (see SUPABASE_URL in the code)", cls: "warn" },
  }[dbStatus];

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <div className="join-eyebrow">Lecturer dashboard {lecturerEmail && <span className="setup-optional">· {lecturerEmail}</span>}</div>
        <h1 className="join-title">Your courses</h1>
        <p className="join-sub">Build a course module by module. Saving publishes it for students — it won't drop you into a live session.</p>
        <div style={{ display: "flex", gap: 14 }}>
          <button className="skip-link" onClick={onBack}>← Back to role select</button>
          {onSignOut && <button className="skip-link" onClick={onSignOut}>Sign out</button>}
        </div>
      </div>

      {statusLabel && <div className={`db-status ${statusLabel.cls}`}>{statusLabel.text}</div>}
      {notice && (
        <div className={`db-status ${notice.kind === "error" ? "warn" : "ok"}`} role={notice.kind === "error" ? "alert" : "status"} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{notice.text}</span>
          <button className="skip-link inline" onClick={onDismissNotice} aria-label="Dismiss message">Dismiss</button>
        </div>
      )}

      <div className="dash-toolbar">
        <button className="explain-btn" onClick={onNewCourse}><Sparkles size={14} /> New course</button>
      </div>

      {courses.length === 0 && <div className="empty-hint">No courses yet — create one to get started.</div>}

      <div className="course-list">
        {courses.map((course) => (
          <div className="course-card" key={course.id}>
            <div className="course-card-head">
              <div>
                <strong>{course.code}</strong> — {course.title}
                {course.institution && <span className="setup-optional"> · {course.institution}</span>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="icon-btn" onClick={() => onViewInsights(course)} title="Course insights — sessions & flagged questions" aria-label={`View insights for ${course.code}`}>
                  <Flag size={14} />
                </button>
                <button className="icon-btn" onClick={() => onEditCourse(course)} title="Edit course details" aria-label={`Edit ${course.code} details`}>
                  <Settings2 size={14} />
                </button>
                <button className="icon-btn" onClick={() => { setConfirm({ kind: "course", id: course.id }); setTypedCode(""); }} title="Delete this course" aria-label={`Delete course ${course.code}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {confirm && confirm.kind === "course" && confirm.id === course.id && (
              <div className="sk-warnings" role="alertdialog" aria-label={`Delete ${course.code}`}>
                <strong>Delete {course.code} and everything in it?</strong>
                <p style={{ margin: "6px 0" }}>This permanently removes the course, its {course.modules.length} module{course.modules.length === 1 ? "" : "s"}, all student session records, quiz data and flagged questions. It cannot be undone. Type <strong>{course.code}</strong> to confirm.</p>
                <input className="setup-input" aria-label="Type the course code to confirm" value={typedCode} onChange={(e) => setTypedCode(e.target.value)} autoCapitalize="none" />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="nav-btn" onClick={() => { setConfirm(null); setTypedCode(""); }}>Cancel</button>
                  <button className="explain-btn" disabled={!courseDeleteConfirmed(course, typedCode) || busyId === course.id} onClick={() => runDelete("course", course)}>
                    {busyId === course.id ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />} Delete course
                  </button>
                </div>
              </div>
            )}

            {course.modules.length === 0 ? (
              <div className="empty-hint">No modules yet — add the first one below.</div>
            ) : (
              <div className="module-list">
                {course.modules.map((m) => (
                  <div className="module-row" key={m.id}>
                    <div>
                      <div className="module-row-title">{m.unit}</div>
                      <div className="module-row-meta">{m.durationMinutes} min · {PACE_OPTIONS.find((p) => p.id === m.pace)?.label} · {m.slides.length} slides</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button className="nav-btn" onClick={() => onPreviewModule(course, m)}>Preview as student</button>
                      <button className="nav-btn" onClick={() => onEditModule(course, m)} aria-label={`Edit module ${m.unit}`}>Edit</button>
                      <button className="nav-btn" onClick={() => onDuplicateModule(course, m)} aria-label={`Duplicate module ${m.unit}`}>Duplicate</button>
                      <button className="icon-btn" onClick={() => setConfirm({ kind: "module", id: m.id })} title="Delete this module" aria-label={`Delete module ${m.unit}`}><Trash2 size={14} /></button>
                    </div>
                    {confirm && confirm.kind === "module" && confirm.id === m.id && (
                      <div className="sk-warnings" role="alertdialog" aria-label={`Delete ${m.unit}`} style={{ flexBasis: "100%" }}>
                        <strong>Delete “{m.unit}”?</strong>
                        <p style={{ margin: "6px 0" }}>This permanently removes the module with its student sessions, quiz data and flagged questions. It cannot be undone. To keep the data, edit the module instead.</p>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="nav-btn" onClick={() => setConfirm(null)}>Cancel</button>
                          <button className="explain-btn" disabled={busyId === m.id} onClick={() => runDelete("module", course, m)}>
                            {busyId === m.id ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />} Delete module
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button className="skip-link" style={{ marginTop: 4 }} onClick={() => onAddModule(course)}>+ Add another module</button>
          </div>
        ))}
      </div>

      {account && <AIHealthPanel session={account} />}

      {account && <AccountDataPanel session={account} kind="lecturer" onDeleted={onAccountDeleted} onOpenLegal={onOpenLegal} />}
    </div>
  );
}

// Lecturer-facing analytics: session history (who attended, how far they
// got, an AI summary, the full transcript on demand) plus every question
// the AI wasn't confident enough to answer on its own. Flagging is useless
// if nothing ever surfaces it back to a human, and a lecture leaves no
// trace at all without this — this is what a department asks to see in
// week one of any real pilot.
// ---------------------------------------------------------------------------
// Slide analytics (lecturer): where do students struggle? Built from the learning
// event log through a database function that applies row-level security, so a
// lecturer only ever sees events from their own courses.
// ---------------------------------------------------------------------------
// A titled section that stays closed until the lecturer opens it. Children are only mounted
// while open, so anything that loads data on mount (like the slide analytics) waits for the click.
function CollapsibleSection({ title, hint, nested = false, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const uid = useRef(`cs-${Math.random().toString(36).slice(2, 9)}`).current;
  return (
    <div className={nested ? "collapse-box nested" : "flag-section collapse-box"}>
      <button type="button" className="collapse-head" aria-expanded={open} aria-controls={uid} onClick={() => setOpen((o) => !o)}>
        <span className={nested ? "collapse-title nested" : "flag-section-title collapse-title"}>{title}</span>
        {hint && <span className="collapse-hint">{hint}</span>}
        <span className="collapse-chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="collapse-body" id={uid}>{children}</div>}
    </div>
  );
}

function SlideAnalyticsBody({ course, session }) {
  const modules = course.modules || [];
  const [moduleId, setModuleId] = useState(modules.length ? modules[0].id : null);
  const [rows, setRows] = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [error, setError] = useState("");
  const [advice, setAdvice] = useState({}); // slide index -> { loading, text, error }

  useEffect(() => {
    if (!moduleId || !supabaseEnabled()) { setRows([]); return undefined; }
    let cancelled = false;
    setRows(null);
    setBreakdown([]);
    setAdvice({});
    setError("");
    const call = (fn) => supabaseRequest(`/rpc/${fn}`, { method: "POST", body: JSON.stringify({ p_module_id: moduleId }) }, session && session.accessToken);
    Promise.all([call("module_slide_stats"), call("module_check_breakdown")])
      .then(([r, b]) => { if (!cancelled) { setRows(rowList(r)); setBreakdown(rowList(b)); } })
      .catch((e) => { if (!cancelled) { setError(e.message || "Couldn't load slide analytics."); setRows([]); } });
    return () => { cancelled = true; };
  }, [moduleId, session]);

  const mod = modules.find((m) => m.id === moduleId);
  const byIndex = new Map((rows || []).map((r) => [r.slide_index, r]));
  const slides = mod ? mod.slides || [] : [];
  const maxViewers = Math.max(0, ...(rows || []).map((r) => Number(r.viewers) || 0));
  const scored = slides.map((sl, i) => {
    const r = byIndex.get(i) || null;
    const sc = r ? attentionScore(r) : null;
    return { i, sl, r, sc, level: heatLevel(sc), why: r ? whyFlagged(r) : [] };
  });
  const attention = scored.filter((x) => x.level === "hot");
  const quizSummary = summarizeBreakdown(breakdown);
  const misconceptions = commonMisconceptions(quizSummary).slice(0, 8);
  const weak = weakConcepts(quizSummary);
  const slideTitleAt = (i) => (slides[i] ? slides[i].title : "");

  const getAdvice = async (x) => {
    setAdvice((a) => ({ ...a, [x.i]: { loading: true } }));
    const top = misconceptions.filter((m) => m.slideIndex === x.i).slice(0, 3).map((m) => `${m.count} students chose the wrong answer "${m.wrongText}"${m.confidentCount ? ` (${m.confidentCount} were very sure)` : ""}`);
    const evidence = [...x.why, ...top].join("\n") || "Students are struggling with this slide.";
    try {
      const text = await suggestSlideImprovements(x.sl, evidence);
      setAdvice((a) => ({ ...a, [x.i]: { text } }));
    } catch (e) {
      setAdvice((a) => ({ ...a, [x.i]: { error: e.message || "Couldn't get suggestions right now." } }));
    }
  };
  return (
    <div>
      {modules.length === 0 ? (
        <div className="empty-hint">Add a module to see how students get on with each slide.</div>
      ) : (
        <>
          {modules.length > 1 && (
            <label className="sk-edit-field" style={{ maxWidth: 360 }}>
              <span>Module</span>
              <select value={moduleId || ""} onChange={(e) => setModuleId(e.target.value)} aria-label="Choose a module">
                {modules.map((m) => <option key={m.id} value={m.id}>{m.unit || m.title || m.id}</option>)}
              </select>
            </label>
          )}
          {error && <div className="setup-error"><AlertTriangle size={13} /> {error}</div>}
          {rows === null ? (
            <div className="empty-hint"><Loader2 className="spin" size={14} /> Loading…</div>
          ) : maxViewers === 0 ? (
            <div className="empty-hint">No student activity recorded for this module yet. Once students attend, you'll see which slides confuse them, how long they spend on each, and how they answer the quiz questions.</div>
          ) : (
            <>
              {maxViewers < 3 && <div className="empty-hint">Only {maxViewers} student{maxViewers === 1 ? "" : "s"} so far, so scores stay blank until at least 3 have attended (so one student can't mislead you).</div>}
              {attention.length > 0 && (
                <div className="sk-warnings" role="note">
                  <strong>Slides that need attention</strong>
                  <ul>
                    {attention.map((x) => (
                      <li key={x.i}>
                        Slide {x.i + 1} “{x.sl.title}”: {x.why.join("; ") || "high confusion"}{" "}
                        <button className="skip-link inline" onClick={() => getAdvice(x)} disabled={advice[x.i] && advice[x.i].loading}>
                          {advice[x.i] && advice[x.i].loading ? "Thinking…" : "Suggest improvements"}
                        </button>
                        {advice[x.i] && advice[x.i].text && <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 2px", color: "#EDEFF2" }}>{advice[x.i].text}</p>}
                        {advice[x.i] && advice[x.i].error && <p style={{ margin: "6px 0 2px" }}>{advice[x.i].error}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {scored.some((x) => x.r && pauseHotspot(x.r)) && (
                <div className="sk-warnings" role="note" style={{ borderColor: "rgba(232,163,61,0.55)", background: "rgba(232,163,61,0.08)", color: "#F5D9A4" }}>
                  <strong>Slides where many students pause</strong>
                  <ul style={{ color: "#F5D9A4" }}>{scored.filter((x) => x.r && pauseHotspot(x.r)).map((x) => <li key={x.i} style={{ color: "#F5D9A4" }}>Slide {x.i + 1} “{x.sl.title}”: {pauseHotspot(x.r)}</li>)}</ul>
                </div>
              )}
              {weak.length > 0 && (
                <div className="sk-warnings" role="note">
                  <strong>Concepts the class is finding hard</strong>
                  <ul>{weak.map((c) => <li key={c.concept}>{c.concept}: {Math.round(c.correctRate * 100)}% correct across {c.answers} answers</li>)}</ul>
                </div>
              )}
              <div className="sk-table-wrap">
                <table className="sk-table" style={{ fontSize: 12.5 }}>
                  <thead>
                    <tr><th scope="col">Slide</th><th scope="col">Students</th><th scope="col">Avg time</th><th scope="col">Quiz correct</th><th scope="col">Got it / Unsure / Lost</th><th scope="col">Questions</th><th scope="col">Paused</th><th scope="col">Needs attention</th></tr>
                  </thead>
                  <tbody>
                    {scored.map(({ i, sl, r, sc, level }) => (
                      <tr key={i}>
                        <th scope="row">{i + 1}. {sl.title}</th>
                        <td>{r ? r.viewers : 0}</td>
                        <td>{r ? formatDwell(r.avg_dwell_ms) : "–"}</td>
                        <td>{r && Number(r.checks) > 0 ? `${Math.round((Number(r.checks_correct) / Number(r.checks)) * 100)}% (${r.checks})` : "–"}</td>
                        <td>{r ? `${r.got_it} / ${r.unsure} / ${r.lost}` : "–"}</td>
                        <td>{r ? Number(r.questions) + Number(r.low_confidence > 0 ? 0 : 0) : "–"}</td>
                        <td>{r && Number(r.viewers) > 0 ? `${r.manual_pausers || 0} of ${r.viewers}` : "–"}</td>
                        <td><span className={`heat heat-${level}`}>{sc === null ? "not enough data" : `${Math.round(sc * 100)}%`}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {quizSummary.concepts.length > 0 && (
                <CollapsibleSection nested title="Understanding by concept" hint={`${quizSummary.concepts.length} concept${quizSummary.concepts.length === 1 ? "" : "s"}`}>
                  <ConceptTable concepts={quizSummary.concepts} />
                </CollapsibleSection>
              )}
              {misconceptions.length > 0 && (
                <CollapsibleSection nested title="Common wrong answers (misconceptions)" hint={`${misconceptions.length} found`}>
                  <MisconceptionList items={misconceptions} slideTitle={slideTitleAt} />
                </CollapsibleSection>
              )}
              <p className="account-text">Needs attention combines wrong quiz answers, “unsure/lost” taps and questions asked on that slide. A slide is only scored once enough students have given data.</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function SlideAnalyticsPanel({ course, session }) {
  return (
    <CollapsibleSection title="Slide analytics" hint="Time, quiz results and confusion for each slide">
      <SlideAnalyticsBody course={course} session={session} />
    </CollapsibleSection>
  );
}

function CourseInsightsScreen({ course, session, runAuthed, onBack }) {
  const authed = useCallback((fn) => (runAuthed ? runAuthed(fn) : fn(session?.accessToken)), [runAuthed, session]);
  const [sessions, setSessions] = useState(null); // null = loading
  const [flags, setFlags] = useState(null);
  const [error, setError] = useState("");
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [clearBusy, setClearBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(null); // "all" | "completed" | null
  const [lastCleared, setLastCleared] = useState(null); // ids, for Undo
  const [showCleared, setShowCleared] = useState(false);

  const load = useCallback(() => {
    setSessions(null);
    setFlags(null);
    setError("");
    authed((t) => Promise.all([fetchSessions(course.id, t), fetchFlaggedQuestions(course.id, t)]))
      .then(([s, f]) => {
        setSessions(s);
        setFlags(f);
      })
      .catch((e) => {
        setError(e.message || "Couldn't load course insights.");
        setSessions([]);
        setFlags([]);
      });
  }, [course.id, authed]);

  useEffect(() => {
    load();
  }, [load]);

  const loadStudentRows = useCallback(
    (moduleId) => authed(async (t) => rowList(await supabaseRequest("/rpc/module_student_roster", { method: "POST", body: JSON.stringify({ p_module_id: moduleId }) }, t))),
    [authed]
  );

  const loadTeachingEvents = useCallback(() => authed((t) => fetchCourseLearningEvents(course.id, t)), [authed, course.id]);

  const approveFlag = async (flagId, question, answer) => {
    await authed((t) => approveFlaggedQuestion(flagId, question, answer, t));
    setFlags((fs) => fs.map((f) => (f.id === flagId ? { ...f, resolved: true, approved_question: question, lecturer_answer: answer } : f)));
  };

  const markResolved = async (flagId) => {
    setFlags((fs) => fs.map((f) => (f.id === flagId ? { ...f, resolved: true } : f)));
    try {
      await authed((t) => resolveFlaggedQuestion(flagId, t));
    } catch (e) {
      load(); // out of sync with the server — just reload rather than show a wrong state
    }
  };

  const unresolvedFlags = (flags || []).filter((f) => !f.resolved);
  const resolvedFlags = (flags || []).filter((f) => f.resolved);

  // Cleared sessions are hidden from this dashboard (and its numbers) but kept, so they can be restored.
  const allSessions = sessions || [];
  const clearedSessions = allSessions.filter((s) => s.lecturer_cleared_at);
  const visibleSessions = allSessions.filter((s) => !s.lecturer_cleared_at);
  const listed = showCleared ? clearedSessions : visibleSessions;
  const totalSessions = visibleSessions.length;
  const completedSessions = visibleSessions.filter((s) => s.completed).length;
  const completionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : null;
  const avgQuestions = totalSessions > 0 ? (visibleSessions.reduce((sum, s) => sum + (s.question_count || 0), 0) / totalSessions).toFixed(1) : null;

  const applyCleared = async (ids, clear) => {
    if (!ids.length || clearBusy) return;
    setClearBusy(true);
    setError("");
    try {
      await authed((t) => setSessionsCleared(course.id, ids, clear, t));
      const idSet = new Set(ids);
      const stamp = clear ? new Date().toISOString() : null;
      setSessions((list) => (list || []).map((x) => (idSet.has(x.id) ? { ...x, lecturer_cleared_at: stamp } : x)));
      setLastCleared(clear ? ids : null);
      setConfirmClear(null);
      if (!clear && clearedSessions.length - ids.length <= 0) setShowCleared(false);
    } catch (e) {
      setError(e.message || "Couldn't update the sessions — please try again.");
    } finally {
      setClearBusy(false);
    }
  };

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <div className="join-eyebrow">{course.code}</div>
        <h1 className="join-title">Course insights</h1>
        <p className="join-sub">Session history and flagged questions across every module in this course.</p>
        <button className="skip-link" onClick={onBack}>← Back to dashboard</button>
      </div>

      {error && <div className="setup-error"><AlertTriangle size={13} /> {error}</div>}

      {sessions === null ? (
        <div className="empty-hint"><Loader2 className="spin" size={14} /> Loading…</div>
      ) : (
        <>
          {totalSessions > 0 && (
            <div className="stats-row">
              <div className="stat-card"><div className="stat-value">{totalSessions}</div><div className="stat-label">Sessions</div></div>
              <div className="stat-card"><div className="stat-value">{completionRate}%</div><div className="stat-label">Completion rate</div></div>
              <div className="stat-card"><div className="stat-value">{avgQuestions}</div><div className="stat-label">Avg. questions asked</div></div>
              <div className="stat-card"><div className="stat-value">{unresolvedFlags.length}</div><div className="stat-label">Unresolved flags</div></div>
            </div>
          )}

          <Boundary label="slide-analytics" title="Slide analytics couldn’t be shown."><SlideAnalyticsPanel course={course} session={session} /></Boundary>
          <Boundary label="roster" title="The class roster couldn’t be shown."><RosterPanel course={course} loadRows={loadStudentRows} /></Boundary>
          <Boundary label="teaching-effect" title="The teaching-effect panel couldn’t be shown."><TeachingEffectPanel loadRows={loadTeachingEvents} /></Boundary>
          <Boundary label="feel" title="The lecture-feel summary couldn’t be shown."><FeelPanel loadRows={loadTeachingEvents} /></Boundary>

          <div className="flag-section">
            <div className="flag-section-title">{showCleared ? `Cleared sessions (${clearedSessions.length})` : `Sessions (${totalSessions})`}</div>
            {lastCleared && !showCleared && (
              <div className="clear-undo" role="status">
                Cleared {lastCleared.length} session{lastCleared.length === 1 ? "" : "s"} from this dashboard.
                <button className="skip-link" disabled={clearBusy} onClick={() => applyCleared(lastCleared, false)}>Undo</button>
              </div>
            )}
            {!showCleared && totalSessions > 0 && (
              <div className="clear-bar">
                {confirmClear ? (
                  <>
                    <span>
                      {confirmClear === "all" ? `Clear all ${totalSessions} sessions` : `Clear ${completedSessions} completed session${completedSessions === 1 ? "" : "s"}`} from this dashboard? Students keep their own history, and you can restore them later.
                    </span>
                    <button className="nav-btn" disabled={clearBusy} onClick={() => applyCleared((confirmClear === "all" ? visibleSessions : visibleSessions.filter((x) => x.completed)).map((x) => x.id), true)}>
                      {clearBusy ? <Loader2 className="spin" size={13} /> : <Trash2 size={13} />} Yes, clear
                    </button>
                    <button className="skip-link" disabled={clearBusy} onClick={() => setConfirmClear(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="nav-btn" onClick={() => setConfirmClear("all")}><Trash2 size={13} /> Clear all</button>
                    {completedSessions > 0 && completedSessions < totalSessions && (
                      <button className="nav-btn" onClick={() => setConfirmClear("completed")}>Clear completed only ({completedSessions})</button>
                    )}
                  </>
                )}
              </div>
            )}
            {showCleared && clearedSessions.length > 0 && (
              <div className="clear-bar">
                <button className="nav-btn" disabled={clearBusy} onClick={() => applyCleared(clearedSessions.map((x) => x.id), false)}>
                  {clearBusy ? <Loader2 className="spin" size={13} /> : <RotateCcw size={13} />} Restore all
                </button>
              </div>
            )}
            {listed.length === 0 ? (
              <div className="empty-hint">
                {showCleared ? "No cleared sessions." : clearedSessions.length > 0 ? "All sessions are cleared. New ones will appear here as students finish lectures." : "No sessions recorded yet — this fills in once a student attends a lecture."}
              </div>
            ) : (
              <div className="flag-list">
                {listed.map((s) => {
                  const open = expandedSessionId === s.id;
                  const mod = (course.modules || []).find((m) => m.id === s.module_id);
                  const mins = s.started_at && s.ended_at ? Math.round((new Date(s.ended_at) - new Date(s.started_at)) / 60000) : null;
                  const pct = s.total_slides > 0 ? Math.min(100, Math.round(((s.slides_reached || 0) / s.total_slides) * 100)) : 0;
                  return (
                    <div className={`session-item ${open ? "open" : ""}`} key={s.id}>
                      <button
                        type="button"
                        className="session-clear-btn"
                        disabled={clearBusy}
                        title={s.lecturer_cleared_at ? "Restore this session" : "Clear this session from the dashboard"}
                        aria-label={s.lecturer_cleared_at ? "Restore this session" : "Clear this session from the dashboard"}
                        onClick={() => applyCleared([s.id], !s.lecturer_cleared_at)}
                      >
                        {s.lecturer_cleared_at ? <RotateCcw size={13} /> : <Trash2 size={13} />}
                      </button>
                      {/* Collapsed row: just who, when, and how it went. Everything else waits for a click. */}
                      <button
                        type="button"
                        className="session-row"
                        aria-expanded={open}
                        aria-controls={`session-detail-${s.id}`}
                        onClick={() => setExpandedSessionId((id) => (id === s.id ? null : s.id))}
                      >
                        <span className="session-row-name">{s.student_name || "Student"}</span>
                        <span className="session-row-date">{new Date(s.ended_at).toLocaleString()}</span>
                        <span className={s.completed ? "session-badge complete" : "session-badge incomplete"}>
                          {s.completed ? "Completed" : "Left early"}
                        </span>
                        <span className="session-row-chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
                      </button>
                      {open && (
                        <div className="session-detail" id={`session-detail-${s.id}`}>
                          <div className="session-stats">
                            {mod && <div><span>Module</span>{mod.unit}</div>}
                            <div><span>Slides reached</span>{s.slides_reached || 0}/{s.total_slides || 0} ({pct}%)</div>
                            <div><span>Questions asked</span>{s.question_count || 0}</div>
                            {mins !== null && <div><span>Time in lecture</span>{mins < 1 ? "under a minute" : `${mins} min`}</div>}
                          </div>
                          {s.summary && <div className="flag-card-answer">{s.summary}</div>}
                          <div className="session-transcript-title">Transcript</div>
                          <div className="session-transcript">
                            {(s.transcript || []).length === 0 && <div className="session-transcript-line">No transcript was recorded for this session.</div>}
                            {(s.transcript || []).map((m, i) => (
                              <div key={i} className="session-transcript-line">
                                <strong>{m.speaker === "lecturer" ? "Lecturer" : m.speaker}:</strong> {m.text}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {clearedSessions.length > 0 && (
            <div className="clear-toggle">
              <button className="skip-link" onClick={() => setShowCleared((v) => !v)}>
                {showCleared ? "← Back to sessions" : `Show cleared sessions (${clearedSessions.length})`}
              </button>
            </div>
          )}

          {unresolvedFlags.length > 0 && (
            <div className="flag-section">
              <div className="flag-section-title">Needs review ({unresolvedFlags.length})</div>
              <div className="flag-list">
                {unresolvedFlags.map((f) => (
                  <Boundary key={f.id} label="flag-card" title="This question couldn’t be shown."><FlagReviewCard f={f} onResolve={markResolved} onApprove={approveFlag} /></Boundary>
                ))}
              </div>
            </div>
          )}
          {resolvedFlags.length > 0 && (
            <div className="flag-section">
              <div className="flag-section-title">Resolved ({resolvedFlags.length})</div>
              <div className="flag-list">
                {resolvedFlags.map((f) => (
                  <div className="flag-card resolved" key={f.id}>
                    <div className="flag-card-meta">{f.slide_title || "Unknown slide"} · {f.student_name || "Student"} · {new Date(f.created_at).toLocaleDateString()}</div>
                    <div className="flag-card-question">"{f.question}"</div>
                    {f.lecturer_answer && <div className="flag-card-answer">Your answer (used by the AI lecturer): {f.lecturer_answer}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main meeting room
// ---------------------------------------------------------------------------
// Phones (portrait) and landscape phones. There the chat is a sheet over the slide, so it starts closed.
const PHONE_QUERY = "(max-width: 720px), (max-height: 500px) and (orientation: landscape)";
const isPhoneScreen = () => { try { return !!(window.matchMedia && window.matchMedia(PHONE_QUERY).matches); } catch (e) { return false; } };


// Catches a render error inside one slide so the rest of the lecture room (controls,
// Prev/Next, chat) keeps working. It resets itself when the slide or view changes.
class SlideBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null, key: props.resetKey }; }
  static getDerivedStateFromError(err) { return { err }; }
  static getDerivedStateFromProps(props, state) { return props.resetKey !== state.key ? { err: null, key: props.resetKey } : null; }
  componentDidCatch(error, info) {
    logClientError("react.slide", error, { componentStack: String((info && info.componentStack) || "").slice(0, 1500), slide: this.props.resetKey });
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div role="alert" style={{ padding: 24, textAlign: "center", color: "#EDEFF2" }}>
        <p style={{ margin: "0 0 12px", fontSize: 15 }}>This slide couldn't be shown. Use Prev / Next to move on.</p>
        <p style={{ margin: "0 0 14px", fontSize: 12, opacity: 0.6 }}>{String((this.state.err && this.state.err.message) || this.state.err).slice(0, 160)}</p>
        <button onClick={this.props.onShowSlides} style={{ background: "#EDEFF2", color: "#14181C", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer" }}>Show slide view</button>
      </div>
    );
  }
}

export { LectureRoom, AuthScreen, JoinScreen, LecturerDashboard, ModuleSetupScreen };
// A module with no slides (nothing saved yet, or its slide data was damaged) cannot be taught. Show a plain
// explanation instead of letting the lecture room fall over.
function EmptyLecture({ role, onLeave, onEdit }) {
  return (
    <div role="status" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", color: "#EDEFF2" }}>
      <div style={{ maxWidth: 380 }}>
        <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>This module has no slides yet</h2>
        <p style={{ color: "#8890A0", fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>
          {role === "lecturer" ? "Add some slides to it, then preview it again." : "Your lecturer hasn’t finished it. Please try another module, or check back later."}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {role === "lecturer" && onEdit && (
            <button type="button" className="nav-btn" onClick={onEdit}>Back to dashboard</button>
          )}
          <button type="button" className="nav-btn" onClick={onLeave}>Leave</button>
        </div>
      </div>
    </div>
  );
}

function LectureRoom(props) {
  if (!hasSlides(props.curriculum)) return <EmptyLecture role={props.role} onLeave={props.onLeave} onEdit={props.onEditSession} />;
  return <LectureRoomInner {...props} />;
}

function LectureRoomInner({ curriculum, settings, courseId, moduleId, studentName, studentSession, researchConsent, shareWithLecturer, role, onLeave, onEditSession }) {
  const [slideIndex, setSlideIndex] = useState(0);
  // bumped whenever the student jumps to another slide by hand, so teaching work still in flight for the slide they left can tell it is out of date
  const navTokenRef = useRef(0);
  const [autopilotKick, setAutopilotKick] = useState(0);
  const [viewMode, setViewMode] = useState("slides"); // 'slides' | 'ide'
  const [chatOpen, setChatOpen] = useState(() => !isPhoneScreen());
  const [moreOpen, setMoreOpen] = useState(false); // phone top bar: the secondary actions live under "More"
  const [messages, setMessages] = useState([]);
  // with the chat closed (the phone default) show how many lecturer lines / answers arrived since it was last open
  const [seenCount, setSeenCount] = useState(0);
  useEffect(() => { if (chatOpen) setSeenCount(messages.length); }, [chatOpen, messages.length]);
  const unread = chatOpen ? 0 : Math.max(0, messages.length - seenCount);
  const [chatInput, setChatInput] = useState("");
  const [lecturerState, setLecturerState] = useState("idle"); // idle | explaining | answering | loading
  const [handRaised, setHandRaised] = useState(false);
  // ---- pause: the student can stop the lecture (to read slowly, take a call...). Tracked as rhythm, never as a score.
  const [paused, setPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState("manual");
  const [resuming, setResuming] = useState(false);
  const pausedRef = useRef(false);
  const resumingRef = useRef(false);
  const pauseTrackerRef = useRef(createPauseTracker());
  const focusStartRef = useRef(Date.now());
  const lastNudgeRef = useRef(0);
  const sessionCompleteRef = useRef(false);
  const [camOn, setCamOn] = useState(true);
  const [interrupted, setInterrupted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [typedCode, setTypedCode] = useState("");
  // Progressive delivery for worked examples / code walkthroughs
  const [reveal, setReveal] = useState({ slide: -1, count: Infinity });
  const [activeLines, setActiveLines] = useState(null);
  const [stepCaption, setStepCaption] = useState("");
  // comprehension check (multiple choice) shown after a slide is explained
  const [activeCheck, setActiveCheck] = useState(null);
  const checkResolverRef = useRef(null);
  const [signals, setSignals] = useState({}); // slide index -> "got_it" | "unsure" | "lost"
  // ---- adaptive lecturing: what do we know about this learner, and is personalisation on?
  const [adaptOn, setAdaptOn] = useState(() => {
    try { return localStorage.getItem("semai_adapt") !== "0"; } catch (e) { return true; }
  });
  const adaptOnRef = useRef(adaptOn);
  const [adaptNote, setAdaptNote] = useState(null); // { text, reason } shown beside the controls
  const historyRef = useRef([]); // quiz answers from earlier sessions (signed-in students only)
  const historyPromiseRef = useRef(null);
  const sessionEvidenceRef = useRef([]); // quiz answers during THIS session (everyone)
  const sessionAdaptRef = useRef(emptySession());
  const planLevelRef = useRef({});
  const lastEvidenceKeyRef = useRef("");
  const diagnosedRef = useRef(new Set()); // concepts already investigated this lecture
  const diagnosticRef = useRef(null); // always the latest runDiagnostic (assigned below)
  const claimsRef = useRef({}); // what the student said about themselves (signed-in students only)
  const masteryNow = () => estimateWithClaims([...historyRef.current, ...sessionEvidenceRef.current], claimsRef.current);
  // The slide area scrolls to follow the lecturer; scrolling by hand pauses that.
  const stageRef = useRef(null);
  const [speakProgress, setSpeakProgress] = useState({ slide: -1, i: 0, n: 1, text: "" });
  const [focusId, setFocusId] = useState(null); // which on-screen block the lecturer is talking about
  const lastFocusRef = useRef(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const [stageScrolled, setStageScrolled] = useState(false);
  const typedCodeRef = useRef("");
  useEffect(() => {
    typedCodeRef.current = typedCode;
  }, [typedCode]);
  const [autopilotOn, setAutopilotOn] = useState(true);
  const [ttsNotice, setTtsNotice] = useState("");
  // Student voice choices (speed, male/female, specific voice), remembered on this device.
  const [voicePrefs, setVoicePrefs] = useState(loadVoicePrefs);
  const voicePrefsRef = useRef(voicePrefs);
  const [voices, setVoices] = useState([]);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const voiceLang = (typeof navigator !== "undefined" && navigator.language) || "en";
  useEffect(() => { voicePrefsRef.current = voicePrefs; saveVoicePrefs(voicePrefs); }, [voicePrefs]);
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return undefined;
    const load = () => setVoices(window.speechSynthesis.getVoices() || []);
    load();
    window.speechSynthesis.addEventListener && window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => { window.speechSynthesis.removeEventListener && window.speechSynthesis.removeEventListener("voiceschanged", load); };
  }, []);
  const [aiNotice, setAiNotice] = useState("");
  // ---- offline: is the device connected, and how much of this lecture is saved for replay?
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => {
    const up = () => { setOnline(true); setAiNotice((n) => (/offline/i.test(n) ? "" : n)); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  const [offlineSave, setOfflineSave] = useState({ phase: "idle", done: 0, total: 0 }); // idle | saving | done | partial
  const saveForOfflineRef = useRef(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [presentationMode, setPresentationMode] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canFullscreen = typeof document !== "undefined" && !!document.fullscreenEnabled;
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch (e) { /* not supported or blocked: ignore */ }
  };
  const [notesStatus, setNotesStatus] = useState("idle"); // idle | generating | error
  const [notesProgress, setNotesProgress] = useState("");

  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);
  const audioRef = useRef(null);
  const activeResolveRef = useRef(null);
  const lastSpokenTextRef = useRef("");
  const typingIntervalRef = useRef(null);
  const explainedSlides = useRef(new Set());
  const messagesEndRef = useRef(null);

  const stateRef = useRef("idle");
  const interruptedRef = useRef(false);
  const slideIndexRef = useRef(0);
  const autopilotEnabledRef = useRef(true);
  const autopilotRunningRef = useRef(false);
  const introDoneRef = useRef(false);
  const mountedRef = useRef(true);
  const sessionRecordedRef = useRef(false);
  const sessionStartedAtRef = useRef(new Date().toISOString());

  // ---- learning analytics: append-only event log (never for lecturer previews)
  const sessionIdRef = useRef(makeId("session"));
  useEffect(() => {
    adaptOnRef.current = adaptOn;
    try { localStorage.setItem("semai_adapt", adaptOn ? "1" : "0"); } catch (e) { /* ignore */ }
    if (!adaptOn) setAdaptNote(null);
  }, [adaptOn]);
  useEffect(() => {
    if (!studentSession || role === "lecturer") return;
    historyPromiseRef.current = fetchMyCheckEvents(studentSession.user.id, studentSession.accessToken)
      .then((ev) => { historyRef.current = ev; })
      .catch(() => {});
    fetchConceptNotes(studentSession.user.id, studentSession.accessToken).then((n) => { claimsRef.current = n; }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const correctionsRef = useRef([]); // lecturer-approved answers for this module
  useEffect(() => {
    let cancelled = false;
    fetchModuleCorrections(moduleId).then((r) => { if (!cancelled) correctionsRef.current = r; });
    return () => { cancelled = true; };
  }, [moduleId]);
  const trackedSlideRef = useRef(null);
  const focusIdRef = useRef(null);
  const slideInfo = (i) => ({ index: i, key: slideKeyFor(curriculum.slides[i] || {}, i) });
  const currentInfo = () => slideInfo(Math.min(slideIndexRef.current, curriculum.slides.length - 1));
  const enterSlideTracking = (i) => {
    const info = slideInfo(i);
    trackedSlideRef.current = { info, t0: Date.now() };
    track("slide_view", info, { type: curriculum.slides[i] && curriculum.slides[i].type });
  };
  const leaveSlideTracking = () => {
    const cur = trackedSlideRef.current;
    if (cur) {
      track("slide_leave", cur.info, { dwell_ms: Date.now() - cur.t0 });
      trackedSlideRef.current = null;
    }
  };
  useEffect(() => {
    startTracking({
      enabled: role !== "lecturer" && supabaseEnabled() && !!courseId && !!moduleId,
      url: SUPABASE_URL,
      key: SUPABASE_ANON_KEY,
      sessionId: sessionIdRef.current,
      courseId,
      moduleId,
      studentId: studentSession ? studentSession.user.id : null,
      studentKey: getStudentKey(),
      consent: !!researchConsent,
      getToken: studentSession ? () => studentSession.accessToken : null,
    });
    track("session_start", null, { share: !!shareWithLecturer, ...(shareWithLecturer && studentName ? { name: String(studentName).trim().slice(0, 60) } : {}), total_slides: curriculum.slides.length, signed_in: !!studentSession, device: typeof window !== "undefined" && window.innerWidth < 700 ? "phone" : "desktop" });
    return () => {
      leaveSlideTracking();
      flushEvents();
      stopTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const messagesRef = useRef([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => { slideIndexRef.current = slideIndex; }, [slideIndex]);
  useEffect(() => { autopilotEnabledRef.current = autopilotOn; }, [autopilotOn]);
  // Chrome in particular can silently drop the very first speechSynthesis
  // utterance on a fresh page if the voice list hasn't loaded yet — this
  // nudges it to load early rather than on the lecturer's opening line.
  useEffect(() => {
    window.speechSynthesis && window.speechSynthesis.getVoices();
  }, []);

  const setLecturerState2 = (s) => {
    stateRef.current = s;
    setLecturerState(s);
  };

  // Fresh session whenever a new/edited curriculum is launched.
  useEffect(() => {
    explainedSlides.current = new Set();
    introDoneRef.current = false;
    setSlideIndex(0);
    setMessages([]);
    setLecturerState2("idle");
    setViewMode("slides");
    setAutopilotOn(true);
    setSessionComplete(false);
    setNotesStatus("idle");
    setNotesProgress("");
  }, [curriculum]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, chatOpen]);

  const slide = curriculum.slides[Math.min(slideIndex, curriculum.slides.length - 1)];
  // Progressive reveal only applies while the lecturer is actively teaching this slide
  const progressive = autopilotOn && reveal.slide === slideIndex;
  // The code editor only makes sense for a slide that has code. This is derived while rendering (not fixed up in an
  // effect afterwards) so that moving from a code slide to a plain one can never render the editor without code.
  const view = viewMode === "ide" && !slide.hasCode ? "slides" : viewMode;

  // New slide: back to the top (title visible) and follow the lecturer again.
  useEffect(() => {
    setUserScrolled(false);
    if (stageRef.current) stageRef.current.scrollTo({ top: 0 });
  }, [slideIndex]);

  // Which block is being discussed? Each spoken sentence is matched to the bullet / formula /
  // table row / diagram it is about; if nothing clearly matches, the focus stays where it was.
  const blocks = useMemo(() => extractBlocks(slide), [slide]);
  const slideIsScripted = useMemo(() => !!buildStructuredUnits(slide), [slide]);
  useEffect(() => {
    lastFocusRef.current = null;
    setFocusId(null);
  }, [slideIndex]);
  useEffect(() => {
    if (speakProgress.slide !== slideIndex || !autopilotOn || view !== "slides" || slideIsScripted) {
      if (speakProgress.slide !== slideIndex || !autopilotOn) setFocusId(null);
      return;
    }
    const m = matchSentenceToBlock(speakProgress.text, blocks, lastFocusRef.current);
    if (m) {
      lastFocusRef.current = m.id;
      setFocusId(m.id);
    }
  }, [speakProgress, blocks, slideIndex, autopilotOn, view, slideIsScripted]);

  // Keep what is being discussed comfortably in view (and only move when it isn't).
  useEffect(() => {
    const el = stageRef.current;
    if (!el || userScrolled || !autopilotOn || view !== "slides" || speakProgress.slide !== slideIndex) return;
    const live = reveal.slide === slideIndex && reveal.count > 0 ? el.querySelector(".sk-step.current, .sk-final") : null;
    const target = live || (focusId ? el.querySelector(`[data-sk-block="${focusId}"]`) : null);
    if (!target) return;
    const sr = el.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const header = el.querySelector(".sk-header");
    const top = scrollTopForBlock({
      blockTop: tr.top - sr.top + el.scrollTop,
      blockBottom: tr.bottom - sr.top + el.scrollTop,
      scrollTop: el.scrollTop,
      viewHeight: el.clientHeight,
      headerH: header ? header.offsetHeight : 0,
      scrollHeight: el.scrollHeight,
    });
    if (top !== null) el.scrollTo({ top, behavior: "smooth" });
  }, [focusId, speakProgress, reveal, slideIndex, userScrolled, autopilotOn, view]);

  useEffect(() => () => { if (checkResolverRef.current) checkResolverRef.current({ cancelled: true }); }, []);

  const stopFollowing = () => setUserScrolled(true);
  const followLecturer = () => setUserScrolled(false); // the effect above scrolls straight back to what's being discussed
  const wordBudget = computeWordBudget(settings.durationMinutes, curriculum.slides.length, settings.pace);
  const toneDesc = (TONE_OPTIONS.find((t) => t.id === settings.tone) || TONE_OPTIONS[0]).desc;
  const [stylePrefs, setStylePrefs] = useState(() => loadPrefs());
  const stylePrefsRef = useRef(stylePrefs);
  const updateStylePrefs = (patch) => setStylePrefs((p) => { const n = { ...p, ...patch }; stylePrefsRef.current = n; savePrefs(n); return n; });
  const personaCourse = { code: curriculum.code, title: curriculum.title, lecturerName: settings.lecturerName, lecturerPersona: settings.lecturerPersona, lecturerStyleNote: settings.lecturerStyleNote };
  const personaId = resolvePersona(personaCourse).id;
  const lecturerIdentity = (lecturerIdentityFor(personaCourse, { toneDesc, institution: settings.institution }).replace(/\.\s*$/, "") + styleLine(stylePrefs)).replace(/\.\s*$/, "");
  const [careOffer, setCareOffer] = useState(null); // { line } while the lecturer is offering slower / break / carry on
  const careResolveRef = useRef(null);
  const signalLogRef = useRef([]); // this lecture's "I'm lost" etc. taps: [{slide, value}]
  const lastCareOfferRef = useRef(0);
  const conversationRef = useRef(null); // this lecture's questions and answers, for follow-ups (in memory only)
  if (!conversationRef.current) conversationRef.current = createConversation();
  const milestonesRef = useRef({ shown: new Set(), count: 0 });
  const [feelChoice, setFeelChoice] = useState(null); // the student's one tap at the end of the lecture
  const careOffersMadeRef = useRef(0);
  const lastFeedbackKeyRef = useRef(null);
  const lastAckKeyRef = useRef(null);
  // Feedback that answers what the student actually did: recovering after a miss, a run of right answers,
  // how sure they said they were. Counts only what has really been recorded.
  const feedbackFor = (check, outcome) => {
    const same = (list) => list.filter((e) => e.concept && check.concept && conceptsMatch(e.concept, check.concept));
    const sess = same(sessionEvidenceRef.current);
    const priorSess = sess.slice(0, -1); // the answer just given is already recorded
    const priorHist = same(historyRef.current);
    let streak = 0;
    for (let i = sessionEvidenceRef.current.length - 1; i >= 0; i--) { if (sessionEvidenceRef.current[i].correct) streak++; else break; }
    const r = quizFeedback({
      check, correct: outcome.correct, confidence: outcome.confidence || null,
      priorMisses: priorSess.filter((e) => !e.correct).length,
      everWeak: priorHist.filter((e) => !e.correct).length >= 2,
      streak: outcome.correct ? streak : 0,
      name: stylePrefsRef.current.useName ? studentName : "", personaId: feedbackCharacter(stylePrefsRef.current, personaId), last: lastFeedbackKeyRef.current,
    });
    lastFeedbackKeyRef.current = r.key;
    return r.text;
  };
  // A moment worth marking, from the real record only (null if there isn't one).
  const milestoneFor_ = (check, outcome) => {
    const m = milestonesRef.current;
    if (!outcome.correct || !check.concept || m.count >= MAX_MILESTONES_PER_LECTURE) return null;
    const key = String(check.concept).toLowerCase();
    if (m.shown.has(key)) return null;
    const ev = [...historyRef.current, ...sessionEvidenceRef.current];
    const pick = (list) => estimateWithClaims(list, claimsRef.current).find((x) => conceptsMatch(x.concept, check.concept)) || null;
    const hit = milestoneFor({ before: pick(ev.slice(0, -1)), after: pick(ev), correct: true });
    if (!hit) return null;
    m.shown.add(key); m.count += 1;
    return milestoneLine(hit.kind, check.concept, feedbackCharacter(stylePrefsRef.current, personaId));
  };

  // Code reveals fresh on a new slide: full code if it's already been taught,
  // blank (waiting to be live-typed) if this is the first visit.
  useEffect(() => {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    // (taught already, or the student is browsing by hand with the lecturer paused: show it all; only the live lecturer types it out)
    setTypedCode(slide.hasCode && (explainedSlides.current.has(slideIndex) || !autopilotEnabledRef.current) ? slide.code : "");
  }, [slideIndex, slide]);

  // Fallback estimate used for the browser-voice path (and to kick off code
  // typing immediately, before we'd otherwise know real audio duration).
  const estimateSpeechDurationMs = (text) => {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1500, (words / AVG_SPEAKING_WPM) * 60000 / (voicePrefsRef.current.rate || 1));
  };

  // A short sample in the student's chosen voice and speed. It never cancels the lecture's own speech.
  const previewVoice = () => {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance("Hello, I'm your lecturer. This is how I sound at this speed.");
    u.rate = voicePrefsRef.current.rate || 1;
    const chosen = chooseVoice(window.speechSynthesis.getVoices(), voicePrefsRef.current, voiceLang);
    if (chosen) { try { u.voice = chosen; u.lang = chosen.lang; } catch (e) { /* unusable voice: keep the default */ } }
    window.speechSynthesis.speak(u);
  };

  const animateTyping = useCallback((code, durationMs, startFrom = 0) => {
    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    let start = performance.now();
    const remainingLen = code.length - startFrom;
    typingIntervalRef.current = setInterval(() => {
      if (pausedRef.current) { start += 40; return; } // time spent paused doesn't count towards the typing progress
      const elapsed = performance.now() - start;
      const progress = Math.min(1, elapsed / durationMs);
      setTypedCode(code.slice(0, startFrom + Math.floor(progress * remainingLen)));
      if (progress >= 1) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
    }, 40);
  }, []);

  const addMessage = (speaker, text, type = "chat") => {
    setMessages((m) => [...m, { id: Date.now() + Math.random(), speaker, text, type }]);
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Polls until the lecturer state machine returns to idle — used after an
  // interruption so the autopilot loop waits for the Q&A exchange to
  // actually finish before it resumes teaching.
  const waitForIdle = () =>
    new Promise((resolve) => {
      const check = () => {
        if (!mountedRef.current || (stateRef.current === "idle" && !pausedRef.current)) return resolve();
        setTimeout(check, 150);
      };
      check();
    });

  // Cuts off whatever is currently being said — browser voice or ElevenLabs
  // audio — and resolves any in-flight speakInterruptible() call with
  // `false` immediately (pause() doesn't fire a natural completion event,
  // so callers would otherwise hang waiting for one).
  const stopSpeaking = useCallback(() => {
    interruptedRef.current = true;
    window.speechSynthesis && window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    if (activeResolveRef.current) {
      activeResolveRef.current(false);
      activeResolveRef.current = null;
    }
  }, []);

  // Unified speech: tries ElevenLabs for natural voice if configured, falls
  // back to the browser's built-in (robotic) speechSynthesis otherwise or
  // on any request failure. Resolves `true` if it finished naturally,
  // `false` if it was interrupted (student asked a question, or navigation
  // happened) — callers use that to decide whether to wait for the
  // resulting Q&A to finish before continuing.
  const speakInterruptible = useCallback(
    async (text, { onDurationKnown, onStart, bypassPause } = {}) => {
      // If the student presses Prev/Next while this line is waiting (paused) or
      // still downloading, the line belongs to a slide that is no longer shown
      // and must not start playing afterwards.
      const speakToken = navTokenRef.current;
      const navMoved = () => !mountedRef.current || navTokenRef.current !== speakToken;
      if (!bypassPause) {
        while (pausedRef.current && mountedRef.current && !navMoved()) await new Promise((r) => setTimeout(r, 200));
        if (navMoved()) return false;
      }
      const tSpeak = performance.now();
      let startLogged = false;
      const markStart = (provider, extra) => {
        if (startLogged) return;
        startLogged = true;
        logTiming("tts_start", { provider, client_ms: performance.now() - tSpeak, chars: text.length, extra });
        onStart && onStart();
      };
      interruptedRef.current = false;
      lastSpokenTextRef.current = text;

      if (settings.voiceProvider === "elevenlabs" && settings.elevenLabsApiKey) {
        const voiceId = settings.elevenLabsVoiceId || "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs default "Rachel" voice
        try {
          const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: "POST",
            headers: { "xi-api-key": settings.elevenLabsApiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              model_id: "eleven_multilingual_v2",
              // Stability near the default (0.5+) sounds steady but flat —
              // this is the single biggest lever for "robotic" complaints.
              // Dropping it toward 0.4 lets pitch/timing vary naturally
              // between takes, the way a real person's delivery does.
              // A little style adds warmth without tipping into caricature.
              voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
            }),
          });
          if (!res.ok) throw new Error(`ElevenLabs request failed (${res.status})`);
          const blob = await res.blob();
          if (navMoved()) return false;
          const fetchMs = Math.round(performance.now() - tSpeak); // the whole sentence is downloaded before playback begins
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.playbackRate = voicePrefsRef.current.rate || 1;
          try { audio.preservesPitch = true; } catch (e) { /* older browsers */ }
          audioRef.current = audio;
          setTtsNotice("");
          const result = await new Promise((resolve, reject) => {
            activeResolveRef.current = resolve;
            audio.onloadedmetadata = () => {
              if (isFinite(audio.duration)) onDurationKnown && onDurationKnown((audio.duration * 1000) / (voicePrefsRef.current.rate || 1));
            };
            audio.onplaying = () => markStart("elevenlabs", { fetch_ms: fetchMs });
            audio.onended = () => resolve(true);
            audio.onerror = () => resolve(false);
            // A rejected play() here is almost always the browser's autoplay
            // policy blocking audio that wasn't triggered by a direct click
            // — surface it instead of resolving silently, so the caller's
            // catch block below can show the "tap to enable" affordance.
            audio.play().catch((err) => reject(err));
          });
          URL.revokeObjectURL(url);
          activeResolveRef.current = null;
          audioRef.current = null;
          return result;
        } catch (e) {
          const blockedByAutoplay = e && (e.name === "NotAllowedError" || e.name === "NotSupportedError");
          setTtsNotice(
            blockedByAutoplay
              ? "Your browser blocked auto-playing audio — tap the 🔊 button to enable the lecturer's voice."
              : "Couldn't reach ElevenLabs for that line — used the browser voice instead."
          );
          if (blockedByAutoplay) setAudioBlocked(true);
          if (navMoved()) return false;
          // falls through to the browser voice below (it may also be blocked,
          // but is worth trying — browsers treat speechSynthesis and
          // HTMLMediaElement autoplay policy somewhat differently)
        }
      }

      onDurationKnown && onDurationKnown(estimateSpeechDurationMs(text));
      if (!window.speechSynthesis) return true;
      window.speechSynthesis.cancel();
      return new Promise((resolve) => {
        activeResolveRef.current = resolve;
        const u = new SpeechSynthesisUtterance(text);
        u.rate = voicePrefsRef.current.rate || 1;
        u.pitch = 1;
        const chosen = chooseVoice(window.speechSynthesis.getVoices(), voicePrefsRef.current, (typeof navigator !== "undefined" && navigator.language) || "en");
        if (chosen) { try { u.voice = chosen; u.lang = chosen.lang; } catch (e) { /* unusable voice: keep the default */ } }
        u.onstart = () => markStart("browser");
        u.onend = () => resolve(true);
        utteranceRef.current = u;
        window.speechSynthesis.speak(u);
      });
    },
    [settings.voiceProvider, settings.elevenLabsApiKey, settings.elevenLabsVoiceId]
  );

  // Every spoken AI call goes through here instead of callAI directly,
  // so a rate limit or provider error surfaces as a visible notice (and a
  // sensible spoken fallback line) instead of the lecturer just going
  // quiet or saying something generic with no explanation why.
  const askLecturer = useCallback(async (system, prompt, fallback, kind = "live", meta = null) => {
    // No connection: don't wait for a request that cannot succeed. The saved lecture carries on.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setAiNotice("You're offline, so the lecturer is using what's saved on this device. New questions will have to wait until you're back online.");
      return fallback;
    }
    try {
      const text = await callAI(system, prompt, undefined, undefined, kind);
      if (text) { setAiNotice(""); if (meta) meta.ok = true; }
      return text || fallback;
    } catch (e) {
      setAiNotice(
        e && e.rateLimited
          ? "The AI lecturer is getting a lot of requests right now — using a fallback line until it clears up."
          : e && e.timeout
          ? "The AI lecturer is taking too long to answer — using a fallback line."
          : "Had trouble reaching the AI lecturer just now — using a fallback line."
      );
      return fallback;
    }
  }, []);

  // Like askLecturer, but the reply streams in (onText gets the text so far). Anything that goes wrong falls back to the
  // ordinary request, so a streaming problem can never leave the student without an answer.
  const askLecturerStream = useCallback(async (system, prompt, fallback, kind, onText) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return askLecturer(system, prompt, fallback, kind);
    try {
      const text = await callAIStream(system, prompt, { onText, kind: `${kind}_stream` });
      if (text) { setAiNotice(""); return text; }
    } catch (e) { /* fall through to the ordinary request */ }
    return askLecturer(system, prompt, fallback, kind);
  }, [askLecturer]);

  const generateExplanation = useCallback(
    async (targetSlide, plan, slideIdx = 0, meta = {}) => {
      // what to say if the AI can't be reached: the narration it gave before, else the slide's own content
      const fb = await narrationFallback(offlineStore(), moduleId, targetSlide, slideIdx);
      const system = `You are ${lecturerIdentity}. You are mid-lecture, speaking out loud to a room of students. Keep this explanation to about ${adaptWordBudget(plan, wordBudget)} words. ${NATURAL_SPEECH_STYLE}`;
      const followAlong = " Walk through the on-screen points in the order they appear on the slide, and use the slide's own key words for each point, so students can follow along as you speak.";
      const detailContext = followAlong + (targetSlide.detail ? ` On-screen supporting text: ${targetSlide.detail}` : "") +
        (targetSlide.diagram || targetSlide.plot || targetSlide.table || targetSlide.definition || targetSlide.formulas
          ? ` Everything the students can see on this slide:\n${slideToPlainContext(targetSlide)}\nTalk them through what is on screen (for a diagram, walk through it step by step; say formulas in words). Never read symbols, LaTeX or code characters out letter by letter.`
          : "");
      const prompt = targetSlide.hasCode
        ? `Current slide: "${targetSlide.title}". Teaching notes: ${targetSlide.notes}${detailContext} You are about to type this code live on screen while you talk: ${targetSlide.code} Narrate it roughly in the order it will be typed, top to bottom, like you're writing it in front of the class.`
        : `Current slide: "${targetSlide.title}". Teaching notes: ${targetSlide.notes}${detailContext}`;
      const text = await askLecturer(system, prompt + adaptationPrompt(plan), fb.text, "explain", meta);
      // keep the standard version on the device for offline replay (not the personalised variants)
      if (meta.ok && plan && plan.level === "standard" && !plan.reminder && role !== "lecturer") saveNarration(offlineStore(), moduleId, targetSlide, slideIdx, text);
      return text;
    },
    [lecturerIdentity, wordBudget, askLecturer, moduleId, role]
  );

  // "Save for offline": ask the AI once for each slide's explanation (slides with scripted steps already carry
  // their own spoken lines) and keep the text on the device, so the lecture can be replayed with no connection.
  // It uses a few AI requests, one slide at a time, and only when the student chooses to.
  saveForOfflineRef.current = async () => {
    if (offlineSave.phase === "saving") return;
    const slides = curriculum.slides;
    const standard = { level: "standard", reminder: null, reason: null, concept: null, applied: false };
    setOfflineSave({ phase: "saving", done: 0, total: slides.length });
    let done = 0, misses = 0, stopped = false;
    for (let i = 0; i < slides.length; i++) {
      if (!mountedRef.current) return;
      const slide = slides[i];
      const already = buildStructuredUnits(slide) || (await hasNarration(offlineStore(), moduleId, slide, i));
      if (!already) {
        const meta = {};
        await generateExplanation(slide, standard, i, meta);
        if (!meta.ok) { misses += 1; if (misses >= 2) { stopped = true; break; } continue; }
        await sleep(400); // gentle on the AI service's per-minute limit
      }
      done += 1;
      if (mountedRef.current) setOfflineSave({ phase: "saving", done, total: slides.length });
    }
    if (mountedRef.current) setOfflineSave({ phase: stopped || done < slides.length ? "partial" : "done", done, total: slides.length });
  };

  // Teaches one slide end-to-end: switches to the right view, explains it
  // (typing code live in sync with estimated speech duration), and — if
  // interrupted by a question — resumes the SAME explanation afterward
  // rather than abandoning it. Speaking happens sentence-by-sentence
  // specifically so "resume" means something precise: continue from the
  // next unspoken sentence, not a guess at some mid-utterance cut point.
  const teachSlide = useCallback(
    async (index) => {
      const targetSlide = curriculum.slides[index];
      const myToken = navTokenRef.current;
      // true once the student has navigated away (or left): from then on this run must not change anything on screen
      const stale = () => !mountedRef.current || navTokenRef.current !== myToken;
      setViewMode(targetSlide.hasCode ? "ide" : "slides");
      setLecturerState2("loading");

      // After a long unbroken stretch, a gentle suggestion to rest (never forced, never repeated within another full stretch)
      if (role !== "lecturer" && index > 0 && stylePrefsRef.current.careOffers && breakNudgeDue({ focusStartMs: focusStartRef.current, now: Date.now(), lastNudgeMs: lastNudgeRef.current })) {
        lastNudgeRef.current = Date.now();
        track("break_nudge", slideInfo(index), null);
        addMessage("lecturer", BREAK_NUDGE_TEXT, "explain");
        setLecturerState2("explaining");
        const nudged = await speakInterruptible(BREAK_NUDGE_TEXT);
        if (stale()) return;
        if (!nudged) await waitForIdle();
        setLecturerState2("loading");
      }

      // The student has told us it is going badly (taps, wrong answers): offer slower / a break / carrying on. Their choice rules.
      if (role !== "lecturer" && index > 0) {
        const due = careDue({
          signals: signalLogRef.current, answers: sessionEvidenceRef.current.filter((e) => !e.diagnostic), slideIndex: index,
          prefs: stylePrefsRef.current, now: Date.now(), lastOfferMs: lastCareOfferRef.current, offersMade: careOffersMadeRef.current,
        });
        if (due && !stale()) {
          lastCareOfferRef.current = Date.now();
          careOffersMadeRef.current += 1;
          const fam = feedbackCharacter(stylePrefsRef.current, personaId);
          const line = careLine(fam, stylePrefsRef.current.useName ? studentName : "");
          track("signal", slideInfo(index), { value: "care_offer", reason: due.reason });
          addMessage("lecturer", line, "explain");
          setLecturerState2("explaining");
          const choiceP = new Promise((resolve) => { careResolveRef.current = resolve; setCareOffer({ line }); setTimeout(() => resolve(null), 25000); });
          const lineDone = await speakInterruptible(line);
          if (stale()) { setCareOffer(null); return; }
          if (!lineDone) await waitForIdle();
          setLecturerState2("idle");
          const choice = await choiceP;
          setCareOffer(null);
          careResolveRef.current = null;
          if (stale()) return;
          if (choice) {
            track("signal", slideInfo(index), { value: "care_choice", choice });
            const reply = careReply(choice, fam);
            addMessage("lecturer", reply, "explain");
            setLecturerState2("explaining");
            await speakInterruptible(reply);
            if (stale()) return;
            setLecturerState2("loading");
            if (choice === "slower") sessionAdaptRef.current.lostSlides.add(index);
            if (choice === "break") pauseLecture("manual");
          } else {
            setLecturerState2("loading");
          }
        }
      }

      // How should THIS slide be taught to THIS student right now? (never skips content or changes assessment)
      const plan = planForSlide({ slide: targetSlide, slideIndex: index, mastery: masteryNow(), session: sessionAdaptRef.current, enabled: adaptOnRef.current });
      planLevelRef.current[index] = plan.level;
      if (plan.applied) {
        setAdaptNote(adaptationLabel(plan));
        if (plan.reminder) sessionAdaptRef.current.reminded.add(plan.reminder);
        track("adapt_applied", slideInfo(index), { level: plan.level, reminder: !!plan.reminder, concept: plan.concept });
      } else {
        setAdaptNote(null);
      }

      let structuredUnits = buildStructuredUnits(targetSlide);
      if (structuredUnits && plan.reminder) {
        // scripted slides can't be re-narrated, so the prerequisite reminder is spoken first
        const line = await askLecturer(
          `You are ${lecturerIdentity}. ${NATURAL_SPEECH_STYLE}`,
          `In one short sentence, remind the students of "${plan.reminder}" in plain words, as a quick refresher because the next slide builds on it.`,
          `Quick reminder: ${plan.reminder} is the idea we're building on here.`,
          "recap"
        );
        if (stale()) return;
        structuredUnits = [{ say: line, reveal: 0, lines: null }, ...structuredUnits];
      }
      const isWalkthrough = !!(targetSlide.hasCode && targetSlide.codeSteps && targetSlide.codeSteps.length);
      const explanation = structuredUnits ? structuredUnits.map((u) => u.say).join(" ") : await generateExplanation(targetSlide, plan, index);
      if (stale()) return;
      addMessage("lecturer", explanation, "explain");
      setLecturerState2("explaining");

      if (isWalkthrough) {
        setTypedCode(targetSlide.code); // walkthroughs show the full program and highlight lines as they're explained
      } else if (targetSlide.hasCode) {
        setTypedCode("");
        animateTyping(targetSlide.code, estimateSpeechDurationMs(explanation), 0);
      }
      if (structuredUnits) setReveal({ slide: index, count: 0 });

      const sentences = structuredUnits ? structuredUnits.map((u) => u.say) : splitIntoSentences(explanation);
      let sentenceIndex = 0;

      while (sentenceIndex < sentences.length) {
        if (stale() || !autopilotEnabledRef.current) return;
        setSpeakProgress({ slide: index, i: sentenceIndex, n: sentences.length, text: sentences[sentenceIndex] });
        if (structuredUnits) {
          const u = structuredUnits[sentenceIndex];
          if (u.reveal !== undefined) setReveal({ slide: index, count: u.reveal });
          if ("lines" in u) {
            setActiveLines(u.lines);
            setStepCaption(u.lines ? u.say : "");
          }
        }
        const completed = await speakInterruptible(sentences[sentenceIndex]);
        if (stale()) return;

        if (completed) {
          sentenceIndex++;
          continue;
        }

        // Interrupted mid-sentence: wait for the full question-answer
        // exchange (including its own acknowledgment) to finish, then
        // retry this SAME sentence — that's what makes it a genuine
        // resume rather than skipping ahead to the next slide.
        setInterrupted(true);
        await waitForIdle();
        setInterrupted(false);
        if (stale() || !autopilotEnabledRef.current) return;

        if (targetSlide.hasCode && typedCodeRef.current.length < targetSlide.code.length) {
          const remainingText = sentences.slice(sentenceIndex).join(" ");
          animateTyping(targetSlide.code, estimateSpeechDurationMs(remainingText), typedCodeRef.current.length);
        }
        setLecturerState2("explaining");
        // loop retries sentences[sentenceIndex] — not incremented above
      }

      if (targetSlide.hasCode) {
        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;
        }
        setTypedCode(targetSlide.code);
      }
      explainedSlides.current.add(index);
      setSpeakProgress({ slide: -1, i: 0, n: 1, text: "" });
      if (structuredUnits) {
        setReveal({ slide: index, count: Infinity });
        setActiveLines(null);
        setStepCaption("");
      }

      // Real comprehension check (multiple choice): recorded, and answered with the pre-written explanation.
      const check = targetSlide.checks && targetSlide.checks[0];
      const isLast = index === curriculum.slides.length - 1;
      let ranCheck = false;
      if (check && !isLast && !stale() && autopilotEnabledRef.current) {
        const lead = "Quick question, to check you've got this.";
        setLecturerState2("explaining");
        addMessage("lecturer", lead, "explain");
        const answered = new Promise((resolve) => {
          checkResolverRef.current = resolve;
          setActiveCheck(newCheckState(index, check, performance.now()));
          track("check_shown", slideInfo(index), { concept: check.concept });
        });
        const leadDone = await speakInterruptible(lead);
        if (stale()) return;
        if (!leadDone) await waitForIdle();
        setLecturerState2("idle");
        const outcome = await answered;
        if (stale() || !autopilotEnabledRef.current) return;
        ranCheck = true;
        if (outcome && !outcome.skipped && !outcome.cancelled) {
          const feedback = feedbackFor(check, outcome);
          setLecturerState2("explaining");
          addMessage("lecturer", feedback, "explain");
          const fbDone = await speakInterruptible(feedback);
          if (stale()) return;
          if (!fbDone) await waitForIdle();
          setLecturerState2("idle");
          const mile = adaptOnRef.current ? milestoneFor_(check, outcome) : null;
          if (mile && !stale()) {
            await sleep(400);
            setLecturerState2("explaining");
            addMessage("lecturer", mile, "explain");
            const mDone = await speakInterruptible(mile);
            if (stale()) return;
            if (!mDone) await waitForIdle();
            setLecturerState2("idle");
          }
          await sleep(700);
          // missed it: is the real gap an earlier idea? (one short question, only if personalisation is on)
          if (!outcome.correct && adaptOnRef.current && diagnosticRef.current) {
            await diagnosticRef.current(index, check.concept, stale);
            if (stale()) return;
          }
        }
      }

      // Quick, human "did that land?" check before moving on (skipped when a real check just ran).
      if (ranCheck) return;
      setLecturerState2("loading");
      const checkSystem = `You are ${lecturerIdentity}. In one short, warm sentence, check whether the student followed what you just covered${
        isLast ? ", and let them know that wraps up today's material" : `, before moving on to "${curriculum.slides[index + 1].title}"`
      }. ${NATURAL_SPEECH_STYLE}`;
      const checkText = await askLecturer(
        checkSystem,
        `You just finished explaining "${targetSlide.title}".`,
        isLast ? "That's everything for today — nicely done!" : "Does that make sense so far?",
        "check"
      );
      if (stale()) return;
      const safeCheck = checkText;
      addMessage("lecturer", safeCheck, "explain");
      setLecturerState2("explaining");
      const checkCompleted = await speakInterruptible(safeCheck);
      if (stale()) return;
      if (!checkCompleted) await waitForIdle();
      setLecturerState2("idle");
      if (!isLast) await sleep(900);
    },
    [curriculum, generateExplanation, speakInterruptible, animateTyping, lecturerIdentity, askLecturer]
  );

  const runIntro = useCallback(async () => {
    setLecturerState2("loading");
    const system = `You are ${lecturerIdentity}. A student named ${studentName} just joined your live virtual classroom. Warmly welcome them by name. ${introGuidance(personaCourse)} Then give a short overview of what today's session (${curriculum.unit}) will cover. Under ${Math.max(
      50,
      Math.round(wordBudget * 0.7)
    )} words. ${NATURAL_SPEECH_STYLE}`;
    await Promise.race([historyPromiseRef.current || Promise.resolve(), sleep(1500)]);
    let personal = welcomeGuidance({ mode: "unknown", facts: [] });
    if (adaptOnRef.current) {
      const moduleConcepts = [...new Set(curriculum.slides.flatMap((s) => [...(s.concepts || []), ...(s.prerequisites || [])]))];
      // only things really on record: earlier answers from this student's own saved history
      const wf = buildWelcomeFacts({ events: historyRef.current, moduleConcepts });
      personal = welcomeGuidance(wf);
      const rel = conceptsToRevise(masteryNow(), 3).filter((c) => moduleConcepts.some((m) => conceptsMatch(m, c.concept))).map((c) => c.concept);
      if (rel.length && wf.mode === "returning") personal += ` Also say, in one friendly sentence, that you will give a quick reminder where ${rel.join(" and ")} come up. Do not mention scores or percentages.`;
    }
    const prompt = `Course: ${curriculum.code} — ${curriculum.title}. Today's topics in order: ${curriculum.slides.map((s) => s.title).join(", ")}.${personal}`;
    const resolved = resolvePersona(personaCourse);
    const fallbackWelcome = `Welcome, ${studentName}! ${resolved.name ? `I'm ${resolved.name}, your AI lecturer. ` : "I'm your AI lecturer. "}Today we're covering ${curriculum.unit}.`;
    const text = await askLecturer(system, prompt, fallbackWelcome, "welcome");
    if (!mountedRef.current) return;
    const safeText = text;
    addMessage("lecturer", safeText, "explain");
    setLecturerState2("explaining");
    const completed = await speakInterruptible(safeText);
    if (!mountedRef.current) return;
    if (!completed) await waitForIdle();
    setLecturerState2("idle");
    await sleep(500);
    introDoneRef.current = true;
  }, [lecturerIdentity, studentName, curriculum, wordBudget, speakInterruptible, askLecturer]);

  const runAutopilot = useCallback(async () => {
    const runToken = navTokenRef.current;
    if (!introDoneRef.current) {
      await runIntro();
    }
    for (let i = slideIndexRef.current; i < curriculum.slides.length; i++) {
      if (!mountedRef.current || !autopilotEnabledRef.current) return null;
      // the student jumped to another slide while this run was busy: hand over to a fresh run from where they are now
      if (navTokenRef.current !== runToken) return "restart";
      setSlideIndex(i);
      await teachSlide(i);
    }
    if (navTokenRef.current !== runToken) return "restart";
    if (mountedRef.current) setSessionComplete(true);
    return null;
  }, [runIntro, teachSlide, curriculum]);

  // Drives the whole session automatically: starts on mount / whenever
  // autopilot is (re)enabled, and stops cleanly when paused (e.g. by manual
  // Prev/Next) — resuming later picks up from the current slide, not zero.
  useEffect(() => {
    if (autopilotOn && !autopilotRunningRef.current) {
      autopilotRunningRef.current = true;
      runAutopilot().then(
        (outcome) => {
          autopilotRunningRef.current = false;
          // autopilot was switched back on while the old run was still winding down: start the new run now
          if (outcome === "restart" && mountedRef.current && autopilotEnabledRef.current) setAutopilotKick((k) => k + 1);
        },
        (err) => {
          autopilotRunningRef.current = false;
          throw err; // still reported by the global error logger, exactly as before
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilotOn, curriculum, autopilotKick]);

  // Records the session once — either when it completes naturally or when
  // the student leaves early — never both (guarded by sessionRecordedRef).
  // Skips lecturer preview sessions so testing doesn't pollute a course's
  // real analytics.
  const finalizeSession = useCallback(
    async (completed) => {
      if (sessionRecordedRef.current) return;
      if (role === "lecturer") return;
      if (!supabaseEnabled() || !courseId || !moduleId) return;
      sessionRecordedRef.current = true;
      const currentMessages = messagesRef.current;
      const questionCount = currentMessages.filter((m) => m.type === "question").length;
      const slidesReached = completed ? curriculum.slides.length : slideIndexRef.current + 1;
      const ps = pauseTrackerRef.current.stats();
      track("session_end", null, { completed, slides_reached: slidesReached, questions: questionCount, duration_s: Math.round((Date.now() - new Date(sessionStartedAtRef.current).getTime()) / 1000), paused_s: Math.round(ps.totalMs / 1000), pauses: ps.count, manual_pauses: ps.manual, away_pauses: ps.away, longest_pause_s: Math.round(ps.longestMs / 1000) });
      flushEvents();
      const summary = await generateSessionSummary(curriculum, currentMessages);
      await recordSession(
        {
          id: sessionIdRef.current,
          researchConsent,
          courseId,
          moduleId,
          studentId: studentSession ? studentSession.user.id : null,
          studentName,
          completed,
          slidesReached,
          totalSlides: curriculum.slides.length,
          questionCount,
          transcript: currentMessages.map(({ speaker, text, type }) => ({ speaker, text, type })),
          summary,
          startedAt: sessionStartedAtRef.current,
        },
        studentSession ? studentSession.accessToken : undefined
      );
    },
    [role, courseId, moduleId, curriculum, studentName, studentSession, researchConsent]
  );

  useEffect(() => {
    if (sessionComplete) finalizeSession(true);
  }, [sessionComplete, finalizeSession]);

  const handleLeaveClick = () => {
    finalizeSession(false); // fire-and-forget — don't block leaving the room on this
    onLeave();
  };

  // ---- Detours: a temporary board (diagram / mini slide / code) shown while a question is answered. ----
  // It is an overlay held in its own state: the lecture slide underneath is only hidden, never changed, so
  // returning is exact. Any failure simply means "no board" and the lecturer answers out loud as before.
  const detoursOnRef = useRef(detoursEnabled());
  const [detour, setDetour] = useState(null); // { kind, slide, highlight, id, pinned } | null
  const detourCtlRef = useRef(null);
  if (!detourCtlRef.current) detourCtlRef.current = createDetourController({ onChange: setDetour });
  const detourScrollRef = useRef(0);
  const questionSeqRef = useRef(0); // lets an older answer notice that a newer question has taken over

  const closeDetour = useCallback((opts) => {
    const closed = detourCtlRef.current.close();
    if (closed && !(opts && opts.restoreScroll === false)) {
      const top = detourScrollRef.current;
      requestAnimationFrame(() => { if (stageRef.current) stageRef.current.scrollTo({ top }); });
    }
  }, []);
  const backFromDetour = useCallback(() => closeDetour(), [closeDetour]);
  const closeDetourIf = useCallback((id) => {
    const cur = detourCtlRef.current.current();
    if (cur && cur.id === id) closeDetour();
  }, [closeDetour]);
  const openDetour = useCallback((board) => {
    detourScrollRef.current = stageRef.current ? stageRef.current.scrollTop : 0;
    const id = detourCtlRef.current.open(board);
    if (stageRef.current) stageRef.current.scrollTo({ top: 0 });
    return id;
  }, []);
  const holdDetour = useCallback((id, ms) => detourCtlRef.current.hold(id, ms), []);
  const togglePinDetour = useCallback(() => { detourCtlRef.current.togglePin(); }, []);
  // Any change of slide or view, or leaving the room, ends a detour (no scroll restore: the stage has moved on).
  useEffect(() => { closeDetour({ restoreScroll: false }); }, [slideIndex, viewMode, closeDetour]);
  useEffect(() => () => closeDetour({ restoreScroll: false }), [closeDetour]);

  // Turns the model's `visual` into a checked board. A diagram that fails its syntax check gets ONE repair
  // attempt (capped at 6 seconds); anything still wrong returns null so nothing broken reaches the student.
  const prepareBoard = useCallback(async (visual, currentSlide) => {
    const board = buildDetourBoard(visual, currentSlide);
    if (!board) return null;
    const first = await checkBoard(board);
    if (first.ok) return first.board;
    if (board.kind !== "diagram") return null;
    try {
      const fixed = await Promise.race([
        callAI("You repair Mermaid diagram syntax.", mermaidRepairPrompt(board.slide.diagram.code, first.issues[0]), 700, undefined, "detour_fix"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 6000)),
      ]);
      const again = buildDetourBoard({ ...visual, mermaid: cleanMermaid(fixed) }, currentSlide);
      if (!again) return null;
      const second = await checkBoard(again);
      return second.ok ? second.board : null;
    } catch (e) {
      return null;
    }
  }, []);

  const handleQuestion = useCallback(
    async (questionText) => {
      // A new question replaces any board still on screen (kept so a follow-up can refer to it).
      const boardBefore = detourCtlRef.current.current();
      const myQuestion = ++questionSeqRef.current;
      closeDetour();
      if (pausedRef.current) await resumeLecture({ silent: true });
      const tQuestion = performance.now();
      track("question", currentInfo(), { chars: questionText.length, focus: focusIdRef.current });
      addMessage(studentName, questionText, "question");
      if (stateRef.current === "explaining") {
        stopSpeaking();
      }
      setLecturerState2("answering");

      // Instant, no AI call needed — a real instructor says "yes?" before
      // they've even fully processed the question. Speaking this and
      // generating the real answer happen concurrently so the answer is
      // ready (or close to it) by the time the acknowledgment finishes,
      // rather than adding its speaking time as pure extra latency.
      const ackPick = questionAck({ name: stylePrefsRef.current.useName ? studentName : "", personaId: feedbackCharacter(stylePrefsRef.current, personaId), last: lastAckKeyRef.current });
      lastAckKeyRef.current = ackPick.key;
      const ack = ackPick.text;
      addMessage("lecturer", ack, "explain");
      const ackPromise = speakInterruptible(ack, { onStart: () => logTiming("qa_ack_start", { client_ms: performance.now() - tQuestion }) });

      const answerBudget = Math.max(45, Math.round(wordBudget * 0.6));
      // "Who made you?" is always answerable, even offline or when the AI is down.
      const originQ = isOriginQuestion(questionText);
      const fallbackAnswer = originQ
        ? originFallbackAnswer()
        : typeof navigator !== "undefined" && navigator.onLine === false
        ? "You're offline right now, so I can't answer new questions. Ask me again when you're back online, and carry on with the saved lecture in the meantime."
        : "Good question — let me pick that up right after this.";
      // Structured output so the AI honestly self-assesses whether it
      // actually knows this, rather than answering everything with the
      // same undifferentiated confidence. This is the whole point of the
      // escalation system — an AI that bluffs on institution-specific
      // logistics or shaky facts isn't trustworthy in a classroom.
      const system = `You are ${lecturerIdentity}. A student just raised their hand and asked a question mid-lecture.

Return ONLY valid JSON in this exact shape, no markdown fences, no commentary:
{"confidence": "high" | "low", "answer": "..."}

Set "confidence" to "low" when: the question asks about institution-specific logistics you have no way of knowing (deadlines, grading policy, office hours, assignment details), requires a specific factual claim you're not genuinely sure is correct, or is genuinely outside what this course/slide covers. Set it to "high" for ordinary clarifying questions about the material actually being taught.

Write "answer" to be spoken aloud (about ${answerBudget} words). If confidence is "high", answer directly — don't restate everything, just answer, then briefly say you'll continue the lecture. If confidence is "low": for logistics questions you can't know, say plainly you don't have that information and that you're flagging it for your instructor to follow up on directly — don't guess. For content questions you're just not fully sure about, give an honest best-effort attempt but clearly say you're not fully certain and that you're flagging it for your instructor to confirm.

${NATURAL_SPEECH_STYLE}`;
      const prompt = `You were covering this slide (teaching notes: ${slide.notes}). Everything that was on screen:\n${slideToPlainContext(slide)}\n\nThe student asks: "${questionText}"\nAnswer so it can be spoken aloud: say maths in words, never read LaTeX or code symbols out letter by letter.`;
      // The lecturer teaches the AI: a matching approved answer is handed to the AI lecturer to base its reply on
      const picked = pickCorrections(questionText, correctionsRef.current);
      const detoursOn = detoursOnRef.current;
      const convoBlock = conversationBlock(conversationRef.current, { slideTitle: slide.title });
      const qSystem = system + originCore() + (originQ ? originDetail() : "") + (detoursOn ? VISUAL_PROMPT : "") + correctionsPromptBlock(picked) + avoidOpenings(conversationRef.current);
      const qPrompt = (convoBlock ? `${convoBlock}\n\n` : "") + prompt + (boardBefore ? `\n\n${boardContext(boardBefore)}` : "");
      // Streaming: speak each sentence as soon as it has arrived instead of waiting for the whole answer.
      const streamOn = streamingOn();
      const useEleven = settings.voiceProvider === "elevenlabs" && !!settings.elevenLabsApiKey;
      const st = streamOn ? { chunker: createChunker({ mode: useEleven ? "two" : "sentences" }), queue: [], final: false, wake: null, spoke: false, said: "", seen: "" } : null;
      const onText = st ? (txt) => {
        const a = extractAnswer(txt);
        if (a && a.text) {
          st.seen = a.text;
          const out = st.chunker.push(a.text, false);
          if (out.length) { st.said += (st.said ? " " : "") + out.join(" "); st.queue.push(...out); if (st.wake) st.wake(); }
        }
      } : null;
      const answerPromise = st
        ? askLecturerStream(qSystem, qPrompt, fallbackAnswer, "qa", onText)
        : askLecturer(qSystem, qPrompt, fallbackAnswer, "qa");

      await ackPromise;
      if (!mountedRef.current) return;
      const tAckEnd = performance.now();
      const onVoiceStart = () => {
        const now = performance.now();
        // dead air = silence between the end of "Yes, Sam?" and the start of the answer; total = question to answer voice
        logTiming("qa_dead_air", { client_ms: Math.max(0, now - tAckEnd), streamed: !!st });
        logTiming("qa_to_answer_voice", { client_ms: now - tQuestion, streamed: !!st });
      };
      // The speaker starts now and talks whenever a sentence is ready; it ends when the answer is complete and spoken.
      const speaker = st ? (async () => {
        let first = true;
        for (;;) {
          if (!mountedRef.current || questionSeqRef.current !== myQuestion) return;
          if (!st.queue.length) {
            if (st.final) return;
            await new Promise((r) => { st.wake = r; setTimeout(r, 100); });
            st.wake = null;
            continue;
          }
          if (!first && interruptedRef.current) return; // the student cut in between two sentences
          const piece = st.queue.shift();
          const ok = await speakInterruptible(piece, first ? { onStart: onVoiceStart } : {});
          first = false;
          st.spoke = true;
          if (!ok) return;
        }
      })() : null;
      const rawAnswer = await answerPromise;
      if (!mountedRef.current) return;
      const parsedAnswer = detoursOnRef.current ? parseAnswerWithVisual(rawAnswer, fallbackAnswer) : { ...parseAnswerJSON(rawAnswer, fallbackAnswer), visual: null };
      const { confidence, visual } = parsedAnswer;
      let safeAnswer = parsedAnswer.answer;
      // A stream that broke part-way leaves unfinished JSON. If we already started speaking, finish on a complete sentence.
      if (st && safeAnswer === fallbackAnswer && st.seen) {
        const cut = trimToSentence(st.seen);
        if (cut) safeAnswer = cut;
      }
      const streamedAny = !!st && (st.spoke || st.queue.length > 0 || st.chunker.spoken > 0);
      if (st) {
        if (streamedAny && continuesFrom(safeAnswer, st.said)) st.queue.push(...st.chunker.push(safeAnswer, true)); // whatever has not been said yet
        st.final = true;
        if (st.wake) st.wake();
      }

      addMessage("lecturer", safeAnswer, confidence === "low" ? "answer-flagged" : "answer");
      if (safeAnswer !== fallbackAnswer) recordExchange(conversationRef.current, { question: questionText, answer: safeAnswer, slideTitle: slide.title });
      track("ai_answer", currentInfo(), { confidence, chars: safeAnswer.length, used_correction: picked.length > 0, streamed: streamedAny, ...(visual ? { visual: visual.kind } : {}) });
      if (confidence === "low") {
        track("flag", currentInfo(), null);
        flagQuestionForLecturer(courseId, moduleId, studentName, questionText, safeAnswer, slide.title);
      }
      setLecturerState2("answering");
      // The board goes up (if the answer came with one and it passes the checks). When the answer was streamed this
      // happens while the lecturer is already talking; otherwise it goes up before the lecturer starts.
      let boardId = null;
      let boardKind = null;
      const prepareAndOpenBoard = async () => {
        try {
          const board = await prepareBoard(visual, slide);
          if (board && mountedRef.current && questionSeqRef.current === myQuestion) { boardId = openDetour(board); boardKind = board.kind; }
        } catch (e) {
          boardId = null;
        }
      };
      if (streamedAny) {
        await Promise.all([speaker, visual ? prepareAndOpenBoard() : null]);
      } else {
        if (visual) await prepareAndOpenBoard();
        if (speaker) await speaker; // ends at once: nothing was queued
        await speakInterruptible(safeAnswer, { onStart: onVoiceStart });
      }
      if (!mountedRef.current) return;
      if (boardId !== null) {
        await holdDetour(boardId, holdMs(boardKind));
        closeDetourIf(boardId);
        if (!mountedRef.current) return;
      }
      setLecturerState2("idle");
      setHandRaised(false);
    },
    [studentName, slide, lecturerIdentity, wordBudget, speakInterruptible, stopSpeaking, askLecturer, askLecturerStream, settings.voiceProvider, settings.elevenLabsApiKey, courseId, moduleId, closeDetour, closeDetourIf, openDetour, holdDetour, prepareBoard]
  );

  const continueTypingCode = useCallback(() => {
    if (!slide.hasCode || typedCode.length >= slide.code.length) return;
    setLecturerState2("explaining");
    const remaining = slide.code.length - typedCode.length;
    const durationMs = Math.max(800, remaining * 45);
    animateTyping(slide.code, durationMs, typedCode.length);
    setTimeout(() => setLecturerState2("idle"), durationMs + 60);
  }, [slide, typedCode, animateTyping]);

  const sendChat = () => {
    if (!chatInput.trim()) return;
    handleQuestion(chatInput.trim());
    setChatInput("");
  };

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current && recognitionRef.current.stop();
  }, []);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setVoiceSupported(false);
      return;
    }

    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      setInterimText("");
    };

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPiece = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcriptPiece;
        else interim += transcriptPiece;
      }
      setInterimText(interim);
      if (final.trim()) {
        recognition.stop();
        handleQuestion(final.trim());
      }
    };

    recognition.onerror = (e) => {
      setIsListening(false);
      setInterimText("");
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        addMessage("system", "Mic permission was blocked — allow microphone access in your browser to ask by voice, or type your question instead.", "system");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText("");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [handleQuestion]);

  const toggleHandRaise = () => {
    if (handRaised) {
      stopListening();
      setHandRaised(false);
      return;
    }
    track("interrupt", currentInfo(), { focus: focusIdRef.current });
    setHandRaised(true);
    startListening();
  };

  // ---- comprehension check handlers
  const cancelActiveCheck = () => {
    if (checkResolverRef.current) {
      checkResolverRef.current({ cancelled: true });
      checkResolverRef.current = null;
    }
    setActiveCheck(null);
  };
  const chooseCheckOption = (i) => {
    setActiveCheck((c) => chooseCheckState(c, i, performance.now()));
  };
  const finishCheck = (confidence) => {
    setActiveCheck((c) => {
      const r = finishCheckState(c, confidence);
      if (!r.event) return c;
      track("check_answer", slideInfo(c.index), { ...r.event, slide_type: curriculum.slides[c.index] && curriculum.slides[c.index].type, adapt_level: planLevelRef.current[c.index] || "standard", ...(c.diagnostic ? { diagnostic: true, for_concept: c.diagnostic.forConcept } : {}) });
      const evidenceKey = `${c.diagnostic ? "d" : ""}${c.index}:${c.chosen}`;
      if (lastEvidenceKeyRef.current !== evidenceKey) {
        lastEvidenceKeyRef.current = evidenceKey;
        sessionEvidenceRef.current.push({ concept: c.check.concept, correct: r.event.correct, confidence: r.event.confidence, ts: Date.now(), diagnostic: !!c.diagnostic });
        if (!r.event.correct && c.check.concept) sessionAdaptRef.current.wrongConcepts.add(c.check.concept);
      }
      const resolve = checkResolverRef.current;
      checkResolverRef.current = null;
      if (resolve) resolve(r.outcome);
      return r.state;
    });
  };
  // One short question about the weakest earlier idea, after a missed quiz question (see learning/diagnose.js).
  // Any failure here (AI busy, no question written) just lets the lecture carry on.
  diagnosticRef.current = async (index, concept, stale) => {
    const pick = pickDiagnostic({ concept, slides: curriculum.slides, mastery: masteryNow(), diagnosed: diagnosedRef.current });
    if (!pick) return;
    diagnosedRef.current.add(concept);
    let q = null;
    try {
      const qs = await generatePractice({ concept: pick.name, slides: curriculum.slides, callAI: (sys, pr, mt) => callAI(sys, pr, mt, undefined, "practice"), count: 2 });
      q = qs && qs[0];
    } catch (e) {
      return;
    }
    if (!q || stale()) return;
    const lead = diagnosticLead(pick.name);
    setLecturerState2("explaining");
    addMessage("lecturer", lead, "explain");
    const leadDone = await speakInterruptible(lead);
    if (stale()) return;
    if (!leadDone) await waitForIdle();
    setLecturerState2("idle");
    const answered = new Promise((resolve) => {
      checkResolverRef.current = resolve;
      setActiveCheck({ ...newCheckState(index, q, performance.now()), diagnostic: { forConcept: concept, prerequisite: pick.name } });
    });
    const out = await answered;
    if (stale() || !autopilotEnabledRef.current) return;
    if (!out || out.skipped || out.cancelled) return;
    const say = async (text) => {
      setLecturerState2("explaining");
      addMessage("lecturer", text, "explain");
      const done = await speakInterruptible(text);
      if (stale()) return;
      if (!done) await waitForIdle();
      setLecturerState2("idle");
    };
    await say(feedbackFor(q, out));
    if (stale()) return;
    if (out.correct) {
      await say(diagnosticNoGap(pick.name, concept));
    } else {
      setLecturerState2("loading");
      const system = `You are ${lecturerIdentity}. ${NATURAL_SPEECH_STYLE}`;
      const text = await askLecturer(system, diagnosticGapPrompt(pick.name, concept), diagnosticGapFallback(pick.name, concept), "diagnose");
      if (stale()) return;
      await say(text);
    }
    await sleep(500);
  };

  const skipCheck = () => {
    setActiveCheck((c) => {
      const r = skipCheckState(c);
      if (!r.event) return c;
      track("check_skip", slideInfo(c.index), r.event);
      const resolve = checkResolverRef.current;
      checkResolverRef.current = null;
      if (resolve) resolve(r.outcome);
      return r.state;
    });
  };
  // the card belongs to one slide; leave it behind when the slide changes
  useEffect(() => {
    setActiveCheck((c) => (c && c.index !== slideIndex ? null : c));
  }, [slideIndex]);
  useEffect(() => {
    if (activeCheck && stageRef.current) {
      const el = stageRef.current.querySelector(".check-card");
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeCheck && activeCheck.phase, activeCheck && activeCheck.index]);

  // ---- "Got it / Unsure / Lost" (a lost student gets the point re-explained straight away)
  const sendSignal = (value) => {
    if (signals[slideIndex] === value) return;
    setSignals((s) => ({ ...s, [slideIndex]: value }));
    track("signal", currentInfo(), { value, focus: focusIdRef.current });
    signalLogRef.current.push({ slide: slideIndex, value });
    if (value === "lost") sessionAdaptRef.current.lostSlides.add(slideIndex);
    if (value === "lost") handleQuestion("I'm lost on this part. Could you explain it again in a simpler way, with a different example?");
  };

  // ---- Pause / resume
  const pauseLecture = (reason = "manual") => {
    if (pausedRef.current) return;
    pauseTrackerRef.current.start(reason, slideIndexRef.current);
    pausedRef.current = true;
    setPaused(true);
    setPauseReason(reason === "away" ? "away" : "manual");
    track("pause", currentInfo(), { reason });
    // Cut the sentence being spoken (the lecture loop repeats it on resume), unless a question is being answered:
    // an answer finishes its sentence, and anything after it waits.
    const speakingNow = !!(activeResolveRef.current || (window.speechSynthesis && window.speechSynthesis.speaking));
    if (speakingNow && stateRef.current !== "answering") {
      stopSpeaking();
      if (stateRef.current === "explaining") setLecturerState2("idle");
    }
  };
  const resumeLecture = async ({ silent = false } = {}) => {
    if (!pausedRef.current || resumingRef.current) return;
    resumingRef.current = true;
    setResuming(true);
    const ended = pauseTrackerRef.current.end();
    if (ended) {
      track("resume", slideInfo(ended.slideIndex), { pause_ms: ended.ms, reason: ended.reason });
      if (ended.ms >= 60000) focusStartRef.current = Date.now(); // a real break restarts the "how long have we been going" clock
    }
    // the lecturer notices: nothing for a quick pause, a friendly welcome back for a longer one
    const line = silent ? null : welcomeBackLine({ ms: ended ? ended.ms : 0, slideTitle: (curriculum.slides[slideIndexRef.current] || {}).title });
    if (line) {
      addMessage("lecturer", line, "explain");
      await speakInterruptible(line, { bypassPause: true });
    }
    pausedRef.current = false;
    setPaused(false);
    resumingRef.current = false;
    setResuming(false);
  };
  useEffect(() => { sessionCompleteRef.current = sessionComplete; }, [sessionComplete]);
  // Screen locked / tab left for a few seconds (a phone call, a message...): pause automatically so nothing is missed.
  // The student decides when to come back; we never resume by ourselves.
  useEffect(() => {
    if (role === "lecturer") return undefined;
    let timer = null;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        timer = setTimeout(() => {
          if (document.visibilityState === "hidden" && autopilotEnabledRef.current && !sessionCompleteRef.current) pauseLecture("away");
        }, 4000);
      } else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Explain differently": the student asks for what helps (also logged: it tells us what kind of explanation each learner needs)
  const requestDifferent = (kind) => {
    const r = EXPLAIN_REQUESTS[kind];
    if (!r) return;
    track("adapt_request", currentInfo(), { kind });
    handleQuestion(r.ask);
  };

  // Manual navigation always pauses autopilot — otherwise the AI-driven
  // loop and a manually-jumping student would fight over the current slide.
  const changeSlide = (dir) => {
    track("slide_nav", currentInfo(), { dir });
    navTokenRef.current += 1;
    cancelActiveCheck();
    stopSpeaking();
    setAutopilotOn(false);
    setReveal({ slide: -1, count: Infinity });
    setActiveLines(null);
    setStepCaption("");
    setLecturerState2("idle");
    setInterrupted(false);
    setSpeakProgress({ slide: -1, i: 0, n: 1, text: "" });
    setSlideIndex((i) => Math.max(0, Math.min(curriculum.slides.length - 1, i + dir)));
  };

  const toggleAutopilot = () => {
    track("autopilot_toggle", currentInfo(), { on: !autopilotOn });
    if (autopilotOn) {
      cancelActiveCheck();
      stopSpeaking();
      setLecturerState2("idle");
      setInterrupted(false);
    }
    setAutopilotOn((v) => !v);
  };

  const togglePresentationMode = () => {
    setPresentationMode((v) => {
      const next = !v;
      if (next) setChatOpen(false); // start clean; the chat control still works independently afterward
      return next;
    });
  };

  // Guaranteed fallback: this handler runs inside a real click, so it will
  // satisfy every browser's autoplay/gesture requirement regardless of why
  // audio was blocked. Re-primes both audio paths and, if the lecturer had
  // already said something, replays it.
  const enableAudio = () => {
    primeAudioForVoice();
    setAudioBlocked(false);
    setTtsNotice("");
    if (lastSpokenTextRef.current) {
      speakInterruptible(lastSpokenTextRef.current);
    }
  };

  const handleDownloadNotes = async () => {
    if (notesStatus === "generating") return;
    setNotesStatus("generating");
    try {
      const upTo = sessionComplete ? curriculum.slides.length : maxSlideReachedRef.current + 1;
      track("notes_download", currentInfo(), { up_to: upTo });
      const sections = await generateLectureNotes(curriculum, setNotesProgress, upTo);
      if (!mountedRef.current) return;
      await downloadLectureNotesPdf(curriculum, sections);
      setNotesStatus("idle");
      setNotesProgress("");
    } catch (e) {
      if (!mountedRef.current) return;
      setNotesStatus("error");
      setNotesProgress("");
    }
  };

  useEffect(() => {
    if (viewMode === "ide" && !slide.hasCode) setViewMode("slides");
  }, [slide, viewMode]);

  // Furthest slide the student has reached — notes cover everything up to here,
  // even if they navigated manually and auto-lecture never reached the end.
  const maxSlideReachedRef = useRef(0);
  useEffect(() => {
    maxSlideReachedRef.current = Math.max(maxSlideReachedRef.current, slideIndex);
  }, [slideIndex]);

  // dwell time per slide: leave the previous slide, enter the new one
  useEffect(() => {
    leaveSlideTracking();
    enterSlideTracking(slideIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideIndex]);
  useEffect(() => { focusIdRef.current = focusId; }, [focusId]);

  const statusLabel = () => {
    if (paused) return "Paused";
    if (lecturerState === "loading") return "Thinking…";
    if (lecturerState === "answering") return "Answering your question…";
    if (lecturerState === "explaining") return slide.hasCode ? "Typing and explaining…" : "Explaining…";
    if (autopilotOn) return "Auto-lecture running — raise your hand anytime";
    return "Auto-lecture paused — use Prev/Next, or resume it above";
  };

  return (
    <div className={`room ${presentationMode ? "presentation" : ""}`}>
      <div className="topbar">
        <div className="topbar-title">
          <span className="dot-live" /> <span className="topbar-title-text">{curriculum.code} · {curriculum.unit}</span>
        </div>
        <div className="topbar-right">
          <div className="topbar-slide"><span className="topbar-slide-title">{slide.title} · </span>{slideIndex + 1}/{curriculum.slides.length}</div>
          <div className="topbar-budget" title="Words per slide, computed from lecture length & pacing">
            <Clock size={12} /> {settings.durationMinutes}min · {PACE_OPTIONS.find((p) => p.id === settings.pace)?.label}
          </div>
          <button
            className="topbar-more"
            onClick={() => setMoreOpen((v) => !v)}
            aria-label="More options"
            aria-expanded={moreOpen}
            aria-controls="topbar-actions"
          >
            <MoreHorizontal size={20} />
          </button>
          <div id="topbar-actions" className={`topbar-actions ${moreOpen ? "open" : ""}`} onClick={() => setMoreOpen(false)}>
          <button
            className={`topbar-edit ${audioBlocked ? "audio-blocked" : ""}`}
            onClick={enableAudio}
            title="Tap if you can't hear the lecturer — unlocks/replays audio"
          >
            <Volume2 size={13} /> {audioBlocked ? "Tap to enable sound" : "Replay voice"}
          </button>
          {role !== "lecturer" && (
            <button className="topbar-edit" onClick={() => setStyleOpen(true)} aria-haspopup="dialog" title="Choose how the lecturer talks to you: short or encouraging, using your name, offers of a break">
              🙂 My style
            </button>
          )}
          <button className="topbar-edit" onClick={() => setVoiceOpen(true)} aria-haspopup="dialog" title="Change the lecturer's voice and speed">
            🎙 Voice &amp; speed ({`${clampRate(voicePrefs.rate)}×`})
          </button>
          <button className={`topbar-edit ${autopilotOn ? "on" : ""}`} onClick={toggleAutopilot} title="Toggle automatic lecture" aria-pressed={autopilotOn}>
            {autopilotOn ? <Volume2 size={13} /> : <VideoOff size={13} />} {autopilotOn ? "Auto-lecture on" : "Auto-lecture off"}
          </button>
          <button className="topbar-edit" onClick={handleDownloadNotes} disabled={notesStatus === "generating"} title="Download written notes for the slides covered so far">
            {notesStatus === "generating" ? <Loader2 className="spin" size={13} /> : <FileDown size={13} />}{" "}
            {notesStatus === "generating" ? "Preparing notes…" : notesStatus === "error" ? "Retry notes" : "Notes (PDF)"}
          </button>
          <button className={`topbar-edit ${presentationMode ? "on" : ""}`} onClick={togglePresentationMode} title="Toggle presentation mode (bigger slide view)" aria-pressed={presentationMode}>
            {presentationMode ? <Minimize2 size={13} /> : <Maximize2 size={13} />} {presentationMode ? "Exit presentation" : "Presentation mode"}
          </button>
          {role !== "lecturer" && online && (
            <button className={`topbar-edit ${offlineSave.phase === "done" ? "on" : ""}`} disabled={offlineSave.phase === "saving"} onClick={() => saveForOfflineRef.current && saveForOfflineRef.current()} title="Keeps this lecture's explanations on this device, so you can replay it later without internet. Uses a few AI requests once.">
              ⬇ {offlineSave.phase === "saving" ? `Saving ${offlineSave.done}/${offlineSave.total}…` : offlineSave.phase === "done" ? "Saved for offline" : offlineSave.phase === "partial" ? `Saved ${offlineSave.done}/${offlineSave.total} — try again` : "Save for offline"}
            </button>
          )}
          {role !== "lecturer" && (
            <button className={`topbar-edit ${adaptOn ? "on" : ""}`} onClick={() => setAdaptOn((v) => !v)} aria-pressed={adaptOn} title="When on, the lecturer adapts explanations to how you're doing (more steps when you're finding something hard, shorter when you already know it). Turn it off for the standard lecture.">
              ✨ Personalised: {adaptOn ? "on" : "off"}
            </button>
          )}
          {canFullscreen && (
            <button className={`topbar-edit ${isFullscreen ? "on" : ""}`} onClick={toggleFullscreen} title="Full screen hides the browser's own toolbars, giving the slide more room" aria-pressed={isFullscreen}>
              ⛶ {isFullscreen ? "Exit full screen" : "Full screen"}
            </button>
          )}
          {role === "lecturer" && onEditSession && (
            <button className="topbar-edit" onClick={onEditSession} title="Edit session settings">
              <Settings2 size={13} /> Edit session
            </button>
          )}
          </div>
        </div>
      </div>
      {moreOpen && <div className="topbar-scrim" onClick={() => setMoreOpen(false)} />}
      <Boundary label="style-panel" title="The style panel couldn’t be shown."><StylePanel open={styleOpen} onClose={() => setStyleOpen(false)} prefs={stylePrefs} onChange={updateStylePrefs} lecturerName={resolvePersona(personaCourse).name} /></Boundary>
      <Boundary label="voice-panel" title="Voice settings couldn’t be shown.">
      <VoicePanel
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        prefs={voicePrefs}
        onChange={(p) => setVoicePrefs(p)}
        voices={voices}
        lang={voiceLang}
        canPreview={paused || lecturerState === "idle"}
        onPreview={previewVoice}
      />
      </Boundary>

      {ttsNotice && (
        <div className={`tts-notice ${audioBlocked ? "clickable" : ""}`} onClick={audioBlocked ? enableAudio : undefined}>
          <AlertTriangle size={12} /> {ttsNotice}
        </div>
      )}
      {!online && (
        <div className="tts-notice" role="status">
          <AlertTriangle size={12} /> You're offline. The lecture plays from what's saved on this device. Your quiz answers are kept and will be sent when you're back online.
        </div>
      )}
      {aiNotice && online && (
        <div className="tts-notice">
          <AlertTriangle size={12} /> {aiNotice}
        </div>
      )}

      <div className="body">
        <div className="main-col">
          <div className="tiles">
            <div className={`tile lecturer-tile ${lecturerState === "explaining" || lecturerState === "answering" ? "speaking" : ""}`}>
              <div className="avatar lecturer-avatar">L</div>
              <div className="tile-label">Lecturer {lecturerState === "loading" && <Loader2 className="spin" size={12} />} {(lecturerState === "explaining" || lecturerState === "answering") && <Volume2 size={12} />}</div>
            </div>
            <div className="tile student-tile">
              {camOn ? <div className="avatar student-avatar">{studentName[0]?.toUpperCase()}</div> : <VideoOff size={20} color="#8B93A1" />}
              <div className="tile-label">{studentName} {handRaised && <Hand size={12} color="#E8A33D" />}</div>
            </div>
          </div>

          <div className="stage-switch">
            <button className={view === "slides" ? "active" : ""} onClick={() => setViewMode("slides")}>
              <PresentationIcon size={14} /> Slides
            </button>
            <button className={view === "ide" ? "active" : ""} disabled={!slide.hasCode} onClick={() => setViewMode("ide")}>
              <Code2 size={14} /> Code editor
            </button>
          </div>

          <div
            className={`stage${stageScrolled ? " scrolled" : ""}${detour ? " detouring" : ""}`}
            ref={stageRef}
            onScroll={(e) => setStageScrolled(e.currentTarget.scrollTop > 8)}
            onWheel={stopFollowing}
            onTouchMove={stopFollowing}
            onKeyDown={(e) => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) stopFollowing(); }}
            tabIndex={0}
            role="region"
            aria-label="Lecture slide"
          >
            {detour && (
              <SlideBoundary resetKey={`detour:${detour.id}`} onShowSlides={backFromDetour}>
                <DetourBoard board={detour} onBack={backFromDetour} onTogglePin={togglePinDetour} />
              </SlideBoundary>
            )}
            <SlideBoundary resetKey={`${slideIndex}:${view}`} onShowSlides={() => setViewMode("slides")}>
            {view === "slides" ? (
              <SlideView
                slide={slide}
                unit={curriculum.unit}
                index={slideIndex}
                total={curriculum.slides.length}
                revealCount={progressive ? reveal.count : Infinity}
                focusId={progressive && !slideIsScripted ? focusId : null}
                showWarnings={role === "lecturer"}
                footer={
                  interrupted && lecturerState !== "idle" ? (
                    <div className="paused-ribbon">Paused mid-explanation to answer a question — will continue after</div>
                  ) : null
                }
              />
            ) : (
              <div className="ide">
                {!slide.codeSteps && !explainedSlides.current.has(slideIndex) && typedCode === "" ? (
                  <div className="ide-placeholder">// The lecturer will type this live while explaining.{"\n"}// Starting automatically…</div>
                ) : (
                  <CodePane
                    code={slide.code || ""}
                    language={slide.language}
                    filename={slide.filename}
                    typedCode={slide.codeSteps ? null : typedCode}
                    typing={!slide.codeSteps && typedCode.length < (slide.code || "").length}
                    activeLines={progressive ? activeLines : null}
                    caption={progressive ? stepCaption : ""}
                    expectedOutput={slide.expectedOutput && (slide.codeSteps ? !progressive || reveal.count === Infinity || !activeLines : typedCode.length >= (slide.code || "").length) ? slide.expectedOutput : ""}
                    liveTag={lecturerState === "explaining" && !slide.codeSteps}
                  />
                )}
              </div>
            )}
            </SlideBoundary>
            {activeCheck && activeCheck.index === slideIndex && (
              <>
                {activeCheck.diagnostic && <div className="mastery-note" role="note" style={{ marginBottom: 6 }}>Quick check on an earlier idea: {activeCheck.diagnostic.prerequisite}</div>}
                <CheckCard state={activeCheck} onChoose={chooseCheckOption} onConfidence={finishCheck} onSkip={skipCheck} />
              </>
            )}
            {view === "slides" && userScrolled && autopilotOn && speakProgress.slide === slideIndex && lecturerState !== "idle" && (
              <button className="follow-pill" onClick={followLecturer}>↧ Follow the lecturer</button>
            )}
          </div>

          <div className="control-strip">
          <div className="stage-actions">
            <button className="nav-btn" disabled={slideIndex === 0} onClick={() => changeSlide(-1)}>
              <ChevronLeft size={16} /> Prev
            </button>
            {slide.hasCode && lecturerState === "idle" && typedCode.length > 0 && typedCode.length < (slide.code || "").length ? (
              <button className="explain-btn" onClick={continueTypingCode}>
                Continue typing code
              </button>
            ) : (
              <div className="status-pill" aria-live="polite">{statusLabel()}</div>
            )}
            <button className="nav-btn" disabled={slideIndex === curriculum.slides.length - 1} onClick={() => changeSlide(1)}>
              Next <ChevronRight size={16} />
            </button>
          </div>

          {careOffer && role !== "lecturer" && (
            <div className="signal-row care-offer" role="group" aria-label="Would you like some help?">
              <span className="signal-label">{careOffer.line}</span>
              {CARE_CHOICES.map((c) => (
                <button key={c.id} className="signal-btn" onClick={() => { const r = careResolveRef.current; if (r) r(c.id); }}>{c.label}</button>
              ))}
            </div>
          )}
          {role !== "lecturer" && (
            <div className="signal-row" role="group" aria-label="How are you finding this slide?">
              <span className="signal-label">How is this going?</span>
              {[["got_it", "Got it"], ["unsure", "Unsure"], ["lost", "I'm lost"]].map(([v, label]) => (
                <button key={v} className={`signal-btn ${v}${signals[slideIndex] === v ? " on" : ""}`} aria-pressed={signals[slideIndex] === v} onClick={() => sendSignal(v)}>{label}</button>
              ))}
            </div>
          )}
          {role !== "lecturer" && (
            <select className="explain-select" aria-label="Ask the lecturer to explain this differently" value="" onChange={(e) => { if (e.target.value) requestDifferent(e.target.value); }}>
              <option value="">Explain differently…</option>
              {Object.entries(EXPLAIN_REQUESTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          )}
          {paused && (
            <span className="paused-note" role="status">
              ⏸ {resuming ? "Resuming…" : pauseReason === "away" ? "You stepped away, so I paused. Press Resume when you're ready." : "Paused. Take your time. Press Resume when you're ready."}
            </span>
          )}
          {adaptNote && adaptOn && role !== "lecturer" && <span className="adapt-note" title={adaptNote.reason} role="status">✨ {adaptNote.text}. {adaptNote.reason}</span>}
          </div>

          {sessionComplete && (
            <div className="complete-banner">
              <div>
                <strong>🎓 Lecture complete!</strong>{" "}
                {notesStatus === "generating"
                  ? notesProgress || "Preparing your notes…"
                  : notesStatus === "error"
                  ? "Couldn't generate notes just now — try again."
                  : "Download detailed written notes covering everything from today's session."}
              </div>
              <button className="explain-btn" disabled={notesStatus === "generating"} onClick={handleDownloadNotes}>
                {notesStatus === "generating" ? <Loader2 className="spin" size={14} /> : <FileDown size={14} />}
                {notesStatus === "generating" ? "Generating…" : "Download lecture notes (PDF)"}
              </button>
              {role !== "lecturer" && (
                <div className="signal-row feel-row" role="group" aria-label="How did this lecture feel?" style={{ width: "100%" }}>
                  {feelChoice ? (
                    <span className="signal-label" role="status">{feelThanks(feelChoice)}</span>
                  ) : (
                    <>
                      <span className="signal-label">How did this lecture feel?</span>
                      {FEEL_CHOICES.map((c) => (
                        <button key={c.id} className="signal-btn" onClick={() => { setFeelChoice(c.id); track("signal", currentInfo(), { value: "lecture_feel", choice: c.id }); }}>{c.label}</button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {chatOpen && (
          <div className="side-panel">
            <div className="side-header"><span>Chat & questions</span><button className="side-close" onClick={() => setChatOpen(false)} aria-label="Close chat"><X size={18} /></button></div>
            <div className="side-messages" aria-live="polite" aria-relevant="additions" role="log">
              {messages.length === 0 && <div className="empty-hint">Your lecturer will greet you in a moment…</div>}
              {messages.map((m) => (
                <div key={m.id} className={`msg msg-${m.type}`}>
                  <div className="msg-speaker">{m.speaker === "lecturer" ? "Lecturer" : m.speaker}</div>
                  <div className="msg-text">{m.text}</div>
                  {m.type === "answer-flagged" && (
                    <div className="msg-flag-note">🚩 Not fully certain — flagged for your instructor to follow up on</div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="side-input-wrap">
              {isListening && (
                <div className="listening-banner">
                  <span className="listening-dot" /> Listening… {interimText && <em>"{interimText}"</em>}
                </div>
              )}
              <div className="side-input">
                <input
                  aria-label="Type your question"
                  placeholder={
                    !voiceSupported
                      ? "Voice not supported here — type your question…"
                      : handRaised
                      ? "Ask your question, or just speak…"
                      : "Raise your hand to ask…"
                  }
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                />
                <button onClick={sendChat} disabled={!chatInput.trim()} aria-label="Send question">
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="controlbar">
        <button
          className={`ctrl labeled ${paused ? "raised" : ""}`}
          onClick={() => (paused ? resumeLecture() : pauseLecture("manual"))}
          disabled={resuming}
          title={paused ? "Resume the lecture" : "Pause the lecture, for example to read the slide slowly or take a call"}
          aria-label={paused ? "Resume the lecture" : "Pause the lecture"}
          aria-pressed={paused}
        >
          {paused ? <Play size={18} /> : <Pause size={18} />} <span>{paused ? "Resume" : "Pause"}</span>
        </button>
        <button className={`ctrl ${camOn ? "on" : ""}`} onClick={() => setCamOn((v) => !v)} title="Camera" aria-label={camOn ? "Turn camera off" : "Turn camera on"} aria-pressed={camOn}>
          {camOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>
        <button
          className={`ctrl ${handRaised ? "raised" : ""} ${isListening ? "listening" : ""}`}
          onClick={toggleHandRaise}
          title="Raise hand to ask by voice"
          aria-label={handRaised ? "Lower hand" : "Raise hand to ask a question"}
          aria-pressed={handRaised}
        >
          <Hand size={18} />
        </button>
        <button className={`ctrl ${chatOpen ? "on" : ""}`} onClick={() => setChatOpen((v) => !v)} title="Chat" aria-label={chatOpen ? "Close chat panel" : unread ? `Open chat panel, ${unread} new` : "Open chat panel"} aria-pressed={chatOpen}>
          <MessageSquare size={18} />
          {unread > 0 && <span className="ctrl-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
        </button>
        <button className="ctrl leave labeled" onClick={handleLeaveClick} title="Leave the meeting">
          <PhoneOff size={18} /> <span>Leave</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App shell — owns the stage machine: role -> setup (lecturer) / join
// (student) -> room. Curriculum + settings are lifted here so they survive
// navigating back and forth (e.g. lecturer editing session mid-demo).
// ---------------------------------------------------------------------------
export default function SEMAIApp() {
  const [stage, setStage] = useState("splash"); // splash | role | auth | studentAuth | dashboard | flags | myHistory | courseMeta | moduleSetup | join | room | privacy | terms
  const [role, setRole] = useState(null);
  const [courses, setCourses] = useState([DEFAULT_COURSE]);
  const [activeCourseId, setActiveCourseId] = useState(null);
  const [notice, setNotice] = useState(null); // { kind: "error" | "ok", text }
  const [courseDraft, setCourseDraft] = useState(null);
  const [insightsCourse, setInsightsCourse] = useState(null);
  const [editingCourse, setEditingCourse] = useState(false);
  const [roomData, setRoomData] = useState(null); // { curriculum, settings }
  const [studentName, setStudentName] = useState("Student");
  const [researchConsent, setResearchConsent] = useState(false);
  const [shareWithLecturer, setShareWithLecturer] = useState(false);
  // null = signed in but no profile yet, undefined = unknown / not loaded, object = {username, fullName}
  const [studentProfile, setStudentProfile] = useState(undefined);
  const [dbStatus, setDbStatus] = useState(supabaseEnabled() ? "loading" : "local"); // loading | connected | offline | error | local
  const [offlineSavedAt, setOfflineSavedAt] = useState(null); // when the saved copy of the courses was made
  const [reloadCoursesTick, setReloadCoursesTick] = useState(0);
  // Send anything saved while offline, as soon as the connection is back (and at start-up).
  useEffect(() => {
    if (!supabaseEnabled()) return undefined;
    const flush = () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      flushQueuedEvents({
        url: SUPABASE_URL,
        key: SUPABASE_ANON_KEY,
        getToken: () => (studentSessionRef.current ? studentSessionRef.current.accessToken : null),
        sendSession: async (row) => {
          try {
            await supabaseRequest("/sessions", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([row]) }, studentSessionRef.current ? studentSessionRef.current.accessToken : null);
            return true;
          } catch (e) {
            const m = String((e && e.message) || "");
            if (/\((401|403)\)/.test(m) && row.student_id) { // expired sign-in: keep the summary, drop only the account link
              try { await supabaseRequest("/sessions", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([{ ...row, student_id: null }]) }); return true; } catch (e2) { return false; }
            }
            return /\((4\d\d)\)/.test(m) && !/\((408|429)\)/.test(m); // other client errors will never succeed: drop
          }
        },
      }).catch(() => {});
    };
    const onOnline = () => { flush(); setReloadCoursesTick((n) => n + 1); };
    flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);
  const [session, setSession] = useState(null); // { accessToken, refreshToken, user: {id, email} } | null
  // Keeps the lecturer's token fresh for every cloud write (see authSession.js). The manager is created
  // once; it always reads the latest session through sessionMgr.set() below.
  const sessionMgr = useMemo(() => createSessionManager({
    refresh: refreshUserSession,
    onChange: (s) => {
      setSession(s);
      saveSessionLocally(s);
      if (!s) { setNotice({ kind: "error", text: "Your sign-in expired, so changes can't be saved. Please sign in again." }); setStage("auth"); }
    },
  }), []);
  const runAuthed = useCallback((fn) => sessionMgr.run(fn), [sessionMgr]);
  const cloudCoursesRef = useRef(new Set()); // course ids known to exist in the cloud
  const cloudQueueRef = useRef(Promise.resolve()); // cloud writes run one after another, in order
  const [studentSession, setStudentSession] = useState(null); // same shape, separate identity/storage
  const studentSessionRef = useRef(null);
  studentSessionRef.current = studentSession; // a student account isn't a lecturer account
  const [legalReturnStage, setLegalReturnStage] = useState("splash");

  // Try to restore a lecturer session on load (refreshing it, since access
  // tokens expire after ~1hr but refresh tokens last much longer). Silently
  // does nothing if Supabase isn't configured or nothing was stored.
  useEffect(() => {
    if (!supabaseEnabled()) return;
    const stored = loadSessionLocally();
    if (!stored) return;
    refreshUserSession(stored.refreshToken)
      .then((fresh) => {
        setSession(fresh);
        saveSessionLocally(fresh);
      })
      .catch(() => saveSessionLocally(null)); // stored session is stale/invalid — just drop it
  }, []);

  // Load the signed-in student's profile (real name + username).
  useEffect(() => {
    if (!studentSession || !supabaseEnabled()) { setStudentProfile(undefined); return undefined; }
    let cancelled = false;
    fetchStudentProfile(studentSession).then((p) => { if (!cancelled) setStudentProfile(p); });
    return () => { cancelled = true; };
  }, [studentSession && studentSession.user.id]);
  const handleSaveProfile = async (values) => {
    const r = await createStudentProfile(studentSession, values);
    if (r.ok) setStudentProfile({ username: normalizeUsername(values.username), fullName: cleanFullName(values.fullName) });
    return r;
  };

  // Same idea, independently, for a student account.
  useEffect(() => {
    if (!supabaseEnabled()) return;
    const stored = loadSessionLocally(STUDENT_SESSION_STORAGE_KEY);
    if (!stored) return;
    refreshUserSession(stored.refreshToken)
      .then((fresh) => {
        setStudentSession(fresh);
        saveSessionLocally(fresh, STUDENT_SESSION_STORAGE_KEY);
      })
      .catch(() => saveSessionLocally(null, STUDENT_SESSION_STORAGE_KEY));
  }, []);

  // Load once on mount. If Supabase isn't configured (blank URL/key) or the
  // request fails, we just keep the in-memory DEFAULT_COURSE state — same
  // behavior as before this feature existed.
  useEffect(() => {
    if (!supabaseEnabled()) return;
    let cancelled = false;
    fetchCoursesFromSupabase()
      .then((loaded) => {
        if (cancelled) return;
        loaded.forEach((c) => cloudCoursesRef.current.add(c.id));
        setCourses(loaded.length > 0 ? loaded : [DEFAULT_COURSE]);
        setDbStatus("connected");
        setOfflineSavedAt(null);
        saveCoursesSnapshot(offlineStore(), loaded); // so lectures can still open with no connection
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Supabase load failed:", e);
        // no connection: open the lectures saved on this device last time
        loadCoursesSnapshot(offlineStore()).then((snap) => {
          if (cancelled) return;
          const saved = snap ? cleanCourseList(snap.courses) : [];
          if (saved.length) {
            setCourses(saved);
            setOfflineSavedAt(snap.savedAt);
            setDbStatus("offline");
          } else setDbStatus("error");
        }).catch(() => { if (!cancelled) setDbStatus("error"); });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadCoursesTick]);

  const emptySetup = () => ({
    moduleSettings: { ...DEFAULT_MODULE_DRAFT_SETTINGS },
    rawText: "",
    fileName: "",
    draft: null,
    phase: "input", // input | extracting | generating | preview
    error: "",
    editingModuleId: null, // set when an existing module is being edited
    editingCreatedAt: null,
  });
  const [setup, setSetupState] = useState(emptySetup);
  const patchSetup = (patch) => setSetupState((s) => ({ ...s, ...patch }));

  const activeCourse = courses.find((c) => c.id === activeCourseId) || null;
  // Only Supabase-backed courses have a real owner_id to filter on. Without
  // Supabase configured, everything stays in the old single-user local mode
  // (no auth gate at all — see the role-select handler below).
  sessionMgr.set(session);
  const myCourses = supabaseEnabled() && session ? courses.filter((c) => c.ownerId === session.user.id) : courses;

  const handleAuthenticated = (newSession) => {
    setSession(newSession);
    saveSessionLocally(newSession);
    setStage("dashboard");
  };

  const handleSignOut = () => {
    if (session) signOutUser(session.accessToken);
    setSession(null);
    saveSessionLocally(null);
    setStage("role");
  };

  const handleStudentAuthenticated = (newSession) => {
    setStudentSession(newSession);
    saveSessionLocally(newSession, STUDENT_SESSION_STORAGE_KEY);
    setStage("join");
  };

  const handleStudentSignOut = () => {
    if (studentSession) signOutUser(studentSession.accessToken);
    setStudentSession(null);
    saveSessionLocally(null, STUDENT_SESSION_STORAGE_KEY);
  };

  const openLegal = (which) => {
    setLegalReturnStage(stage);
    setStage(which);
  };

  // After the delete-account function succeeds the auth user is gone, so drop
  // every local trace of the session and anything cached for that user.
  const handleLecturerAccountDeleted = () => {
    const uid = session?.user?.id;
    setSession(null);
    saveSessionLocally(null);
    setCourses((cs) => {
      const remaining = cs.filter((c) => c.ownerId !== uid);
      return remaining.length > 0 ? remaining : [DEFAULT_COURSE];
    });
    setInsightsCourse(null);
    setStage("role");
  };

  const handleStudentAccountDeleted = () => {
    setStudentSession(null);
    saveSessionLocally(null, STUDENT_SESSION_STORAGE_KEY);
    setStage("role");
  };

  const handleNewCourse = () => {
    if (supabaseEnabled() && !session) {
      setNotice({ kind: "error", text: "Please sign in as a lecturer before creating a course." });
      setStage("auth");
      return;
    }
    setCourseDraft({
      id: makeId("course"), code: "", title: "", institution: "",
      tone: "conversational", voiceProvider: "browser", elevenLabsApiKey: "", elevenLabsVoiceId: "",
      lecturerName: "", lecturerPersona: DEFAULT_PERSONA, lecturerStyleNote: "",
      ownerId: session ? session.user.id : null,
      modules: [],
    });
    setEditingCourse(false);
    setStage("courseMeta");
  };

  const handleEditCourse = (course) => {
    setCourseDraft({ ...course });
    setEditingCourse(true);
    setStage("courseMeta");
  };

  const handleCourseMetaContinue = () => {
    setCourses((cs) => (cs.some((c) => c.id === courseDraft.id) ? cs.map((c) => (c.id === courseDraft.id ? courseDraft : c)) : [...cs, courseDraft]));
    setActiveCourseId(courseDraft.id);
    if (supabaseEnabled()) {
      const draft = courseDraft;
      enqueueCloud(() => sessionMgr.run(async (token) => {
        await saveCourseToSupabase({ ...draft, ownerId: draft.ownerId || sessionMgr.get().user.id }, token);
        cloudCoursesRef.current.add(draft.id);
      })).catch(reportSaveError("the course"));
    }
    if (editingCourse) {
      setStage("dashboard");
    } else {
      setSetupState(emptySetup());
      setStage("moduleSetup");
    }
  };

  const handleAddModule = (course) => {
    setActiveCourseId(course.id);
    setSetupState(emptySetup());
    setStage("moduleSetup");
  };

  // Saving a module just adds it to the course and returns to the
  // dashboard — it does NOT open a live session. Only the explicit
  // "Save & preview as student" path does that.
  const reportSaveError = (what) => (e) => {
    console.error(`Supabase ${what} save failed:`, e);
    if (e instanceof SessionExpiredError) return; // the sign-in notice is already showing
    const raw = String((e && e.message) || "");
    let why = raw.slice(0, 140);
    if (/42501/.test(raw)) why = "Your account isn't allowed to change this course. Sign out and back in, and make sure it's a course you created.";
    else if (/23503/.test(raw)) why = "The course hasn't reached the cloud yet. Try saving again.";
    setNotice({ kind: "error", text: `Couldn't save ${what} to the cloud, so it may be lost on refresh. ${why}` });
  };

  // Cloud writes go through one queue so a module can never be sent before its course.
  const enqueueCloud = (task) => {
    const run = cloudQueueRef.current.then(task, task);
    cloudQueueRef.current = run.catch(() => {});
    return run;
  };
  // Make sure the course exists in the cloud, then save the module.
  const cloudSaveModule = (course, moduleObj) =>
    enqueueCloud(() => sessionMgr.run(async (token) => {
      if (!cloudCoursesRef.current.has(course.id)) {
        await saveCourseToSupabase({ ...course, ownerId: course.ownerId || sessionMgr.get().user.id }, token);
        cloudCoursesRef.current.add(course.id);
      }
      await saveModuleToSupabase(course.id, moduleObj, token);
    }));

  const handleSaveModule = (moduleObj) => {
    const wasEdit = (courses.find((c) => c.id === activeCourseId)?.modules || []).some((m) => m.id === moduleObj.id);
    setCourses((cs) => cs.map((c) => (c.id === activeCourseId ? applyModuleSave(c, moduleObj) : c)));
    if (supabaseEnabled()) {
      const course = courses.find((c) => c.id === activeCourseId);
      if (course) cloudSaveModule(course, moduleObj).catch(reportSaveError("the module"));
    }
    setNotice(wasEdit ? { kind: "ok", text: `Saved changes to “${moduleObj.unit}”.` } : null);
    setStage("dashboard");
  };

  const handleSaveAndPreview = (moduleObj) => {
    const course = courses.find((c) => c.id === activeCourseId);
    const updatedCourse = applyModuleSave(course, moduleObj);
    setCourses((cs) => cs.map((c) => (c.id === activeCourseId ? updatedCourse : c)));
    if (supabaseEnabled()) cloudSaveModule(course, moduleObj).catch(reportSaveError("the module"));
    primeAudioForVoice();
    setRoomData(buildRoomData(updatedCourse, moduleObj));
    setStudentName("Lecturer (preview)");
    setStage("room");
  };

  const handleEditModule = (course, module) => {
    setActiveCourseId(course.id);
    setSetupState(moduleToSetup(module));
    setNotice(null);
    setStage("moduleSetup");
  };

  const handleDuplicateModule = (course, module) => {
    const copy = duplicateModule(module, makeId("module"));
    setCourses((cs) => cs.map((c) => (c.id === course.id ? applyModuleSave(c, copy) : c)));
    if (supabaseEnabled()) cloudSaveModule(course, copy).catch(reportSaveError("the copy"));
    setNotice({ kind: "ok", text: `Created “${copy.unit}”. Open Edit to rename it.` });
  };

  const handleDeleteModule = async (course, module) => {
    try {
      if (supabaseEnabled()) await enqueueCloud(() => sessionMgr.run((token) => deleteModuleFromSupabase(module.id, token)));
      setCourses((cs) => cs.map((c) => (c.id === course.id ? removeModule(c, module.id) : c)));
      setNotice({ kind: "ok", text: `Deleted “${module.unit}”.` });
    } catch (e) {
      setNotice({ kind: "error", text: `Couldn't delete “${module.unit}”. ${String((e && e.message) || "").slice(0, 160)}` });
    }
  };

  const handleDeleteCourse = async (course) => {
    try {
      if (supabaseEnabled()) {
        await enqueueCloud(() => sessionMgr.run((token) => deleteCourseFromSupabase(course.id, token)));
        cloudCoursesRef.current.delete(course.id);
      }
      setCourses((cs) => cs.filter((c) => c.id !== course.id));
      setActiveCourseId((cur) => nextActiveCourseId(courses, course.id, cur));
      setInsightsCourse((cur) => (cur && cur.id === course.id ? null : cur));
      setNotice({ kind: "ok", text: `Deleted course ${course.code}.` });
    } catch (e) {
      setNotice({ kind: "error", text: `Couldn't delete ${course.code}. ${String((e && e.message) || "").slice(0, 160)}` });
    }
  };

  const handlePreviewModule = (course, module) => {
    primeAudioForVoice();
    setRoomData(buildRoomData(course, module));
    setStudentName("Lecturer (preview)");
    setStage("room");
  };

  const handleJoin = (course, module, name, research, share) => {
    primeAudioForVoice(); // must run inside this click-triggered call, not later in a useEffect
    setResearchConsent(!!research);
    setShareWithLecturer(share !== false);
    setRoomData(buildRoomData(course, module));
    setStudentName(name);
    setStage("room");
  };

  const handleLeaveRoom = () => {
    setStage(role === "lecturer" ? "dashboard" : "join");
  };

  return (
    <>
      <GlobalStyles />
      <main>
      <Boundary variant="screen" label={`screen:${stage}`} resetKey={stage} exitLabel="Go to start" onExit={() => { setRoomData(null); setStage("role"); }}>
      {stage === "role" && (
        <RoleSelectScreen
          onOpenLegal={openLegal}
          onSelectRole={(r) => {
            setRole(r);
            if (r === "lecturer") {
              // Only gate on real auth when there's an actual database to
              // scope ownership against — without Supabase configured this
              // stays exactly the old single-user local mode.
              setStage(supabaseEnabled() && !session ? "auth" : "dashboard");
            } else {
              setStage("join");
            }
          }}
        />
      )}
      {stage === "splash" && <SplashScreen onContinue={() => setStage("role")} onOpenLegal={openLegal} />}
      {stage === "auth" && <AuthScreen onAuthenticated={handleAuthenticated} onBack={() => setStage("role")} onOpenLegal={openLegal} />}
      {stage === "privacy" && <PrivacyPolicyScreen onBack={() => setStage(legalReturnStage)} />}
      {stage === "terms" && <TermsScreen onBack={() => setStage(legalReturnStage)} />}
      {stage === "dashboard" && (
        <LecturerDashboard
          courses={myCourses}
          dbStatus={dbStatus}
          lecturerEmail={session ? accountLabel(session.user.email) : undefined}
          account={supabaseEnabled() ? session : null}
          onAccountDeleted={handleLecturerAccountDeleted}
          onOpenLegal={openLegal}
          onNewCourse={handleNewCourse}
          onEditCourse={handleEditCourse}
          onEditModule={handleEditModule}
          onDuplicateModule={handleDuplicateModule}
          onDeleteModule={handleDeleteModule}
          onDeleteCourse={handleDeleteCourse}
          notice={notice}
          onDismissNotice={() => setNotice(null)}
          onAddModule={handleAddModule}
          onPreviewModule={handlePreviewModule}
          onBack={() => setStage("role")}
          onSignOut={session ? handleSignOut : null}
          onViewInsights={(course) => {
            setInsightsCourse(course);
            setStage("flags");
          }}
        />
      )}
      {stage === "flags" && insightsCourse && (
        <CourseInsightsScreen course={insightsCourse} session={session} runAuthed={runAuthed} onBack={() => setStage("dashboard")} />
      )}
      {stage === "courseMeta" && courseDraft && (
        <CourseMetaScreen
          draft={courseDraft}
          editing={editingCourse}
          onChange={(patch) => setCourseDraft((d) => ({ ...d, ...patch }))}
          onContinue={handleCourseMetaContinue}
          onCancel={() => setStage("dashboard")}
        />
      )}
      {stage === "moduleSetup" && activeCourse && (
        <ModuleSetupScreen
          course={activeCourse}
          setup={setup}
          patchSetup={patchSetup}
          onSaveModule={handleSaveModule}
          onSaveAndPreview={handleSaveAndPreview}
          onCancel={() => setStage("dashboard")}
        />
      )}
      {stage === "join" && (
        <JoinScreen
          courses={courses}
          onJoin={handleJoin}
          onOpenLegal={openLegal}
          onBack={() => setStage("role")}
          studentSession={studentSession}
          studentProfile={studentProfile}
          onSaveProfile={handleSaveProfile}
          onStudentSignIn={() => setStage("studentAuth")}
          onStudentSignOut={handleStudentSignOut}
          onViewMyHistory={() => setStage("myHistory")}
        />
      )}
      {stage === "studentAuth" && (
        <AuthScreen role="student" onAuthenticated={handleStudentAuthenticated} onBack={() => setStage("join")} onOpenLegal={openLegal} />
      )}
      {stage === "myHistory" && studentSession && (
        <MyHistoryScreen session={studentSession} courses={courses} onBack={() => setStage("join")} onAccountDeleted={handleStudentAccountDeleted} onOpenLegal={openLegal} />
      )}
      {stage === "room" && roomData && (
        <LectureRoom
          curriculum={roomData.curriculum}
          settings={roomData.settings}
          courseId={roomData.courseId}
          moduleId={roomData.moduleId}
          studentName={studentName}
          studentSession={role === "student" ? studentSession : null}
          researchConsent={researchConsent}
          shareWithLecturer={shareWithLecturer}
          role={role}
          onLeave={handleLeaveRoom}
          onEditSession={role === "lecturer" ? () => setStage("dashboard") : null}
        />
      )}
      </Boundary>
      </main>
    </>
  );
}


// ---------------------------------------------------------------------------
// Styling — token system:
// bg #14181C, panel #1E2530, chalkboard #2F6F4F, live-amber #E8A33D,
// code-blue #6B95FF, text #EDEFF2 / #8B93A1
// ---------------------------------------------------------------------------
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

      * { box-sizing: border-box; }
      .room, .join-screen, .setup-screen { font-family: 'Inter', sans-serif; color: #EDEFF2; background: #14181C; }

      /* Join / role screens */
      .join-screen { min-height: 560px; display: flex; align-items: center; justify-content: center; padding: 40px 20px; }
      .join-card { max-width: 380px; width: 100%; text-align: center; }
      .join-card.wide { max-width: 480px; }
      .pick-list { display: flex; flex-direction: column; gap: 8px; text-align: left; margin: 18px 0; }
      .pick-row { padding: 12px 14px; border-radius: 10px; border: 1px solid #2A313C; background: #1E2530; color: #EDEFF2; font-size: 13px; text-align: left; cursor: pointer; }
      .pick-row:hover { border-color: #E8A33D; }
      .join-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #E8A33D; margin-bottom: 14px; }
      .join-title { font-family: 'Space Grotesk', sans-serif; font-size: 26px; line-height: 1.2; margin: 0 0 8px; }
      .join-sub { color: #8B93A1; font-size: 14px; margin: 0 0 28px; }
      .join-input { width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid #2A313C; background: #1E2530; color: #EDEFF2; font-size: 14px; margin-bottom: 12px; outline: none; }
      .join-input:focus { border-color: #E8A33D; }
      .join-btn { width: 100%; padding: 12px; border-radius: 10px; border: none; background: #2F6F4F; color: #EDEFF2; font-weight: 600; font-size: 14px; cursor: pointer; transition: background 0.15s; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 10px; }
      .join-btn:disabled { background: #2A313C; color: #8890A0; cursor: not-allowed; }
      .join-btn:not(:disabled):hover { background: #37855D; }
      .join-btn.secondary { background: #1E2530; border: 1px solid #2A313C; color: #C7CCD4; }
      .join-btn.secondary:hover { background: #232A34; }
      .join-hint { color: #8890A0; font-size: 12px; margin-top: 16px; }

      /* Setup screen */
      .setup-screen { min-height: 560px; max-width: 920px; margin: 0 auto; padding: 32px 20px 60px; }
      .setup-header { text-align: center; margin-bottom: 28px; }
      .setup-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 28px; align-items: start; }
      .setup-col { display: flex; flex-direction: column; gap: 8px; }
      .setup-col.narrow { max-width: 420px; margin: 0 auto; }
      .course-context-note { font-size: 11px; color: #8890A0; margin-top: 10px; line-height: 1.5; }

      .db-status { font-size: 11px; padding: 7px 12px; border-radius: 8px; margin-bottom: 14px; display: inline-block; }
      .db-status.ok { color: #6FBF8A; background: rgba(111,191,138,0.1); border: 1px solid rgba(111,191,138,0.25); }
      .db-status.warn { color: #E8A33D; background: rgba(232,163,61,0.1); border: 1px solid rgba(232,163,61,0.25); }
      .db-status.loading { color: #8B93A1; background: #1A1F27; border: 1px solid #232A34; }
      .dash-toolbar { display: flex; justify-content: flex-end; margin-bottom: 18px; }
      .course-list { display: flex; flex-direction: column; gap: 14px; }
      .course-card { background: #1E2530; border: 1px solid #232A34; border-radius: 12px; padding: 16px; }
      .course-card-head { display: flex; justify-content: space-between; align-items: center; font-size: 14px; margin-bottom: 10px; }
      .module-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 4px; }
      .module-row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; align-items: center; padding: 10px 12px; background: #1A1F27; border: 1px solid #232A34; border-radius: 9px; }
      .module-row-title { font-size: 13px; color: #EDEFF2; margin-bottom: 2px; }
      .module-row-meta { font-size: 11px; color: #8890A0; }
      .flag-section { margin-bottom: 24px; }
      .flag-section-title { font-size: 12px; font-weight: 600; color: #8B93A1; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
      .flag-list { display: flex; flex-direction: column; gap: 10px; }
      .flag-card { background: #1E2530; border: 1px solid #232A34; border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 6px; }
      .flag-card.resolved { opacity: 0.55; }
      .flag-card-meta { font-size: 11px; color: #8890A0; }
      .flag-card-question { font-size: 14px; color: #EDEFF2; font-style: italic; }
      .flag-card-answer { font-size: 12.5px; color: #9AA2AF; line-height: 1.5; }
      .flag-card .nav-btn { align-self: flex-start; margin-top: 4px; }
      .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
      .stat-card { background: #1E2530; border: 1px solid #232A34; border-radius: 10px; padding: 14px; text-align: center; }
      .stat-value { font-family: 'Space Grotesk', sans-serif; font-size: 22px; color: #E8A33D; }
      .stat-label { font-size: 11px; color: #8B93A1; margin-top: 4px; }
      .session-badge { font-weight: 600; }
      .session-badge.complete { color: #6FBF8A; }
      .session-badge.incomplete { color: #E8A33D; }
      .collapse-box.nested { margin-top: 12px; border: 1px solid #232A35; border-radius: 10px; background: #14181F; }
      .collapse-head { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 2px; background: none; border: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; }
      .collapse-box.nested > .collapse-head { padding: 10px 12px; }
      .collapse-head:hover .collapse-title { color: #fff; }
      .collapse-head:focus-visible { outline: 2px solid #E8A33D; outline-offset: 2px; border-radius: 6px; }
      .collapse-title { margin: 0; flex: 0 1 auto; }
      .collapse-title.nested { font-size: 13px; font-weight: 600; color: #E6E9EE; }
      .collapse-hint { flex: 1 1 auto; min-width: 0; font-size: 11px; color: #8890A0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .collapse-chevron { color: #8890A0; font-size: 12px; width: 12px; text-align: center; }
      .collapse-body { padding-top: 8px; }
      .collapse-box.nested > .collapse-body { padding: 0 12px 12px; }
      .session-item { background: #14181F; border: 1px solid #232A35; border-radius: 10px; overflow: hidden; }
      .session-item.open { border-color: #3A4556; }
      .session-item { position: relative; }
      .session-clear-btn { position: absolute; top: 8px; right: 34px; z-index: 1; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: none; border: 1px solid transparent; border-radius: 6px; color: #8B93A1; cursor: pointer; }
      .session-clear-btn:hover:not(:disabled) { color: #E8A33D; border-color: #2A313B; background: #1A1F27; }
      .session-clear-btn:disabled { opacity: .5; cursor: default; }
      .session-row { padding-right: 70px !important; }
      .clear-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 10px; font-size: 13px; color: #C9D0DA; }
      .clear-undo { display: flex; align-items: center; gap: 12px; margin: 0 0 10px; padding: 8px 12px; border-radius: 8px; background: #1A1F27; font-size: 13px; color: #C9D0DA; }
      .clear-toggle { margin: -4px 0 18px; }
      .session-row { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: none; border: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; }
      .session-row:hover { background: #1A1F27; }
      .session-row:focus-visible { outline: 2px solid #E8A33D; outline-offset: -2px; }
      .session-row-name { font-weight: 600; font-size: 13px; color: #E6E9EE; min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .session-row-date { font-size: 11px; color: #8890A0; white-space: nowrap; }
      .session-row .session-badge { font-size: 11px; white-space: nowrap; }
      .session-row-chevron { color: #8890A0; font-size: 12px; width: 12px; text-align: center; }
      .session-detail { padding: 4px 12px 12px; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid #232A35; }
      .session-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-top: 10px; font-size: 12px; color: #C7CCD4; }
      .session-stats span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #8890A0; margin-bottom: 2px; }
      .session-transcript-title { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #8890A0; }
      .session-detail .session-transcript { margin-top: 0; }
      @media (max-width: 520px) { .session-row { flex-wrap: wrap; gap: 4px 10px; } .session-row-date { order: 3; flex-basis: 100%; } }
      .session-transcript { margin-top: 8px; padding: 10px; background: #1A1F27; border-radius: 8px; max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
      .session-transcript-line { font-size: 12px; color: #C7CCD4; line-height: 1.5; }
      @media (max-width: 600px) {
        .stats-row { grid-template-columns: repeat(2, 1fr); }
      }
      .preview-actions-right { display: flex; gap: 10px; }
      .setup-label { font-size: 12px; font-weight: 600; color: #8B93A1; display: flex; align-items: center; gap: 5px; margin-bottom: 2px; }
      .setup-optional { font-weight: 400; color: #8890A0; text-transform: none; letter-spacing: 0; }
      .dropzone { border: 1.5px dashed #2A313C; border-radius: 12px; padding: 22px; text-align: center; color: #8B93A1; font-size: 13px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: border-color 0.15s, background 0.15s; }
      .dropzone:hover { border-color: #E8A33D; background: rgba(232,163,61,0.05); }
      .setup-or { text-align: center; color: #8890A0; font-size: 11px; margin: 6px 0; }
      .setup-textarea { width: 100%; min-height: 180px; padding: 12px; border-radius: 10px; border: 1px solid #2A313C; background: #1A1F27; color: #EDEFF2; font-size: 13px; font-family: 'JetBrains Mono', monospace; line-height: 1.6; resize: vertical; outline: none; }
      .setup-textarea:focus { border-color: #E8A33D; }
      .setup-input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #2A313C; background: #1E2530; color: #EDEFF2; font-size: 13px; outline: none; margin-bottom: 4px; }
      .setup-input:focus { border-color: #E8A33D; }
      .setup-slider { width: 100%; accent-color: #E8A33D; }
      .pill-row { display: flex; gap: 6px; flex-wrap: wrap; }
      .pill { padding: 7px 12px; border-radius: 20px; border: 1px solid #2A313C; background: #1A1F27; color: #8B93A1; font-size: 12px; cursor: pointer; }
      .pill.active { background: #2F6F4F; color: #EDEFF2; border-color: #2F6F4F; }
      .setup-checkbox { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #C7CCD4; margin-top: 12px; cursor: pointer; }
      .budget-readout { font-size: 11px; color: #E8A33D; background: rgba(232,163,61,0.1); border: 1px solid rgba(232,163,61,0.25); border-radius: 8px; padding: 8px 10px; margin-top: 12px; }
      .setup-error { display: flex; align-items: center; gap: 6px; color: #F0A0A0; font-size: 12px; margin-top: 10px; }
      .skip-link { background: none; border: none; color: #8890A0; font-size: 12px; text-decoration: underline; cursor: pointer; margin-top: 10px; padding: 4px; }
      .skip-link.inline { margin: 0 0 0 8px; padding: 0; display: inline; }
      .legal-body ul { padding-left: 20px; margin: 0 0 10px; }
      .legal-body, .account-panel { text-align: left; }
      .account-panel { max-width: 720px; margin: 36px 0 24px; padding-top: 18px; border-top: 1px solid #2A313A; }
      .account-title { font-family: 'Space Grotesk', sans-serif; font-size: 15px; margin: 0 0 6px; color: #EDEFF2; }
      .account-text { font-size: 13px; line-height: 1.55; color: #8890A0; margin: 0 0 10px; }
      .account-actions { display: flex; gap: 10px; flex-wrap: wrap; margin: 8px 0; }
      .account-confirm { margin: 10px 0; padding: 12px; border: 1px solid #5A2A2A; border-radius: 8px; background: #1C1416; }
      .nav-btn.danger { border-color: #7A3030; color: #F2A5A5; }
      .nav-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .signed-in-badge { font-size: 12px; color: #6FBF8A; background: rgba(111,191,138,0.1); border: 1px solid rgba(111,191,138,0.25); border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; text-align: left; }

      .preview-wrap { display: flex; flex-direction: column; gap: 14px; }
      .preview-toolbar { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #C7CCD4; flex-wrap: wrap; gap: 8px; }
      .slide-card-list { display: flex; flex-direction: column; gap: 12px; max-height: 460px; overflow-y: auto; padding-right: 4px; }
      .slide-card { background: #1E2530; border: 1px solid #232A34; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
      .slide-card-head { display: flex; align-items: center; gap: 8px; }
      .slide-card-title { flex: 1; font-family: 'Space Grotesk', sans-serif; font-size: 15px; background: none; border: none; border-bottom: 1px solid #2A313C; color: #EDEFF2; padding: 4px 0; outline: none; }
      .icon-btn { background: none; border: none; color: #8890A0; cursor: pointer; padding: 4px; }
      .icon-btn:hover { color: #F0A0A0; }
      .slide-card-bullets, .slide-card-notes, .slide-card-code { width: 100%; border-radius: 8px; border: 1px solid #2A313C; background: #1A1F27; color: #C7CCD4; font-size: 12.5px; padding: 8px 10px; outline: none; resize: vertical; }
      .slide-card-code { font-family: 'JetBrains Mono', monospace; }
      .preview-actions { display: flex; justify-content: space-between; gap: 10px; }

      /* Room shell — fixed to the viewport height, nothing here should grow
         the outer page. Only .stage and .side-messages scroll internally. */
      .room { height: 100vh; height: 100dvh; max-height: none; display: flex; flex-direction: column; overflow: hidden; }
      .topbar { flex: 0 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 6px 14px; border-bottom: 1px solid #232A34; font-size: 13px; }
      .topbar-title { font-weight: 600; display: flex; align-items: center; gap: 8px; }
      .topbar-right { display: flex; align-items: center; gap: 12px; }
      .dot-live { width: 7px; height: 7px; border-radius: 50%; background: #E8A33D; box-shadow: 0 0 0 3px rgba(232,163,61,0.2); }
      .topbar-slide { color: #8B93A1; font-family: 'JetBrains Mono', monospace; font-size: 12px; }
      .topbar-budget { display: flex; align-items: center; gap: 4px; color: #8890A0; font-size: 11px; }
      .topbar-edit { display: flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 7px; border: 1px solid #232A34; background: #1A1F27; color: #8B93A1; font-size: 11px; cursor: pointer; }
      .topbar-edit:hover { color: #EDEFF2; border-color: #37404D; }
      .topbar-edit.on { background: rgba(232,163,61,0.12); color: #E8A33D; border-color: rgba(232,163,61,0.35); }
      .topbar-edit.audio-blocked { background: rgba(240,160,160,0.12); color: #F0A0A0; border-color: rgba(240,160,160,0.4); animation: pulse-ring 1.2s ease-in-out infinite; }
      .tts-notice { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; padding: 6px 20px; font-size: 11px; color: #E8A33D; background: rgba(232,163,61,0.08); border-bottom: 1px solid rgba(232,163,61,0.2); }
      .tts-notice.clickable { cursor: pointer; text-decoration: underline; }

      .body { flex: 1 1 auto; display: flex; overflow: hidden; min-height: 0; }
      .main-col { flex: 1; display: flex; flex-direction: column; padding: 8px 12px; gap: 8px; min-width: 0; min-height: 0; transition: padding 0.25s ease; }

      .tiles { flex: 0 0 auto; display: flex; gap: 10px; height: 62px; transition: opacity 0.2s ease; }
      .tile { flex: 1; max-width: 220px; background: #1E2530; border-radius: 12px; border: 1px solid #232A34; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; position: relative; transition: border-color 0.2s, box-shadow 0.2s; }
      .tile.speaking { border-color: #E8A33D; box-shadow: 0 0 0 2px rgba(232,163,61,0.25); }
      .avatar { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 14px; }
      .lecturer-avatar { background: #2F6F4F; color: #EDEFF2; }
      .student-avatar { background: #35404E; color: #EDEFF2; }
      .tile-label { font-size: 11px; color: #8B93A1; display: flex; align-items: center; gap: 4px; }

      .stage-switch { flex: 0 0 auto; display: flex; gap: 8px; }
      .stage-switch button { display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 8px; border: 1px solid #232A34; background: #1A1F27; color: #8B93A1; font-size: 12px; cursor: pointer; }
      .stage-switch button.active { background: #232A34; color: #EDEFF2; border-color: #37404D; }
      .stage-switch button:disabled { opacity: 0.35; cursor: not-allowed; }

      .stage { flex: 1 1 auto; background: #1E2530; border: 1px solid #232A34; border-radius: 12px; padding: 16px 26px; overflow-y: auto; min-height: 0; transition: padding 0.25s ease; display: flex; flex-direction: column; scroll-behavior: auto; }
      /* Safe centering: auto margins centre a short slide, but collapse to 0 when the slide is taller than the stage, so the TOP is always reachable (justify-content:center cut it off). */
      .stage > .slide, .stage > .ide { margin-block: auto; }
      .stage:focus-visible { outline: 2px solid #E8A33D; outline-offset: -2px; }
      .follow-pill { position: sticky; bottom: 4px; align-self: center; flex: 0 0 auto; background: #E8A33D; color: #1B1408; border: none; border-radius: 999px; padding: 8px 16px; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: 0 6px 18px rgba(0,0,0,0.45); z-index: 6; }
      .slide-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #E8A33D; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px; display: flex; justify-content: space-between; }
      .slide h2 { font-family: 'Space Grotesk', sans-serif; font-size: 28px; margin: 0 0 14px; line-height: 1.25; transition: font-size 0.25s ease; }
      .slide ul { margin: 0; padding-left: 22px; color: #C7CCD4; line-height: 1.8; font-size: 16px; transition: font-size 0.25s ease; }
      .slide ul li { margin-bottom: 7px; }
      .slide-detail { margin: 12px 0 0; padding-top: 12px; border-top: 1px solid #2A313C; color: #9AA2AF; font-size: 14.5px; line-height: 1.8; }
      .paused-ribbon { margin-top: 18px; padding: 8px 12px; background: rgba(232,163,61,0.12); border: 1px solid rgba(232,163,61,0.35); color: #E8A33D; font-size: 12px; border-radius: 8px; }

      /* Presentation mode: tiles hidden, everything else scales up so the
         slide reads like an actual projected presentation rather than a
         chat-app content pane. Toggled from the topbar; chat can still be
         reopened independently via the controlbar without leaving it. */
      .room.presentation .tiles { display: none; }
      .room.presentation .main-col { padding: 8px 20px; }
      .room.presentation .stage { padding: 20px 56px 28px; }
      .room.presentation .slide-eyebrow { font-size: 13px; }
      .room.presentation .slide h2 { font-size: 40px; margin-bottom: 18px; }
      .room.presentation .slide ul { font-size: 22px; line-height: 1.85; }
      .room.presentation .slide ul li { margin-bottom: 11px; }
      .room.presentation .slide-detail { font-size: 18px; margin-top: 16px; padding-top: 14px; }

      .ide { display: flex; flex-direction: column; height: 100%; }
      /* the code editor takes ALL the height the stage has (it scrolls internally only if the program is longer) */
      .stage > .ide { flex: 1 1 0; min-height: 0; margin-block: 0; }
      .ide-bar { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #8B93A1; margin-bottom: 10px; border-bottom: 1px solid #232A34; padding-bottom: 8px; display: flex; align-items: center; justify-content: space-between; }
      .live-tag { display: flex; align-items: center; gap: 5px; color: #E8A33D; font-size: 11px; }
      .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #E8A33D; animation: pulse 1s ease-in-out infinite; }
      .ide-placeholder { font-family: 'JetBrains Mono', monospace; font-size: 13px; line-height: 1.7; color: #8890A0; white-space: pre-wrap; font-style: italic; }
      .ide-code { flex: 1; font-family: 'JetBrains Mono', monospace; font-size: 13px; line-height: 1.7; color: #C7CCD4; margin: 0; white-space: pre-wrap; }
      .type-cursor { color: #E8A33D; animation: pulse 0.8s step-end infinite; }
      .tok-keyword { color: #6B95FF; }
      .tok-string { color: #E8A33D; }
      .tok-comment { color: #8890A0; font-style: italic; }

      .control-strip { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; }
      .stage-actions { flex: 1 1 320px; min-width: 0; display: flex; align-items: center; gap: 10px; }
      .nav-btn { display: flex; align-items: center; gap: 4px; padding: 6px 11px; border-radius: 8px; border: 1px solid #232A34; background: #1A1F27; color: #C7CCD4; font-size: 12px; cursor: pointer; }
      .nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
      .explain-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 16px; border-radius: 8px; border: none; background: #2F6F4F; color: #EDEFF2; font-weight: 600; font-size: 13px; cursor: pointer; }
      .explain-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      .stage-actions .explain-btn { flex: 1; }
      .complete-banner { position: sticky; bottom: 0; z-index: 3; flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 16px; margin-top: 4px; border-radius: 10px; background: #1B3328; border: 1px solid rgba(47,111,79,0.55); font-size: 12.5px; color: #C7CCD4; }
      .complete-banner .explain-btn { flex: 0 0 auto; white-space: nowrap; }
      .status-pill { flex: 1; text-align: center; padding: 10px; border-radius: 8px; background: #1A1F27; border: 1px solid #232A34; color: #8B93A1; font-size: 12px; }
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }

      .side-panel { width: 260px; flex: 0 0 260px; border-left: 1px solid #232A34; display: flex; flex-direction: column; min-height: 0; }
      .side-header { flex: 0 0 auto; padding: 14px 16px; font-size: 12px; font-weight: 600; color: #8B93A1; border-bottom: 1px solid #232A34; }
      .side-messages { flex: 1 1 auto; overflow-y: auto; min-height: 0; padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
      .empty-hint { color: #8890A0; font-size: 12px; }
      .msg-speaker { font-size: 11px; color: #8890A0; margin-bottom: 3px; }
      .msg-text { font-size: 13px; line-height: 1.5; color: #C7CCD4; }
      .msg-question .msg-speaker { color: #6B95FF; }
      .msg-answer .msg-speaker, .msg-explain .msg-speaker { color: #E8A33D; }
      .msg-system { opacity: 0.8; }
      .msg-system .msg-speaker { color: #F0A0A0; }
      .msg-answer-flagged .msg-speaker { color: #E8A33D; }
      .msg-flag-note { font-size: 11px; color: #E8A33D; margin-top: 5px; }
      .side-input-wrap { flex: 0 0 auto; border-top: 1px solid #232A34; }
      .listening-banner { display: flex; align-items: center; gap: 6px; padding: 8px 16px 0; font-size: 11px; color: #E8A33D; }
      .listening-banner em { color: #C7CCD4; font-style: normal; }
      .listening-dot { width: 7px; height: 7px; border-radius: 50%; background: #E8A33D; animation: pulse 1s ease-in-out infinite; flex-shrink: 0; }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      .side-input { display: flex; gap: 6px; padding: 12px 16px; }
      .side-input input { flex: 1; padding: 9px 10px; border-radius: 8px; border: 1px solid #2A313C; background: #1A1F27; color: #EDEFF2; font-size: 12px; outline: none; }
      .side-input button { padding: 9px 10px; border-radius: 8px; border: none; background: #2F6F4F; color: #EDEFF2; cursor: pointer; }
      .side-input button:disabled { background: #2A313C; color: #8890A0; }

      .controlbar { flex: 0 0 auto; display: flex; justify-content: center; gap: 10px; padding: 8px 12px; border-top: 1px solid #232A34; }
      .ctrl { width: 40px; height: 40px; border-radius: 10px; border: 1px solid #232A34; background: #1A1F27; color: #8B93A1; display: flex; align-items: center; justify-content: center; cursor: pointer; }
      .ctrl.labeled { width: auto; padding: 0 16px; gap: 7px; font-size: 13px; font-weight: 600; }
      .ctrl.on { background: #232A34; color: #EDEFF2; }
      .ctrl.raised { background: rgba(232,163,61,0.15); color: #E8A33D; border-color: rgba(232,163,61,0.4); }
      .ctrl.listening { animation: pulse-ring 1.2s ease-in-out infinite; }
      @keyframes pulse-ring { 0%, 100% { box-shadow: 0 0 0 0 rgba(232,163,61,0.4); } 50% { box-shadow: 0 0 0 6px rgba(232,163,61,0); } }
      .ctrl.leave { background: #4A2323; color: #F0A0A0; border-color: #5C2A2A; }

      @media (max-width: 720px) {
        .setup-grid { grid-template-columns: 1fr; }
      }

      /* ===== Phones: Meet / Zoom style =====
         The slide gets the whole screen. The chat becomes a bottom sheet (a side column would leave the slide
         ~100px wide), secondary actions move under "More", and the call controls are round, thumb-sized buttons. */
      .topbar-actions { display: contents; }
      .topbar-more, .topbar-scrim, .side-close { display: none; }
      .ctrl { position: relative; }
      .ctrl-badge { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #E8A33D; color: #1B1408; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }

      /* shared by portrait phones and landscape phones */
      @media (max-width: 720px), (max-height: 500px) and (orientation: landscape) {
        .room { --ctrlbar-h: calc(72px + env(safe-area-inset-bottom, 0px)); }
        .room button { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
        input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { font-size: 16px !important; } /* below 16px iOS zooms the page when a field is focused */


        .stage-switch button { flex: 1; justify-content: center; min-height: 40px; font-size: 13px; }
        .control-strip { gap: 6px; }
        .stage-actions { flex: 1 1 100%; gap: 8px; }
        .nav-btn { min-height: 44px; padding: 0 14px; font-size: 14px; justify-content: center; }
        .status-pill { min-height: 44px; display: flex; align-items: center; justify-content: center; padding: 4px 8px; font-size: 12px; line-height: 1.25; }
        .stage-actions .explain-btn { min-height: 44px; }
        .signal-row { flex: 1 1 100%; flex-wrap: nowrap; gap: 6px; margin-top: 0; }
        .signal-label { display: none; }
        .signal-btn { flex: 1; min-height: 40px; padding: 0 6px; font-size: 13px; }
        .explain-select { flex: 1 1 100%; min-height: 40px; }
        .paused-note, .adapt-note { flex: 1 1 100%; border-radius: 12px; text-align: center; }
        .complete-banner { flex-direction: column; align-items: stretch; gap: 10px; }
        .complete-banner .explain-btn { width: 100%; min-height: 44px; white-space: normal; }

        .controlbar { height: var(--ctrlbar-h); padding: 8px 10px env(safe-area-inset-bottom, 0px); align-items: center; justify-content: space-around; gap: 6px; }
        .ctrl { width: 52px; height: 52px; border-radius: 50%; flex: 0 0 auto; }
        .ctrl.labeled { width: 52px; padding: 0; }
        .ctrl.labeled span { display: none; }
        .ctrl.leave { width: 68px; border-radius: 26px; }

        /* chat: a sheet that slides up over the bottom of the slide, above the call controls */
        .side-panel { position: fixed; z-index: 25; left: 0; right: 0; bottom: var(--ctrlbar-h); width: auto; flex: none; height: min(58dvh, 520px); background: #171C23; border-left: none; border-top: 1px solid #2F3A48; border-radius: 18px 18px 0 0; box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.5); overflow: hidden; animation: sheet-up 0.22s ease-out; }
        @keyframes sheet-up { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
        .side-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 6px 8px 16px; font-size: 13px; }
        .side-close { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; border: none; background: transparent; color: #8B93A1; cursor: pointer; }
        .side-messages { padding: 10px 16px; }
        .msg-text { font-size: 14.5px; line-height: 1.55; }
        .side-input { padding: 10px 12px; }
        .side-input input { min-height: 44px; padding: 0 12px; }
        .side-input button { min-width: 48px; min-height: 44px; }
      }

      /* top bar: title + slide counter + "More" for phones, landscape phones and tablets (8 buttons don't fit a 768px bar either) */
      @media (max-width: 900px), (max-height: 500px) and (orientation: landscape) {
        .topbar { position: relative; min-height: 48px; gap: 8px; padding: calc(6px + env(safe-area-inset-top, 0px)) 10px 6px; }
        .topbar-title { flex: 1 1 auto; min-width: 0; font-size: 13px; }
        .topbar-title-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .topbar-right { flex: 0 0 auto; gap: 8px; }
        .topbar-slide { white-space: nowrap; }
        .topbar-slide-title, .topbar-budget { display: none; }
        .topbar-more { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 10px; border: 1px solid #232A34; background: #1A1F27; color: #C7CCD4; cursor: pointer; }
        .topbar-more[aria-expanded="true"] { background: #232A34; color: #EDEFF2; }
        .topbar-scrim { display: block; position: fixed; inset: 0; z-index: 28; background: rgba(0, 0, 0, 0.35); }
        .topbar-actions { display: none; position: absolute; z-index: 30; top: 100%; left: 8px; right: 8px; margin-top: 4px; flex-direction: column; gap: 4px; padding: 6px; background: #1A1F27; border: 1px solid #2F3A48; border-radius: 14px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55); max-height: calc(100dvh - 120px); overflow-y: auto; }
        .topbar-actions.open { display: flex; }
        .topbar-actions .topbar-edit { width: 100%; min-height: 46px; padding: 0 14px; gap: 10px; font-size: 14px; justify-content: flex-start; border-radius: 10px; }
        .tts-notice { padding: 6px 12px; }
      }

      /* portrait phones: compact participant strip, slide-sized type */
      @media (max-width: 720px) {
        .main-col { padding: 6px 8px; gap: 6px; }
        .tiles { height: 44px; gap: 8px; }
        .tile { flex-direction: row; justify-content: flex-start; max-width: none; gap: 8px; padding: 0 10px; }
        .avatar { width: 28px; height: 28px; font-size: 12px; }
        .tile-label { font-size: 12px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .stage { padding: 14px 14px 18px; }
        .slide h2 { font-size: 22px; margin-bottom: 10px; }
        .slide ul { font-size: 15px; line-height: 1.7; padding-left: 18px; }
        .slide-detail { font-size: 14px; line-height: 1.7; }
        .room.presentation .main-col { padding: 6px 8px; }
        .room.presentation .stage { padding: 14px 14px 20px; }
        .room.presentation .slide-eyebrow { font-size: 11px; }
        .room.presentation .slide h2 { font-size: 26px; margin-bottom: 12px; }
        .room.presentation .slide ul { font-size: 17px; line-height: 1.75; }
        .room.presentation .slide ul li { margin-bottom: 8px; }
        .room.presentation .slide-detail { font-size: 15.5px; margin-top: 12px; padding-top: 10px; }
        .join-screen, .setup-screen { padding-left: 16px; padding-right: 16px; }
        .module-row, .course-card-head { flex-wrap: wrap; gap: 8px; }
        .preview-actions { flex-wrap: wrap; }
      }
      /* short screens: not enough height for the participant strip */
      @media (max-width: 720px) and (max-height: 700px) { .tiles { display: none; } }

      /* landscape phones: slide on the left, chat docked on the right, slim bars */
      @media (max-height: 500px) and (orientation: landscape) {
        .room { --ctrlbar-h: calc(56px + env(safe-area-inset-bottom, 0px)); }
        .tiles { display: none; }
        .topbar { min-height: 40px; padding-top: 3px; padding-bottom: 3px; }
        .main-col { padding: 4px 8px; gap: 4px; }
        .stage { padding: 10px 14px; }
        .slide h2 { font-size: 20px; margin-bottom: 8px; }
        .controlbar { padding-top: 4px; }
        .ctrl { width: 44px; height: 44px; }
        .ctrl.labeled { width: 44px; }
        .ctrl.leave { width: 60px; }
        .side-panel { top: 0; left: auto; right: 0; width: min(340px, 55vw); height: auto; border-radius: 0; border-top: none; border-left: 1px solid #2F3A48; }
        .stage-switch button { flex: 0 0 auto; min-height: 32px; padding: 4px 14px; }
        .control-strip { gap: 6px; }
        .stage-actions { flex: 1 1 280px; }
        .nav-btn, .status-pill, .stage-actions .explain-btn { min-height: 40px; }
        .signal-row { flex: 0 0 auto; }
        .signal-btn { flex: 0 0 auto; min-height: 36px; padding: 0 12px; }
        .explain-select { flex: 0 1 170px; min-height: 36px; }
        .paused-note, .adapt-note { flex: 0 1 auto; }
      }

      /* Student voice settings */
      .voice-scrim { position: fixed; inset: 0; z-index: 80; background: rgba(0,0,0,0.45); }
      .voice-panel { position: fixed; z-index: 81; top: 72px; right: 16px; width: min(360px, calc(100vw - 24px)); max-height: calc(100dvh - 96px); overflow-y: auto; background: #1A1F27; border: 1px solid #2A313C; border-radius: 14px; padding: 16px; box-shadow: 0 16px 48px rgba(0,0,0,0.5); color: #EDEFF2; }
      .voice-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .voice-label { display: flex; justify-content: space-between; font-size: 12.5px; color: #8890A0; margin: 12px 0 6px; }
      .voice-value { color: #EDEFF2; font-weight: 600; }
      .voice-panel input[type="range"] { width: 100%; accent-color: #2F6F4F; }
      .voice-presets { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
      .voice-presets .pill:disabled { opacity: 0.4; cursor: not-allowed; }
      .voice-select { width: 100%; min-height: 40px; background: #14181C; color: #EDEFF2; border: 1px solid #2A313C; border-radius: 8px; padding: 0 10px; font-size: 16px; }
      .voice-note { font-size: 12px; line-height: 1.5; color: #8890A0; margin: 8px 0 0; }
      .voice-actions { display: flex; gap: 8px; margin-top: 14px; }
      @media (max-width: 720px) {
        .voice-panel { top: auto; right: 0; left: 0; bottom: 0; width: auto; max-height: 82dvh; border-radius: 16px 16px 0 0; padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); }
      }
      /* Accessibility: a strong, consistent keyboard focus ring, applied
         globally and placed last in the cascade so it overrides any
         earlier outline:none on individual form elements (several had
         no focus indicator at all before this). Uses :focus-visible
         rather than :focus so it only shows for keyboard/assistive-tech
         focus, not mouse clicks. */
      *:focus-visible {
        outline: 2px solid #E8A33D;
        outline-offset: 2px;
        border-radius: 4px;
      }
      .sr-only {
        position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
      }
    `}</style>
  );
}

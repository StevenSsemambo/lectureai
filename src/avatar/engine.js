// The lecturer's face: loads the rigged avatar (GLB), draws it into a canvas, and moves it from the bus events.
// Ported from the standalone "3D AI Lecturer" prototype (three.js r128 + its GLTFLoader, pinned in package.json).
//
// Safe by construction:
//  - it only ever READS the voice (through avatarBus events or the audio element), it never controls it;
//  - it draws nothing while the tab is hidden or its box has no size, and runs at ~24 fps while idle;
//  - dispose() frees the WebGL context, so turning the camera off and on again can't pile up contexts.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  buildTimeline, mouthAt, autoEmotion, planActions, adaptMsPerUnit, BASE_MS_PER_UNIT, clamp,
  MS_PER_UNIT_MIN, MS_PER_UNIT_MAX, buildSpeechMap, positionFromFraction, nextWordT,
} from "./lipsync.js";
import { buildRig, applyArm, POSES } from "./body.js";
import { analyseBlob } from "./envelope.js";
import { getOffsetMs } from "./lipTuning.js";

// Each browser voice has its own speed, and some never send word events. What we learn about a voice is kept on this
// device so the next lecture starts in sync.
const CAL_KEY = "semai.lipsync.voice.v2";
function readCal() { try { return JSON.parse(localStorage.getItem(CAL_KEY) || "{}") || {}; } catch (e) { return {}; } }
function loadCal(voice) {
  const c = readCal()[voice];
  if (!c) return null;
  return { ms: c.ms >= MS_PER_UNIT_MIN && c.ms <= MS_PER_UNIT_MAX ? c.ms : null, b: c.b === 1 ? true : c.b === 0 ? false : null };
}
function saveCal(voice, ms, bnd) {
  try {
    const o = readCal();
    o[voice] = { ms: Math.round(ms * 10) / 10, b: bnd === true ? 1 : bnd === false ? 0 : undefined };
    const keys = Object.keys(o);
    if (keys.length > 12) delete o[keys[0]];
    localStorage.setItem(CAL_KEY, JSON.stringify(o));
  } catch (e) { /* storage unavailable: fine */ }
}

// How long the mouth waits before starting a LINE of speech (the first piece), because the browser's "started" event can
// come well before any sound (network voices fetch their audio first). A word event, when the voice sends them, ends the wait.
const WAIT_FIRST_WORD_MS = 600;       // voice not known yet
const WAIT_FIRST_WORD_KNOWN_MS = 800; // voice known to send word events
const NO_EVENT_LAG_MS = 450;          // voice known NOT to send word events: nothing to wait for, so a fixed lag
const PENDING_FALLBACK_MS = 3500;     // a piece was queued but the voice never said it started: only then start on a guess

const { Vector3: V3, Quaternion: Q } = THREE;
const LEFT = "Left", RIGHT = "Right";
const both = (n, v) => ({ [n + LEFT]: v, [n + RIGHT]: v });

// facial expression targets (morph targets) + a slight head tilt [pitch, roll]
const EMOTIONS = {
  neutral: { m: { ...both("mouthSmile", 0.14), browInnerUp: 0.05 }, h: [0, 0] },
  happy: { m: { ...both("mouthSmile", 0.55), ...both("cheekSquint", 0.3), ...both("eyeSquint", 0.15), ...both("browOuterUp", 0.15) }, h: [-0.02, 0.03] },
  excited: { m: { ...both("mouthSmile", 0.7), ...both("cheekSquint", 0.4), ...both("eyeWide", 0.25), browInnerUp: 0.25, ...both("browOuterUp", 0.35) }, h: [-0.03, 0] },
  serious: { m: { ...both("browDown", 0.4), ...both("mouthPress", 0.25), ...both("eyeSquint", 0.1) }, h: [0.03, 0] },
  concerned: { m: { browInnerUp: 0.65, ...both("browDown", 0.12), ...both("mouthFrown", 0.3) }, h: [0.02, 0.06] },
  surprised: { m: { ...both("eyeWide", 0.6), browInnerUp: 0.6, ...both("browOuterUp", 0.55) }, h: [-0.04, 0] },
  thoughtful: { m: { browInnerUp: 0.3, browDownLeft: 0.25, browOuterUpRight: 0.25, ...both("mouthPress", 0.14), mouthLeft: 0.1 }, h: [0, 0.05] },
};

// quick facial expressions that come and go with single words (added on top of the mood)
const PULSES = {
  smile: { ...both("mouthSmile", 0.6), ...both("cheekSquint", 0.35), ...both("eyeSquint", 0.15) },
  furrow: { ...both("browDown", 0.5), ...both("eyeSquint", 0.15), ...both("mouthPress", 0.1) },
  brow_up: { browInnerUp: 0.5, ...both("browOuterUp", 0.5) },
  wide: { ...both("eyeWide", 0.5), browInnerUp: 0.45, ...both("browOuterUp", 0.4) },
  concern: { browInnerUp: 0.7, ...both("mouthFrown", 0.35), ...both("browDown", 0.1) },
  think: { browInnerUp: 0.25, browDownLeft: 0.25, browOuterUpRight: 0.3, mouthLeft: 0.1 },
};

export class LecturerFace {
  constructor({ container, modelUrl, framing = "bust", onStatus, reducedMotion = false }) {
    this.container = container;
    this.modelUrl = modelUrl;
    this.framing = framing;
    this.onStatus = onStatus || (() => {});
    this.reduced = !!reducedMotion;

    this.disposed = false;
    this.ready = false;
    this.model = null; this.morphs = []; this.bones = {}; this.base = {}; this.headY = 1.6;
    this.cur = {}; // smoothed morph values
    this.gaze = { x: 0, y: 0, tx: 0, ty: 0, next: 2000 };
    this.blinkAt = 2500; this.blinkT = -1;
    this.hx = 0; this.hz = 0; this.nodT = -1e9;
    this.pose = { Left: null, Right: null };
    this.rig = null; this.pulses = []; this.lastGestureAt = -1e9; this.shakeT = -1e9; this.tiltT = -1e9; this.gazeHold = null; this.yawBias = 0;
    this.armsActiveUntil = 0;

    // speaking state
    this.speaking = false; this.thinking = false; this.speechEmo = "neutral";
    this.tl = null; this.tlStart = 0; this.t0 = 0; this.rate = 1; this.fixedMs = 0; this.audio = null;
    this.actions = []; this.gi = 0; this.pending = null;
    this.baseMs = BASE_MS_PER_UNIT; this.voiceKey = null; this.calDirty = false;
    this.bndKnown = null;   // does this voice send word events? (null = not known yet)
    this.bndSeen = false; this.nb = 0; this.awaitFirst = false; this.awaitAt = 0; // this piece
    this.offsetMs = 0; this.overrunMs = 0; this.lastPiece = null; this.envState = "none";
    this.lineActive = false; this.awaitCap = 0; this.leadMs = 0; // lineActive: a line of speech is in progress (pieces after the first need no wait)
    this.lastB = null; this.wordLocked = false; this.nextT = 0; // browser voice: word boundaries seen in this piece
    this.env = null; this.map = null; this.level = 0; this.jobs = new WeakMap(); // recorded voice: measured loudness

    this.last = performance.now(); this.lastRender = 0; this.size = { w: 0, h: 0 };

    // throws when WebGL is unavailable: the caller shows the plain-letter fallback
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.className = "avatar-canvas";
    container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2b3340);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x666670, 0.9));
    const key = new THREE.DirectionalLight(0xfff2e0, 1.1); key.position.set(1.2, 2.6, 2.5); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xb8d0ff, 0.5); rim.position.set(-2, 2, -1.5); this.scene.add(rim);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

    this._onLost = (e) => { e.preventDefault(); this.ready = false; this.onStatus("error"); };
    this.canvas.addEventListener("webglcontextlost", this._onLost);
    this._ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this._resize()) : null;
    if (this._ro) this._ro.observe(container);
    this._resize();
    this._frame = this._frame.bind(this);
    this._raf = requestAnimationFrame(this._frame);
  }

  // ---------- loading ----------
  async load() {
    const res = await fetch(this.modelUrl);
    if (!res.ok) throw new Error("avatar model " + res.status);
    const buf = await res.arrayBuffer();
    if (this.disposed) return;
    const gltf = await new Promise((resolve, reject) => {
      // The textures are decoded the plain way (as in the prototype). The loader picks its decoder when parsing starts,
      // so the browser's createImageBitmap is hidden only for that moment and put straight back.
      const had = window.createImageBitmap;
      try { window.createImageBitmap = undefined; new GLTFLoader().parse(buf, "", resolve, reject); }
      catch (e) { reject(e); }
      finally { window.createImageBitmap = had; }
    });
    if (this.disposed) return;
    const model = gltf.scene;
    const morphs = [], bones = {};
    model.traverse((o) => {
      if (o.isSkinnedMesh) o.frustumCulled = false;
      if (o.morphTargetDictionary && o.morphTargetInfluences) morphs.push(o);
    });
    for (const n of ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftArm", "LeftForeArm", "RightArm", "RightForeArm", "LeftHand", "RightHand"]) bones[n] = model.getObjectByName(n);
    if (!bones.LeftArm || !bones.Head) throw new Error("avatar needs a standard humanoid skeleton");
    this.scene.add(model);
    this.model = model; this.morphs = morphs; this.bones = bones;
    this.rig = buildRig(model, bones); // measures her hands and fingers once
    for (let i = 0; i < 4; i++) this._armsTo(1); // settle into the resting pose
    for (const n of ["Spine1", "Spine2", "Neck", "Head"]) if (bones[n]) this.base[n] = bones[n].quaternion.clone();
    model.updateWorldMatrix(true, true);
    this.headY = new V3().setFromMatrixPosition(bones.Head.matrixWorld).y;
    this._applyFraming();
    this.ready = true;
    this.onStatus("ready");
  }

  _armsTo(k) {
    for (const n of [LEFT, RIGHT]) applyArm(this.rig, n, POSES.rest, k);
  }

  // ---------- size / framing ----------
  setFraming(framing) { if (framing !== this.framing) { this.framing = framing; this._applyFraming(); } }

  _resize() {
    if (this.disposed) return;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.size = { w, h };
    if (!w || !h) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    this._applyFraming();
    this.lastRender = 0; // draw at once
  }

  _applyFraming() {
    // bust: head and shoulders, a little further back than the prototype's wide shot so the hair is not cropped in a tall
    // tile. face: closer, for the small round tile on phones. (Numbers checked against the model's head bounds.)
    const hy = this.headY;
    const f = this.framing === "face" ? { y: hy + 0.03, dist: 0.95 } : { y: hy - 0.094, dist: 1.4 };
    this.cam.position.set(0, f.y, f.dist);
    this.cam.lookAt(0, f.y, 0);
    this.cam.updateProjectionMatrix();
  }

  // ---------- events from the voice ----------
  handle(type, d) {
    if (this.disposed) return;
    const now = performance.now();
    switch (type) {
      case "piece": this.pending = { text: d.text, rate: d.rate, voice: d.voice, at: now }; break;
      case "pieceStart": this.pending = null; this._begin({ text: d.text, rate: d.rate, voice: d.voice }, now); break;
      case "recordingReady": this._analyse(d.blob); break; // measure it while it is still being set up
      case "recording": {
        this.pending = null;
        this._begin({ text: d.text, rate: d.rate, durationMs: d.durationMs, audio: d.audio }, now);
        if (d.blob && this.tl) {
          const tl = this.tl;
          this.envState = "pending";
          this._analyse(d.blob).then((env) => {
            if (this.disposed || this.tl !== tl || !this.audio) return;
            if (env) { this.env = env; this.map = buildSpeechMap(tl); this.envState = "ready"; } else this.envState = "failed";
          });
        }
        break;
      }
      case "boundary": {
        if (d.kind === "sentence") break;
        if (!this.tl && this.pending) { const p = this.pending; this.pending = null; this._begin(p, now); } // sound is certainly playing
        if (!this.tl || this.fixedMs || this.audio) break; // recordings are timed by the audio itself
        const k = this.tl.u.findIndex((x) => x.ci >= d.charIndex);
        if (k < 0) break;
        const ut = this.tl.u[k].t;
        this.nb++;
        if (this.nb === 1) this.leadMs = Math.round(now - this.t0); // how far ahead of the first word the 'started' event came
        if (!this.bndSeen) { this.bndSeen = true; if (this.bndKnown !== true) { this.bndKnown = true; this.calDirty = true; } }
        if (this.lastB && ut > this.lastB.t + 0.5) {
          // how fast is this voice really talking? learn it from the time between two words, right now
          const dMs = now - this.lastB.at;
          if (dMs > 40 && dMs < 3000) {
            const measured = (dMs / (ut - this.lastB.t)) * (this.rate || 1);
            this.baseMs = clamp(this.baseMs * 0.65 + measured * 0.35, MS_PER_UNIT_MIN, MS_PER_UNIT_MAX);
            this.calDirty = true;
          }
        }
        this.lastB = { t: ut, at: now };
        this.tlStart = now + this.offsetMs - ut * this._msPerUnit(); // snap to this word...
        this.nextT = nextWordT(this.tl, k);                          // ...and do not run into the next one before the voice gets there
        this.wordLocked = true; this.awaitFirst = false;
        break;
      }
      case "pieceEnd": this._finish(true, now, true); break; // the voice really stopped: shut the mouth now, do not run on
      case "end": this._finish(true, now); this._saveCal(); break;
      case "stop": this._finish(false, now); this._saveCal(); break;
      default: break;
    }
  }

  setThinking(v) { this.thinking = !!v; }

  _analyse(blob) {
    let job = this.jobs.get(blob);
    if (!job) { job = analyseBlob(blob); this.jobs.set(blob, job); }
    return job;
  }
  _saveCal() { if (this.calDirty && this.voiceKey) { saveCal(this.voiceKey, this.baseMs, this.bndKnown); this.calDirty = false; } }

  // a few lines of plain text about the timing, for tuning (shown when ?lipdebug is on)
  debugLine() {
    const lp = this.lastPiece;
    return [
      `${this.audio ? "recording" : "browser voice"}: ${this.voiceKey || "-"}`,
      `word events: ${this.bndKnown === true ? "yes" : this.bndKnown === false ? "NO" : "?"}   offset ${this.offsetMs} ms   speed ${this.baseMs.toFixed(0)} ms/unit   measured: ${this.envState}`,
      lp ? `last piece: guessed ${lp.estMs} ms, took ${lp.actMs} ms, words heard ${lp.nb}, ran past ${lp.over} ms` : "last piece: -",
      lp && lp.nb ? `'started' event came ${lp.lead} ms before the first word` : "",
    ].filter(Boolean).join("\n");
  }

  _msPerUnit() { return this.fixedMs || clamp(this.baseMs / (this.rate || 1), 30, 160); }

  _begin({ text, rate, durationMs, audio, voice }, now) {
    if (!text) return;
    this._finish(true, now, true); // learn the speed of the piece that just ended
    if (voice && voice !== this.voiceKey) {
      this._saveCal(); this.voiceKey = voice; this.calDirty = false;
      const c = loadCal(voice);
      this.baseMs = (c && c.ms) || BASE_MS_PER_UNIT; this.bndKnown = c ? c.b : null;
    }
    this.offsetMs = getOffsetMs();
    this.tl = buildTimeline(text);
    this.actions = planActions(text, this.tl); this.gi = 0;
    this.rate = rate || 1;
    this.fixedMs = durationMs > 0 && this.tl.total > 0 ? durationMs / this.tl.total : 0;
    this.audio = audio || null;
    this.t0 = now;
    this.tlStart = now + (audio ? 0 : this.offsetMs);
    // The "started" event can come well before the sound. The first piece of a line therefore waits for the voice's first
    // word event (which proves sound is playing); a voice known to send none gets a fixed lag instead. Pieces after the
    // first follow straight on from the previous one, so they start at once.
    const firstOfLine = !this.lineActive; this.lineActive = true;
    this.awaitFirst = false; this.awaitAt = now; this.awaitCap = 0;
    if (!audio && firstOfLine) {
      if (this.bndKnown === false) this.tlStart += NO_EVENT_LAG_MS;
      else { this.awaitFirst = true; this.awaitCap = this.bndKnown === true ? WAIT_FIRST_WORD_KNOWN_MS : WAIT_FIRST_WORD_MS; }
    }
    this.bndSeen = false; this.nb = 0; this.overrunMs = 0; this.leadMs = 0;
    this.speechEmo = autoEmotion(text) || "neutral";
    this.speaking = true;
  }

  _finish(natural, now, keepSpeaking = false) {
    // a piece the boundaries already timed has taught us its speed; otherwise learn it from how long the whole piece took
    if (natural && this.tl && this.t0 && !this.fixedMs && !this.audio) {
      // words heard during the piece already taught us its speed; otherwise learn it from how long the whole piece took
      if (!this.bndSeen) { this.baseMs = adaptMsPerUnit(this.baseMs, now - this.t0, this.tl.total, this.rate); this.calDirty = true; }
      // a long piece that ended without a single word event: this voice does not send them
      if (this.voiceKey && !this.bndSeen && this.tl.u.length >= 30 && now - this.t0 > 600 && this.bndKnown !== false) { this.bndKnown = false; this.calDirty = true; }
      this.lastPiece = { estMs: Math.round(this.tl.total * this._msPerUnit()), actMs: Math.round(now - this.t0), nb: this.nb, over: Math.round(this.overrunMs), lead: this.leadMs };
    }
    if (!keepSpeaking) this.lineActive = false;
    this.tl = null; this.t0 = 0; this.audio = null; this.fixedMs = 0; this.envState = "none"; this.awaitFirst = false; this.overrunMs = 0;
    this.env = null; this.map = null; this.level = 0; this.lastB = null; this.wordLocked = false;
    if (!keepSpeaking) { this.speaking = false; this.pending = null; this.speechEmo = "neutral"; }
  }

  // position on the timeline, in weight units (-1 = not saying anything right now)
  _position(now) {
    if (!this.tl) return -1;
    if (this.audio) {
      const a = this.audio, dur = a.duration;
      if (a.paused || !(dur > 0) || !isFinite(dur)) return -1;
      const ct = a.currentTime - this.offsetMs / 1000; // the student's timing offset (e.g. Bluetooth delay)
      if (ct < 0) return -1;
      if (this.env && this.map) {
        // the real sound decides: silent frames shut the mouth, and the words advance only while the voice is sounding
        const e = this.env, f = Math.floor(ct / e.hop);
        if (f < 0 || f >= e.n || !e.voiced[f]) { this.level = 0; return -1; }
        this.level = e.env[f];
        return positionFromFraction(this.tl, this.map, (e.cum[f] + 0.5) / e.total);
      }
      if (this.envState === "pending" && ct < 0.8) return -1; // still measuring: better a moment of stillness than a wrong shape
      return (ct / dur) * this.tl.total; // not measured: stretch the text evenly over the recording
    }
    if (this.awaitFirst) {
      if (now - this.awaitAt < this.awaitCap) return -1; // waiting for the voice's first word event
      this.awaitFirst = false; this.tlStart = now + this.offsetMs; // it never came: start anyway
    }
    const ms = this._msPerUnit();
    const p = (now - this.tlStart) / ms;
    if (this.wordLocked) {
      if (this.lastB && now - this.lastB.at > 900) this.wordLocked = false; // word events went quiet: stop waiting for them
      else return Math.min(p, this.nextT - 0.01);
    }
    if (p >= this.tl.total) {
      // The voice is slower than the estimate and has not finished: keep talking (repeat the last words) rather than freezing.
      const over = (p - this.tl.total) * ms;
      this.overrunMs = Math.max(this.overrunMs, over);
      if (over > 4000) return -1; // far too long: the voice has probably ended without telling us
      const span = Math.min(this.tl.total, 14);
      return this.tl.total - span + ((p - this.tl.total) % span);
    }
    return p;
  }

  // ---------- frame ----------
  _frame(now) {
    this._raf = requestAnimationFrame(this._frame);
    if (this.disposed || !this.ready || document.hidden || !this.size.w || !this.size.h) { this.last = now; return; }
    const talking = this.speaking || this.thinking;
    if (!talking && now - this.lastRender < 42) return; // ~24 fps while idle
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now; this.lastRender = now;

    if (this.pending && now - this.pending.at > PENDING_FALLBACK_MS) { const p = this.pending; this.pending = null; this._begin(p, now); } // the voice never said "started"

    const B = this.bones, T = {};
    const emoName = this.speaking ? this.speechEmo : this.thinking ? "thoughtful" : "neutral";
    const em = EMOTIONS[emoName] || EMOTIONS.neutral;
    const calm = this.speaking ? 0.7 : 1;
    for (const k in em.m) T[k] = em.m[k] * (/smile|press|frown/i.test(k) ? calm : 1);

    // mouth
    if (this.speaking && this.tl) {
      const p = this._position(now);
      while (this.gi < this.actions.length && p >= this.actions[this.gi].t) this._act(this.actions[this.gi++], now);
      const m = mouthAt(this.tl, p);
      if (m) {
        const lv = this.audio && this.env ? clamp(0.6 + 0.55 * this.level, 0.5, 1.15) : 1; // louder sound, wider mouth
        T[m.viseme] = m.viseme === "viseme_PP" ? m.weight : Math.min(1, m.weight * lv); T.jawOpen = m.jaw * lv;
        if (m.funnel) T.mouthFunnel = m.funnel;
        if (m.pucker) T.mouthPucker = m.pucker;
        if (m.next) T[m.next.viseme] = Math.max(T[m.next.viseme] || 0, m.next.weight);
      }
    }

    // blink
    if (now > this.blinkAt && this.blinkT < 0) this.blinkT = now;
    let bl = 0;
    if (this.blinkT >= 0) {
      const q = (now - this.blinkT) / 150;
      if (q >= 1) { this.blinkT = -1; this.blinkAt = now + (Math.random() < 0.2 ? 250 : 2200 + Math.random() * 3300); } else bl = Math.sin(Math.PI * q);
    }
    T.eyeBlinkLeft = T.eyeBlinkRight = bl;

    // gaze: mostly on the student, now and then a glance away (up and aside when thinking)
    const g = this.gaze;
    const gh = this.gazeHold && now < this.gazeHold.until ? this.gazeHold : null;
    if (gh) { // looking where the words point: at the slide, up while thinking, back at the student
      g.tx = gh.to === "slide" ? -0.6 : gh.to === "up" ? 0.25 : 0; g.ty = gh.to === "slide" ? -0.05 : gh.to === "up" ? 0.4 : 0;
      g.next = Math.max(g.next, gh.until);
    } else if (now > g.next) {
      const away = Math.random() < 0.2 || (emoName === "thoughtful" && Math.random() < 0.5);
      g.tx = away ? (Math.random() - 0.5) * 0.7 : 0;
      g.ty = away ? (emoName === "thoughtful" ? 0.35 : (Math.random() - 0.5) * 0.4) : 0;
      g.next = now + (away ? 600 + Math.random() * 500 : 1500 + Math.random() * 2500);
    }
    g.x += (g.tx - g.x) * (1 - Math.exp(-dt / 0.07));
    g.y += (g.ty - g.y) * (1 - Math.exp(-dt / 0.07));
    T.eyeLookOutLeft = Math.max(0, g.x); T.eyeLookInRight = Math.max(0, g.x);
    T.eyeLookInLeft = Math.max(0, -g.x); T.eyeLookOutRight = Math.max(0, -g.x);
    T.eyeLookUpLeft = T.eyeLookUpRight = Math.max(0, g.y);
    T.eyeLookDownLeft = T.eyeLookDownRight = Math.max(0, -g.y);

    // quick expressions that go with single words
    if (this.pulses.length) {
      this.pulses = this.pulses.filter((q) => now - q.t < q.dur + 700);
      for (const q of this.pulses) {
        const el = now - q.t, env = el < 150 ? el / 150 : el < q.dur ? 1 : Math.max(0, 1 - (el - q.dur) / 600), def = PULSES[q.f];
        for (const k in def) T[k] = Math.min(1, (T[k] || 0) + def[k] * q.amp * env * (this.reduced ? 0.5 : 1) * (this.speaking && /smile|press|frown/i.test(k) ? 0.7 : 1));
      }
    }

    // smooth + apply
    const cur = this.cur;
    for (const n in T) if (!(n in cur)) cur[n] = 0;
    for (const n in cur) {
      const tau = /viseme|jaw|mouthFunnel|mouthPucker/.test(n) ? 0.045 : /Blink/.test(n) ? 0.035 : /eyeLook/.test(n) ? 0.06 : 0.22;
      cur[n] += ((T[n] || 0) - cur[n]) * (1 - Math.exp(-dt / tau));
      for (const m of this.morphs) { const i = m.morphTargetDictionary[n]; if (i !== undefined) m.morphTargetInfluences[i] = cur[n]; }
    }

    // arms: only worked on while a gesture is running or just finished
    if (now < this.armsActiveUntil) {
      for (const n of [LEFT, RIGHT]) {
        const ps = this.pose[n], act = ps && now < ps.until;
        let def = POSES.rest, bump = 0;
        if (act) {
          const a = (now - ps.t) / 1000;
          def = ps.def;
          bump = (ps.beat ? 0.2 * Math.exp(-a * 5) : 0) + 0.04 * Math.sin(a * 4 + (n === LEFT ? 1.3 : 0)); // the stroke of a beat, then a faint life
        } else if (ps) this.pose[n] = null;
        applyArm(this.rig, n, def, 1 - Math.exp(-dt * (act ? 6 : 3)), bump);
      }
    }

    // head and body: a calm, living sway; a nod on emphasis
    const mo = this.reduced ? 0.25 : 1;
    const a = (this.speaking ? 1 : 0.4) * mo, t = now, ns = (now - this.nodT) / 400;
    const nod = ns < 1 ? 0.07 * Math.sin(Math.PI * ns) * mo : 0;
    this.hx += (em.h[0] - this.hx) * (1 - Math.exp(-dt / 0.4));
    this.hz += (em.h[1] - this.hz) * (1 - Math.exp(-dt / 0.4));
    const gz = this.gazeHold && now < this.gazeHold.until && this.gazeHold.to === "slide";
    this.yawBias += ((gz ? -0.3 : 0) - this.yawBias) * (1 - Math.exp(-dt / 0.3)); // turns her head a little towards the slide when she points at it
    const sk = (now - this.shakeT) / 800, shake = sk < 1 ? 0.13 * Math.sin(sk * Math.PI * 3) * (1 - sk) * mo : 0;
    const tk = (now - this.tiltT) / 1300, tilt = tk < 1 ? 0.09 * Math.sin(Math.PI * tk) * mo : 0;
    const yaw = 0.07 * a * Math.sin(t / 2600) + 0.035 * mo * Math.sin(t / 1500) + shake + this.yawBias * this.rig.yawSign * mo;
    const e = new THREE.Euler(this.hx + nod + 0.015 * mo * Math.sin(t / 1900) + (cur.jawOpen || 0) * 0.08, yaw, this.hz + tilt + 0.015 * mo * Math.sin(t / 2100));
    B.Head.quaternion.copy(this.base.Head).multiply(new Q().setFromEuler(e));
    if (B.Neck) B.Neck.quaternion.copy(this.base.Neck).multiply(new Q().setFromEuler(new THREE.Euler(this.hx * 0.4 + nod * 0.3, yaw * 0.4, this.hz * 0.3)));
    if (B.Spine2) B.Spine2.quaternion.copy(this.base.Spine2).multiply(new Q().setFromEuler(new THREE.Euler(0.012 * mo * Math.sin(t / 1050) + (emoName === "serious" ? 0.03 : 0), 0.03 * mo * Math.sin(t / 3300), 0.008 * mo * Math.sin(t / 2700))));

    this.renderer.render(this.scene, this.cam);
  }

  // one-handed gestures use either hand, mostly swapping (people do), except pointing at the slide (always the hand on the slide's side)
  _pickHand(def) {
    if (def.hands === "R") return RIGHT;
    this.lastHand = Math.random() < 0.35 ? (this.lastHand || RIGHT) : (this.lastHand === RIGHT ? LEFT : RIGHT);
    return this.lastHand;
  }

  // something planned from the words happens now: a gesture, a quick expression, a head move or where the eyes go
  _act(ev, now) {
    if (ev.kind === "g") {
      const def = POSES[ev.g];
      if (!def || this.reduced) return; // no arm gestures for people who asked for less motion
      const strong = def.beat || /^(c[123]|point_slide)$/.test(ev.g);
      if (!strong && now - this.lastGestureAt < 2200) return; // not a new gesture every second
      this.lastGestureAt = now;
      for (const side of ev.s === "both" ? [LEFT, RIGHT] : [this._pickHand(def)]) this.pose[side] = { def, t: now, until: now + def.dur, beat: !!def.beat };
      this.armsActiveUntil = now + def.dur + 1500; // the gesture, then time to settle back to rest
      if (def.beat) this.nodT = now;
    } else if (ev.kind === "f") this.pulses.push({ f: ev.f, amp: ev.amp, t: now, dur: ev.dur });
    else if (ev.kind === "h") { if (ev.h === "nod") this.nodT = now; else if (ev.h === "shake") this.shakeT = now; else this.tiltT = now; }
    else if (ev.kind === "gaze") this.gazeHold = { to: ev.to, until: now + (ev.to === "slide" ? 1600 : 1000) };
  }

  // ---------- cleanup ----------
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    if (this._ro) this._ro.disconnect();
    try { this.canvas.removeEventListener("webglcontextlost", this._onLost); } catch (e) { /* ignore */ }
    try {
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose();
          m.dispose();
        });
      });
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    } catch (e) { /* ignore */ }
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.model = null; this.morphs = []; this.bones = {};
  }
}

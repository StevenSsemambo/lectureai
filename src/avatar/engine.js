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
  buildTimeline, mouthAt, autoEmotion, planGestures, adaptMsPerUnit, GESTURE_POSES, BASE_MS_PER_UNIT, clamp,
} from "./lipsync.js";

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

const REST = [0.14, -1, 0.05, 0.14, -0.55, 0.8];
const dirs = (side, g) => { g = g || REST; return [new V3(side * g[0], g[1], g[2]), new V3(side * g[3], g[4], g[5])]; };

// Turns `bone` so that the line bone -> child points along `dir` (blended by k).
function aim(bone, child, dir, k) {
  bone.updateWorldMatrix(true, true);
  const bp = new V3().setFromMatrixPosition(bone.matrixWorld);
  const cp = new V3().setFromMatrixPosition(child.matrixWorld);
  const q = new Q().setFromUnitVectors(cp.sub(bp).normalize(), dir.clone().normalize());
  const bq = bone.getWorldQuaternion(new Q());
  const pq = bone.parent.getWorldQuaternion(new Q());
  bone.quaternion.slerp(pq.invert().multiply(q).multiply(bq), k);
}

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
    this.armsActiveUntil = 0;

    // speaking state
    this.speaking = false; this.thinking = false; this.speechEmo = "neutral";
    this.tl = null; this.tlStart = 0; this.t0 = 0; this.rate = 1; this.fixedMs = 0; this.audio = null;
    this.gestures = []; this.gi = 0; this.pending = null;
    this.baseMs = BASE_MS_PER_UNIT;

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
    for (let i = 0; i < 4; i++) this._armsTo(1); // settle into the resting pose
    for (const n of ["Spine1", "Spine2", "Neck", "Head"]) if (bones[n]) this.base[n] = bones[n].quaternion.clone();
    model.updateWorldMatrix(true, true);
    this.headY = new V3().setFromMatrixPosition(bones.Head.matrixWorld).y;
    this._applyFraming();
    this.ready = true;
    this.onStatus("ready");
  }

  _armsTo(k) {
    const B = this.bones;
    for (const [n, s] of [[LEFT, 1], [RIGHT, -1]]) {
      const d = dirs(s);
      aim(B[n + "Arm"], B[n + "ForeArm"], d[0], k);
      aim(B[n + "ForeArm"], B[n + "Hand"], d[1], k);
    }
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
      case "piece": this.pending = { text: d.text, rate: d.rate, at: now }; break;
      case "pieceStart": this.pending = null; this._begin({ text: d.text, rate: d.rate }, now); break;
      case "recording": this.pending = null; this._begin({ text: d.text, rate: d.rate, durationMs: d.durationMs, audio: d.audio }, now); break;
      case "boundary": {
        if (!this.tl || this.fixedMs || this.audio) break; // recordings are timed by the audio itself
        const k = this.tl.u.findIndex((x) => x.ci >= d.charIndex);
        if (k >= 0) this.tlStart = now - this.tl.u[k].t * this._msPerUnit();
        break;
      }
      case "end": this._finish(true, now); break;
      case "stop": this._finish(false, now); break;
      default: break;
    }
  }

  setThinking(v) { this.thinking = !!v; }

  _msPerUnit() { return this.fixedMs || clamp(this.baseMs / (this.rate || 1), 30, 160); }

  _begin({ text, rate, durationMs, audio }, now) {
    if (!text) return;
    this._finish(true, now, true); // learn the speed of the piece that just ended
    this.tl = buildTimeline(text);
    this.gestures = planGestures(text, this.tl); this.gi = 0;
    this.rate = rate || 1;
    this.fixedMs = durationMs > 0 && this.tl.total > 0 ? durationMs / this.tl.total : 0;
    this.audio = audio || null;
    this.tlStart = this.t0 = now;
    this.speechEmo = autoEmotion(text) || "neutral";
    this.speaking = true;
  }

  _finish(natural, now, keepSpeaking = false) {
    if (natural && this.tl && this.t0 && !this.fixedMs && !this.audio) this.baseMs = adaptMsPerUnit(this.baseMs, now - this.t0, this.tl.total, this.rate);
    this.tl = null; this.t0 = 0; this.audio = null; this.fixedMs = 0;
    if (!keepSpeaking) { this.speaking = false; this.pending = null; this.speechEmo = "neutral"; }
  }

  // position on the timeline, in weight units (-1 = not saying anything right now)
  _position(now) {
    if (!this.tl) return -1;
    if (this.audio) {
      const a = this.audio, dur = a.duration;
      if (a.paused || !(dur > 0) || !isFinite(dur)) return -1;
      return (a.currentTime / dur) * this.tl.total;
    }
    return (now - this.tlStart) / this._msPerUnit();
  }

  // ---------- frame ----------
  _frame(now) {
    this._raf = requestAnimationFrame(this._frame);
    if (this.disposed || !this.ready || document.hidden || !this.size.w || !this.size.h) { this.last = now; return; }
    const talking = this.speaking || this.thinking;
    if (!talking && now - this.lastRender < 42) return; // ~24 fps while idle
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now; this.lastRender = now;

    if (this.pending && now - this.pending.at > 1200) { const p = this.pending; this.pending = null; this._begin(p, now); } // the voice never said "started"

    const B = this.bones, T = {};
    const emoName = this.speaking ? this.speechEmo : this.thinking ? "thoughtful" : "neutral";
    const em = EMOTIONS[emoName] || EMOTIONS.neutral;
    const calm = this.speaking ? 0.7 : 1;
    for (const k in em.m) T[k] = em.m[k] * (/smile|press|frown/i.test(k) ? calm : 1);

    // mouth
    if (this.speaking && this.tl) {
      const p = this._position(now);
      while (this.gi < this.gestures.length && p >= this.gestures[this.gi].t) this._fire(this.gestures[this.gi++], now);
      const m = mouthAt(this.tl, p);
      if (m) {
        T[m.viseme] = m.weight; T.jawOpen = m.jaw;
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
    if (now > g.next) {
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
      for (const [n, s] of [[LEFT, 1], [RIGHT, -1]]) {
        const ps = this.pose[n], act = ps && now < ps.until;
        let gp = null;
        if (act) {
          const a = (now - ps.t) / 1000;
          gp = ps.g.slice();
          const bump = ps.beat ? 0.2 * Math.exp(-a * 5) : 0;
          gp[4] += 0.05 * Math.sin(a * 5) + bump; gp[1] -= bump * 0.6;
        } else if (ps) this.pose[n] = null;
        const d = dirs(s, gp), k = 1 - Math.exp(-dt * (act ? 6 : 3));
        aim(B[n + "Arm"], B[n + "ForeArm"], d[0], k);
        aim(B[n + "ForeArm"], B[n + "Hand"], d[1], k);
      }
    }

    // head and body: a calm, living sway; a nod on emphasis
    const mo = this.reduced ? 0.25 : 1;
    const a = (this.speaking ? 1 : 0.4) * mo, t = now, ns = (now - this.nodT) / 400;
    const nod = ns < 1 ? 0.07 * Math.sin(Math.PI * ns) * mo : 0;
    this.hx += (em.h[0] - this.hx) * (1 - Math.exp(-dt / 0.4));
    this.hz += (em.h[1] - this.hz) * (1 - Math.exp(-dt / 0.4));
    const yaw = 0.07 * a * Math.sin(t / 2600) + 0.035 * mo * Math.sin(t / 1500);
    const e = new THREE.Euler(this.hx + nod + 0.015 * mo * Math.sin(t / 1900) + (cur.jawOpen || 0) * 0.08, yaw, this.hz + 0.015 * mo * Math.sin(t / 2100));
    B.Head.quaternion.copy(this.base.Head).multiply(new Q().setFromEuler(e));
    if (B.Neck) B.Neck.quaternion.copy(this.base.Neck).multiply(new Q().setFromEuler(new THREE.Euler(this.hx * 0.4 + nod * 0.3, yaw * 0.4, this.hz * 0.3)));
    if (B.Spine2) B.Spine2.quaternion.copy(this.base.Spine2).multiply(new Q().setFromEuler(new THREE.Euler(0.012 * mo * Math.sin(t / 1050) + (emoName === "serious" ? 0.03 : 0), 0.03 * mo * Math.sin(t / 3300), 0.008 * mo * Math.sin(t / 2700))));

    this.renderer.render(this.scene, this.cam);
  }

  _fire(ev, now) {
    if (this.reduced) return; // no arm gestures for people who asked for less motion
    for (const side of ev.s === "both" ? [LEFT, RIGHT] : [RIGHT]) {
      this.pose[side] = { g: GESTURE_POSES[ev.g], t: now, until: now + 1500, beat: ev.g === "beat" || ev.g === "count" };
    }
    this.armsActiveUntil = now + 1500 + 1500; // gesture, then time to settle back to rest
    if (ev.g === "beat" || ev.g === "ask" || ev.g === "count") this.nodT = now;
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

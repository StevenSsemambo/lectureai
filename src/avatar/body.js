// Body control for the lecturer's face rig: where the arms point, which way the palms face, and how the fingers curl.
// Everything here works on the model's bones only (no DOM, no rendering), so it can be measured in Node (.tests/t_body.mjs).
//
// Poses are written for one side and mirrored: "x" is OUTWARD (away from the body), y up, z towards the student.
//   u = direction of the upper arm, f = direction of the forearm, n = which way the palm faces, hand = finger shape.
import * as THREE from "three";

const { Vector3: V3, Quaternion: Q } = THREE;
export const FINGER_NAMES = ["Index", "Middle", "Ring", "Pinky"];

const EXT = [0.04, 0.06, 0.04], FIST = [1.3, 1.5, 1.0];
// curl (radians) of the three finger joints, for index, middle, ring, pinky
export const SHAPES = {
  relaxed: [[0.18, 0.25, 0.2], [0.22, 0.3, 0.25], [0.28, 0.35, 0.28], [0.34, 0.4, 0.3]],
  open: [[0.05, 0.07, 0.05], [0.05, 0.07, 0.05], [0.06, 0.08, 0.06], [0.08, 0.1, 0.07]],
  point: [EXT, FIST, FIST, FIST],
  c1: [EXT, FIST, FIST, FIST],
  c2: [EXT, EXT, FIST, FIST],
  c3: [EXT, EXT, EXT, FIST],
};

// dur = how long the pose is held (ms). Both-hand poses are used on both sides.
export const POSES = {
  rest: { u: [0.2, -1, 0.05], f: [0.14, -0.55, 0.8], n: [-0.8, -0.4, 0.2], hand: "relaxed", dur: 0 },
  welcome: { u: [0.44, -0.82, 0.37], f: [-0.06, 0.52, 0.85], n: [0, 0.85, 0.4], hand: "open", dur: 1900 },
  open: { u: [0.44, -0.82, 0.37], f: [-0.06, 0.52, 0.85], n: [0, 0.9, 0.3], hand: "open", dur: 1600 },
  offer: { u: [0.26, -0.85, 0.47], f: [0.11, 0.26, 0.96], n: [0, 1, 0.1], hand: "open", dur: 1400 },
  beat: { u: [0.31, -0.81, 0.5], f: [0.08, 0.59, 0.81], n: [-0.8, 0.1, 0.3], hand: "open", dur: 1100, beat: true },
  stop: { u: [0.32, -0.79, 0.52], f: [0, 0.79, 0.61], n: [0, 0.1, 1], hand: "open", dur: 1200, beat: true },
  point_slide: { hands: "R", u: [0.75, -0.45, 0.2], f: [0.95, 0.1, 0.3], n: [0, 1, 0.2], hand: "open", dur: 2000 },
  c1: { u: [0.23, -0.83, 0.5], f: [0.08, 0.86, 0.51], n: [0, 0, 1], hand: "c1", dur: 1900 },
  c2: { u: [0.23, -0.83, 0.5], f: [0.08, 0.86, 0.51], n: [0, 0, 1], hand: "c2", dur: 1900 },
  c3: { u: [0.23, -0.83, 0.5], f: [0.08, 0.86, 0.51], n: [0, 0, 1], hand: "c3", dur: 1900 },
  next: { u: [0.26, -0.85, 0.47], f: [0.11, 0.26, 0.96], n: [-0.3, 0.9, 0.2], hand: "open", dur: 1300 },
  wide: { u: [0.44, -0.82, 0.37], f: [-0.06, 0.52, 0.85], n: [-1, 0, 0], hand: "open", dur: 1700 },
  small: { u: [0.3, -0.8, 0.45], f: [-0.15, 0.3, 0.7], n: [-1, 0, 0], hand: "open", dur: 1500 },
  shrug: { u: [0.44, -0.82, 0.37], f: [-0.06, 0.52, 0.85], n: [0, 1, 0.1], hand: "open", dur: 1600 },
  together: { u: [0.4, -0.85, 0.45], f: [-0.25, 0.15, 0.7], n: [-1, 0, 0], hand: "open", dur: 1700 },
};

// Measure the model once (in its rest pose) so the same code works for any standard humanoid rig:
// which way each palm faces, and which axis curls each finger towards the palm.
export function buildRig(model, bones) {
  model.updateWorldMatrix(true, true);
  const P = (o) => new V3().setFromMatrixPosition(o.matrixWorld);
  const rig = { bones, side: {} };
  for (const side of ["Left", "Right"]) {
    const s = side === "Left" ? 1 : -1;
    const hand = bones[side + "Hand"];
    const g = (n) => model.getObjectByName(side + "Hand" + n);
    const i1 = g("Index1"), m1 = g("Middle1"), k1 = g("Pinky1");
    if (!hand || !i1 || !m1 || !k1) { rig.side[side] = null; continue; }
    const p0 = P(hand);
    const h = P(m1).sub(p0).normalize();
    const n = new V3().crossVectors(P(i1).sub(p0), P(k1).sub(p0)).normalize();
    // rest pose: arms hang with the palms towards the body (A-pose); arms held out: palms down
    const armsDown = bones[side + "Arm"] ? P(bones[side + "Arm"]).y - p0.y > 0.15 : true;
    if (armsDown ? n.x * s > 0 : n.y > 0) n.negate();
    const hq = hand.getWorldQuaternion(new Q()).invert();
    const fingers = FINGER_NAMES.map((name) => {
      const bs = [1, 2, 3].map((j) => g(name + j));
      if (bs.some((b) => !b)) return null;
      const tip = g(name + "4") || bs[2];
      model.updateWorldMatrix(true, true);
      const t0 = P(tip);
      let best = null, bestV = -Infinity;
      for (const ax of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const q0 = bs[0].quaternion.clone();
        bs[0].quaternion.multiply(new Q().setFromAxisAngle(new V3(...ax), 0.4));
        bs[0].updateWorldMatrix(true, true);
        const v = P(tip).sub(t0).dot(n);
        bs[0].quaternion.copy(q0); bs[0].updateWorldMatrix(true, true);
        if (v > bestV) { bestV = v; best = ax; }
      }
      return { bones: bs, axis: new V3(...best), base: bs.map((b) => b.quaternion.clone()) };
    });
    rig.side[side] = { nLocal: n.clone().applyQuaternion(hq), hLocal: h.clone().applyQuaternion(hq), fingers };
  }
  // arm calibration (rest pose): each bone's own long axis, and the elbow's hinge axis (anatomical flexion = about world -x at rest)
  rig.arm = {};
  for (const side of ["Left", "Right"]) {
    const up = bones[side + "Arm"], fo = bones[side + "ForeArm"], ha = bones[side + "Hand"];
    if (!up || !fo || !ha) { rig.arm[side] = null; continue; }
    const au = fo.position.clone().normalize(), af = ha.position.clone().normalize();
    // the rest pose already has a slight bend at the elbow: its plane is the elbow's hinge; b0 = how much it is bent at rest
    const d0 = af.clone().applyQuaternion(fo.quaternion);
    let eu = new V3().crossVectors(au, d0), b0 = Math.atan2(eu.length(), au.dot(d0));
    if (eu.length() < 0.05) { // (almost) straight at rest: use the anatomical flexion axis, a forearm swinging forward
      eu = new V3(-1, 0, 0).applyQuaternion(up.getWorldQuaternion(new Q()).invert());
      eu.sub(au.clone().multiplyScalar(eu.dot(au))); b0 = 0;
    }
    eu.normalize();
    rig.arm[side] = { q0u: up.quaternion.clone(), q0f: fo.quaternion.clone(), q0h: ha.quaternion.clone(), au, af, eu, b0 };
  }

  // which way a positive head turn (about the head bone's own y axis) points: +1 = towards +x (the student's right)
  rig.yawSign = 1;
  const hb = bones.Head;
  if (hb) {
    hb.updateWorldMatrix(true, false);
    const fwd = new V3(0, 0, 1).applyQuaternion(hb.getWorldQuaternion(new Q()).invert());
    const saved = hb.quaternion.clone();
    hb.quaternion.multiply(new Q().setFromEuler(new THREE.Euler(0, 0.3, 0)));
    hb.updateWorldMatrix(true, false);
    rig.yawSign = fwd.clone().applyQuaternion(hb.getWorldQuaternion(new Q())).x >= 0 ? 1 : -1;
    hb.quaternion.copy(saved); hb.updateWorldMatrix(true, false);
  }
  return rig;
}

export function shapeHand(rig, side, shape, k) {
  const sd = rig.side[side];
  if (!sd || !shape) return;
  sd.fingers.forEach((f, fi) => {
    if (!f) return;
    for (let j = 0; j < 3; j++) {
      const q = f.base[j].clone().multiply(new Q().setFromAxisAngle(f.axis, shape[fi][j]));
      f.bones[j].quaternion.slerp(q, k);
    }
  });
}

const basis = (a, b) => new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(a, b, new V3().crossVectors(a, b)));
const MAX_ROLL = 1.8; // the palm can turn about 100 degrees either way, like a real forearm

// Puts one arm into a pose. Every call computes the arm from the pose alone (never from the previous frame's twist), so
// nothing can build up. The elbow only hinges like a real elbow; the palm turn is shared by forearm (60%) and wrist (40%).
// `bump` lifts the forearm a little (the quick stroke of an emphasis beat). k = how far to move this frame (0..1).
export function applyArm(rig, side, pose, k, bump = 0) {
  const A = rig.arm[side], sd = rig.side[side], B = rig.bones, s = side === "Left" ? 1 : -1;
  if (!A) return;
  const up = B[side + "Arm"], fo = B[side + "ForeArm"], ha = B[side + "Hand"];
  const U = new V3(s * pose.u[0], pose.u[1], pose.u[2]).normalize();
  const F = new V3(s * pose.f[0], pose.f[1] + bump, pose.f[2]).normalize();
  // the elbow hinge axis is perpendicular to both arm directions; the upper arm turns about its own length to match it
  let H = new V3().crossVectors(U, F);
  const sinb = H.length(), beta = Math.atan2(sinb, U.dot(F));
  if (sinb < 1e-4) H = new V3(-1, 0, 0).sub(U.clone().multiplyScalar(-U.x)).normalize(); else H.divideScalar(sinb);
  const Qu = basis(U, H).multiply(basis(A.au, A.eu).invert());                       // world rotation of the upper arm
  const uLocal = up.parent.getWorldQuaternion(new Q()).invert().multiply(Qu);
  let fLocal = new Q().setFromAxisAngle(A.eu, beta - A.b0).multiply(A.q0f);          // the elbow: a pure hinge
  let hLocal = A.q0h.clone();
  if (sd && pose.n) {
    const Qf0 = Qu.clone().multiply(fLocal), axis = A.af.clone().applyQuaternion(Qf0);
    const c = sd.nLocal.clone().applyQuaternion(Qf0.clone().multiply(A.q0h)), want = new V3(s * pose.n[0], pose.n[1], pose.n[2]);
    const proj = (v) => v.clone().sub(axis.clone().multiplyScalar(v.dot(axis)));
    const c2 = proj(c), d2 = proj(want);
    if (c2.lengthSq() > 1e-6 && d2.lengthSq() > 1e-6) {
      c2.normalize(); d2.normalize();
      const roll = Math.max(-MAX_ROLL, Math.min(MAX_ROLL, Math.atan2(axis.dot(new V3().crossVectors(c2, d2)), c2.dot(d2))));
      fLocal = fLocal.multiply(new Q().setFromAxisAngle(A.af, roll * 0.6));
      hLocal = A.q0h.clone().multiply(new Q().setFromAxisAngle(sd.hLocal, roll * 0.4));
    }
  }
  up.quaternion.slerp(uLocal, k); fo.quaternion.slerp(fLocal, k); ha.quaternion.slerp(hLocal, k);
  shapeHand(rig, side, SHAPES[pose.hand], k);
}

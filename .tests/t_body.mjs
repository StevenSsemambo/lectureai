// Measures every arm pose on the real avatar model: no hand through the other hand, the body or the head,
// a natural elbow, palms facing where they should. (run: node .tests/t_body.mjs; add --verbose for the numbers)
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import fs from "fs";
import { buildRig, applyArm, POSES, FINGER_NAMES } from "../src/avatar/body.js";
global.window = global; global.self = global; global.createImageBitmap = undefined;
global.document = { createElementNS: () => { const l = {}; return { addEventListener: (e, f) => { l[e] = f; }, removeEventListener() {}, set src(v) { setTimeout(() => l.load && l.load({}), 0); }, width: 1, height: 1 }; } };
const verbose = process.argv.includes("--verbose");
const V3 = THREE.Vector3;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("FAIL:", m)); };

const buf = fs.readFileSync(new URL("../public/avatars/avatar-f1.glb", import.meta.url));
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", res, rej));
const model = gltf.scene;
const bones = {};
for (const n of ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftArm", "LeftForeArm", "RightArm", "RightForeArm", "LeftHand", "RightHand"]) bones[n] = model.getObjectByName(n);
model.updateMatrixWorld(true);

// body and head surface points, taken once in the rest pose (arms hanging, so |x| small = torso)
// (vertices mostly moved by the arm bones are the arms themselves, so they are left out of the torso)
const TORSO_BONES = /^(Hips|Spine|Spine1|Spine2|Neck|Head|LeftUpLeg|RightUpLeg|LeftLeg|RightLeg)$/;
const cloud = (names, keep, onlyBody) => { const out = []; model.traverse((o) => { if (o.isSkinnedMesh && names.includes(o.name)) { const p = o.geometry.attributes.position, v = new V3(), si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight; for (let i = 0; i < p.count; i += 2) { if (onlyBody) { let bi = 0, bw = -1; for (let c = 0; c < 4; c++) { const G = ["getX", "getY", "getZ", "getW"][c], w = sw[G](i); if (w > bw) { bw = w; bi = si[G](i); } } if (!TORSO_BONES.test(o.skeleton.bones[bi].name)) continue; } o.boneTransform(i, v); const w = v.clone().applyMatrix4(o.matrixWorld); if (keep(w)) out.push(w); } } }); return out; };
const headY = new V3().setFromMatrixPosition(bones.Head.matrixWorld).y;
const torso = cloud(["Wolf3D_Body", "Wolf3D_Outfit_Top"], (w) => w.y > 0.7 && w.y < headY, true);
const head = cloud(["Wolf3D_Head"], () => true, false);
ok(torso.length > 150 && head.length > 300, `body and head surface points found (${torso.length}, ${head.length})`);
const dmin = (pts, set) => { let m = 9; for (const a of pts) for (const b of set) { const d = a.distanceTo(b); if (d < m) m = d; } return m; };

const rig = buildRig(model, bones);
ok(rig.side.Left && rig.side.Right && rig.side.Left.fingers.every(Boolean), "both hands and all fingers found");
const P = (o) => new V3().setFromMatrixPosition(o.matrixWorld);
const handPts = (side) => { const pts = [P(bones[side + "Hand"])]; for (const f of FINGER_NAMES) for (let j = 1; j <= 4; j++) pts.push(P(model.getObjectByName(side + "Hand" + f + j))); for (let j = 2; j <= 4; j++) pts.push(P(model.getObjectByName(side + "HandThumb" + j))); return pts; };
const armPts = (side) => { const e = P(bones[side + "ForeArm"]), w = P(bones[side + "Hand"]), s = P(bones[side + "Arm"]); return [e, w.clone().add(e).multiplyScalar(0.5), e.clone().add(s).multiplyScalar(0.5)]; };

const SIDES = { Left: 1, Right: -1 };
const both = (a, b) => { for (let i = 0; i < 4; i++) { applyArm(rig, "Left", a, 1); applyArm(rig, "Right", b, 1); } model.updateMatrixWorld(true); };
const bendOf = (side, pose) => { const s = SIDES[side], u = new V3(s * pose.u[0], pose.u[1], pose.u[2]).normalize(), f = new V3(s * pose.f[0], pose.f[1], pose.f[2]).normalize(); return (Math.acos(Math.max(-1, Math.min(1, u.dot(f)))) * 180) / Math.PI; };
const report = [];
for (const [name, pose] of Object.entries(POSES)) {
  const twoHanded = ["welcome", "open", "wide", "small", "shrug", "together"].includes(name) || name === "rest";
  both(twoHanded ? pose : POSES.rest, pose); // single-hand poses are done with the right hand
  const L = handPts("Left"), R = handPts("Right");
  const hh = dmin(L, R), bend = bendOf("Left", pose);
  const minLx = Math.min(...L.map((p) => p.x)), maxRx = Math.max(...R.map((p) => p.x));
  const th = dmin([...L, ...R], torso), ta = dmin([...armPts("Left"), ...armPts("Right")], torso), hd = dmin([...L, ...R], head);
  // palm direction actually reached
  const sd = rig.side.Right, hq = bones.RightHand.getWorldQuaternion(new THREE.Quaternion());
  const got = sd.nLocal.clone().applyQuaternion(hq), want = new V3(-pose.n[0], pose.n[1], pose.n[2]).normalize();
  const hl = sd.hLocal.clone().applyQuaternion(hq);
  const pr = (v) => v.clone().sub(hl.clone().multiplyScalar(v.dot(hl))).normalize();
  const palm = pr(got).dot(pr(want));
  report.push({ name, hh: +hh.toFixed(3), cross: +Math.min(minLx, -maxRx).toFixed(3), torsoHand: +th.toFixed(3), torsoArm: +ta.toFixed(3), head: +hd.toFixed(3), bend: Math.round(bend), palm: +palm.toFixed(2) });
  const wr = [P(bones.RightHand)].concat(twoHanded ? [P(bones.LeftHand)] : []), used = twoHanded ? [...L, ...R] : R;
  if (name !== "rest" && name !== "point_slide") { // gestures must stay inside what the student sees (the side panel shows about 24 cm to each side)
    ok(Math.max(...wr.map((w) => Math.abs(w.x))) <= 0.26 && Math.max(...used.map((p) => Math.abs(p.x))) <= 0.3, `${name}: stays inside the picture`);
    ok(Math.min(...wr.map((w) => w.y)) >= headY - 0.36, `${name}: hands high enough to be seen`);
    ok(hd >= 0.08, `${name}: hands do not cover the face (${hd.toFixed(3)})`);
  }
  if (name !== "rest" || true) {
    const tog = name === "together" || name === "small";
    ok(hh >= (tog ? 0.045 : 0.07), `${name}: hands clear of each other (${hh.toFixed(3)})`);
    ok(minLx >= (tog ? 0.015 : 0.03) && -maxRx >= (tog ? 0.015 : 0.03), `${name}: neither hand crosses the middle (${minLx.toFixed(3)}, ${(-maxRx).toFixed(3)})`);
    ok(th >= 0.035, `${name}: hands clear of the body (${th.toFixed(3)})`);
    ok(ta >= 0.035, `${name}: arms clear of the body (${ta.toFixed(3)})`);
    ok(hd >= 0.06, `${name}: hands clear of the head (${hd.toFixed(3)})`);
    ok(bend >= 0 && bend <= 150, `${name}: natural elbow (${Math.round(bend)} degrees)`);
    ok(palm >= 0.8, `${name}: palm faces where intended (${palm.toFixed(2)})`);
  }
}
// the way INTO each pose and back out must stay clear too, not only the finished pose
for (const [name, pose] of Object.entries(POSES)) {
  if (name === "rest") continue;
  const two = ["welcome", "open", "wide", "small", "shrug", "together"].includes(name);
  const a = two ? pose : POSES.rest;
  let minHH = 9, minTH = 9, minHD = 9;
  for (const [from, to] of [[POSES.rest, pose], [pose, POSES.rest]]) {
    both(two ? from : POSES.rest, from); // start exactly at the first pose
    for (let i = 0; i < 40; i++) {
      applyArm(rig, "Left", two ? to : POSES.rest, 0.12); applyArm(rig, "Right", to, 0.12); model.updateMatrixWorld(true);
      const L = handPts("Left"), R = handPts("Right");
      minHH = Math.min(minHH, dmin(L, R)); minTH = Math.min(minTH, dmin([...L, ...R], torso)); minHD = Math.min(minHD, dmin([...L, ...R], head));
    }
  }
  ok(minHH >= 0.04, `${name}: hands never touch each other on the way (${minHH.toFixed(3)})`);
  ok(minTH >= 0.03, `${name}: hands never go into the body on the way (${minTH.toFixed(3)})`);
  ok(minHD >= 0.05, `${name}: hands never go into the face on the way (${minHD.toFixed(3)})`);
}
// turning towards the slide: the engine multiplies by this sign, so it must be exactly +1 or -1 and really match the head
ok(rig.yawSign === 1 || rig.yawSign === -1, "head turn direction measured");
{ const hb = bones.Head, f0 = new V3(0, 0, 1), sv = hb.quaternion.clone();
  hb.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.3 * rig.yawSign, 0))); hb.updateWorldMatrix(true, false);
  const inv = new THREE.Quaternion(); // forward of the head in head space (measured at rest), now in the world
  hb.quaternion.copy(sv); hb.updateWorldMatrix(true, false);
  const restQ = hb.getWorldQuaternion(new THREE.Quaternion()), fwdLocal = f0.clone().applyQuaternion(restQ.clone().invert());
  hb.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.3 * rig.yawSign, 0))); hb.updateWorldMatrix(true, false);
  const fwd = fwdLocal.applyQuaternion(hb.getWorldQuaternion(inv));
  ok(fwd.x > 0.2, `a positive turn (times the sign) turns her head towards the student's right (${fwd.x.toFixed(2)})`);
  hb.quaternion.copy(sv); hb.updateWorldMatrix(true, false); }
if (verbose) console.table(report);
console.log(`body: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

# Lecturer's face (camera icon)

When the student turns the camera icon **on**, a 3D lecturer appears and lip-syncs to whatever the lecturer says. It never
covers the slide: on screens ≥1000 px wide (≥1280 px with the chat open) it has its own 184 px column between the slide and
the chat; on phones/tablets it is a small round tile at the end of the Slides / Code-editor row; on landscape phones it is hidden.

## How it plugs in (3 touch points in existing code)
1. `App.jsx` → `speakInterruptible` / `stopSpeaking` call `avatarBus.*` (one-line, no-op when nothing listens).
2. `voice/speech.js` → three optional callbacks (`onPieceStart`, `onBoundary`, extra arg on `onPiece`). Behaviour unchanged.
3. `App.jsx` → two empty slot `<div>`s + `<AvatarGate/>`, rendered only while `camOn`.

## Files
- `avatarBus.js`   one-way message line voice → face. Safe with no listeners; a failing listener can't break speech.
- `lipsync.js`     pure functions: text → mouth-shape timeline, emotions, gestures. Unit-tested (`.tests/t_avatar.mjs`).
- `engine.js`      three.js (r128, pinned) rig/morph/render loop. Idle ≈24 fps; stops when tab hidden or tile hidden; `dispose()` frees GPU.
- `LecturerAvatar.jsx` the tile (one DOM node moved between slots; follows whichever slot CSS shows).
- `AvatarGate.jsx` lazy-loads the above (≈147 kB gz chunk) and swallows any error → the face just steps aside.
- `dock.css`       layout. Scoped to `.avatar-*` / `.has-avatar`: matches nothing when the camera is off.
- `public/avatars/avatar-f1.glb` the model (2.3 MB). Fetched only when the camera is on; cached for offline after first use; NOT precached.

## Sync
- Browser voice: the mouth starts only on evidence of sound. The first piece of a line waits for the voice's first word event
  (up to 0.6 s, 0.8 s for voices known to send them); voices known to send none get a fixed 450 ms lag; later pieces start at once.
  A queued piece with no sign of sound starts the mouth only after 3.5 s. Word events re-sync and lock to each word (released after
  0.9 s of silence); if the guess runs out the mouth keeps talking up to 4 s; speed and "sends word events" are learned per voice.
  The student's "Mouth timing" slider (Voice panel) shifts everything; `?lipdebug` shows the live numbers.
- Loading: the face does not start downloading until the voice has actually started (or 6 s), and the model is fetched at low priority,
  so it never competes with the lecture's own audio. The face never changes how the browser voice is driven (piece sizes etc. are the app's own).
- ElevenLabs: the face reads the `<audio>` element's own clock, so pause / stall / resume stay in sync.

## Switching it off / removing it
Camera icon off = nothing loads. To remove entirely: revert the commit (or delete `src/avatar`, `public/avatars`, the 3 touch points above, and `three` from package.json).

## Licence — check before shipping commercially
The model was exported from Ready Player Me (shut down 31 Jan 2026). Confirm its licence terms allow commercial redistribution,
or replace the GLB with one you own (any humanoid GLB with ARKit/Oculus-viseme blendshapes works).

## Natural motion: actions that follow the words (body.js, lipsync.js `planActions`)
- `planActions` reads each spoken piece and plans actions at the exact word that triggers them: a gesture (greeting, pointing at the
  slide, counting 1-2-3 with fingers, emphasis beat, "stop", shrug, hands wide/small, hands together), a quick facial expression
  (smile, furrow, brows up, concern, thinking), a head move (nod, shake, tilt) and where the eyes go (slide, up, student).
  Add words in `ACTION_RULES`. At most two gestures per piece, and none within ~2 s of the last (except beats, counting, pointing).
- `body.js` controls the arms, which way each palm faces and how the fingers curl (relaxed, open, pointing, 1/2/3 fingers). It
  measures the model's hands once (`buildRig`), so no hand-made bone numbers.
- Every pose is MEASURED on the real model: `node .tests/t_body.mjs --verbose` checks that hands never pass through each other,
  the body or the face (also on the way in and out), stay inside the side panel's picture, and that palms face where intended.
  Add or change a pose in `POSES`, run it, and it says at once if a hand would go through something.
- Pointing at the slide assumes the slide is on the student's left of the lecturer (the desktop rail layout).
- Arms are solved like a real arm (body.js `applyArm`): the upper arm and forearm point exactly where the pose says, the elbow only
  hinges, and the palm turn is shared 60/40 by forearm and wrist (max ~100 degrees). Each frame is computed from the pose alone, never
  from the previous frame's twist, so nothing can build up however long she talks. `t_body.mjs` checks this with 300 random gestures.
- One-handed gestures swap between her right and left hand; pointing at the slide always uses the hand on the slide's side.

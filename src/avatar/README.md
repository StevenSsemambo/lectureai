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
- ElevenLabs: the face reads the `<audio>` element's own clock, so pause / stall / resume stay in sync.

## Switching it off / removing it
Camera icon off = nothing loads. To remove entirely: revert the commit (or delete `src/avatar`, `public/avatars`, the 3 touch points above, and `three` from package.json).

## Licence — check before shipping commercially
The model was exported from Ready Player Me (shut down 31 Jan 2026). Confirm its licence terms allow commercial redistribution,
or replace the GLB with one you own (any humanoid GLB with ARKit/Oculus-viseme blendshapes works).

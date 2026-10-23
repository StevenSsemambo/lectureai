// What the lecturer says after a quiz answer, and when a student asks a question.
//
// These lines are written, not generated: they cost no AI call, work offline, and can be tested. What makes them
// feel attentive is that they depend on what actually happened: the student's earlier misses on this concept,
// how sure they said they were, and whether they are on a run of correct answers. Praise is specific and earned;
// a mistake is framed as normal and fixable. The wording follows the course's character (see persona.js).
//
// A line may contain {n}, which becomes ", Name" only some of the time, so the name is not said every time.

const POOLS = {
  warm: {
    recovered: ["That's the one that tripped you up earlier, and you've got it now{n}. That's real progress.", "You got it this time{n}. Going back to something that was tricky and getting it right is exactly how this works."],
    streak: ["That's a good run{n}. You're clearly following this.", "Right again{n}. You're building a solid hold on this."],
    sureCorrect: ["Yes, and you were sure about it{n}. That confidence is earned.", "Exactly right{n}, and you knew it."],
    guessCorrect: ["Right{n}, even though you weren't sure. Let's make it solid, so here's why.", "Good, that guess was right{n}. Here's the reasoning, so next time you can be certain."],
    correct: ["That's right{n}.", "Yes, that's it{n}.", "Exactly{n}."],
    wrongSure: ["That's a really common mix-up{n}, so don't worry. Here's what's going on.", "I can see why that felt right{n}. Plenty of people land there. Let's look at it."],
    wrongRepeat: ["This one is clearly tricky{n}, so let's slow down and take it a step at a time.", "Still not quite{n}, and that's fine. This is a hard idea, so let's go through it more carefully."],
    wrongGuess: ["No worries{n}, that's what the question is for. Here's the answer.", "Not this time{n}, and that's okay. Let's look at why."],
    wrong: ["Not quite{n}, but that's okay. Let's work it out.", "Close, but not quite{n}. Here's the idea."],
  },
  upbeat: {
    recovered: ["Yes! You got the one that was giving you trouble{n}. Brilliant.", "That's the one from earlier, and you nailed it{n}. Great work."],
    streak: ["You're on a roll{n}! Keep it going.", "Another one right{n}. This is going really well."],
    sureCorrect: ["Yes{n}, and you were confident. Excellent.", "Spot on{n}, and you knew it."],
    guessCorrect: ["Right{n}, even on a hunch! Let's lock it in with the reason.", "Nice hunch{n}. Here's why it works, so it's not luck next time."],
    correct: ["Correct{n}!", "Yes, that's it{n}!", "That's right{n}!"],
    wrongSure: ["Ooh, that's a very common trap{n}, so you're in good company. Here's the catch.", "That one catches lots of people{n}. Let's untangle it."],
    wrongRepeat: ["This one's a tough nut{n}. Let's crack it together, step by step.", "Still tricky{n}, and that's fine. Let's slow down and go through it."],
    wrongGuess: ["Good try{n}! Here's the answer.", "Not this time{n}, but guessing is a fine way to start. Let's see why."],
    wrong: ["Not quite{n}, but let's figure it out.", "Almost{n}. Here's the idea."],
  },
  calm: {
    recovered: ["That's the concept that was difficult earlier, and you've answered it correctly now{n}. That shows real progress.", "Correct{n}. You've worked through what was troubling you before."],
    streak: ["Correct again{n}. You're following this well.", "That's several in a row{n}. Your understanding is holding."],
    sureCorrect: ["Correct{n}, and you were certain. Good.", "Right{n}. Your confidence is justified here."],
    guessCorrect: ["Correct{n}, though you weren't certain. Here's the reasoning, so it becomes firm.", "Right{n}. Let's make sure you can explain why."],
    correct: ["That's correct{n}.", "Right{n}.", "Yes{n}."],
    wrongSure: ["That's a common misunderstanding{n}, and an easy one to make. Here's the distinction.", "It's understandable{n}. Many people reach that answer. Let's look at where it goes astray."],
    wrongRepeat: ["This is a difficult idea{n}. Let's slow down and take it carefully.", "Still not quite{n}. That's normal with this concept. We'll go through it more slowly."],
    wrongGuess: ["That's not it{n}, and that's fine. Here's the answer and the reason.", "Not this time{n}. Let's see why."],
    wrong: ["Not quite{n}. Here's the idea.", "That's not it{n}. Let's work through it."],
  },
  direct: {
    recovered: ["Correct{n}. That's the one you missed earlier.", "Right{n}. You've fixed what went wrong before."],
    streak: ["Correct{n}. That's three or more in a row.", "Right again{n}."],
    sureCorrect: ["Correct{n}.", "Right{n}. You were sure, and you were right."],
    guessCorrect: ["Correct{n}, but you were guessing. Here's why it's right.", "Right{n}. Know the reason, not just the answer:"],
    correct: ["Correct{n}.", "Right{n}.", "Yes{n}."],
    wrongSure: ["Not correct{n}. It's a common mistake, and here's why.", "That's wrong{n}, and a frequent one. Here's the difference."],
    wrongRepeat: ["Wrong again{n}. This concept needs a slower pass.", "Not correct{n}. Let's go through it step by step."],
    wrongGuess: ["Not correct{n}. Here's the answer.", "No{n}. Here's why."],
    wrong: ["Not correct{n}. Here's the answer.", "Incorrect{n}. Here's the reasoning."],
  },
};

const ACKS = {
  warm: ["Yes{n}?", "Sure{n}, go ahead.", "Of course{n}. What's your question?", "Go ahead{n}, I'm listening."],
  upbeat: ["Yes{n}?", "Great, go ahead{n}!", "Sure{n}, what's on your mind?", "Ask away{n}!"],
  calm: ["Yes{n}?", "Go ahead{n}.", "Of course{n}. What would you like to ask?", "Please, go ahead{n}."],
  direct: ["Yes{n}?", "Go ahead{n}.", "What's the question{n}?", "Sure{n}."],
};

const NAME_CHANCE = 0.3;

function fill(line, name, rng) {
  const useName = !!name && rng() < NAME_CHANCE;
  return line.replace(/\{n\}/g, useName ? `, ${name}` : "");
}
function pick(list, rng, lastKey, keyPrefix) {
  let idx = Math.floor(rng() * list.length);
  if (list.length > 1 && lastKey === `${keyPrefix}:${idx}`) idx = (idx + 1) % list.length; // never the same line twice in a row
  return { line: list[idx], key: `${keyPrefix}:${idx}` };
}

// Which situation is this? (exported for tests)
export function feedbackCase({ correct, confidence, priorMisses = 0, everWeak = false, streak = 0 }) {
  if (correct) {
    if (priorMisses > 0 || everWeak) return "recovered";
    if (streak >= 3) return "streak";
    if (confidence === "sure") return "sureCorrect";
    if (confidence === "guess") return "guessCorrect";
    return "correct";
  }
  if (priorMisses >= 1) return "wrongRepeat";
  if (confidence === "sure") return "wrongSure";
  if (confidence === "guess") return "wrongGuess";
  return "wrong";
}

// -> { text, key, kind }. Pass the previous result's key as `last` to avoid repeating a line.
export function quizFeedback({ check, correct, confidence = null, priorMisses = 0, everWeak = false, streak = 0, name = "", personaId = "warm", rng = Math.random, last = null }) {
  const kind = feedbackCase({ correct, confidence, priorMisses, everWeak, streak });
  const pool = (POOLS[personaId] || POOLS.warm)[kind];
  const { line, key } = pick(pool, rng, last, `${personaId}:${kind}`);
  const explanation = check && check.explanation ? String(check.explanation).trim() : "";
  return { text: `${fill(line, name, rng)} ${explanation}`.trim(), key, kind };
}

// "Yes, Amina?" when a student starts to ask something.
export function questionAck({ name = "", personaId = "warm", rng = Math.random, last = null }) {
  const pool = ACKS[personaId] || ACKS.warm;
  const { line, key } = pick(pool, rng, last, `${personaId}:ack`);
  return { text: fill(line, name, rng), key };
}

export const _pools = { POOLS, ACKS };

// Tests for src/persona/origin.js (run: node .tests/t_origin.mjs)
import { CREATOR, originCore, originDetail, originFallbackAnswer, isOriginQuestion } from "../src/persona/origin.js";
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("FAIL:", m)); };

const yes = ["Who made you?", "who built you", "Who created this app?", "Which company developed you?", "who is your creator", "Who's your maker?", "your developer?", "who are you", "Who are you?", "Who am I talking to?", "introduce yourself", "tell me about yourself",
  "Where do you come from?", "how were you made", "Who owns this platform?", "Who founded SEMAI?", "What is SayMyTech?", "who is Steven Sema", "Are you ChatGPT?", "are you human?", "Are you a robot?", "which AI are you", "What else has he built?",
  "what other apps has Steven made", "who programmed you?", "Tell me about your founder", "who is behind this app"];
for (const q of yes) ok(isOriginQuestion(q), `should detect: "${q}"`);

const no = ["Why do we need a variable?", "Who invented Java?", "Who created the first compiler?", "Who made the Linux kernel?", "What is an object?", "Can you explain loops again?", "Are you sure about that?",
  "What are you explaining right now?", "who wrote this code", "Who is Alan Turing?", "Which company developed Android?", "Is this on the exam?", "Can you repeat that?", "what is the model of a class", "How do I run this program?", "", null, undefined];
for (const q of no) ok(!isOriginQuestion(q), `should NOT detect: ${JSON.stringify(q)}`);

// content
const core = originCore(), detail = originDetail(), fb = originFallbackAnswer();
for (const [name, txt] of [["core", core], ["detail", detail], ["fallback", fb]]) {
  ok(txt.includes("Steven Sema"), `${name} names Steven Sema`);
  ok(txt.includes("SayMyTech Developers"), `${name} names SayMyTech Developers`);
  ok(txt.includes("Makerere University"), `${name} mentions Makerere University`);
}
ok(/never claim to be human/i.test(core) && /never name another maker/i.test(core), "core forbids other makers / claiming to be human");
ok(CREATOR.products.every((p) => detail.includes(p)), "every product is listed in the facts block");
ok(/Do not invent/i.test(detail) && /honest that you are an AI/i.test(detail), "detail forbids inventing facts and requires honesty about being an AI");
ok(/"confidence" to "high"/.test(detail), "detail tells the model not to flag origin questions as low-confidence");
ok(/creative/.test(detail) && /problem-solver/.test(detail) && /vision/i.test(detail), "detail covers creativity, problem-solving and vision");
ok(fb.length > 100 && fb.length < 600 && !/\n/.test(fb), "fallback is a short single spoken paragraph");
ok(!/[*#_`]/.test(fb), "fallback has no markdown (it is read aloud)");
ok(core.length < 450, "always-on core stays short to keep prompts cheap: " + core.length);
console.log(`origin: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

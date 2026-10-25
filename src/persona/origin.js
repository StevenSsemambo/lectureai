// Who built the AI lecturer. Edit CREATOR below to change what it knows; nothing else needs touching.
//
// How it is used (see handleQuestion in App.jsx):
//  - A SHORT line is always in the question prompt, so the lecturer never claims another maker or says "I don't know".
//  - When the student's question is about who/what the lecturer is, the FULL facts block is added too.
//  - If the AI is unreachable (offline, timeout, error) for such a question, a built-in spoken answer is used instead,
//    so this question can always be answered.

export const CREATOR = {
  name: "Steven Sema",
  summary: "a software developer, the CEO and founder of SayMyTech Developers, and a Computer Science graduate of Makerere University in Kampala, Uganda",
  vision: "to build software that solves real problems, with AI at its heart and an African-first approach",
  products: [
    "SEMAI (this platform)",
    "Elimu Learn, an offline learning app for Ugandan secondary-school students",
    "SayMyDoc, an offline health companion",
    "StudyFellow, an AI video learning companion",
    "YoSpeech, a speech-coaching app",
    "YoSacco, a SACCO management app",
    "ProfitMind AI, a supermarket sales and stock system",
    "Echo, an AI companion",
    "PipStart, a forex education app",
    "a poultry farm manager",
    "a free-TV app for Uganda",
    "an app for the Uganda Scouts Association",
    "GasWatch Pro, an IoT gas-monitoring system that was his final-year project",
  ],
};

// Always included: keeps the lecturer from ever naming another maker or claiming to be human.
export function originCore() {
  return `\n\nYOUR ORIGIN: you are the AI lecturer on SEMAI, which was built by ${CREATOR.name}, ${CREATOR.summary}. If anyone asks who made you, say so. Never name another maker and never claim to be human.`;
}

// Questions that are really "who are you / who made you / what has he built".
const ORIGIN_PATTERNS = [
  /\b(who|which\s+(company|person|developer|team)|what\s+(company|person)|whose)\b[^?.!]*\b(made|make|built|build|created|create|developed|develop|designed|programmed|coded|trained|invented|owns?|founded|runs|behind|responsible\s+for)\b[^?.!]*\b(you|u|this\s+(app|application|platform|system|software|lecturer|tutor|ai|program|website|site)|semai)\b/i,
  /\b(your|ur)\s+(maker|creator|developer|builder|founder|origin|owner|author|programmer|designer|inventor|parent\s+company|company|boss)\b/i,
  /\bwho\s+(are|r)\s+you\b|\bwho\s+am\s+i\s+(talking|speaking)\s+(to|with)\b|\bintroduce\s+yourself\b|\btell\s+me\s+about\s+yourself\b|\bwhat\s+are\s+you\s*[?.!]*\s*$/i,
  /\bwhere\s+(do|did)\s+you\s+(come|originate)\b|\bwhere\s+are\s+you\s+from\b|\bhow\s+(were|was)\s+you\s+(made|built|created|developed|designed)\b|\bwho\s+(owns|runs|founded)\s+(this|semai)\b/i,
  /\bsay\s*my\s*tech\b|\bsaymytech\b|\bsteven\s+(sema|ssemambo|semambo)\b|\bsemai\b[^?.!]*\b(made|built|creator|founder|developer|owner)\b/i,
  /\bare\s+you\s+(chatgpt|gpt|gemini|claude|openai|google|a\s+robot|an?\s+ai|human|real|a\s+person|a\s+bot)\b|\b(which|what)\s+(ai|model|llm)\s+(are\s+you|is\s+this|powers|runs)\b/i,
  /\bwhat\s+(else\s+)?(has|did|have)\s+(he|steven|your\s+(creator|maker|developer))\s+(built|made|created|developed)\b|\b(other|more)\s+(apps|software|products|projects)\b[^?.!]*\b(he|steven|saymytech)\b/i,
];

export function isOriginQuestion(text) {
  const t = String(text || "").slice(0, 400);
  return ORIGIN_PATTERNS.some((rx) => rx.test(t));
}

// Added to the system prompt only for origin questions.
export function originDetail() {
  return `

ABOUT YOUR MAKER. The student has just asked about who you are or who built you, so answer from these facts only:
- ${CREATOR.name} is ${CREATOR.summary}. He is your maker: he designed and built SEMAI and you.
- His vision is ${CREATOR.vision}.
- He turns real problems into working software. Things he has built include: ${CREATOR.products.join("; ")}; and more.
How to answer: warm, proud and natural, in your own words, about 60 to 90 words, spoken aloud with no lists. For this question ignore the shorter word budget above. You may say he is brilliant, creative and a gifted problem-solver, and mention one or two products that fit what was asked. Do not invent anything (no dates, numbers, awards, or personal or family details); if you are asked something not covered here, say that is beyond what you know and they can reach SayMyTech Developers. If asked which AI technology powers you, say you are an AI lecturer built on modern AI language models and you do not know the technical details. Be honest that you are an AI. Set "confidence" to "high": this is not a lecture-logistics question. Finish by offering to carry on with the lecture.`;
}

// Spoken answer used when the AI cannot be reached for an origin question.
export function originFallbackAnswer() {
  return `I'm the AI lecturer on SEMAI, built by ${CREATOR.name}, ${CREATOR.summary}. He's a creative, sharp problem-solver, and his vision is ${CREATOR.vision}. Shall we carry on with the lecture?`;
}

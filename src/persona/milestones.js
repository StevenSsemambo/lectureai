// Moments worth marking, built only from the student's real record. Nothing is celebrated that did not happen:
// a concept becomes solid for the first time, or one that used to be hard starts to come together.
// before/after are mastery entries ({level, n, ...}) for the same concept, `before` from the record without
// the answer just given.

export const MAX_MILESTONES_PER_LECTURE = 2;

export function milestoneFor({ before, after, correct }) {
  if (!correct || !after) return null;
  const was = before ? before.level : "none";
  // "solid" is only called solid from the third answer on, so look at whether it already was by then
  const wasSolid = !!before && before.level === "strong" && before.n >= 3;
  if (after.level === "strong" && after.n >= 3 && !wasSolid) return { kind: "firstStrong" };
  if (before && was === "weak" && before.n >= 2 && (after.level === "developing" || after.level === "strong")) return { kind: "bounceBack" };
  return null;
}

const LINES = {
  warm: {
    firstStrong: "Something worth noticing: you've got {c} down solidly now.",
    bounceBack: "{c} was a hard one for you earlier, and it's coming together now. That's real progress.",
  },
  upbeat: {
    firstStrong: "Look at that! {c} is solid for you now.",
    bounceBack: "{c} gave you trouble before, and you just turned it around. Great stuff!",
  },
  calm: {
    firstStrong: "You now have {c} on firm ground.",
    bounceBack: "{c} was difficult earlier, and it is steadier now. That took persistence.",
  },
  direct: {
    firstStrong: "{c}: solid now.",
    bounceBack: "{c} was weak before. It's improving.",
  },
};

export function milestoneLine(kind, concept, personaId = "warm") {
  const pool = LINES[personaId] || LINES.warm;
  const t = pool[kind];
  return t ? t.replace("{c}", concept) : null;
}
export const _lines = LINES;

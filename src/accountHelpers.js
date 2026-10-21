// Username-only accounts: pure helpers shared by the sign-up, sign-in and password-reset screens.

// Accounts made without a real email use a placeholder login email on a reserved domain that can
// never receive mail. People should see their username, never that placeholder.
const PLACEHOLDER_DOMAIN_RE = /@(?:[a-z0-9-]+\.)*semai\.(?:invalid|test)$/i;

export function isPlaceholderEmail(email) {
  return PLACEHOLDER_DOMAIN_RE.test(String(email || ""));
}

// What to show for "who is signed in": the username for placeholder accounts, the email otherwise.
export function accountLabel(email) {
  const e = String(email || "");
  return isPlaceholderEmail(e) ? e.split("@")[0] : e;
}

// The sign-in box accepts either a username or (for older accounts) an email.
export function looksLikeEmail(v) {
  return String(v || "").includes("@");
}

// Recovery codes are shown as XXXXX-XXXXX-XXXXX-XXXXX; accept any spacing, dashes and case.
export function normalizeRecoveryCode(v) {
  return String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function recoveryCodeLooksValid(v) {
  return normalizeRecoveryCode(v).length === 20;
}

export function passwordError(p) {
  const s = String(p || "");
  if (s.length < 8) return "Use at least 8 characters.";
  if (/^\s+$/.test(s)) return "Choose a password with real characters.";
  return "";
}

// A text file the person can save with their recovery code.
export function recoveryCodeFile(username, code) {
  return [
    "SEMAI account recovery code",
    "",
    `Username: ${username}`,
    `Recovery code: ${code}`,
    "",
    "Keep this somewhere safe. If you forget your password, choose \"Forgot password?\" on the sign-in screen",
    "and enter your username and this code. Each code works once; you get a new one after using it.",
    "Anyone with this code can reset your password, so don't share it.",
  ].join("\n");
}

// Turns server/network errors from the account service into something a person can act on.
export function friendlyAccountError(message, status) {
  const m = String(message || "");
  if (status === 429 || /too many/i.test(m)) return m || "Too many attempts. Try again later.";
  if (/failed to fetch|networkerror|load failed/i.test(m)) return "Couldn't reach the server. Check your connection and try again.";
  return m || "Something went wrong. Try again.";
}

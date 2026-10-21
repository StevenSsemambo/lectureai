// Keeps a lecturer's sign-in alive for as long as the tab is open.
//
// Supabase access tokens (JWTs) last about an hour. The app used to refresh them only once, when the
// page loaded, so a lecturer who stayed on the page for more than an hour got "JWT expired" (401) on
// every save, and saves made while signed out were rejected by row-level security (403). This manager
// hands out a token that is guaranteed fresh, refreshes at most once at a time (refresh tokens rotate,
// so two simultaneous refreshes would break each other), and retries a call once if the server still
// says the token is expired.

export function jwtExpiryMs(token) {
  try {
    const part = String(token || "").split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("utf8");
    const exp = JSON.parse(json).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch (e) {
    return null;
  }
}

export function isExpiredTokenError(e) {
  const msg = String((e && e.message) || e || "");
  return (e && e.status === 401) || /\(401\)/.test(msg) || /JWT expired|PGRST30[0-9]/i.test(msg);
}

export class SessionExpiredError extends Error {
  constructor(message = "Your sign-in expired. Please sign in again.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

// refresh(refreshToken) -> Promise<session>. onChange(session|null) is told about every new session
// (so the app can store it) and gets null when the refresh token was rejected (signed out for good).
export function createSessionManager({ refresh, onChange = () => {}, now = () => Date.now(), skewMs = 60000 }) {
  let current = null;
  let inflight = null;

  const doRefresh = () => {
    if (inflight) return inflight;
    const rt = current && current.refreshToken;
    if (!rt) return Promise.reject(new SessionExpiredError());
    inflight = Promise.resolve()
      .then(() => refresh(rt))
      .then((fresh) => {
        current = fresh;
        onChange(fresh);
        return fresh;
      })
      .catch((e) => {
        const msg = String((e && e.message) || "");
        // Network trouble is not the same as a rejected refresh token: keep the session in that case.
        if (/failed to fetch|network|load failed/i.test(msg)) throw e;
        current = null;
        onChange(null);
        throw new SessionExpiredError();
      })
      .finally(() => { inflight = null; });
    return inflight;
  };

  return {
    set(session) { current = session || null; },
    get() { return current; },
    async token() {
      if (!current) throw new SessionExpiredError("Please sign in as a lecturer first.");
      const exp = jwtExpiryMs(current.accessToken);
      if (exp !== null && exp - now() < skewMs) await doRefresh();
      return current.accessToken;
    },
    // Run fn(accessToken); if the server says the token expired anyway, refresh once and retry.
    async run(fn) {
      let tok = await this.token();
      try {
        return await fn(tok);
      } catch (e) {
        if (!isExpiredTokenError(e)) throw e;
        await doRefresh();
        tok = current.accessToken;
        return fn(tok);
      }
    },
  };
}

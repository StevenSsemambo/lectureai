// Network calls that can stall (a weak mobile connection, a hung server) must never freeze the app.
// withTimeout gives every call a deadline: `run(signal)` does the fetch AND reads the body, and if it has not
// finished in `ms` the request is aborted and a clear, catchable error is thrown (err.timeout === true).

export async function withTimeout(run, ms, makeController = () => (typeof AbortController !== "undefined" ? new AbortController() : null)) {
  const controller = makeController();
  if (!controller) return run(undefined); // very old browser: no way to abort, behave as before
  let timer;
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("The request took too long. Check your connection and try again.");
      err.timeout = true;
      err.status = 0;
      reject(err); // first, so the caller always sees the timeout error rather than the abort it triggers
      controller.abort();
    }, ms);
  });
  try {
    // Race, so even a fetch that ignores the abort signal cannot hold the caller past the deadline.
    return await Promise.race([run(controller.signal), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

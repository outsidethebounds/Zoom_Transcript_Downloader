const RETRYABLE = /could not verify .* (?:controls|filters)|timed out waiting for the authenticated zoom recording metadata scan|sign in to .* then rescan|sign-in is required|waiting for zoom sign-in|receiving end does not exist|could not establish connection|message port closed|no tab with id|http 401|unauthorized|authentication required|unauthenticated/i;

/** Retry only source-page auth/readiness races; terminal scan errors stay terminal. */
export async function scanWithReadiness({ scan, isCancelled = () => false, pause, onWaiting = () => {}, timeoutMs = 120000, retryDelayMs = 1500, now = Date.now }) {
  const deadline = now() + timeoutMs;
  let last;
  let attempts = 0;
  while (!isCancelled() && now() <= deadline) {
    attempts++;
    try { last = await scan(); } catch (error) { last = { ok: false, error: String(error?.message || error) }; }
    if (isCancelled()) return { ok: false, stopped: true, error: 'Scan stopped.' };
    if (last?.ok === true || last?.stopped === true) return { ...last, attempts };
    const retryable = last?.needsUserAction === true || RETRYABLE.test(String(last?.error || ''));
    if (!retryable) return { ...last, attempts };
    onWaiting(last);
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await pause(Math.min(retryDelayMs, remaining));
  }
  if (isCancelled()) return { ok: false, stopped: true, error: 'Scan stopped.' };
  return { ...(last || {}), ok: false, needsUserAction: true, expired: true, attempts, error: 'Zoom sign-in or source-page readiness did not complete within two minutes. Open Zoom to sign in, then retry this source.' };
}

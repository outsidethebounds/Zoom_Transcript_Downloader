export async function sendWhenContentReady({ ping, inject, send, pause, attempts = 5 }) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      if (!(await ping())) await inject();
      // Evaluation can finish before the runtime listener is reachable.
      if (!(await ping())) { await pause(Math.min(100 * (attempt + 1), 500)); continue; }
      return await send();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await pause(Math.min(150 * (attempt + 1), 600));
    }
  }
  if (lastError) throw lastError;
  throw new Error('Extension content script did not become ready after injection.');
}

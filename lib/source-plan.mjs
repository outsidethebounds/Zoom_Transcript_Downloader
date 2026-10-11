export const TRANSCRIPT_SOURCES = Object.freeze(['recordings', 'myNotes']);

export function orderSources(selected) {
  const requested = new Set(Array.isArray(selected) ? selected : []);
  return TRANSCRIPT_SOURCES.filter(source => requested.has(source));
}

export function createSourcePlan(selected, snapshot = {}) {
  const queue = orderSources(selected);
  const results = { ...(snapshot.results || {}) };
  let nextIndex = Math.max(0, Math.min(Number(snapshot.nextIndex) || 0, queue.length));
  let stopped = snapshot.stopped === true;
  let paused = snapshot.paused === true;
  return {
    next() { return stopped || paused ? null : (queue[nextIndex++] || null); },
    complete(source, result = {}) {
      if (!TRANSCRIPT_SOURCES.includes(source)) throw new Error('Unknown source: ' + source);
      results[source] = { ...result };
      if (result.needsUserAction) paused = true;
      if (result.stopped) stopped = true;
      return { paused, stopped, done: stopped || paused || nextIndex >= queue.length };
    },
    stop() { stopped = true; nextIndex = queue.length; },
    get results() { return { ...results }; },
    get paused() { return paused; },
    get stopped() { return stopped; },
    get finished() { return stopped || paused || nextIndex >= queue.length; },
    get remaining() { return queue.slice(nextIndex); },
    snapshot() { return { selected: queue.slice(), nextIndex, results: { ...results }, stopped, paused }; },
  };
}

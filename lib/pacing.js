(() => {
  const INTER_ITEM_DELAY_MS = 1500;
  globalThis.ZTDPacing = Object.freeze({
    INTER_ITEM_DELAY_MS,
    async waitForNextStart(previousStartMs, now, sleep) {
      const elapsed = Math.max(0, now() - previousStartMs);
      const remaining = Math.max(0, INTER_ITEM_DELAY_MS - elapsed);
      if (remaining > 0) await sleep(remaining);
      return now();
    },
  });
})();

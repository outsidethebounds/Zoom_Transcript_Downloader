(() => {
  const INTER_ITEM_DELAY_MS = 1500;
  globalThis.ZTDPacing = Object.freeze({
    INTER_ITEM_DELAY_MS,
    wait: sleep => sleep(INTER_ITEM_DELAY_MS),
  });
})();

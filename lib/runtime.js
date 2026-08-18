(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.ZTDRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createClient(namespace, chromeApi = chrome) {
    async function send(type, payload) {
      const message = { type: `${namespace}:${type}` };
      if (payload !== undefined) message.payload = payload;
      return await chromeApi.runtime.sendMessage(message);
    }

    return {
      async getSettings() {
        return await chromeApi.runtime.sendMessage({ type: `${namespace}:getSettings` });
      },
      async setSettings(settings) {
        return await chromeApi.runtime.sendMessage({ type: `${namespace}:setSettings`, settings });
      },
      async getLatestDownloadId() {
        return await chromeApi.runtime.sendMessage({ type: `${namespace}:getLatestDownloadId` });
      },
      async waitForObservedDownload(payload) {
        return await send('waitForObservedDownload', payload);
      },
      async startDownloadBatch(payload) {
        return await send('startDownloadBatch', payload);
      },
      async finishDownloadBatch(payload) {
        return await send('finishDownloadBatch', payload);
      },
      async downloadArtifact(payload) {
        return await send('downloadArtifact', payload);
      },
      async saveTranscript(payload) {
        return await send('saveTranscript', payload);
      },
    };
  }

  return { createClient };
});

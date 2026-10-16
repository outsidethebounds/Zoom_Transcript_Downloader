(() => {
  if (globalThis.ZTDRecordingCapability?.version === 1) return;
  globalThis.ZTDRecordingCapability = Object.freeze({
    version: 1,
    available: true,
    reason: '',
    contract: Object.freeze({ method: 'POST', path: '/rest/meeting/transcript/user/download', transport: 'xhr', responseType: 'blob', mimeType: 'text/plain', requestIds: Object.freeze(['meetingId', 'sortKey']) }),
  });
})();

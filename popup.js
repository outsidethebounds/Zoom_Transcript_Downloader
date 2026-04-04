const DEFAULTS = {
  filenamePattern: '{date} - {time} - {title}',
  helperBaseUrl: 'http://127.0.0.1:47321',
  savePath: '/Users/macmini/Downloads/Meeting Notes',
  dryRun: true,
};

async function load() {
  const settings = await chrome.storage.local.get(DEFAULTS);
  document.getElementById('pattern').value = settings.filenamePattern;
  document.getElementById('helperBaseUrl').value = settings.helperBaseUrl;
  document.getElementById('savePath').value = settings.savePath;
  document.getElementById('dryRun').checked = !!settings.dryRun;
}

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    filenamePattern: document.getElementById('pattern').value,
    helperBaseUrl: document.getElementById('helperBaseUrl').value,
    savePath: document.getElementById('savePath').value,
    dryRun: document.getElementById('dryRun').checked,
  });
  window.close();
});

load().catch(console.error);

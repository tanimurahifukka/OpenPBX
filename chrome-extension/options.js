const baseUrl = document.getElementById('baseUrl');
const from = document.getElementById('from');
const save = document.getElementById('save');

(async () => {
  const cfg = await chrome.storage.sync.get({ baseUrl: 'http://localhost:3000', from: '1001' });
  baseUrl.value = cfg.baseUrl;
  from.value = cfg.from;
})();

save.addEventListener('click', async () => {
  await chrome.storage.sync.set({ baseUrl: baseUrl.value, from: from.value });
  save.textContent = '保存しました';
  setTimeout(() => (save.textContent = '保存'), 1500);
});

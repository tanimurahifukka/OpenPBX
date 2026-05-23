// Click-to-call の発信実行 (content/popup から chrome.runtime.sendMessage で要求される)。
async function call(toNumber) {
  const cfg = await chrome.storage.sync.get({
    baseUrl: 'http://localhost:3000',
    from: '1001',
  });
  const res = await fetch(`${cfg.baseUrl}/api/originate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // PBX 側でログイン cookie を使う
    body: JSON.stringify({ from: cfg.from, to: toNumber }),
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'click2call') {
    call(msg.number)
      .then((r) => sendResponse({ ok: true, result: r }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true; // async
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'cr-call-selection',
    title: 'OpenPBX で発信: %s',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'cr-call-selection' && info.selectionText) {
    const num = info.selectionText.replace(/[^0-9*#+-]/g, '');
    if (num) {
      try {
        await call(num);
      } catch (e) {
        console.warn('[cr] call failed', e);
      }
    }
  }
});

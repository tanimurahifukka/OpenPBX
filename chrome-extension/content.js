// tel: リンクと電話番号らしき文字列に Click-to-call をフックする。
(() => {
  // <a href="tel:..."> のクリックを乗っ取り
  document.addEventListener('click', (ev) => {
    const a = ev.target instanceof Element ? ev.target.closest('a[href^="tel:"]') : null;
    if (!a) return;
    ev.preventDefault();
    const tel = decodeURIComponent(a.getAttribute('href').slice(4));
    const num = tel.replace(/[^0-9*#+-]/g, '');
    if (!num) return;
    chrome.runtime.sendMessage({ type: 'click2call', number: num });
  });

  // 平文の電話番号にアイコンを付ける軽量パターン (高負荷を避けるため発火制限)
  // RE は g flag のためインスタンスを使い回すと lastIndex がずれて取りこぼす。
  // matchAll で都度走査する。
  const RE = /(\b0\d[\d-]{7,}|\b\+\d{8,})/g;
  function decorate(node) {
    if (!(node instanceof Text)) return;
    const text = node.nodeValue;
    if (!text) return;
    const matches = [...text.matchAll(RE)];
    if (matches.length === 0) return;
    // innerHTML を使わず、TextNode と createElement で span を組み立てる。
    // これにより、たまたま電話番号と並んだ HTML 風文字列が解釈される事故を防ぐ。
    const span = document.createElement('span');
    let cursor = 0;
    for (const m of matches) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (start > cursor) {
        span.appendChild(document.createTextNode(text.slice(cursor, start)));
      }
      const a = document.createElement('a');
      a.setAttribute('href', `tel:${m[0].replace(/[^0-9+]/g, '')}`);
      a.setAttribute('data-cr-click', '1');
      a.style.textDecoration = 'underline dotted';
      a.appendChild(document.createTextNode(m[0]));
      span.appendChild(a);
      cursor = end;
    }
    if (cursor < text.length) {
      span.appendChild(document.createTextNode(text.slice(cursor)));
    }
    node.parentNode?.replaceChild(span, node);
  }
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  let i = 0;
  while ((n = tw.nextNode())) {
    if (++i > 500) break; // 安全上限
    decorate(n);
  }
})();

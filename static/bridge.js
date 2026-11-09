/* J.A.R.V.I.S. page bridge — injected into pages Jarvis builds.
   Lets Jarvis read the page structure and scroll / highlight sections while presenting. */
(() => {
  if (window.__jarvisBridge) return;
  window.__jarvisBridge = true;
  const src = document.currentScript && document.currentScript.src;
  const HOST = src ? new URL(src).host : 'localhost:8765';
  let ws, els = [], current = null;

  const css = document.createElement('style');
  css.textContent = `
    .jv-focus { outline: 3px solid rgba(0,229,255,.9) !important; outline-offset: 6px !important;
      box-shadow: 0 0 0 9999px rgba(0,0,0,.18), 0 0 40px rgba(0,229,255,.55) !important;
      transition: outline-color .4s, box-shadow .6s !important; border-radius: 6px; position: relative; z-index: 5; }
    #jv-badge { position: fixed; top: 14px; right: 14px; z-index: 2147483647; font: 600 13px Consolas, monospace;
      letter-spacing: .12em; color: #e8fdff; background: rgba(2,20,30,.85); border: 1px solid #00e5ff;
      padding: 8px 14px; box-shadow: 0 0 18px rgba(0,229,255,.5); pointer-events: none;
      clip-path: polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%); transition: opacity .4s; }
    #jv-badge i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #ff3b5c;
      margin-right: 8px; box-shadow: 0 0 8px #ff3b5c; animation: jvb 1s infinite; }
    @keyframes jvb { 50% { opacity: .25; } }`;
  document.head.appendChild(css);

  const visible = (e) => e && e.getClientRects().length > 0 && e.offsetHeight > 30;
  function collect() {
    const sel = 'section, .slide, [data-slide], article';
    let list = [...document.querySelectorAll(sel)].filter((e) => !e.parentElement.closest(sel));
    if (list.length < 2) list = [...document.querySelectorAll('header, main > *, footer')];
    if (list.length < 2) list = [...document.querySelectorAll('h1, h2')];
    els = list.slice(0, 20);
    return els.map((e, index) => {
      const h = e.matches('h1,h2,h3') ? e : e.querySelector('h1, h2, h3, h4');
      const text = (e.innerText || '').replace(/\s+/g, ' ').trim();
      return { index, heading: (h ? h.innerText : text.slice(0, 60)).trim().slice(0, 120), text: text.slice(0, 700) };
    });
  }

  function badge(text) {
    let b = document.getElementById('jv-badge');
    if (!b) { b = document.createElement('div'); b.id = 'jv-badge'; document.body.appendChild(b); }
    b.innerHTML = `<i></i>${text}`; b.style.opacity = 1;
  }

  async function reveal(el) {
    // slide decks that hide inactive slides: try the page's own navigation
    for (let k = 0; k < 30 && !visible(el); k++) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  function screenPoint(el) {
    const h = el.matches('section, .slide, [data-slide], article, header, footer')
      ? (el.querySelector('h1, h2, h3, h4') || el) : el;
    const r = h.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const chromeX = (window.outerWidth - window.innerWidth) / 2;
    const chromeY = window.outerHeight - window.innerHeight - chromeX;
    const x = window.screenX + chromeX + r.left + Math.min(r.width, 600) / 2;
    const y = window.screenY + chromeY + r.top + Math.min(r.height, 120) / 2;
    return { point: [Math.round(x * dpr), Math.round(y * dpr)], width: Math.round(Math.min(r.width, 600) * dpr) };
  }

  async function handle(m) {
    if (m.cmd === 'goto') {
      if (!els.length) collect();
      const el = els[m.index];
      if (!el) return { ok: false, error: 'no such section' };
      await reveal(el);
      if (current) current.classList.remove('jv-focus');
      el.scrollIntoView({ behavior: 'smooth', block: el.offsetHeight > innerHeight * 0.9 ? 'start' : 'center' });
      await new Promise((r) => setTimeout(r, 900));
      el.classList.add('jv-focus'); current = el;
      badge(`JARVIS PRESENTING · ${m.index + 1} / ${m.total || els.length}`);
      // something safe to click inside this section (buttons, tabs, toggles - never links that leave the page)
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 8 && r.height > 8 && r.top > 0 && r.bottom < innerHeight; };
      const target = [...el.querySelectorAll('button:not([type=submit]), [role=tab], summary, .tab, .btn, [onclick], a[href^="#"]')]
        .find(vis);
      return { ok: true, ...screenPoint(el), click: target ? screenPoint(target).point : null,
               click_label: target ? (target.innerText || target.getAttribute('aria-label') || '').trim().slice(0, 40) : null };
    }
    if (m.cmd === 'clear') {
      if (current) current.classList.remove('jv-focus');
      current = null; const b = document.getElementById('jv-badge'); if (b) b.style.opacity = 0;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return { ok: true };
    }
    if (m.cmd === 'sections') return { ok: true, sections: collect() };
    return { ok: false, error: 'unknown command' };
  }

  function connect() {
    ws = new WebSocket(`ws://${HOST}/page`);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', title: document.title, url: location.href, sections: collect() }));
    ws.onmessage = async (ev) => {
      const m = JSON.parse(ev.data);
      let res; try { res = await handle(m); } catch (e) { res = { ok: false, error: String(e) }; }
      ws.send(JSON.stringify({ id: m.id, ...res }));
    };
    ws.onclose = () => setTimeout(connect, 2000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', connect); else connect();
})();

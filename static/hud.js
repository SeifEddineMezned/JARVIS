/* =====================================================================
   J.A.R.V.I.S. HUD  —  voice in (Web Speech API), voice out (neural TTS
   from server), live telemetry, optical feed, protocol log, arc reactor.
   ===================================================================== */
const $ = (s) => document.querySelector(s);
const S = {
  mode: localStorage.getItem('jv_mode') || 'wake',   // 'wake' | 'ptt'
  lang: localStorage.getItem('jv_lang') || 'en',
  state: 'standby', busy: false, speaking: false, awakeUntil: 0,
  ws: null, ops: 0, booted: false, model: '—', host: '—',
};
const REC_LANG = { en: 'en-US', fr: 'fr-FR', ar: 'ar-SA' };
const STATE_LABEL = { standby: 'ONLINE', listening: 'LISTENING', thinking: 'PROCESSING', acting: 'EXECUTING', speaking: 'SPEAKING' };
const WAKE_RE = /\b(?:hey\s+|ok\s+|okay\s+)?(jarvis|jarvis's|jervis|jarvas|javis|jarves|jarbis|garvis|charvis|travis|jarvi|jarv|davis|service)\b[\s,.:!?-]*(.*)$/i;

/* ----------------------------------------------------------- theme */
const TH = { c: [0, 229, 255], o: [255, 157, 28] };          // live colors used by canvases
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const rgbs = (a) => a.join(',');
function applyTheme(c, o) {
  TH.c = c; TH.o = o;
  const r = document.documentElement.style;
  r.setProperty('--c-rgb', rgbs(c)); r.setProperty('--o-rgb', rgbs(o));
  r.setProperty('--c2-rgb', rgbs(mix(c, [255, 255, 255], 0.35)));
  r.setProperty('--bg1-rgb', rgbs(mix([2, 10, 16], c, 0.16)));
  r.setProperty('--bg2-rgb', rgbs(mix([1, 6, 10], c, 0.07)));
  r.setProperty('--bg3-rgb', rgbs(mix([0, 4, 7], c, 0.05)));
  COLORS.standby = c; COLORS.speaking = c; COLORS.listening = mix(c, [255, 255, 255], 0.3);
  COLORS.acting = o; COLORS.thinking = mix(o, [255, 220, 90], 0.5);
}
function setTheme(primary, secondary, label = '', animate = true) {
  const to = [hex2rgb(primary), hex2rgb(secondary || '#ff9d1c')], from = [TH.c.slice(), TH.o.slice()];
  try { localStorage.setItem('jv_theme', JSON.stringify([primary, secondary])); } catch {}
  if (!animate) { applyTheme(...to); return; }
  const t0 = performance.now(), dur = 1400;
  (function step(now) {
    const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    applyTheme(mix(from[0], to[0], e), mix(from[1], to[1], e));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
  $('#themeFlashTxt').textContent = 'INTERFACE RECONFIGURED' + (label ? ' · ' + label.toUpperCase() : '');
  const f = $('#themeFlash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  document.body.classList.add('glitch'); setTimeout(() => document.body.classList.remove('glitch'), 1100);
  if (AC) { tone(180, 0.9, 'sawtooth', 0.04, 0, 1800); tone(2400, 0.25, 'square', 0.02, 0.3, 600); tone(880, 0.5, 'sine', 0.05, 0.6); }
}

/* ----------------------------------------------------------- audio */
let AC, outAn, micAn;
const fbuf = new Uint8Array(128);
function initAudio() {
  AC = new (window.AudioContext || window.webkitAudioContext)();
  outAn = AC.createAnalyser(); outAn.fftSize = 256; outAn.smoothingTimeConstant = 0.78;
  outAn.connect(AC.destination);
}
async function initMic() {
  try {
    const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    micAn = AC.createAnalyser(); micAn.fftSize = 256; micAn.smoothingTimeConstant = 0.7;
    AC.createMediaStreamSource(st).connect(micAn);
  } catch (e) { logSys('MIC ACCESS DENIED — use text input', true); }
}
function tone(f, d = 0.12, type = 'sine', v = 0.07, delay = 0, f2) {
  if (!AC) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + 0.05);
}
const sfx = {
  boot() { tone(60, 2.2, 'sawtooth', 0.04, 0, 700); tone(110, 2.2, 'sine', 0.08, 0, 1400);
           for (let i = 0; i < 8; i++) tone(900 + i * 160, 0.05, 'square', 0.02, 0.25 + i * 0.18);
           tone(1760, 0.6, 'sine', 0.05, 2.0); },
  online() { tone(523, 0.15, 'sine', 0.06); tone(784, 0.15, 'sine', 0.06, 0.12); tone(1046, 0.4, 'sine', 0.06, 0.24); },
  listen() { tone(880, 0.07, 'sine', 0.07); tone(1320, 0.12, 'sine', 0.07, 0.07); },
  send()   { tone(1320, 0.05, 'triangle', 0.05); tone(1760, 0.08, 'triangle', 0.05, 0.05); },
  exec()   { tone(2200, 0.03, 'square', 0.025); tone(2900, 0.04, 'square', 0.025, 0.045); },
  ok()     { tone(1500, 0.06, 'sine', 0.04); },
  err()    { tone(260, 0.3, 'sawtooth', 0.05, 0, 120); },
};

/* ----------------------------------------------------------- speech out */
const speechQ = []; let curSrc = null, fakeTalk = false;
let curItem = null;
function enqueueSpeech(text, b64, id) { speechQ.push({ text, b64, id }); if (!S.speaking) playNext(); }
function markSpoken(item) { if (item && item.id) wsSend({ type: 'spoken', id: item.id }); }
async function playNext() {
  markSpoken(curItem); curItem = null;
  const item = speechQ.shift();
  if (!item) { S.speaking = false; fakeTalk = false; onSpeechEnd(); return; }
  curItem = item;
  S.speaking = true; pauseRec(); setState('speaking'); typeOut(item.text);
  if (item.b64 && AC) {
    try {
      const bytes = Uint8Array.from(atob(item.b64), (c) => c.charCodeAt(0));
      const buf = await AC.decodeAudioData(bytes.buffer);
      const src = AC.createBufferSource(); src.buffer = buf; src.connect(outAn);
      curSrc = src; src.onended = () => { curSrc = null; playNext(); }; src.start(); return;
    } catch (e) { console.warn('audio decode failed', e); }
  }
  // fallback: browser voice
  const u = new SpeechSynthesisUtterance(item.text);
  const vs = speechSynthesis.getVoices();
  u.voice = vs.find((v) => /Ryan|George|Daniel|UK English Male/i.test(v.name)) || vs.find((v) => v.lang.startsWith(REC_LANG[S.lang].slice(0, 2))) || null;
  u.rate = 1.02; u.pitch = 0.9; fakeTalk = true;
  u.onend = u.onerror = () => { fakeTalk = false; playNext(); };
  speechSynthesis.speak(u);
}
function stopSpeech() {
  speechQ.forEach(markSpoken); markSpoken(curItem); curItem = null;
  speechQ.length = 0;
  if (curSrc) { curSrc.onended = null; try { curSrc.stop(); } catch {} curSrc = null; }
  speechSynthesis.cancel(); fakeTalk = false;
  if (S.speaking) { S.speaking = false; onSpeechEnd(); }
}
function onSpeechEnd() {
  if (S.busy) { setState('thinking'); return; }
  setState('standby');
  if (S.mode === 'wake') S.awakeUntil = Date.now() + 7000;   // follow-up without wake word
  resumeRec();
}

/* ----------------------------------------------------------- speech in */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, recActive = false, recWanted = false, pttHeld = false, pttText = '';
function startRec() {
  if (!SR || recActive || S.speaking) return;
  rec = new SR(); rec.lang = REC_LANG[S.lang]; rec.continuous = true; rec.interimResults = true;
  rec.onresult = (e) => {
    let interim = '', fin = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]; (r.isFinal ? (fin += r[0].transcript) : (interim += r[0].transcript));
    }
    if (interim) onInterim(interim.trim());
    if (fin) onFinal(fin.trim());
  };
  rec.onend = () => {
    recActive = false; $('#micBtn').classList.remove('live');
    if (S.mode === 'ptt' && !pttHeld) { const t = pttText.trim(); pttText = ''; if (t) send(t); else if (!S.busy && !S.speaking) setState('standby'); return; }
    if (recWanted && !S.speaking) setTimeout(startRec, 200);
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { recWanted = false; logSys('SPEECH RECOGNITION BLOCKED — allow the microphone', true); }
  };
  try { rec.start(); recActive = true; if (S.mode === 'ptt') $('#micBtn').classList.add('live'); } catch {}
}
function pauseRec() { if (rec && recActive) { try { rec.abort(); } catch {} } }
function resumeRec() { if (S.mode === 'wake') { recWanted = true; if (!recActive) startRec(); } }

function awake() { return Date.now() < S.awakeUntil; }
function onInterim(t) {
  if (S.mode === 'ptt') { showUser(pttText + ' ' + t, true); return; }
  if (WAKE_RE.test(t) || awake()) { showUser(t, true); if (S.state === 'standby') setState('listening'); }
  else if (!S.busy) showHeard(t);
}
function showHeard(t) { const el = $('#userLine'); el.textContent = `heard: "${t}" — start with "Jarvis…" or hold SPACE`; el.className = 'heard'; }
function onFinal(t) {
  if (S.mode === 'ptt') { pttText += ' ' + t; showUser(pttText.trim(), true); return; }
  const m = t.match(WAKE_RE);
  if (m) {
    const cmd = m[2].replace(/^[\s,.]+/, '').trim();
    if (cmd.length > 1) send(cmd);
    else { S.awakeUntil = Date.now() + 8000; sfx.listen(); setState('listening'); showUser('…'); }
    return;
  }
  if (awake()) send(t);
  else { if (!S.busy) showHeard(t); if (S.state === 'listening') setState('standby'); }
}
function wakeManually() {
  stopSpeech();
  if (S.mode === 'wake') { S.awakeUntil = Date.now() + 8000; sfx.listen(); setState('listening'); showUser('…'); resumeRec(); }
  else { pttHeld = false; pttText = ''; sfx.listen(); setState('listening'); startRec(); setTimeout(() => { try { rec && rec.stop(); } catch {} }, 7000); }
}

/* ----------------------------------------------------------- websocket */
function connect() {
  const ws = new WebSocket(`ws://${location.host}/ws${location.hash.includes('demo') ? '?demo=1' : ''}`); S.ws = ws;
  ws.onopen = () => { $('#linkDot').classList.add('on'); $('#linkTxt').textContent = 'UPLINK SECURE'; };
  ws.onclose = () => { $('#linkDot').classList.remove('on'); $('#linkTxt').textContent = 'RECONNECTING'; setTimeout(connect, 1500); };
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); (handlers[m.type] || (() => {}))(m); };
}
function wsSend(o) { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(o)); else logSys('NO UPLINK TO CORE', true); }
function send(text) {
  text = text.trim(); if (!text) return;
  stopSpeech(); S.awakeUntil = 0; sfx.send();
  showUser(text); typeOut(''); S.busy = true; setState('thinking');
  logSys(`DIRECTIVE  "${text.length > 60 ? text.slice(0, 60) + '…' : text}"`);
  if (/^(reset|clear memory|forget everything)$/i.test(text)) { wsSend({ type: 'reset' }); S.busy = false; return; }
  wsSend({ type: 'command', text, lang: S.lang });
}
let lastLi = null, codeBuf = '', codeT0 = 0, codeHide = null;
const handlers = {
  boot(m) {
    S.model = m.model; S.host = location.hash.includes('demo') ? 'STARK-TOWER' : m.host;
    m.host = S.host;
    S.backends = m.backends || 1;
    if (m.cores) renderCores(m.cores);
    $('#modelName').textContent = m.model.toUpperCase();
    $('#hostName').textContent = m.host.toUpperCase();
    $('#screenTxt').textContent = `${m.screen[0]} × ${m.screen[1]}`;
    $('#ovTxt').textContent = m.overlay ? 'ACTIVE' : 'OFFLINE';
  },
  status(m) {
    if (m.state === 'idle') { S.busy = false; if (!S.speaking) { setState('standby'); resumeRec(); } }
    else { S.busy = true; if (!S.speaking) setState(m.state); }
  },
  say(m) { enqueueSpeech(m.text, m.audio, m.id); },
  reply(m) { S.busy = false; enqueueSpeech(m.text, m.audio); },
  tool(m) {
    S.busy = true; if (!S.speaking) setState('acting'); sfx.exec();
    S.ops++; $('#opCount').textContent = `${S.ops} OPS`;
    const args = Object.entries(m.args || {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('  ');
    lastLi = addLog(`<span class="n">▸ ${m.name.toUpperCase()}</span> <span class="s">…</span><span class="a">${esc(args)}</span>`);
  },
  tool_result(m) {
    if (lastLi) { lastLi.classList.add(m.ok ? 'ok' : 'fail'); lastLi.querySelector('.s').textContent = m.ok ? '✓ DONE' : '✗ FAILED'; }
    m.ok ? sfx.ok() : sfx.err();
  },
  vision(m) {
    const feed = $('#feed'), ret = $('#reticle');
    $('#feedImg').src = 'data:image/jpeg;base64,' + m.image; $('#camBoxes').innerHTML = '';
    feed.classList.remove('cam-shot', 'cam-live');
    feed.classList.add('live'); feed.classList.remove('scanning'); void feed.offsetWidth; feed.classList.add('scanning');
    $('#visionLabel').textContent = (m.label || '').toUpperCase().slice(0, 34);
    ret.classList.remove('on');
    if (m.point) { ret.style.left = m.point[0] * 100 + '%'; ret.style.top = m.point[1] * 100 + '%'; void ret.offsetWidth; ret.classList.add('on'); }
  },
  code_start(m) {
    const feed = $('#feed'), fab = $('#fab');
    feed.classList.add('coding'); fab.classList.remove('done');
    $('#fabFile').textContent = 'FABRICATING  ' + m.file.toUpperCase(); codeBuf = ''; codeT0 = performance.now();
    $('#codeFeed').textContent = ''; $('#fabStats').textContent = '0 LINES'; clearTimeout(codeHide);
  },
  code(m) {
    codeBuf += m.chunk; const el = $('#codeFeed');
    el.textContent = codeBuf.slice(-6000); el.scrollTop = el.scrollHeight;
    const secs = (performance.now() - codeT0) / 1000;
    $('#fabStats').textContent = `${codeBuf.split(String.fromCharCode(10)).length} LINES · ${Math.round(codeBuf.length / Math.max(secs, 0.1))} CH/S`;
    if (Math.random() < 0.25) tone(2400 + Math.random() * 1200, 0.015, 'square', 0.012);
  },
  code_end(m) {
    $('#fab').classList.add('done'); $('#fabFile').textContent = '✓ COMPILED  ' + m.file.toUpperCase();
    sfx.ok(); codeHide = setTimeout(() => $('#feed').classList.remove('coding'), 9000);
  },
  camera_snap(m) { snapCamera(m.id); },
  camera_view(m) { showCameraView(m); },
  theme(m) { setTheme(m.primary, m.secondary, m.label || ''); logSys(`INTERFACE THEME → ${(m.label || m.primary).toUpperCase()}`); },
  layout(m) { $('#hud').classList.toggle('minimal', m.mode === 'minimal'); logSys(`LAYOUT → ${m.mode.toUpperCase()}`); },
  present(m) { logSys(`PRESENTING ${m.index}/${m.total} · ${(m.heading || '').toUpperCase().slice(0, 40)}`); },
  cores(m) { renderCores(m.cores); },
  active(m) {
    document.body.classList.toggle('dormant', !m.active);
    if (!m.active) { stopSpeech(); recWanted = false; pauseRec(); }
    else if (S.booted && S.mode === 'wake') { recWanted = true; resumeRec(); }
  },
  core(m) {
    S.model = m.model; const el = $('#modelName'); el.textContent = m.model.toUpperCase();
    logSys(`NEURAL CORE SWITCH → ${m.model.toUpperCase()}`); tone(660, 0.1, 'sine', 0.05); tone(990, 0.15, 'sine', 0.05, 0.1);
  },
  error(m) { logSys('CORE ERROR: ' + m.text, true); sfx.err(); },
  stats: renderStats,
};

/* ----------------------------------------------------------- UI helpers */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ts = () => new Date().toTimeString().slice(0, 8);
function addLog(html, cls = '') {
  const li = document.createElement('li'); li.className = cls;
  li.innerHTML = `<span class="t">${ts()}</span>${html}`;
  const ul = $('#log'); ul.appendChild(li); while (ul.children.length > 60) ul.firstChild.remove();
  ul.scrollTop = ul.scrollHeight; return li;
}
function logSys(text, bad = false) { addLog(`<span class="n">${esc(text)}</span>`, bad ? 'fail sys' : 'sys'); }
function setState(st) {
  S.state = st; const el = $('#stateTxt');
  el.textContent = STATE_LABEL[st] || st.toUpperCase(); el.className = 'state ' + st;
}
function showUser(t, interim = false) { const el = $('#userLine'); el.textContent = t; el.className = interim ? 'interim' : ''; }
let typeTimer = null;
function typeOut(text) {
  clearInterval(typeTimer); const el = $('#aiLine'); let i = 0;
  el.innerHTML = '<span class="caret"></span>';
  if (!text) return;
  typeTimer = setInterval(() => {
    i += 2; el.innerHTML = esc(text.slice(0, i)) + '<span class="caret"></span>';
    if (i >= text.length) { clearInterval(typeTimer); el.textContent = text; }
  }, 28);
}

function renderCores(list) {
  const ul = $('#coresList'); if (!ul || !list) return;
  const ready = list.filter((c) => c.state === 'ready').length;
  $('#coreCount').textContent = `${ready}/${list.length} READY`;
  ul.innerHTML = list.map((c) => `<li class="${c.state}${c.active ? ' active' : ''}"><b></b><span>${esc(c.label.toUpperCase())}</span>${c.vision ? '<em>VISION</em>' : ''}</li>`).join('');
}

/* ----------------------------------------------------------- webcam eyes */
let camStream = null, camOffTimer = null;
async function ensureCamera() {
  const v = $('#camVideo');
  if (!camStream) {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    v.srcObject = camStream; await v.play();
    await new Promise((r) => setTimeout(r, 1200));          // let auto-exposure settle (first frames are dark)
  }
  clearTimeout(camOffTimer);
  camOffTimer = setTimeout(stopCamera, 20000);               // privacy: camera light goes off when idle
  return v;
}
function stopCamera() {
  if (camStream) camStream.getTracks().forEach((t) => t.stop());
  camStream = null; $('#feed').classList.remove('cam-live');
}
async function snapCamera(id) {
  const feed = $('#feed');
  try {
    feed.classList.remove('coding', 'cam-shot'); $('#camBoxes').innerHTML = '';
    const v = await ensureCamera();
    feed.classList.add('cam-live'); $('#visionLabel').textContent = 'CAMERA LIVE';
    $('#camTag').innerHTML = '<i></i>CAMERA LIVE';
    logSys('OPTICAL SENSOR → WEBCAM ENGAGED');
    tone(1200, 0.08, 'sine', 0.05); tone(1800, 0.12, 'sine', 0.05, 0.1);
    await new Promise((r) => setTimeout(r, 700));             // a beat of live video for the audience
    const c = document.createElement('canvas'); c.width = v.videoWidth || 1280; c.height = v.videoHeight || 720;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const image = c.toDataURL('image/jpeg', 0.85).split(',')[1];
    tone(2600, 0.05, 'square', 0.03);                         // shutter blip
    wsSend({ type: 'camera_frame', id, image });
  } catch (e) {
    feed.classList.remove('cam-live');
    logSys('CAMERA UNAVAILABLE — ' + (e.name === 'NotAllowedError' ? 'permission denied' : e.message || e.name), true);
    wsSend({ type: 'camera_frame', id, error: e.name === 'NotAllowedError' ? 'camera permission denied in the HUD' : String(e.message || e) });
  }
}
function showCameraView(m) {
  const feed = $('#feed');
  $('#feedImg').src = 'data:image/jpeg;base64,' + m.image;
  feed.classList.remove('cam-live', 'coding'); feed.classList.add('live', 'cam-shot');
  $('#camTag').innerHTML = (m.objects || []).length ? '<i></i>TARGETS LOCKED' : '<i></i>SNAPSHOT · ANALYSING';
  feed.classList.remove('scanning'); void feed.offsetWidth; feed.classList.add('scanning');
  $('#visionLabel').textContent = (m.label || '').toUpperCase().slice(0, 34);
  $('#camBoxes').innerHTML = (m.objects || []).map((o, i) => {
    const [x0, y0, x1, y1] = o.box;
    return `<div class="cam-box" style="left:${x0 * 100}%;top:${y0 * 100}%;width:${(x1 - x0) * 100}%;height:${(y1 - y0) * 100}%;animation-delay:${i * 0.18}s"><span>${esc(o.label.toUpperCase())}</span></div>`;
  }).join('');
  if ((m.objects || []).length) { logSys(`TARGETS ACQUIRED: ${m.objects.map((o) => o.label.toUpperCase()).join(' · ')}`); tone(1500, 0.06, 'square', 0.03); tone(2000, 0.08, 'square', 0.03, 0.08); }
}

/* ----------------------------------------------------------- telemetry */
const netUp = Array(60).fill(0), netDown = Array(60).fill(0);
function gauge(id, p) {
  const g = $(id); g.querySelector('.g-fg').style.strokeDashoffset = 314 * (1 - p / 100);
  g.querySelector('b').textContent = Math.round(p) + '%'; g.classList.toggle('hot', p > 85);
}
function renderStats(m) {
  gauge('#gCpu', m.cpu); gauge('#gRam', m.ram); gauge('#gDisk', m.disk);
  const cores = $('#cores');
  if (cores.children.length !== m.cores.length) cores.innerHTML = m.cores.map(() => '<i></i>').join('');
  m.cores.forEach((v, i) => (cores.children[i].style.height = Math.max(4, v) + '%'));
  netUp.push(m.up); netDown.push(m.down); netUp.shift(); netDown.shift();
  $('#netTxt').textContent = `↑${fmtK(m.up)} ↓${fmtK(m.down)}`;
  drawNet();
  $('#batTxt').textContent = m.battery == null ? 'MAINS (NO CELL)' : `${Math.round(m.battery)}% ${m.plugged ? '· CHARGING' : ''}`;
  $('#batBar').style.width = (m.battery == null ? 100 : m.battery) + '%';
  $('#procTxt').textContent = m.procs;
}
const fmtK = (k) => (k > 1024 ? (k / 1024).toFixed(1) + ' MB/s' : Math.round(k) + ' KB/s');
function drawNet() {
  const c = $('#netChart'), x = c.getContext('2d'), dpr = devicePixelRatio || 1;
  c.width = c.clientWidth * dpr; c.height = 90 * dpr; const W = c.width, H = c.height;
  x.clearRect(0, 0, W, H);
  x.strokeStyle = `rgba(${rgbs(TH.c)},.12)`; x.lineWidth = 1;
  for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(0, (H * i) / 4); x.lineTo(W, (H * i) / 4); x.stroke(); }
  const max = Math.max(50, ...netUp, ...netDown) * 1.15;
  const line = (arr, col, fill) => {
    x.beginPath(); arr.forEach((v, i) => { const px = (i / (arr.length - 1)) * W, py = H - (v / max) * H; i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.strokeStyle = col; x.lineWidth = 2 * dpr; x.shadowColor = col; x.shadowBlur = 8; x.stroke(); x.shadowBlur = 0;
    x.lineTo(W, H); x.lineTo(0, H); x.closePath(); x.fillStyle = fill; x.fill();
  };
  line(netDown, `rgb(${rgbs(TH.c)})`, `rgba(${rgbs(TH.c)},.12)`); line(netUp, `rgb(${rgbs(TH.o)})`, `rgba(${rgbs(TH.o)},.08)`);
}

/* ----------------------------------------------------------- clock */
setInterval(() => {
  const d = new Date();
  $('#clockTime').textContent = d.toTimeString().slice(0, 8);
  $('#clockDate').textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
}, 250);

/* ----------------------------------------------------------- arc reactor */
const R = $('#reactor'), rc = R.getContext('2d');
let level = 0, hue = [0, 229, 255];
const COLORS = { standby: [0, 229, 255], listening: [80, 240, 255], speaking: [0, 229, 255], thinking: [255, 196, 60], acting: [255, 140, 28] };
function sizeCanvas(c) { const d = devicePixelRatio || 1; if (c.width !== c.clientWidth * d) { c.width = c.clientWidth * d; c.height = c.clientHeight * d; } }
function audioLevel() {
  let an = null;
  if (S.speaking && !fakeTalk) an = outAn; else if (S.state === 'listening' || (S.mode === 'ptt' && recActive)) an = micAn;
  if (!an) { fbuf.fill(0); if (fakeTalk) { for (let i = 0; i < 64; i++) fbuf[i] = 90 + 90 * Math.abs(Math.sin(performance.now() / 90 + i / 3)) * Math.random(); return 0.45; } return 0; }
  an.getByteFrequencyData(fbuf); let s = 0; for (let i = 2; i < 60; i++) s += fbuf[i]; return Math.min(1, s / 58 / 150);
}
function drawReactor(now) {
  sizeCanvas(R);
  const W = R.width, H = R.height, cx = W / 2, cy = H / 2, s = Math.min(W, H) / 2, t = now / 1000;
  const target = COLORS[S.state] || COLORS.standby;
  hue = hue.map((v, i) => v + (target[i] - v) * 0.06);
  const col = (a) => `rgba(${hue[0] | 0},${hue[1] | 0},${hue[2] | 0},${a})`;
  level += (audioLevel() - level) * 0.3;
  const sp = S.state === 'thinking' ? 3.2 : S.state === 'acting' ? 2.2 : 1;
  const bootK = Math.min(1, (now - bootAt) / 1800);
  rc.clearRect(0, 0, W, H);
  rc.save(); rc.translate(cx, cy); rc.scale(0.6 + 0.4 * bootK, 0.6 + 0.4 * bootK); rc.globalAlpha = bootK;

  // glow
  const g = rc.createRadialGradient(0, 0, 0, 0, 0, s * (0.75 + level * 0.3));
  g.addColorStop(0, col(0.32 + level * 0.3)); g.addColorStop(0.35, col(0.1)); g.addColorStop(1, col(0));
  rc.fillStyle = g; rc.beginPath(); rc.arc(0, 0, s, 0, Math.PI * 2); rc.fill();

  rc.lineCap = 'butt'; rc.shadowColor = col(1);
  // 1. outer tick ring
  rc.save(); rc.rotate(t * 0.04 * sp);
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2, long = i % 15 === 0, mid = i % 5 === 0;
    const r1 = s * 0.95, r2 = s * (long ? 0.88 : mid ? 0.91 : 0.93);
    rc.strokeStyle = col(long ? 0.9 : 0.4); rc.lineWidth = long ? 2.5 : 1;
    rc.beginPath(); rc.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); rc.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); rc.stroke();
  }
  rc.restore();
  // 2. segmented heavy arcs
  rc.save(); rc.rotate(-t * 0.25 * sp); rc.lineWidth = s * 0.028; rc.shadowBlur = 12;
  for (let i = 0; i < 6; i++) { rc.strokeStyle = col(i % 2 ? 0.85 : 0.45); rc.beginPath(); rc.arc(0, 0, s * 0.83, (i * Math.PI) / 3 + 0.08, ((i + 1) * Math.PI) / 3 - 0.08); rc.stroke(); }
  rc.restore();
  // 3. dashed thin rings
  rc.save(); rc.rotate(t * 0.6 * sp); rc.setLineDash([s * 0.02, s * 0.03]); rc.lineWidth = 1.5; rc.strokeStyle = col(0.55); rc.shadowBlur = 0;
  rc.beginPath(); rc.arc(0, 0, s * 0.765, 0, Math.PI * 2); rc.stroke(); rc.setLineDash([]); rc.restore();
  // 3b. thinking sweep
  if (S.state === 'thinking' || S.state === 'acting') {
    rc.save(); rc.rotate(t * 4); rc.lineWidth = s * 0.012; rc.shadowBlur = 20; rc.strokeStyle = col(1);
    rc.beginPath(); rc.arc(0, 0, s * 0.725, 0, Math.PI * 0.6); rc.stroke();
    rc.rotate(Math.PI); rc.beginPath(); rc.arc(0, 0, s * 0.725, 0, Math.PI * 0.6); rc.stroke(); rc.restore();
  }
  // 4. frequency bars
  rc.save(); rc.rotate(-Math.PI / 2); rc.shadowBlur = 8;
  const N = 96;
  for (let i = 0; i < N; i++) {
    const k = i < N / 2 ? i : N - i - 1, v = fbuf[3 + Math.floor(k * 1.1)] / 255;
    const idle = 0.012 + 0.01 * Math.sin(t * 2 + i * 0.4);
    const len = s * (idle + v * 0.16), a = (i / N) * Math.PI * 2, r0 = s * 0.56;
    rc.strokeStyle = col(0.35 + v * 0.65); rc.lineWidth = Math.max(2, s * 0.012);
    rc.beginPath(); rc.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); rc.lineTo(Math.cos(a) * (r0 + len), Math.sin(a) * (r0 + len)); rc.stroke();
  }
  rc.restore();
  // 5. reactor coil ring
  rc.save(); rc.rotate(t * 0.15 * sp); rc.shadowBlur = 16;
  rc.strokeStyle = col(0.9); rc.lineWidth = s * 0.012; rc.beginPath(); rc.arc(0, 0, s * 0.53, 0, Math.PI * 2); rc.stroke();
  for (let i = 0; i < 10; i++) {
    rc.save(); rc.rotate((i / 10) * Math.PI * 2);
    rc.fillStyle = col(0.18 + level * 0.4); rc.strokeStyle = col(0.9); rc.lineWidth = 1.5;
    rc.beginPath(); rc.rect(s * 0.4, -s * 0.045, s * 0.1, s * 0.09); rc.fill(); rc.stroke(); rc.restore();
  }
  rc.strokeStyle = col(0.7); rc.lineWidth = 2; rc.beginPath(); rc.arc(0, 0, s * 0.38, 0, Math.PI * 2); rc.stroke();
  rc.restore();
  // 6. triangle
  rc.save(); rc.rotate(Math.sin(t * 0.5) * 0.08 + (S.state === 'thinking' ? t * 1.5 : 0)); rc.shadowBlur = 24;
  rc.strokeStyle = col(0.95); rc.lineWidth = s * 0.03; rc.lineJoin = 'round';
  rc.beginPath(); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i * Math.PI * 2) / 3, r = s * 0.31; rc[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } rc.closePath(); rc.stroke();
  rc.restore();
  // 7. core
  const cr = s * (0.13 + level * 0.07 + 0.008 * Math.sin(t * 3));
  const cg = rc.createRadialGradient(0, 0, 0, 0, 0, cr * 1.6);
  cg.addColorStop(0, 'rgba(255,255,255,1)'); cg.addColorStop(0.3, col(0.85)); cg.addColorStop(1, col(0));
  rc.shadowBlur = 30; rc.fillStyle = cg; rc.beginPath(); rc.arc(0, 0, cr * 1.6, 0, Math.PI * 2); rc.fill();
  // 8. orbiters
  rc.shadowBlur = 14;
  for (let i = 0; i < 3; i++) {
    const a = t * (0.8 + i * 0.35) * sp + (i * Math.PI * 2) / 3, r = s * (0.66 + i * 0.03);
    rc.fillStyle = col(1); rc.beginPath(); rc.arc(Math.cos(a) * r, Math.sin(a) * r, s * 0.012, 0, Math.PI * 2); rc.fill();
  }
  rc.restore();
}

/* ----------------------------------------------------------- background */
const BG = $('#bg'), bx = BG.getContext('2d');
const parts = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), v: 0.0002 + Math.random() * 0.0006, r: Math.random() * 1.6 + 0.4 }));
function drawBg() {
  const d = devicePixelRatio || 1; if (BG.width !== innerWidth * d) { BG.width = innerWidth * d; BG.height = innerHeight * d; }
  const W = BG.width, H = BG.height; bx.clearRect(0, 0, W, H);
  // hex grid
  bx.strokeStyle = `rgba(${rgbs(TH.c)},0.05)`; bx.lineWidth = 1; const hs = 34 * d, hh = hs * Math.sqrt(3);
  for (let y = 0, row = 0; y < H + hh; y += hh / 2, row++) for (let x = (row % 2) * hs * 1.5; x < W + hs * 3; x += hs * 3) {
    bx.beginPath(); for (let k = 0; k < 6; k++) { const a = (Math.PI / 3) * k; bx[k ? 'lineTo' : 'moveTo'](x + hs * Math.cos(a), y + hs * Math.sin(a)); } bx.closePath(); bx.stroke();
  }
  for (const p of parts) {
    p.y -= p.v; if (p.y < 0) { p.y = 1; p.x = Math.random(); }
    bx.fillStyle = `rgba(${rgbs(TH.c)},0.5)`; bx.beginPath(); bx.arc(p.x * W, p.y * H, p.r * d, 0, Math.PI * 2); bx.fill();
  }
}
let bgFrame = 0;
function loop(now) { drawReactor(now); if (bgFrame++ % 2 === 0) drawBg(); requestAnimationFrame(loop); }

/* ----------------------------------------------------------- boot */
let bootAt = performance.now() + 1e9;
async function boot() {
  if (S.booted) return; S.booted = true;
  const DEMO = location.hash.includes('demo');           // screenshot / showcase mode: no mic
  initAudio(); if (!DEMO) initMic(); sfx.boot();
  $('#initBtn').style.pointerEvents = 'none';
  const lines = [
    'Initializing J.A.R.V.I.S. kernel', 'Arc reactor output ........ 3.0 GJ/s',
    `Linking neural cores ........ ${S.backends} online`, `Primary core ................ ${S.model}`,
    'Optical sensors (screen capture)',
    'Motor control (mouse / keyboard)', 'Neural voice synthesis', 'Holographic overlay projection',
    `Host system .................. ${S.host}`,
  ];
  const log = $('#bootLog');
  for (const l of lines) {
    log.innerHTML += `<span class="ok">[ OK ]</span> ${esc(l)}\n`;
    await new Promise((r) => setTimeout(r, 230));
  }
  log.innerHTML += '\n>> ALL SYSTEMS NOMINAL';
  await new Promise((r) => setTimeout(r, 600));
  $('#boot').classList.add('leaving'); $('#hud').classList.remove('hidden');
  bootAt = performance.now(); sfx.online();
  setTimeout(() => $('#boot').remove(), 1100);
  if (!SR) logSys('Voice input needs Edge or Chrome — text input active', true);
  logSys('J.A.R.V.I.S. ONLINE');
  wsSend({ type: 'hello', lang: S.lang });
  recWanted = S.mode === 'wake' && !DEMO;
  if (location.hash.includes('cycle')) startThemeCycle();
}

/* ----------------------------------------------------------- controls */
function applyChips() { $('#modeTxt').textContent = S.mode === 'wake' ? 'WAKE WORD' : 'PUSH-TO-TALK'; $('#langTxt').textContent = S.lang.toUpperCase(); }
$('#initBtn').addEventListener('click', boot);
$('#dormant').addEventListener('click', () => wsSend({ type: 'claim' }));
$('#sendBtn').addEventListener('click', () => { send($('#cmd').value); $('#cmd').value = ''; });
$('#cmd').addEventListener('keydown', (e) => { if (e.key === 'Enter') { send(e.target.value); e.target.value = ''; } e.stopPropagation(); });
$('#micBtn').addEventListener('click', wakeManually);
R.addEventListener('click', wakeManually);
$('#modeChip').addEventListener('click', () => {
  S.mode = S.mode === 'wake' ? 'ptt' : 'wake'; localStorage.setItem('jv_mode', S.mode); applyChips();
  recWanted = S.mode === 'wake'; pauseRec(); if (recWanted) setTimeout(startRec, 300);
  logSys(`MIC MODE → ${S.mode === 'wake' ? 'WAKE WORD ("Jarvis …")' : 'PUSH-TO-TALK (hold SPACE)'}`);
});
$('#langChip').addEventListener('click', () => {
  const order = ['en', 'fr', 'ar']; S.lang = order[(order.indexOf(S.lang) + 1) % order.length];
  localStorage.setItem('jv_lang', S.lang); applyChips(); pauseRec();
  logSys(`LANGUAGE → ${S.lang.toUpperCase()}`);
});
document.addEventListener('keydown', (e) => {
  if (!S.booted) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); boot(); } return; }
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault(); stopSpeech(); pttHeld = true; pttText = '';
    if (S.mode === 'wake') { S.awakeUntil = Date.now() + 10000; sfx.listen(); setState('listening'); resumeRec(); }
    else { sfx.listen(); setState('listening'); startRec(); }
  }
  if (e.key === 'Escape') { stopSpeech(); wsSend({ type: 'interrupt' }); logSys('INTERRUPTED BY USER'); }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && pttHeld) { pttHeld = false; if (S.mode === 'ptt') setTimeout(() => { try { rec && rec.stop(); } catch {} }, 350); }
});
speechSynthesis.getVoices();
applyChips(); connect(); requestAnimationFrame(loop);
try { const t = JSON.parse(localStorage.getItem('jv_theme') || 'null'); if (t) setTheme(t[0], t[1], '', false); } catch {}
{ const m = location.hash.match(/theme=([0-9a-f]{6})-([0-9a-f]{6})/i); if (m) setTheme('#' + m[1], '#' + m[2], '', false); }
if (location.hash.includes('autoboot')) setTimeout(boot, 800);

/* showcase: cycle through suit themes (open http://localhost:8765/#autoboot-demo-cycle) */
const SHOWCASE = [['#ff2a3d', '#ffc83d', 'iron man'], ['#2bff88', '#b54dff', 'hulk'], ['#b54dff', '#ffc83d', 'thanos'],
                  ['#ffe23d', '#2bff88', 'vision'], ['#00e5ff', '#ff9d1c', 'jarvis']];
function startThemeCycle() {
  let i = 0;
  setInterval(() => { const t = SHOWCASE[i++ % SHOWCASE.length]; setTheme(t[0], t[1], t[2]); }, 4500);
}

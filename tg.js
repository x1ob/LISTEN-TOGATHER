// A. Music – Listening together, web guest. Speaks protocol v1 of the app (Together.java):
//  code -> PBKDF2-SHA256("accord-together-v1", 30000 rounds, 48 bytes): topic "atg"+hex(first 16), AES-256-GCM key (next 32)
//  messages: 12-byte nonce + ciphertext+tag, AAD "accord-tg", base64; JSON with k f n w v t
//  relays: ntfy.sh and ntfy.envs.net, every message through both.
'use strict';
const TG = (() => {
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', PROTO = 1, CAP = 2;
  const RELAYS = ['https://ntfy.sh/', 'https://ntfy.envs.net/'];
  const enc = new TextEncoder(), dec = new TextDecoder();
  const rnd = n => { let s = ''; const a = crypto.getRandomValues(new Uint32Array(n)); for (const x of a) s += ALPHA[x % ALPHA.length]; return s; };
  const DEV = rnd(10);
  const clean = s => (s || '').toUpperCase().split('').filter(c => ALPHA.includes(c)).join('');
  const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  const b64 = u => { let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function derive(code) {
    const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('accord-together-v1'), iterations: 30000 }, base, 384));
    const key = await crypto.subtle.importKey('raw', bits.slice(16, 48), 'AES-GCM', false, ['encrypt', 'decrypt']);
    return { topic: 'atg' + hex(bits.slice(0, 16)), key };
  }
  async function seal(plain, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('accord-tg'), tagLength: 128 }, key, enc.encode(plain)));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return b64(out);
  }
  async function open(s, key) {
    const b = unb64(s); if (b.length < 29) throw new Error('short');
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12), additionalData: enc.encode('accord-tg'), tagLength: 128 }, key, b.slice(12)));
  }

  // message age without trusting clocks (Together.Lag)
  class Lag {
    constructor() { this.min = Infinity; this.lastAge = 0; this.lastAt = 0; this.same = 0; }
    age(sent, nowWall, nowUp) {
      const d = nowWall - sent;
      if (this.min !== Infinity) this.min += 2;
      if (d <= this.min) { this.min = d; this.same = 0; this.lastAge = 0; this.lastAt = nowUp; return 0; }
      let age = d - this.min;
      if (age > 4000 && this.lastAge > 4000 && Math.abs(age - this.lastAge) < 1500 && nowUp - this.lastAt > 2500) { if (++this.same >= 2) { this.min = d; this.same = 0; age = 0; } } else this.same = 0;
      this.lastAge = age; this.lastAt = nowUp; return Math.min(age, 600000);
    }
  }

  const st = { on: false, topic: '', key: null, seq: 0, term: 0, hostId: null, hostAt: 0, welcomed: false, up: [false, false], src: [],
    seen: [], lastSeq: new Map(), hostCap: 0, qRaw: null, qList: [], rQh: 0, rQhSet: false, hostQh: 0, hostQhSet: false, qMis: 0, lastQr: 0, pend: [], lags: new Map(), lastOpenAt: 0, rate: 0, rateAt: 0, lastHi: 0, lastPing: 0, startedAt: 0 };
  let ui = () => {}, player = null;

  function msg(k, extra) { return Object.assign({ k, f: DEV, n: ++st.seq, w: Date.now(), v: PROTO, t: st.term }, extra || {}); }
  async function send(m) {
    if (!st.key) return;
    const body = await seal(JSON.stringify(m), st.key);
    RELAYS.forEach(r => fetch(r + st.topic, { method: 'POST', body }).catch(() => {}));
  }
  function fresh(id) { if (!id) return true; if (st.seen.includes(id)) return false; st.seen.push(id); if (st.seen.length > 60) st.seen.shift(); return true; }

  function listen(i) {
    const es = new EventSource(RELAYS[i] + st.topic + '/sse');
    st.src[i] = es;
    es.onopen = () => { st.up[i] = true; st.lastOpenAt = performance.now(); if (!st.welcomed) hi(); ui(); };
    es.onerror = () => { st.up[i] = false; ui(); };
    es.onmessage = ev => {
      let o; try { o = JSON.parse(ev.data); } catch (e) { return; }
      if (o.event !== 'message' || !o.message || o.message.length > 8000) return;
      if (!fresh(i + ':' + o.id)) return;
      incoming(o.message);
    };
  }
  async function incoming(body) {
    const now = performance.now();
    if (now - st.rateAt > 10000) { st.rateAt = now; st.rate = 0; }
    if (++st.rate > 60) return;
    let m; try { m = JSON.parse(await open(body, st.key)); } catch (e) { return; }
    const f = String(m.f || ''), k = m.k;
    if (!f || f.length > 40 || f === DEV) return;
    if (Math.abs(Date.now() - (m.w || 0)) > 12 * 3600 * 1000) return;
    const n = typeof m.n === 'number' ? m.n : -1, prev = st.lastSeq.get(f);
    if (n < 0 || (prev !== undefined && n <= prev)) return;
    if (prev === undefined && st.lastSeq.size >= 16) return;
    st.lastSeq.set(f, n);
    let lg = st.lags.get(f); if (!lg) { lg = new Lag(); st.lags.set(f, lg); }
    let age = lg.age(m.w || 0, Date.now(), now);
    if (age > 4000 && now - st.lastOpenAt > 4000) age = 0;
    if (k === 'wl' || k === 'st') {
      if (!fromHost(m, f)) return;
      st.hostAt = now;
      if (k === 'wl') { st.welcomed = true; st.hostCap = m.cp || 0; }
      else { if ('qh' in m) { st.hostQh = m.qh | 0; st.hostQhSet = true; } remote(m, age); }
      ui();
    } else if (k === 'qs') {
      if (f === st.hostId) mirror(String(m.q || ''));
    } else if (k === 'sl') {
      if (f === st.hostId && m.ri === st.searchId) {
        const list = String(m.r || '') ? String(m.r).split(RS).map(one => { const x = one.split(FS); return { id: x[0], ti: x[1] || '', ar: x[2] || '', th: (x[3] || '').startsWith('https://') ? x[3] : 'https://i.ytimg.com/vi/' + x[0] + '/hqdefault.jpg' }; }).filter(x => validId(x.id)) : [];
        st.searchId = ''; TG.onSearch && TG.onSearch(list);
      }
    } else if (k === 'qa') {
      if (f === st.hostId) { const qi = String(m.qi || ''); st.pend = st.pend.filter(p => p.qi !== qi); }
    } else if (k === 'sw') {
      // the host handed the music to someone else: that phone is the host now
      if (f === st.hostId && (m.t || 0) >= st.term && m.to && m.to.length <= 40) { st.term = m.t || 0; st.hostId = m.to === DEV ? null : m.to; }
    } else if (k === 'by') {
      if (f === st.hostId) { say('The host ended the session'); leave(false); }
    } else if (k === 'rx') {
      if (f === st.hostId) TG.onReaction && TG.onReaction(m.e === 2 ? 'nope' : 'heart', m.c || 1);
    }
  }
  function fromHost(m, f) {
    const t = m.t || 0, now = performance.now();
    if (f === st.hostId) { if (t > st.term) st.term = t; return true; }
    const take = st.hostId == null || t > st.term || (t === st.term && now - st.hostAt > 45000);
    if (!take) return false;
    st.term = Math.max(st.term, t); st.hostId = f; return true;
  }
  function hi() { st.lastHi = performance.now(); send(msg('hi', { av: 'web 1.0', cp: CAP })); }

  // ---- following the host (Together.remote / enforce, the same rules)
  const r = { id: '', title: '', artist: '', thumb: '', dur: 0, pos: 0, at: 0, playing: false, local: false, seek: false, isNew: false };
  const g = { loadCool: 0, seekCool: 0, steadySince: 0, lead: 150, checkLead: false, bigTries: 0, corrections: 0, firstCorr: 0, loads: 0, drift: 0, unplayable: '' };
  // song ids as the app writes them: an 11-letter YouTube id, or "xs"/"xb" + the SoundCloud/Bandcamp address (base64url)
  const b64url = str => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64url = id => { try { return decodeURIComponent(escape(atob(id.replace(/-/g, '+').replace(/_/g, '/')))); } catch (e) { return ''; } };
  function urlOf(id) {
    if (!/^x[sb][A-Za-z0-9_-]{8,700}$/.test(id)) return '';
    const u = unb64url(id.slice(2)); let h;
    try { if (!u.startsWith('https://') || u.length > 900) return ''; h = new URL(u).hostname; } catch (e) { return ''; }
    if (!h || h.length < 4 || !h.includes('.') || /^[0-9.]+$/.test(h) || h === 'localhost' || /\.(local|internal)$/.test(h)) return '';
    if (id[1] === 's' && !(h === 'soundcloud.com' || h.endsWith('.soundcloud.com'))) return '';
    return u;
  }
  const validId = id => /^[A-Za-z0-9_-]{11}$/.test(id) || !!urlOf(id);
  const kindOf = id => /^xs/.test(id) ? 'sc' : /^xb/.test(id) ? 'bc' : 'yt';
  const clip = (s, n) => String(s || '').slice(0, n);
  function remote(m, age) {
    if (m.idle === 1) return;
    r.local = m.lo === 1; r.playing = m.pl === 1;
    if (r.local) { r.id = ''; player && player.pause(); say('The host is playing a song from their phone – waiting'); return; }
    const id = String(m.id || '');
    if (!validId(id)) return;
    const delay = 150 + age, isNew = id !== r.id;
    r.id = id; r.title = clip(m.ti, 200); r.artist = clip(m.ar, 200);
    const th = clip(m.th, 600); r.thumb = th.startsWith('https://') ? th : kindOf(id) === 'yt' ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' : '';
    r.dur = Math.max(0, Math.min(43200000, m.du || 0));
    r.pos = Math.max(0, Math.min(43200000, (m.po || 0) + (r.playing ? delay : 0)));
    r.at = performance.now(); r.isNew = true;
    if (m.sk === 1 && !isNew) r.seek = true;
    if (isNew) { g.loadCool = 0; g.loads = 0; r.seek = false; g.bigTries = 0; }
    if (age < 4000) enforce();
  }
  function expected(now) { let e = r.pos + (r.playing ? now - r.at : 0); if (r.dur > 3000 && e > r.dur - 400) e = r.dur - 400; return e; }
  function enforce() {
    if (!player || !player.ready || !r.id || r.local) return;
    const now = performance.now(), exp = expected(now);
    if (player.id() !== r.id) {
      if (now < g.loadCool || g.loads >= 3) return;
      player.load(r.id, exp / 1000, r.playing); g.loads++; g.loadCool = now + 5000; g.seekCool = now + 8000; g.steadySince = 0; r.isNew = false; return;
    }
    g.loads = 0;
    const pl = player.playing();
    if (r.playing && !pl) { g.steadySince = 0; if (now >= g.loadCool) player.play(); }
    else if (!r.playing && pl) { g.steadySince = 0; player.pause(); }
    if (pl && !g.steadySince) g.steadySince = now;
    const pos = player.time() * 1000; if (pos < 0) return;
    const drift = pos - exp; g.drift = drift;
    const jump = () => { player.seek(Math.max(0, exp + (r.playing ? g.lead : 0)) / 1000); g.steadySince = 0; g.checkLead = r.playing; };
    if (r.seek) { r.seek = false; if (Math.abs(drift) > 800) { jump(); g.seekCool = now + 5000; } return; }
    if (now < g.seekCool) return;
    const steady = !r.playing || (pl && g.steadySince && now - g.steadySince > 6000);
    if (steady && Math.abs(drift) < 1500) g.bigTries = 0;
    if (g.checkLead && steady && Math.abs(drift) < 5000) { g.lead = Math.max(0, Math.min(4000, g.lead - drift)); g.checkLead = false; }
    let big = Math.abs(drift) > 5000 && now >= g.loadCool;
    if (big && g.bigTries >= 2) big = false;
    if (big) { g.bigTries++; jump(); g.seekCool = now + 8000; return; }
    if (steady && Math.abs(drift) > (r.playing ? 1500 : 1000)) {
      if (now - g.firstCorr > 120000) { g.corrections = 0; g.firstCorr = now; }
      if (g.corrections >= 3) return;
      g.corrections++; jump(); g.seekCool = now + 20000;
    }
  }
  // ---- the host's up-next list (Together.hostQueue / mirror), song requests (sendQueued) and edits (guestEdit)
  const FS = '\u001f', RS = '\u001e';
  const jhash = str => { let h = 0; for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; return h; };   // Java String.hashCode
  function mirror(q) {
    q = q.slice(0, 4000); st.qRaw = q; st.rQh = jhash(q); st.rQhSet = true; st.hostQh = st.rQh; st.hostQhSet = true; st.qMis = 0;
    st.qList = q ? q.split(RS).map(one => { const f = one.split(FS); return { id: f[0], ti: f[1] || '', ar: f[2] || '', du: +f[3] || 0, th: (f[4] || '').startsWith('https://') ? f[4] : (kindOf(f[0]) === 'yt' ? 'https://i.ytimg.com/vi/' + f[0] + '/hqdefault.jpg' : '') }; }).filter(x => validId(x.id)) : [];
    TG.onQueue && TG.onQueue(st.qList.slice());
  }
  function checkQueueHash(now) {
    if (st.hostCap < CAP || !st.hostQhSet || !st.hostId) return;
    const ok = st.rQhSet ? st.rQh === st.hostQh : st.hostQh === 0;
    if (ok) { st.qMis = 0; return; }
    if (!st.qMis) { st.qMis = now; return; }
    if (now - st.qMis < 3500 || now - st.lastQr < 6000) return;
    st.lastQr = now; send(msg('qr'));
  }
  function request(song, next) {
    if (!st.on) return false;
    const qi = rnd(8), body = { nx: next ? 1 : 0, id: song.id || '', ti: clip(song.ti, 200), ar: clip(song.ar, 200), al: clip(song.al, 200), th: clip(song.th, 600), du: song.du || 0, qi };
    if (song.lk) body.lk = clip(song.lk, 600);
    st.pend.push({ qi, body, at: performance.now(), tries: 1 }); if (st.pend.length > 12) st.pend.shift();
    send(msg('q', body)); return !!st.hostId;
  }
  function resend(now) {
    for (let i = st.pend.length - 1; i >= 0; i--) {
      const p = st.pend[i];
      if (st.hostCap < CAP) { st.pend.splice(i, 1); continue; }          // an older host doesn't confirm: sent once
      if (now - p.at < 3200) continue;
      if (p.tries >= 5) { st.pend.splice(i, 1); say('The host didn\u2019t get \u201C' + clip(p.body.ti, 50) + '\u201D \u2013 try again'); continue; }
      p.tries++; p.at = now; send(msg('q', p.body));
    }
  }
  function search(q) {
    if (!st.on || !st.hostId) return 'nohost';
    if (st.hostCap < 4) return 'old';
    st.searchId = rnd(6); send(msg('sr', { qy: clip(q, 120), ri: st.searchId })); return 'ok';
  }
  function edit(ids) {
    if (!st.on || !st.hostId) return 'nohost';
    if (st.hostCap < CAP) return 'old';
    send(msg('qe', { q: ids.join(RS), b: st.rQh }));
    st.qList = ids.map(id => st.qList.find(x => x.id === id)).filter(Boolean); TG.onQueue && TG.onQueue(st.qList.slice());
    return 'ok';
  }
  let tickId = 0, sayFn = () => {};
  function say(s) { sayFn(s); }
  function tick() {
    if (!st.on) return;
    const now = performance.now();
    if (now - st.startedAt > 4 * 3600 * 1000) { say('Listening together timed out'); leave(true); return; }
    enforce();
    if (!st.welcomed && now - st.lastHi > (now - st.startedAt < 60000 ? 6000 : 20000)) hi();
    resend(now); checkQueueHash(now);
    if (st.hostId && now - st.lastPing > 20000) { st.lastPing = now; send(msg('pg', { ok: player && player.id() === r.id ? 1 : 0, pl: player && player.playing() ? 1 : 0 })); }
    if (!st.hostId && now - st.startedAt > 20000 && !st.warned) { st.warned = true; say(st.up.some(x => x) ? 'No host found yet – check the code, and that your friend has the session open' : "Can't reach the connection – check your internet"); }
    ui();
  }
  async function join(code, p, onUi, onSay) {
    code = clean(code); if (code.length < 4) throw new Error('code');
    player = p; ui = onUi; sayFn = onSay;
    const d = await derive(code);
    Object.assign(st, { on: true, topic: d.topic, key: d.key, hostId: null, welcomed: false, term: 0, startedAt: performance.now(), warned: false });
    st.lastSeq.clear(); st.lags.clear(); st.seen = []; st.pend = []; st.qList = []; st.qRaw = null; st.rQhSet = false; st.hostQhSet = false; st.hostCap = 0;
    for (let i = 0; i < RELAYS.length; i++) listen(i);
    tickId = setInterval(tick, 500);
  }
  function leave(tell) {
    if (!st.on) return;
    if (tell) send(msg('by', { h: 0 }));
    st.on = false; clearInterval(tickId); st.src.forEach(e => e && e.close()); st.src = []; st.up = [false, false];
    player && player.pause(); r.id = ''; ui();
  }
  function react(kind) { if (st.on && st.hostId) send(msg('rx', { e: kind === 'nope' ? 2 : 1, c: 1, s: r.id })); }
  return { join, leave, react, clean, request, edit, search, validId, kindOf, urlOf, b64url, hostFinds: () => st.hostCap >= 3, queue: () => st.qList.slice(), canEdit: () => st.hostCap >= CAP, state: () => ({ on: st.on, up: st.up.slice(), host: !!st.hostId, welcomed: st.welcomed, song: Object.assign({}, r), drift: g.drift, exp: r.id ? expected(performance.now()) : 0 }),
           _test: { derive, seal, open } };
})();
if (typeof module !== 'undefined') module.exports = TG;

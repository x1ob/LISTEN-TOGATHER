// A. Music – Listening together, web guest. Speaks protocol v1 of the app (Together.java):
//  code -> PBKDF2-SHA256("accord-together-v1", 30000 rounds, 48 bytes): topic "atg"+hex(first 16), AES-256-GCM key (next 32)
//  messages: 12-byte nonce + ciphertext+tag, AAD "accord-tg", base64; JSON with k f n w v t
//  relays: ntfy.sh and ntfy.envs.net, every message through both.
'use strict';
const TG = (() => {
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', PROTO = 1, CAP = 2;
  const RELAYS = ['https://ntfy.sh/', 'https://ntfy.envs.net/'];
  // second kind of relay: public MQTT brokers over secure WebSocket. ntfy lets an address send only about 250 messages a
  // day; when that is used up every message is refused and nobody can connect. These have no daily cap.
  const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
  const MQTT_JS = 'https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js';
  let mq = [];
  function mqttStart() {
    if (!window.mqtt) {
      if (!document.getElementById('mqttjs')) { const t = document.createElement('script'); t.id = 'mqttjs'; t.src = MQTT_JS; t.onload = () => st.on && mqttStart(); t.onerror = () => note('could not load the MQTT library'); document.head.appendChild(t); }
      return;
    }
    mqttStop();
    const topic = 'amusic/tg/' + st.topic;
    BROKERS.forEach((url, j) => {
      const i = RELAYS.length + j;
      try {
        const c = window.mqtt.connect(url, { clientId: 'amw' + Math.random().toString(16).slice(2, 12), clean: true, keepalive: 30, reconnectPeriod: 3000, connectTimeout: 10000, protocolVersion: 4 });
        c.on('connect', () => { c.subscribe(topic, { qos: 0 }); st.up[i] = true; st.lastOpenAt = performance.now(); note('connected to ' + url.split('/')[2]); if (!st.welcomed) hi(); ui(); });
        c.on('close', () => { if (st.up[i]) note(url.split('/')[2] + ' closed'); st.up[i] = false; ui(); });
        c.on('error', () => {});
        c.on('message', (tp, payload) => { const b = payload.toString(); if (b.length <= 9000) incoming(b); });
        mq[j] = c;
      } catch (e) { note('MQTT ' + url + ' failed'); }
    });
  }
  function mqttStop() { mq.forEach(c => { try { c.end(true); } catch (e) {} }); mq = []; }
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

  const st = { on: false, topic: '', key: null, seq: 0, term: 0, hostId: null, hostAt: 0, welcomed: false, up: [false, false, false, false], src: [],
    seen: [], lastSeq: new Map(), hostCap: 0, qRaw: null, qList: [], rQh: 0, rQhSet: false, hostQh: 0, hostQhSet: false, qMis: 0, lastQr: 0, pend: [], lags: new Map(), lastOpenAt: 0, rate: 0, rateAt: 0, lastHi: 0, lastPing: 0, startedAt: 0 };
  let ui = () => {}, player = null;

  function msg(k, extra) { return Object.assign({ k, f: DEV, n: ++st.seq, w: Date.now(), v: PROTO, t: st.term }, extra || {}); }
  async function send(m) {
    if (!st.key) return;
    const body = await seal(JSON.stringify(m), st.key);
    mq.forEach(c => { try { if (c.connected) c.publish('amusic/tg/' + st.topic, body, { qos: 0 }); } catch (e) {} });
    // a relay that answers "too many requests" (429) rests for a while; the other one carries the messages
    const now = performance.now(), up = RELAYS.map((_, i) => now >= (rest.until[i] || 0)), anyUp = up.some(x => x);
    RELAYS.forEach((r, i) => {
      if (anyUp && !up[i]) return;
      fetch(r + st.topic, { method: 'POST', body }).then(res => {
        if (res.status === 429 && !(performance.now() < (rest.until[i] || 0))) { rest.for[i] = Math.min(600000, (rest.for[i] || 30000) * 2); rest.until[i] = performance.now() + rest.for[i]; note(r.replace('https://', '') + ' busy - resting ' + Math.round(rest.for[i] / 1000) + ' s'); }
        else if (res.ok) { rest.for[i] = 0; sentOk[i] = (sentOk[i] || 0) + 1; }
        else { sentBad[i] = (sentBad[i] || 0) + 1; if (sentBad[i] < 4) note(r.replace('https://', '') + ' refused a message: HTTP ' + res.status); }
      }).catch(e => { sentBad[i] = (sentBad[i] || 0) + 1; if (sentBad[i] < 4) note(r.replace('https://', '') + ' could not be reached: ' + e.message); });
    });
  }
  const sentOk = [], sentBad = [];
  const rest = { until: [], for: [] };
  function fresh(id) { if (!id) return true; if (st.seen.includes(id)) return false; st.seen.push(id); if (st.seen.length > 60) st.seen.shift(); return true; }

  function listen(i) {
    const es = new EventSource(RELAYS[i] + st.topic + '/sse');
    st.src[i] = es;
    es.onopen = () => { note('relay ' + RELAYS[i].split('/')[2] + ' open'); st.up[i] = true; st.lastOpenAt = performance.now(); if (!st.welcomed) hi(); ui(); };
    es.onerror = () => { if (st.up[i]) note('relay ' + RELAYS[i].split('/')[2] + ' dropped'); st.up[i] = false; ui(); };
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
    if (++st.rate > 150) return;                 // (each message can arrive once per relay)
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
  const r = { id: '', title: '', artist: '', thumb: '', mv: '', dur: 0, pos: 0, at: 0, playing: false, local: false, seek: false, isNew: false };
  const g = { manual: false, pauseSeen: 0, stuckSince: 0, retries: 0, ad: false, lastT: -1, lastTAt: 0, loadCool: 0, seekCool: 0, steadySince: 0, lead: 150, checkLead: false, bigTries: 0, corrections: 0, firstCorr: 0, loads: 0, drift: 0, unplayable: '' };
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
    if (r.local) { r.id = ''; r.title = clip(m.ti, 200); r.artist = clip(m.ar, 200); r.thumb = ''; player && player.pause(); say('The host is playing a song from their phone \u2013 finding it online\u2026'); return; }
    const id = String(m.id || '');
    if (!validId(id)) return;
    const delay = 150 + age, isNew = id !== r.id;
    r.id = id; r.title = clip(m.ti, 200); r.artist = clip(m.ar, 200);
    const mv = clip(m.mv, 700); r.mv = /^https:\/\/[^\s"'<>]+$/.test(mv) ? mv : (isNew ? '' : r.mv);
    const th = clip(m.th, 600); r.thumb = th.startsWith('https://') ? th : kindOf(id) === 'yt' ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' : '';
    r.dur = Math.max(0, Math.min(43200000, m.du || 0));
    r.pos = Math.max(0, Math.min(43200000, (m.po || 0) + (r.playing ? delay : 0)));
    r.at = performance.now(); r.isNew = true;
    if (m.sk === 1 && !isNew) { r.seek = true; if (m.hs === 1) g.manual = true; }
    if (isNew) { g.loadCool = 0; g.loads = 0; r.seek = false; g.bigTries = 0; g.retries = 0; g.stuckSince = 0; }
    if (age < 4000) enforce();
  }
  function expected(now) { let e = r.pos + (r.playing ? now - r.at : 0); if (r.dur > 3000 && e > r.dur - 400) e = r.dur - 400; return e; }
  // a short record of what the follower did, for the About page's "Copy sync report"
  const notes = [];
  function note(t) { const d = new Date(); notes.push(d.toTimeString().slice(0, 8) + '  ' + t); if (notes.length > 150) notes.shift(); }
  function enforce() {
    if (!player || !player.ready || !r.id || r.local) return;
    const now = performance.now(), exp = expected(now);
    if (player.id() !== r.id) {
      if (now < g.loadCool || g.loads >= 3) return;
      g.started = false; note('load ' + r.id + ' at ' + Math.round(exp / 1000) + ' s' + (r.playing ? '' : ' (paused)')); player.load(r.id, exp / 1000, r.playing); g.loads++; g.loadCool = now + 5000; g.seekCool = now + 8000; g.steadySince = 0; r.isNew = false; return;
    }
    const pl = player.playing();
    // loaded but the song never starts (blocked or stuck while buffering): load it again, up to 3 times a song
    // (not while it is simply buffering a moment, and never at the end of the song: that would restart it)
    const ps = player.state ? player.state() : -9, nearEnd = r.dur > 0 && exp > r.dur - 4000;
    // Only when the player never got going at all (still "not started" or "cued"): once anything played, that may be a
    // YouTube ad, and loading again only brings another ad (iPhone, 23 Nov: ads after ads).
    if (ps === 1 || ps === 2 || ps === 3) g.started = true;
    if (r.playing && !pl && !g.ad && !g.started && (ps === -1 || ps === 5) && !nearEnd) {
      if (!g.stuckSince) g.stuckSince = now;
      else if (now - g.stuckSince > 10000 && now >= g.loadCool && g.retries < 1) {
        g.retries++; g.stuckSince = 0; note('song did not start (state ' + ps + ') - load again'); say('Starting the song again\u2026');
        player.load(r.id, exp / 1000, true); g.loadCool = now + 5000; g.seekCool = now + 8000; g.steadySince = 0; return;
      }
    } else g.stuckSince = 0;
    g.loads = 0;
    if (r.playing && !pl) { g.steadySince = 0; if (now >= g.loadCool) player.play(); }
    else if (!r.playing && pl) {
      // the host says "not playing" for a moment at every song change: only stop for a pause that lasts
      if (!g.pauseSeen) g.pauseSeen = now;
      if (now - g.pauseSeen > 700) { g.steadySince = 0; note('host paused - pause'); player.pause(); }
    }
    if (r.playing || !pl) g.pauseSeen = 0;
    if (pl && !g.steadySince) g.steadySince = now;
    const pos = player.time() * 1000; if (pos < 0) return;
    // an ad: the player says it is playing but the song's clock stands still. Hold the sync until the song runs again.
    if (pl && r.playing) {
      if (Math.abs(pos - g.lastT) > 20) { g.lastT = pos; g.lastTAt = now; if (g.ad) { g.ad = false; g.seekCool = 0; g.bigTries = 0; } }
      else if (now - g.lastTAt > 1800) { if (!g.ad) note('clock stopped while playing (ad?) - sync held'); g.ad = true; }
    } else { g.lastT = pos; g.lastTAt = now; }
    if (g.ad) { g.drift = 0; return; }
    const drift = pos - exp; g.drift = drift;
    const jump = () => { note('jump: ' + Math.round(drift) + ' ms off'); player.seek(Math.max(0, exp + (r.playing ? g.lead : 0)) / 1000); g.steadySince = 0; g.checkLead = r.playing; };
    if (r.seek) { r.seek = false; const hand = g.manual; g.manual = false; if (Math.abs(drift) > (hand ? 250 : 800)) { jump(); g.seekCool = now + 5000; } return; }
    if (now < g.seekCool) return;
    const steady = !r.playing || (pl && g.steadySince && now - g.steadySince > 6000);
    if (steady && Math.abs(drift) < 1500) g.bigTries = 0;
    if (g.checkLead && steady && Math.abs(drift) < 5000) { g.lead = Math.max(0, Math.min(4000, g.lead - drift)); g.checkLead = false; }
    let big = Math.abs(drift) > 5000 && now >= g.loadCool;
    if (big && g.bigTries >= 2) big = false;
    if (big) { g.bigTries++; jump(); g.seekCool = now + 8000; return; }
    // small drift is left alone (a jump is a hiccup you hear); clearly off is fixed, at most once every 45 s
    if (steady && Math.abs(drift) > (r.playing ? 2500 : 1000)) {
      if (now - g.firstCorr > 120000) { g.corrections = 0; g.firstCorr = now; }
      if (g.corrections >= 3) return;
      g.corrections++; jump(); g.seekCool = now + 45000;
    }
  }
  // ---- the host's up-next list (Together.hostQueue / mirror), song requests (sendQueued) and edits (guestEdit)
  const FS = '\u001f', RS = '\u001e';
  const isPhone = id => /^-l[A-Za-z0-9_-]{1,30}$/.test(id);       // a song from the host's phone (its online version plays when it starts)
  const jhash = str => { let h = 0; for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; return h; };   // Java String.hashCode
  function mirror(q) {
    q = q.slice(0, 4000); st.qRaw = q; st.rQh = jhash(q); st.rQhSet = true; st.hostQh = st.rQh; st.hostQhSet = true; st.qMis = 0;
    st.qList = q ? q.split(RS).map(one => { const f = one.split(FS); return { id: f[0], ti: f[1] || '', ar: f[2] || '', du: +f[3] || 0, th: (f[4] || '').startsWith('https://') ? f[4] : (kindOf(f[0]) === 'yt' && validId(f[0]) ? 'https://i.ytimg.com/vi/' + f[0] + '/hqdefault.jpg' : ''), phone: isPhone(f[0]) }; }).filter(x => validId(x.id) || x.phone) : [];
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
    send(msg('qe', { q: ids.join(RS), b: st.rQh, al: 1 }));
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
    // tell the host how we are doing: every 20 s, and at once (at most every 1.5 s) when it changes, so its dot is honest
    if (st.hostId) {
      const ok = player && r.id && player.id() === r.id && player.time() >= 0 ? 1 : 0, pl = player && player.playing() ? 1 : 0, pst = ok * 2 + pl;
      if (now - st.lastPing > 20000 || (pst !== st.lastPst && now - st.lastPing > 1500)) { st.lastPing = now; st.lastPst = pst; send(msg('pg', { ok, pl })); }
    }
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
    mqttStart();
    tickId = setInterval(tick, 500);
  }
  function leave(tell) {
    if (!st.on) return;
    if (tell) send(msg('by', { h: 0 }));
    st.on = false; clearInterval(tickId); st.src.forEach(e => e && e.close()); st.src = []; mqttStop(); st.up = [false, false, false, false];
    player && player.pause(); r.id = ''; ui();
  }
  function react(kind) { if (st.on && st.hostId) send(msg('rx', { e: kind === 'nope' ? 2 : 1, c: 1, s: r.id })); }
  const report = () => 'A. Music Together web 1.0 - ' + navigator.userAgent + '\nhost ' + (st.hostId ? 'yes' : 'no') + ', song ' + (r.id || '-') + ', drift ' + Math.round(g.drift || 0) + ' ms\nrelays: ' + RELAYS.map((x, k) => x.split('/')[2] + (st.up[k] ? ' up' : ' down') + ' sent ' + (sentOk[k] || 0) + ' ok/' + (sentBad[k] || 0) + ' bad').join('; ') + '; ' + BROKERS.map((x, k) => x.split('/')[2] + (st.up[RELAYS.length + k] ? ' up' : ' down')).join('; ') + '\n' + notes.join('\n');
  const syncNow = () => { if (!st.on || !r.id) return false; r.seek = true; g.manual = true; g.seekCool = 0; g.corrections = 0; g.bigTries = 0; note('synced by a tap on the badge'); return true; };
  return { syncNow, report, join, leave, react, clean, request, edit, search, validId, kindOf, urlOf, b64url, hostFinds: () => st.hostCap >= 3, queue: () => st.qList.slice(), canEdit: () => st.hostCap >= CAP, state: () => ({ on: st.on, up: st.up.slice(), host: !!st.hostId, welcomed: st.welcomed, song: Object.assign({}, r), drift: g.drift, ad: g.ad, exp: r.id ? expected(performance.now()) : 0 }),
           _test: { derive, seal, open } };
})();
if (typeof module !== 'undefined') module.exports = TG;

/* HBRT Agro web dashboard (firmware 6.0+).
   Talks to the greenhouse through Firebase:
     /hbrt/<key>/live      s (readings), cfg, wx (weather), use (water/power), ev (timeline)   streamed
     /hbrt/<key>/in/cmd    commands        /in/seen  "someone is watching"
     /hbrt/<key>/log       5-minute history, 7 days
     /hbrt/<key>/journal   team journal (+ /photos)
   A view-only link (#v=...) reads a copy at /hbrt/<viewKey> and can't send commands.        */
"use strict";

const $ = id => document.getElementById(id);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------------- language + theme ---------------- */
let LANG = LS.get("hbrt.lang", null) || (navigator.language || "en").slice(0, 2);
if (!window.I18N || !I18N[LANG]) LANG = "en";
let LOC = "en-GB";
function t(k, ...a) {
  const s = (I18N[LANG] && I18N[LANG][k]) ?? I18N.en[k] ?? k;
  return s.replace(/\{(\d)\}/g, (m, i) => a[i] ?? "");
}
function setLang(l) {
  LANG = I18N[l] ? l : "en";
  LOC = LANG === "en" ? "en-GB" : LANG + "-AF-u-nu-latn";
  LS.set("hbrt.lang", LANG);
  document.documentElement.lang = LANG;
  document.documentElement.dir = LANG === "en" ? "ltr" : "rtl";
}
function setTheme(th) {
  LS.set("hbrt.theme", th);
  if (th === "light" || th === "dark") document.documentElement.setAttribute("data-theme", th);
  else document.documentElement.removeAttribute("data-theme");
  const dark = th === "dark" || (th === "system" && !matchMedia("(prefers-color-scheme: light)").matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? "#08130e" : "#f2f6f3";
}
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/* ---------------- icons ---------------- */
const ICON = {
  fan: '<svg viewBox="0 0 24 24" fill="currentColor"><g class="blades"><circle cx="12" cy="12" r="2"/><path d="M12 10c0-4.5 1-7 3.6-7 2.4 0 2.8 3.2 0 5.3ZM14 12c4.5 0 7 1 7 3.6 0 2.4-3.2 2.8-5.3 0ZM12 14c0 4.5-1 7-3.6 7-2.4 0-2.8-3.2 0-5.3ZM10 12c-4.5 0-7-1-7-3.6 0-2.4 3.2-2.8 5.3 0Z"/></g></svg>',
  drop: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2ZM9 19h6v1.5a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 20.5Z"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c1.2 4 5.5 6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.7 1.3-4.2 2.7-5.6 0 1.8.9 2.9 1.8 2.9 0-2.9-.9-5.7 1-8.3Z"/></svg>',
  vent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10l10-2M7 15l10-2"/></svg>',
  power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3v8"/><path d="M7 6.5a8 8 0 1 0 10 0"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z"/></svg>',
  control: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"><rect x="3" y="7" width="18" height="10" rx="5"/><circle cx="16" cy="12" r="2.5"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16M6 16l4-5 3 3 5-7"/></svg>',
  journal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3Z"/><path d="M5 17a3 3 0 0 1 3-3h11"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 9a4.5 4.5 0 0 1 0 9Z"/></svg>',
  rain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 5a4.5 4.5 0 0 1 0 9Z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/></svg>',
  snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/></svg>',
  storm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 5a4.5 4.5 0 0 1 0 9"/><path d="m13 12-3 5h4l-3 5"/></svg>',
  fog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h16M3 13h18M6 17h12"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
  tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3"/></svg>',
  basket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 10h18l-2 10H5Z"/><path d="m8 10 4-6 4 6"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4Z"/><circle cx="12" cy="13" r="3.5"/></svg>',
};
const wxIcon = c => ICON[["sun", "cloud", "cloud", "fog", "rain", "rain", "snow", "rain", "storm"][c]];
const wxKind = code => code === 0 ? 0 : code <= 2 ? 1 : code === 3 ? 2 : code <= 48 ? 3 : code <= 57 ? 4 : code <= 67 ? 5 : code <= 77 ? 6 : code <= 82 ? 7 : code <= 86 ? 6 : 8;

const DEV = [
  { d: "fan", c: "--hum", i: "fan" },
  { d: "pump", c: "--tank", i: "drop" },
  { d: "lights", c: "--light", i: "bulb" },
  { d: "heater", c: "--heat", i: "flame" },
  { d: "servo", c: "--vent", i: "vent" },
];
const CROPS = { tomato: [10, 1250], cucumber: [10, 850], pepper: [10, 1300], lettuce: [4, 900], strawberry: [7, 1100], herbs: [10, 700] };
const PRESETS = { tomato: [18, 30, 75, 40], cucumber: [20, 32, 80, 50], pepper: [20, 30, 70, 40], lettuce: [10, 24, 70, 45], strawberry: [15, 26, 75, 45], herbs: [16, 28, 65, 35] };
const STAGES = ["seedling", "growing", "flowering", "fruiting", "harvest"];
const ALERTS = ["hot", "cold", "humid", "dry", "tank", "lock", "dht", "st", "frost"];
const SENS = [["T", "m_air_temp"], ["H", "m_hum"], ["S", "m_soil_moist"], ["ST", "m_soil_temp"], ["W", "m_water_tank"]];

/* ---------------- state ---------------- */
const STORE = "hbrt.greenhouses";
const S = {
  list: [], cur: null, ro: false, es: null, live: {}, lastT: 0, at: 0, skew: 0, link: "connecting",
  view: "home", log: [], logAt: 0, journal: null, beat: null, pending: {}, prevAl: null,
  series: "T", range: 24, compare: false, tlFilter: "all", built: {}, fwLatest: null, spark: [],
};

/* ---------------- greenhouse list ---------------- */
function parseRef(s) {
  const m = /(?:#([gv])=)?([A-Za-z0-9]{16,})@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/.exec(s || "");
  if (!m) return null;
  return { key: m[2], db: m[3], ro: m[1] === "v" || m[2].startsWith("gv") };
}
function loadList() { S.list = LS.get(STORE, []); }
function saveList() { LS.set(STORE, S.list); }
function addRef(ref) {
  let g = S.list.find(x => x.key === ref.key);
  if (!g) { g = { key: ref.key, db: ref.db, ro: !!ref.ro, name: "" }; S.list.push(g); saveList(); }
  return g;
}
const base = g => `https://${g.db}/hbrt/${g.key}`;
const page = () => location.origin + location.pathname;
const ctrlLink = g => `${page()}#g=${g.key}@${g.db}`;
const viewLink = (g, vk) => `${page()}#v=${vk}@${g.db}`;

/* ---------------- connection ---------------- */
function open(g) {
  close();
  Object.assign(S, { cur: g, ro: !!g.ro, live: {}, gotPut: false, lastT: 0, at: 0, pending: {}, log: [], logAt: 0, journal: null, prevAl: null, spark: [] });
  S.built = {};
  LS.set(STORE + ".cur", g.key);
  showApp();
  setLink("connecting");
  const es = new EventSource(base(g) + "/live.json");
  S.es = es;
  const on = type => e => { if (S.es !== es) return; try { const j = JSON.parse(e.data); apply(type, j.path, j.data); } catch (x) {} };
  es.addEventListener("put", on("put"));
  es.addEventListener("patch", on("patch"));
  es.addEventListener("cancel", () => { setLink("denied"); es.close(); });
  es.onopen = () => setLink("online");
  es.onerror = () => { if (S.es === es) setLink(navigator.onLine ? "reconnecting" : "nonet"); };
  beat();
  S.beat = setInterval(beat, 20000);
  renderAll();
}
function close() {
  if (S.es) S.es.close();
  S.es = null;
  clearInterval(S.beat);
}
async function beat() {
  const g = S.cur;
  if (!g || document.hidden) return;
  const t0 = Date.now();
  try {
    const r = await fetch(base(g) + (S.ro ? "/seen.json" : "/in/seen.json"), { method: "PUT", body: '{".sv":"timestamp"}' });
    const v = await r.json();
    if (typeof v === "number") S.skew = v - (t0 + Date.now()) / 2;
  } catch (e) {}
}
function apply(type, path, data) {
  const parts = (path || "/").split("/").filter(Boolean);
  if (type === "put") S.gotPut = true;
  if (!parts.length) {
    if (type === "put") S.live = data && typeof data === "object" ? data : {};
    else Object.assign(S.live, data || {});
  } else {
    let n = S.live;
    for (const p of parts.slice(0, -1)) n = n[p] = n[p] && typeof n[p] === "object" ? n[p] : {};
    const leaf = parts[parts.length - 1];
    if (data === null) delete n[leaf];
    else if (type === "patch" && data && typeof data === "object") n[leaf] = Object.assign(n[leaf] && typeof n[leaf] === "object" ? n[leaf] : {}, data);
    else n[leaf] = data;
  }
  const s = S.live.s;
  if (s && s.t && s.t !== S.lastT) {
    S.lastT = s.t;
    S.at = Math.min(Date.now(), s.t - S.skew);
    S.pending = {};
    S.spark.push({ T: s.temperature, H: s.humidity, S: s.soil, W: s.water });
    if (S.spark.length > 60) S.spark.shift();
    if (s.name && s.name !== S.cur.name) { S.cur.name = s.name; saveList(); }
    notifyAlerts(s);
  }
  scheduleRender();
}
async function send(obj) {
  const g = S.cur;
  if (!g || S.ro) return false;
  try {
    const r = await fetch(base(g) + "/in/cmd.json", { method: "POST", body: JSON.stringify(Object.assign({}, obj, { t: { ".sv": "timestamp" } })) });
    if (!r.ok) throw 0;
    beat();
    return true;
  } catch (e) { toast(t("not_sent")); return false; }
}
const boardUp = () => S.at && Date.now() - S.at < 35000;
const live = () => S.link === "online" && boardUp() && !S.ro;

/* ---------------- derived values ---------------- */
const cfg = () => Object.assign({ tempMax: 35, tempMin: 15, humMax: 60, soilMin: 30, waterMin: 5, pumpMax: 60, lightSched: false, lightOn: 360, lightOff: 1200, sched: [], rules: [], watt: {}, cal: {}, flowMl: 20, tankL: 20 }, S.live.cfg || {});
const fmt = (v, d = 0) => typeof v === "number" && isFinite(v) ? v.toFixed(d) : "--";
const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const mins = v => { const [h, m] = (v || "0:0").split(":").map(Number); return ((h || 0) * 60 + (m || 0)) % 1440; };
const devName = d => t("d_" + (d === "vent" ? "servo" : d));
const modeName = m => t("mode_" + (m || "auto"));
function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 5 ? t("just_now") : s < 60 ? t("ago_s", s) : s < 3600 ? t("ago_m", Math.round(s / 60)) : s < 86400 ? t("ago_h", Math.round(s / 3600)) : t("ago_d", Math.round(s / 86400));
}
function dur(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
  return h >= 24 ? t("dur_dh", Math.floor(h / 24), h % 24) : t("dur_hm", h, m);
}
const timeStr = ms => new Date(ms).toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit" });
const dateStr = (ms, o) => new Date(ms).toLocaleDateString(LOC, o || { day: "numeric", month: "short" });
const wday = d => new Intl.DateTimeFormat(LOC, { weekday: "short" }).format(d);

function alertText(a, s) {
  const v = { hot: fmt(s.temperature, 1), cold: fmt(s.temperature, 1), humid: fmt(s.humidity), dry: fmt(s.soil), frost: fmt((S.live.wx?.d || [])[1]?.min) };
  return t("al_" + a, v[a]);
}
function health(s) {
  const l = cfg();
  const off = (v, lo, hi, span) => v < lo ? Math.min(1, (lo - v) / span) : v > hi ? Math.min(1, (v - hi) / span) : 0;
  let x = 100;
  if (s.dhtOk !== false) { x -= 30 * off(s.temperature, l.tempMin, l.tempMax, 8); x -= 15 * off(s.humidity, 30, l.humMax, 20); } else x -= 25;
  x -= 35 * off(s.soil, l.soilMin, 100, 20);
  x -= 15 * off(s.water, l.waterMin + 10, 100, 15);
  if (s.stOk === false) x -= 5;
  return Math.round(clamp(x, 0, 100));
}
function summary(s) {
  const al = s.al || [];
  if (s.watering > 0) return t("sum_watering", s.watering);
  if (al.length) return alertText(al[0], s);
  if (s.pump) return t("sum_pump");
  if (s.fan && s.servo) return t("sum_cool");
  if (s.heater) return t("sum_heat");
  return t("sum_good");
}
function vpd(T, RH) { const es = 0.6108 * Math.exp(17.27 * T / (T + 237.3)); return es * (1 - RH / 100); }
function dew(T, RH) { const g = Math.log(Math.max(1, RH) / 100) + 17.62 * T / (243.12 + T); return 243.12 * g / (17.62 - g); }
function vpdBand(stage) { return stage === "seedling" ? [0.4, 0.8] : stage === "growing" ? [0.8, 1.2] : stage === "flowering" || stage === "fruiting" ? [1.0, 1.5] : [0.8, 1.2]; }
function growth(s) {
  const c = cfg();
  if (!c.crop || !CROPS[c.crop]) return null;
  const gH = s.gddH || CROPS[c.crop][1], g = s.gdd || 0, day = s.day ?? 0;
  const frac = clamp(g / gH, 0, 1);
  const rate = day > 3 && g > 0 ? g / day : 12;
  const left = Math.max(0, (gH - g) / Math.max(1, rate));
  return { crop: c.crop, stage: s.stage || STAGES[0], day, frac, totalDays: Math.round(day + left), harvest: Date.now() + left * 86400000, g, gH };
}

/* ---------------- link state + banner ---------------- */
function setLink(st) { S.link = st; renderTop(); }
function renderTop() {
  const up = boardUp(), on = S.link === "online" && up;
  $("dot").className = "dot" + (on ? " on" : "");
  $("stateTxt").textContent = S.ro ? (on ? t("view_only") : t("offline")) :
    S.link === "online" ? (up ? t("live") : S.at ? t("offline") : t("waiting")) :
    S.link === "denied" ? t("no_access") : S.link === "nonet" ? t("no_internet") : t("connecting");
  $("ghName").textContent = S.live.s?.name || S.cur?.name || "Greenhouse";
  const b = $("banner");
  let msg = "", ro = false;
  if (S.link === "denied") msg = t("banner_denied");
  else if (S.link === "nonet") msg = t("banner_nonet");
  else if (S.link === "reconnecting") msg = t("banner_reconnecting");
  else if (S.link === "online" && S.at && !up) msg = t("banner_board_down", ago(Date.now() - S.at));
  else if (S.ro) { msg = t("view_only_note"); ro = true; }
  b.textContent = msg;
  b.className = "banner" + (msg ? " show" : "") + (ro ? " ro" : "");
}

/* ---------------- rendering ---------------- */
let rq = 0;
function scheduleRender() { if (!rq) rq = requestAnimationFrame(() => { rq = 0; renderLive(); }); }
function renderAll() {
  S.built = {};
  buildNav();
  renderTop();
  renderLive();
}
function renderLive() {
  renderTop();
  const v = S.view;
  if (v === "home") renderHome();
  else if (v === "control") renderControl();
  else if (v === "timeline") renderTimeline();
  else if (v === "settings") renderSettings();
  else if (v === "history" && !S.built.history) renderHistory();
  else if (v === "journal" && !S.built.journal) renderJournal();
  if ($("exhibit").classList.contains("on")) renderExhibit();
}
function buildNav() {
  const items = [["home", "nav_home"], ["control", "nav_control"], ["history", "nav_history"], ["journal", "nav_journal"], ["settings", "nav_settings"]];
  $("nav").innerHTML = items.map(([v, k]) => `<button data-v="${v}" ${S.view === v ? 'aria-current="page"' : ""}>${ICON[v]}<span>${t(k)}</span></button>`).join("");
  $("nav").querySelectorAll("button").forEach(b => b.onclick = () => view(b.dataset.v));
}
function view(v) {
  S.view = v;
  document.querySelectorAll(".view").forEach(x => x.classList.toggle("on", x.id === "v-" + v));
  document.querySelectorAll("#nav button").forEach(b => b.dataset.v === v || (v === "timeline" && b.dataset.v === "home") ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  S.built[v] = false;
  if (v === "history") { S.built.history = false; loadLog(); }
  if (v === "journal") { S.built.journal = false; loadJournal(); }
  renderLive();
  scrollTo({ top: 0 });
}

/* Replace an element's content only when it changed, then wire its buttons again. */
function put(el, html, wire) {
  if (!el || el._h === html) return false;
  el._h = html;
  el.innerHTML = html;
  if (wire) wire(el);
  return true;
}

/* ---------- the dial: sky, plant and rings ---------- */
function dialSvg(id) {
  const rings = [["T", 142, "--temp"], ["H", 126, "--hum"], ["S", 110, "--soil"], ["W", 94, "--tank"]];
  const arcs = rings.map(([k, r]) => `<circle cx="150" cy="150" r="${r}" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="10"/>`).join("") +
    rings.map(([k, r, c]) => { const C = (2 * Math.PI * r).toFixed(1); return `<circle class="ringarc" data-k="${k}" data-c="${C}" cx="150" cy="150" r="${r}" fill="none" stroke="var(${c})" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 150 150)"/>`; }).join("");
  return `<svg viewBox="0 0 300 300" role="img" aria-label="${esc(t("health_l"))}">
  <defs>
    <radialGradient id="${id}gl"><stop offset="0" stop-color="#ffd86b" stop-opacity=".55"/><stop offset="1" stop-color="#ffd86b" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}gh"><stop offset="0" stop-color="#ff7a3c" stop-opacity=".6"/><stop offset="1" stop-color="#ff7a3c" stop-opacity="0"/></radialGradient>
  </defs>
  ${arcs}
  <g class="plant" id="${id}plant">
    <g class="glow l"><circle cx="150" cy="112" r="74" fill="url(#${id}gl)"/></g>
    <g class="glow h"><ellipse cx="150" cy="226" rx="74" ry="20" fill="url(#${id}gh)"/></g>
    <g class="wind" stroke="#e6f7ff" stroke-width="3" fill="none" stroke-linecap="round"><path d="M74 118h56"/><path d="M66 140h44"/></g>
    <g id="${id}size">
      <g class="sway">
        <path d="M150 192C148 160 152 126 150 94" stroke="#2e8b4a" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path class="leafL lf" d="M150 168C128 154 108 156 96 168C114 178 134 178 150 168Z"/>
        <path class="leafR lf2" d="M150 142C172 126 194 128 206 140C188 152 166 152 150 142Z"/>
        <path class="leafL lf" d="M150 118C134 104 118 102 106 108C118 122 134 126 150 118Z"/>
        <g class="sway2"><path class="lf2" d="M150 98C158 82 174 76 188 79C182 94 166 101 150 98Z"/></g>
        <circle class="flower" cx="150" cy="92" r="6" fill="#ffe27a"/>
        <circle class="flower" cx="114" cy="110" r="4.5" fill="#ffe27a"/>
        <circle class="fruit" cx="186" cy="152" r="9" fill="#ff5e4a"/>
        <circle class="fruit" cx="172" cy="161" r="7" fill="#ff7a59"/>
        <circle class="fruit" cx="114" cy="176" r="7" fill="#ff8a4a"/>
      </g>
    </g>
    <g class="drops" fill="#8fd2ff"><circle cx="138" cy="62" r="3.5"/><circle cx="151" cy="56" r="3.5"/><circle cx="163" cy="62" r="3.5"/></g>
    <path d="M118 192H182L174 226Q173 231 167 231H133Q127 231 126 226Z" fill="#1f8a84"/>
    <rect x="112" y="184" width="76" height="13" rx="6" fill="#2ba89a"/>
    <ellipse id="${id}soil" cx="150" cy="188" rx="33" ry="4" fill="#6b4a2e"/>
  </g>
</svg>`;
}
function updateDial(id, s) {
  const root = id === "h" ? $("v-home") : $("exhibit");
  const frac = { T: clamp((s.temperature || 0) / 45, 0, 1), H: clamp((s.humidity || 0) / 100, 0, 1), S: clamp((s.soil || 0) / 100, 0, 1), W: clamp((s.water || 0) / 100, 0, 1) };
  root.querySelectorAll(".ringarc").forEach(c => { c.style.strokeDashoffset = (c.dataset.c * (1 - frac[c.dataset.k])).toFixed(1); });
  const p = $(id + "plant");
  if (!p) return;
  const h = health(s), l = cfg(), st = s.stage || "";
  const leaf = h >= 80 ? ["#46b764", "#5bd27a"] : h >= 50 ? ["#8fb944", "#a6c95a"] : ["#c0a03a", "#cdb256"];
  p.querySelectorAll(".lf").forEach(e => e.setAttribute("fill", leaf[0]));
  p.querySelectorAll(".lf2").forEach(e => e.setAttribute("fill", leaf[1]));
  p.classList.toggle("droop", s.soil < l.soilMin);
  p.classList.toggle("watering", !!(s.pump || s.watering > 0));
  p.classList.toggle("lit", !!s.lights);
  p.classList.toggle("warm", !!s.heater);
  p.classList.toggle("breeze", !!(s.fan || s.servo));
  p.classList.toggle("flowering", st === "flowering" || st === "fruiting" || st === "harvest");
  p.classList.toggle("fruiting", st === "fruiting" || st === "harvest");
  $(id + "size").setAttribute("transform", st === "seedling" ? "translate(45 58) scale(.7)" : "");
  const m = clamp((s.soil || 0) / 100, 0, 1);
  $(id + "soil").setAttribute("fill", `rgb(${Math.round(150 - 90 * m)},${Math.round(110 - 70 * m)},${Math.round(70 - 45 * m)})`);
}
function skyHtml() {
  const h = new Date().getHours();
  const tod = h < 5 || h >= 20 ? "night" : h < 7 ? "dawn" : h < 17 ? "day" : "dusk";
  const k = wxKind(S.live.wx?.code ?? 0);
  const clouds = k >= 1 ? (k >= 2 ? 3 : 2) : 1;
  let c = "";
  for (let i = 0; i < clouds; i++) c += `<span class="cloud" style="top:${22 + i * 34}px;width:${70 + i * 18}px;animation-duration:${40 + i * 14}s;animation-delay:-${i * 13}s"></span>`;
  return `<div class="sky ${tod}">${tod === "night" ? '<div class="stars"></div><div class="moon"></div>' : '<div class="sun"></div>'}${c}${k >= 4 && k !== 6 ? '<div class="skyrain"></div>' : ""}<div class="ground"></div></div>`;
}

/* ---------- home ---------- */
function renderHome() {
  const el = $("v-home");
  const s = S.live.s;
  if (!S.built.home) {
    S.built.home = true;
    el.innerHTML = `
      <section class="hero" id="hero">${skyHtml()}
        <div class="hero-main">
          <div class="dial">${dialSvg("h")}<div class="score"><b id="hScore">--</b><span>${t("health")}</span></div></div>
          <div class="hero-text">
            <p class="say" id="hSay">${t("sum_wait")}</p>
            <div class="legend">
              <div><b id="hT">--</b><span>${t("m_air")}</span></div><div><b id="hH">--</b><span>${t("m_hum")}</span></div>
              <div><b id="hS">--</b><span>${t("m_soil")}</span></div><div><b id="hW">--</b><span>${t("m_tank")}</span></div>
            </div>
            <div class="tags" id="hTags"></div>
            <div class="meta" id="hMeta"></div>
          </div>
        </div>
      </section>
      <div class="devchips" id="hDev" style="margin-top:14px"></div>
      <div class="grid2" style="margin-top:14px">
        <div class="stack">
          <section class="panel bars" id="hBars"></section>
          <section class="panel" id="hGrowth"></section>
        </div>
        <div class="stack">
          <section class="panel" id="hWx"></section>
          <section class="panel" id="hTank"></section>
          <section class="panel" id="hTl"></section>
        </div>
      </div>`;
    S.skyAt = Date.now();
  }
  if (Date.now() - (S.skyAt || 0) > 600000) { S.skyAt = Date.now(); const sky = el.querySelector(".sky"); if (sky) sky.outerHTML = skyHtml(); }
  if (!s) {
    $("hSay").textContent = S.gotPut ? t("sum_nodata") : t("sum_wait");
    return;
  }
  const l = cfg(), al = s.al || [];
  updateDial("h", s);
  $("hScore").textContent = health(s);
  $("hSay").textContent = summary(s);
  $("hT").textContent = fmt(s.temperature, 1) + "°";
  $("hH").textContent = fmt(s.humidity) + "%";
  $("hS").textContent = fmt(s.soil) + "%";
  $("hW").textContent = fmt(s.water) + "%";
  const g = growth(s);
  let tags = `<span class="tag ${s.mode === "manual" ? "o" : "g"}">${modeName(s.mode)}</span>`;
  tags += `<span class="tag">${S.ro ? t("view_only") : t("via_cloud")}</span>`;
  if (g) tags += `<span class="tag">${t("c_" + g.crop)} · ${t("st_" + g.stage)} · ${t("g_day", g.day)}</span>`;
  if (l.lightSched) tags += `<span class="tag">${devName("lights")} ${hhmm(l.lightOn)}–${hhmm(l.lightOff)}</span>`;
  if (al.length > 1) tags += `<span class="tag r">${t("al_n", al.length)}</span>`;
  $("hTags").innerHTML = tags;
  $("hMeta").textContent = t("updated_ago", ago(Date.now() - S.at)) + (s.uptime ? " · " + t("running_for", dur(s.uptime)) : "");

  // devices on now
  const onNow = DEV.filter(x => s[x.d]);
  put($("hDev"), onNow.length ? onNow.map(x => {
    const ov = s.ovr && s.ovr[x.d] !== undefined ? ` · ${s.ovr[x.d] < 0 ? "∞" : t("min_short", Math.ceil(s.ovr[x.d] / 60))}` : "";
    return `<button class="devchip c-${x.d}" data-go="control">${x.d === "fan" ? ICON.fan.replace('class="blades"', 'class="blades spin"') : ICON[x.i]}${devName(x.d)}${x.d === "servo" ? " · " + t("open") : ""}${ov}</button>`;
  }).join("") : `<span class="devchip" style="color:var(--muted)">${t("nothing_on")}</span>`, el => el.querySelectorAll("[data-go]").forEach(b => b.onclick = () => view("control")));

  // range bars
  const v = vpd(s.temperature, s.humidity), dp = dew(s.temperature, s.humidity), vb = vpdBand(s.stage);
  const bar = (label, val, unit, lo, hi, min, max, color, lim) => {
    const p = x => clamp((x - min) / (max - min) * 100, 0, 100);
    return `<div class="b"><div class="lbl"><span>${label}</span><b>${val}${unit}</b></div>
      <div class="track"><span class="band" style="inset-inline-start:${p(lo)}%;width:${p(hi) - p(lo)}%;background:var(${color})"></span>
      <span class="mark" style="inset-inline-start:${p(parseFloat(val))}%;background:var(${color});box-shadow:0 0 8px var(${color})"></span></div>
      <div class="lim">${lim}</div></div>`;
  };
  const vNote = v < vb[0] ? t("vpd_low") : v > vb[1] ? t("vpd_high") : t("vpd_good");
  const gap = s.temperature - dp;
  put($("hBars"),
    bar(t("m_air"), fmt(s.temperature, 1), "°", l.tempMin, l.tempMax, 0, 45, "--temp", `${fmt(l.tempMin)}–${fmt(l.tempMax)}°`) +
    bar(t("m_hum"), fmt(s.humidity), "%", Math.max(0, l.humMax - 35), l.humMax, 0, 100, "--hum", `≤ ${fmt(l.humMax)}%`) +
    bar(t("m_soil"), fmt(s.soil), "%", l.soilMin, 100, 0, 100, "--soil", `≥ ${fmt(l.soilMin)}%`) +
    bar(t("m_soil_temp"), fmt(s.soilTemp, 1), "°", 15, 28, 0, 40, "--light", "15–28°") +
    bar(t("m_vpd"), fmt(v, 2), "", vb[0], vb[1], 0, 2.5, "--brand", `${vb[0]}–${vb[1]}`) +
    `<div class="note muted">${vNote}</div>` +
    `<div class="b"><div class="lbl"><span>${t("m_dew")}</span><b>${fmt(dp, 1)}°</b></div><div class="grow small ${gap < 3 ? "" : "muted"}" style="${gap < 3 ? "color:var(--danger)" : ""}">${gap < 3 ? t("dew_risk", fmt(gap, 1)) : t("dew_ok", fmt(gap, 1))}</div></div>`);

  renderGrowth(s);
  renderWx();
  renderTank(s);
  // short timeline
  const ev = events().slice(0, 4);
  put($("hTl"), `<div class="row" style="margin-bottom:10px"><h2 class="grow">${t("tl_today")}</h2><button class="link" id="seeAll">${t("tl_see_all")}</button></div>` +
    (ev.length ? `<div class="tl">${ev.map(evRow).join("")}</div>` : `<p class="muted small">${t("tl_empty")}</p>`), () => $("seeAll").onclick = () => view("timeline"));
}
function renderGrowth(s) {
  const g = growth(s), el = $("hGrowth");
  if (!g) { put(el, `<h2>${t("g_title")}</h2><p class="muted small" style="margin:8px 0 0">${t("g_setup")}</p>`); return; }
  const idx = STAGES.indexOf(g.stage);
  put(el, `<div class="row"><h2 class="grow">${t("c_" + g.crop)}</h2><span class="tag g">${t("st_" + g.stage)}</span></div>
    <div class="small muted" style="margin-top:4px">${g.frac >= 1 ? t("g_ready") : t("g_of", g.day, g.totalDays) + " · " + t("g_harvest", dateStr(g.harvest))}</div>
    <div class="prog"><i style="width:${Math.max(3, g.frac * 100).toFixed(1)}%"></i></div>
    <div class="stages">${STAGES.map((x, i) => `<span class="${i === idx ? "cur" : ""}">${t("st_" + x)}</span>`).join("")}</div>
    <p class="tiny muted" style="margin:10px 0 0">${t("gdd_note", Math.round(g.g), Math.round(g.gH))}</p>`);
}
function renderWx() {
  const el = $("hWx"), w = S.live.wx, l = cfg();
  if (!el) return;
  if (!w || !w.d) { put(el, `<h2>${t("wx_title")}</h2><p class="muted small" style="margin:8px 0 0">${t("wx_none")}</p>`); return; }
  const k = wxKind(w.code);
  const day = (d, i) => {
    const rain = d.ps >= 1 || d.pp >= 60;
    return `<div class="d ${rain ? "wrain" : ""}">${wday(new Date(Date.now() + i * 86400000))}${wxIcon(wxKind(d.code))}<b>${fmt(d.max)}°</b>${fmt(d.min)}°</div>`;
  };
  put(el, `<h2 style="margin-bottom:10px">${t("wx_title")}</h2>
    <div class="wx"><div class="now"><span class="small muted">${t("wx_" + k)}</span><b>${fmt(w.now)}°</b><span class="tiny muted">${fmt(w.d[0].max)}° / ${fmt(w.d[0].min)}°</span></div>
    ${w.d.slice(1, 4).map((d, i) => day(d, i + 1)).join("")}</div>
    ${w.frost ? `<div class="notice warn">${ICON.snow.replace("<svg", '<svg width="20" height="20"')}<span>${t("wx_frost", fmt(w.d[1].min))}</span></div>` : ""}
    <div class="notice ${w.rain ? "blue" : ""}">${(w.rain ? ICON.rain : ICON.sun).replace("<svg", '<svg width="20" height="20"')}<span>${w.rain && l.rainSkip !== false ? t("wx_rain_skip") : t("wx_no_rain")}</span></div>`);
}
function renderTank(s) {
  const el = $("hTank"), l = cfg(), u = S.live.use || {};
  const today = u.today || {}, days = (u.days || []).slice(0, 6).reverse();
  const avg = days.length ? days.reduce((a, d) => a + (d.L || 0), 0) / days.length : today.L || 0;
  const leftL = (l.tankL || 20) * s.water / 100;
  const daysLeft = avg > 0.05 ? leftL / avg : null;
  const all = days.map(d => d.L || 0).concat([today.L || 0]);
  const mx = Math.max(0.1, ...all);
  put(el, `<div class="tank">
      <div class="vessel" aria-hidden="true"><div class="water" style="height:${clamp(s.water, 0, 100)}%"></div></div>
      <div class="grow"><div class="small muted">${t("m_water_tank")}</div><div class="big">${fmt(s.water)}%</div>
        <div class="small" style="color:${s.water <= l.waterMin ? "var(--danger)" : "var(--tank)"};font-weight:600">${s.water <= l.waterMin ? t("tank_empty") : daysLeft !== null ? t("tank_days", fmt(daysLeft, daysLeft < 10 ? 1 : 0)) : s.water < l.waterMin + 15 ? t("tank_low") : t("tank_ok")}</div></div>
    </div>
    <div class="cols2" style="margin-top:14px">
      <div><div class="tiny muted">${t("water_today")}</div><div class="num" style="font-size:22px">${t("liters", fmt(today.L || 0, 1))}</div></div>
      <div><div class="tiny muted">${t("power_today")}</div><div class="num" style="font-size:22px">${t("kwh", fmt(today.kWh || 0, 2))}</div></div>
    </div>
    <div class="minibars" aria-hidden="true">${all.map((v, i) => `<i class="${i === all.length - 1 ? "today" : ""}" style="height:${(v / mx * 100).toFixed(0)}%"></i>`).join("")}</div>`);
}

/* ---------- timeline ---------- */
function events() {
  const ev = Object.values(S.live.ev || {}).filter(e => e && typeof e.n === "number");
  return ev.sort((a, b) => b.n - a.n);
}
function whyText(e) {
  const x = e.x;
  switch (e.w) {
    case "hot": return t("why_hot", fmt(x, 1));
    case "cold": return t("why_cold", fmt(x, 1));
    case "humid": return t("why_humid", fmt(x));
    case "dry": return t("why_dry", fmt(x));
    case "moist": return t("why_moist", fmt(x));
    case "maxrun": return t("why_maxrun", fmt(x));
    case "rule": return t("why_rule", (x || 0) + 1);
    case undefined: case "": return "";
    default: return t("why_" + e.w);
  }
}
function evInfo(e) {
  const by = t("by_" + (e.by || "system"));
  const w = whyText(e);
  const sub = w ? `${by}: ${w}` : by;
  const color = e.d ? `var(${(DEV.find(x => x.d === e.d) || { c: "--muted" }).c})` : "var(--muted)";
  switch (e.c) {
    case "dev": return { title: e.d === "servo" ? t(e.v ? "ev_vent_open" : "ev_vent_close") : t(e.v ? "ev_on" : "ev_off", devName(e.d)), sub, color, k: "devices" };
    case "alert": return { title: t("al_" + e.a, fmt(e.x, e.a === "hot" || e.a === "cold" ? 1 : 0)), sub: "", color: "var(--danger)", k: "alerts" };
    case "mode": return { title: t("ev_mode", modeName(e.m)), sub: by, color: "var(--brand)", k: "settings" };
    case "skip": return { title: t("ev_skip"), sub, color: "var(--tank)", k: "devices" };
    case "water": return { title: t("ev_water", fmt(e.x)), sub: by, color: "var(--tank)", k: "devices" };
    case "boot": return { title: t("ev_boot"), sub: "", color: "var(--muted)", k: "settings" };
    case "cfg": return { title: t("ev_cfg"), sub, color: "var(--muted)", k: "settings" };
    case "cal": return { title: t("ev_cal"), sub: by, color: "var(--muted)", k: "settings" };
    case "ota": return { title: t(e.v ? "ev_ota_ok" : "ev_ota_fail"), sub: "", color: e.v ? "var(--brand)" : "var(--danger)", k: "settings" };
    case "wifi": return { title: t(e.v ? "ev_wifi_new" : "ev_wifi_setup"), sub: "", color: "var(--muted)", k: "settings" };
    case "ovrend": return { title: t("ev_ovrend", devName(e.d)), sub: by, color, k: "devices" };
    case "stage": return { title: t("ev_stage", t("st_" + e.st)), sub: "", color: "var(--soil)", k: "settings" };
    default: return { title: e.c, sub, color, k: "settings" };
  }
}
function evRow(e) {
  const i = evInfo(e);
  return `<div class="e"><div class="rail"><i style="background:${i.color};box-shadow:0 0 8px ${i.color}"></i><u></u></div>
    <div class="body"><b>${esc(i.title)}</b>${i.sub ? `<div>${esc(i.sub)}</div>` : ""}</div>
    <div class="time">${e.t ? timeStr(e.t) : ""}</div></div>`;
}
function renderTimeline() {
  const el = $("v-timeline");
  const all = events().filter(e => S.tlFilter === "all" || evInfo(e).k === S.tlFilter);
  const groups = {};
  for (const e of all) { const k = e.t ? new Date(e.t).toDateString() : "x"; (groups[k] = groups[k] || []).push(e); }
  const today = new Date().toDateString(), yest = new Date(Date.now() - 86400000).toDateString();
  el.innerHTML = `<div class="vtitle"><button class="iconbtn" id="tlBack" aria-label="${t("close")}">${ICON.home.replace("<svg", '<svg width="20" height="20"')}</button><h1>${t("tl_title")}</h1></div>
    <div class="chips" style="margin-bottom:14px">${["all", "devices", "alerts", "settings"].map(f => `<button class="chip" data-f="${f}" aria-pressed="${S.tlFilter === f}">${t("filter_" + f)}</button>`).join("")}</div>
    <section class="panel tl">${all.length ? Object.entries(groups).map(([k, list]) =>
      `<h3>${k === today ? t("today") : k === yest ? t("yesterday") : k === "x" ? t("tl_earlier") : dateStr(list[0].t, { weekday: "long", day: "numeric", month: "long" })}</h3>${list.map(evRow).join("")}`).join("") : `<p class="muted">${t("tl_empty")}</p>`}</section>`;
  $("tlBack").onclick = () => view("home");
  el.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { S.tlFilter = b.dataset.f; renderTimeline(); });
}

/* ---------- control ---------- */
function renderControl() {
  const el = $("v-control"), s = S.live.s, l = cfg();
  if (!S.built.control) {
    S.built.control = true;
    el.innerHTML = `<div class="vtitle"><h1>${t("ctl_title")}</h1></div>
      <div class="stack">
        <div class="modes" role="radiogroup" aria-label="${t("ctl_title")}" id="cModes">
          ${["auto", "manual", "away"].map(m => `<button role="radio" data-m="${m}"><b>${t("mode_" + m)}</b><span>${t("mode_" + m + "_sub")}</span></button>`).join("")}
        </div>
        <p class="small muted" id="cModeNote" style="margin:-4px 4px 0"></p>
        <div id="cOvr" class="stack"></div>
        <section class="panel" style="padding:4px 6px"><div class="bubbles" id="cDev"></div></section>
        <div class="grid2">
          <section class="panel holdwrap" id="cWater">
            <div class="row" style="align-self:stretch"><h2 class="grow">${t("water_now")}</h2><span class="small muted" id="cTank"></span></div>
            <button class="hold" id="hold" aria-label="${t("hold_to_water")}">
              <span class="halo"></span>
              <svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" fill="none" stroke="var(--track)" stroke-width="10"/><circle id="holdArc" cx="100" cy="100" r="88" fill="none" stroke="var(--tank)" stroke-width="10" stroke-linecap="round" stroke-dasharray="552.9" stroke-dashoffset="552.9" transform="rotate(-90 100 100)" style="transition:stroke-dashoffset .2s"/></svg>
              <span class="face">${ICON.drop.replace("<svg", '<svg width="30" height="30"')}<b id="holdVal">10 s</b><span id="holdLbl">${t("hold_to_water")}</span></span>
            </button>
            <p class="small muted" id="cHoldHint" style="margin:0;text-align:center"></p>
            <div class="chips" id="cQuick" style="justify-content:center"></div>
          </section>
          <section class="panel" id="cPlan"></section>
        </div>
      </div>`;
    el.querySelectorAll("#cModes button").forEach(b => b.onclick = async () => {
      if (!live()) return;
      S.pending.mode = b.dataset.m; renderControl();
      if (await send({ device: "mode", value: b.dataset.m })) toast(t("mode_set", modeName(b.dataset.m)));
    });
    setupHold();
  }
  const on = live();
  const mode = S.pending.mode || s?.mode || "auto";
  el.querySelectorAll("#cModes button").forEach(b => { b.setAttribute("aria-checked", b.dataset.m === mode); b.disabled = !on; });
  $("cModeNote").textContent = S.ro ? t("view_only_note") : mode === "away" ? t("away_note") : mode === "manual" ? t("manual_note") : "";
  // overrides
  const ovr = s?.ovr || {};
  const keys = Object.keys(ovr);
  put($("cOvr"), keys.map(d => `<div class="ovr"><div class="t"><b>${t(s[d] ? "ovr_on" : "ovr_off", devName(d))}</b><span>${ovr[d] < 0 ? t("ovr_forever") : t("ovr_back", Math.max(1, Math.ceil(ovr[d] / 60)))}</span></div><button data-d="${d}" ${on ? "" : "disabled"}>${t("return_now")}</button></div>`).join("") +
    (keys.length > 1 ? `<button class="link" id="ovrAll">${t("return_all")}</button>` : ""), el => {
    el.querySelectorAll("button[data-d]").forEach(b => b.onclick = () => send({ device: "ovr_clear", value: b.dataset.d }));
    if ($("ovrAll")) $("ovrAll").onclick = () => send({ device: "ovr_clear", value: "all" });
  });
  // device bubbles
  const lt = !document.documentElement.matches('[data-theme=dark]') && matchMedia("(prefers-color-scheme: light)").matches || document.documentElement.matches("[data-theme=light]");
  put($("cDev"), DEV.map(x => {
    const v = !!(S.pending[x.d] ?? s?.[x.d]);
    const st = x.d === "pump" && s?.watering > 0 ? t("watering_left", s.watering) :
      ovr[x.d] !== undefined ? (ovr[x.d] < 0 ? t("left_forever") : t("left_min", Math.max(1, Math.ceil(ovr[x.d] / 60)))) :
      x.d === "servo" ? t(v ? "open" : "closed") : t(v ? "on" : "off") + (mode !== "manual" ? " · " + (x.d === "lights" && l.lightSched ? t("st_schedule") : t("st_auto")) : "");
    const icon = x.d === "fan" && v ? ICON.fan.replace('class="blades"', 'class="blades spin"') : ICON[x.i];
    return `<button class="bub ${v ? "on" : ""} ${lt ? "lt" : ""}" data-d="${x.d}" style="--c:var(${x.c})" ${on ? "" : "disabled"} aria-pressed="${v}">
      <span class="ball"><svg class="orbit" viewBox="0 0 84 84"><circle cx="42" cy="42" r="39" fill="none" stroke="var(${x.c})" stroke-width="3" stroke-dasharray="12 10" stroke-linecap="round"/></svg><span class="core">${icon}</span></span>
      <span class="n">${devName(x.d)}</span><span class="s">${esc(st)}</span></button>`;
  }).join("") + `<button class="bub stop" id="allOff" ${on ? "" : "disabled"}><span class="ball"><span class="core">${ICON.power}</span></span><span class="n">${t("all_off")}</span><span class="s">${t("all_off_sub")}</span></button>`, el => {
    el.querySelectorAll(".bub[data-d]").forEach(b => b.onclick = () => devTap(b.dataset.d));
    $("allOff").onclick = allOff;
  });
  // water
  if (s) {
    $("cTank").textContent = `${t("m_tank")} ${fmt(s.water)}%`;
    const blocked = s.water <= l.waterMin ? t("tank_block") : s.pumpLock ? t("pump_rest") : "";
    const busy = s.watering > 0;
    const hb = $("hold");
    hb.disabled = !on || (!!blocked && !busy);
    hb.classList.toggle("busy", busy);
    if (!holdState.down) {
      $("holdVal").textContent = busy ? t("sec_short", s.watering) : t("sec_short", 10);
      $("holdLbl").textContent = busy ? t("stop") : t("hold_to_water");
      $("holdArc").style.strokeDashoffset = busy ? (552.9 * (1 - s.watering / Math.max(1, l.pumpMax))).toFixed(1) : 552.9;
    }
    $("cHoldHint").textContent = blocked || t("hold_hint", l.pumpMax);
    put($("cQuick"), [5, 10, 20, 30, 60].filter(x => x <= l.pumpMax).map(x => `<button class="chip" data-s="${x}" ${on && !blocked ? "" : "disabled"}>${t("sec_short", x)}</button>`).join(""),
      el => el.querySelectorAll("[data-s]").forEach(b => b.onclick = () => water(+b.dataset.s)));
  }
  renderPlan();
}
function renderPlan() {
  const el = $("cPlan"), l = cfg(), w = S.live.wx;
  const sched = (l.sched || []).filter(x => x.s > 0);
  let week = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() + i * 86400000), wd = d.getDay();
    const n = sched.filter(x => (x.d ?? 127) & (1 << wd)).length;
    const rain = l.rainSkip !== false && w?.d && i < 4 && (w.d[i].ps >= 1 || w.d[i].pp >= 60) && n > 0;
    week += `<div class="${rain ? "wrain" : n ? "" : "none"} ${i === 0 ? "today" : ""}">${wday(d)}<b>${rain ? "☂" : n ? n + "×" : "–"}</b></div>`;
  }
  const rainDays = [];
  if (l.rainSkip !== false && w?.d) for (let i = 0; i < 4; i++) if ((w.d[i].ps >= 1 || w.d[i].pp >= 60) && sched.length) rainDays.push(i === 0 ? t("today") : wday(new Date(Date.now() + i * 86400000)));
  const changed = put(el, `<div class="row" style="margin-bottom:12px"><h2 class="grow">${t("plan")}</h2>${S.ro ? "" : `<button class="link" id="planEdit">${t("edit")}</button>`}</div>
    <div class="week">${week}</div>
    <p class="small muted" style="margin:12px 0 0">${sched.length ? t("plan_times", sched.map(x => hhmm(x.m)).join(", ")) : t("plan_none")} ${t("plan_soil", l.soilMin)}</p>
    ${rainDays.length ? `<p class="small" style="margin:6px 0 0;color:var(--tank)">${t("plan_skip", rainDays.join(", "))}</p>` : ""}`);
  if (changed && $("planEdit")) $("planEdit").onclick = () => { view("settings"); setTimeout(() => $("sec-times")?.scrollIntoView({ behavior: "smooth" }), 80); };
}
function devTap(d) {
  const s = S.live.s;
  if (!s || !live()) return;
  if (d === "pump") {
    if (s.pump || s.watering > 0) { send({ device: "stopwater" }); return; }
    openWaterSheet();
    return;
  }
  const v = !(S.pending[d] ?? s[d]);
  if ((S.pending.mode || s.mode) === "manual") {
    S.pending[d] = v; renderControl();
    send({ device: d, value: v, mins: 0 });
    return;
  }
  openDurSheet(d, v);
}
function openDurSheet(d, v) {
  let pick = 30;
  const opts = [[15, "dur_15"], [30, "dur_30"], [60, "dur_60"], [-1, "dur_forever"]];
  const x = DEV.find(q => q.d === d);
  sheet(`<span class="grab"></span>
    <div class="row"><span class="core" style="width:46px;height:46px;border-radius:15px;display:grid;place-items:center;background:var(${x.c});color:#fff">${ICON[x.i].replace("<svg", '<svg width="24" height="24"')}</span>
    <div class="grow"><h2>${t(v ? "keep_on" : "keep_off", devName(d).toLowerCase())}</h2><div class="small muted">${t("then_auto")}</div></div></div>
    <div class="durs">${opts.map(([m, k]) => `<button data-m="${m}" aria-pressed="${m === pick}">${t(k)}</button>`).join("")}</div>
    <button class="btn wide" id="durGo"></button>
    <button class="btn ghost wide" style="margin-top:8px" id="durCancel">${t("cancel")}</button>`);
  const label = () => { const o = opts.find(q => q[0] === pick); $("durGo").textContent = pick < 0 ? t(v ? "turn_on" : "turn_off") : t(v ? "turn_on_for" : "turn_off_for", t(o[1])); };
  label();
  $("sheetBox").querySelectorAll("[data-m]").forEach(b => b.onclick = () => { pick = +b.dataset.m; $("sheetBox").querySelectorAll("[data-m]").forEach(q => q.setAttribute("aria-pressed", q === b)); label(); });
  $("durGo").onclick = () => { sheet(null); S.pending[d] = v; renderControl(); send({ device: d, value: v, mins: pick }); };
  $("durCancel").onclick = () => sheet(null);
}
function openWaterSheet() {
  const l = cfg();
  sheet(`<span class="grab"></span><h2>${t("water_now")}</h2><p class="small muted">${t("hold_hint", l.pumpMax)}</p>
    <div class="durs">${[5, 10, 20, 30, 60].filter(x => x <= l.pumpMax).map(x => `<button data-s="${x}">${t("sec_short", x)}</button>`).join("")}</div>
    <button class="btn ghost wide" id="wCancel">${t("cancel")}</button>`);
  $("sheetBox").querySelectorAll("[data-s]").forEach(b => b.onclick = () => { sheet(null); water(+b.dataset.s); });
  $("wCancel").onclick = () => sheet(null);
}
async function water(sec) { if (await send({ device: "water", value: sec })) toast(t("watering_for", sec)); }
function allOff() {
  confirmBox(t("all_off_q"), t("all_off_body"), t("turn_off"), async () => {
    DEV.forEach(x => S.pending[x.d] = false); S.pending.mode = "manual"; renderControl();
    if (await send({ device: "alloff" })) toast(t("all_off_done"));
  }, true);
}
const holdState = { down: false, t0: 0, timer: 0, sec: 10 };
function setupHold() {
  const b = $("hold");
  const max = () => cfg().pumpMax || 60;
  const tick = () => {
    const el = (Date.now() - holdState.t0) / 1000;
    holdState.sec = clamp(Math.round(5 + el * 8), 5, max());
    $("holdVal").textContent = t("sec_short", holdState.sec);
    $("holdArc").style.strokeDashoffset = (552.9 * (1 - holdState.sec / max())).toFixed(1);
  };
  const down = e => {
    if (b.disabled) return;
    const s = S.live.s;
    if (s && s.watering > 0) { send({ device: "stopwater" }); return; }
    e.preventDefault();
    holdState.down = true; holdState.t0 = Date.now(); holdState.sec = 5;
    b.classList.add("pressing");
    $("holdLbl").textContent = t("hold_to_water");
    holdState.timer = setInterval(tick, 80);
    b.setPointerCapture?.(e.pointerId);
  };
  const up = () => {
    if (!holdState.down) return;
    clearInterval(holdState.timer);
    holdState.down = false;
    b.classList.remove("pressing");
    const quick = Date.now() - holdState.t0 < 350;
    water(quick ? 10 : holdState.sec);
  };
  b.addEventListener("pointerdown", down);
  b.addEventListener("pointerup", up);
  b.addEventListener("pointercancel", up);
  b.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && !b.disabled) { e.preventDefault(); const s = S.live.s; s?.watering > 0 ? send({ device: "stopwater" }) : water(10); } });
}

/* ---------- history ---------- */
async function loadLog(force) {
  const g = S.cur;
  if (!g || (!force && Date.now() - S.logAt < 120000 && S.log.length)) { if (S.view === "history") renderHistory(); return; }
  try {
    const r = await fetch(base(g) + "/log.json");
    const j = await r.json();
    S.log = j ? Object.values(j).filter(x => x && x.t).sort((a, b) => a.t - b.t) : [];
    S.logAt = Date.now();
  } catch (e) {}
  if (S.view === "history") renderHistory();
}
const SER = { T: ["h_temp", "°C", "--temp", 1], H: ["h_hum", "%", "--hum", 0], S: ["h_soil", "%", "--soil", 0], W: ["h_tank", "%", "--tank", 0] };
function renderHistory() {
  const el = $("v-history");
  S.built.history = true;
  el.innerHTML = `<div class="vtitle"><h1>${t("h_title")}</h1></div>
    <div class="stack">
      <section class="panel">
        <div class="row"><div class="chips" id="hSer"></div><span class="grow"></span><div class="chips" id="hRng"></div></div>
        <div class="swrow" style="padding-bottom:0"><div class="t"><b>${t("compare")}</b><span>${t("h_note")}</span></div><button class="switch" id="hCmp" role="switch" aria-checked="${S.compare}" aria-label="${esc(t("compare"))}" ${S.range === 24 ? "" : "disabled"}></button></div>
        <div class="chart"><canvas id="chart"></canvas><div class="tip" id="tip"></div></div>
        <div class="stats" id="hStats"></div>
      </section>
      <div class="grid2">
        <section class="panel"><h2>${t("heat_title")}</h2><p class="sub">${t("heat_note")}</p><div class="heat" id="heat"></div></section>
        <section class="panel"><h2>${t("usage_title")}</h2><div class="ubars" id="ubars"></div>
          <div class="legend2"><span><i style="background:var(--tank)"></i>${t("water_today").split(" ")[0]} (L)</span><span><i style="background:var(--light)"></i>kWh</span></div></section>
      </div>
      <div class="row"><button class="btn ghost" id="csvBtn">${t("download_csv")}</button><button class="btn" id="pdfBtn">${t("download_pdf")}</button></div>
    </div>`;
  $("hSer").innerHTML = Object.entries(SER).map(([k, v]) => `<button class="chip" data-k="${k}" aria-pressed="${S.series === k}">${t(v[0])}</button>`).join("");
  $("hRng").innerHTML = [[24, "r_24h"], [168, "r_7d"]].map(([r, k]) => `<button class="chip" data-r="${r}" aria-pressed="${S.range === r}">${t(k)}</button>`).join("");
  $("hSer").querySelectorAll("[data-k]").forEach(b => b.onclick = () => { S.series = b.dataset.k; renderHistory(); });
  $("hRng").querySelectorAll("[data-r]").forEach(b => b.onclick = () => { S.range = +b.dataset.r; if (S.range !== 24) S.compare = false; renderHistory(); });
  $("hCmp").onclick = () => { S.compare = !S.compare; renderHistory(); };
  $("csvBtn").onclick = csv;
  $("pdfBtn").onclick = report;
  const cv = $("chart");
  cv.onmousemove = chartHover; cv.ontouchmove = chartHover; cv.onmouseleave = () => $("tip").style.display = "none";
  drawChart(); drawHeat(); drawUsage();
}
let chartPts = [];
function drawChart() {
  const cv = $("chart");
  if (!cv) return;
  const [name, unit, cvar, dec] = SER[S.series], color = css(cvar);
  const now = Date.now(), from = now - S.range * 3600e3;
  const pts = S.log.filter(p => p.t >= from && typeof p[S.series] === "number").map(p => ({ ts: p.t, v: p[S.series] }));
  const prev = S.compare ? S.log.filter(p => p.t >= from - 86400e3 && p.t < from && typeof p[S.series] === "number").map(p => ({ ts: p.t + 86400e3, v: p[S.series] })) : [];
  const r = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * r; cv.height = h * r;
  const c = cv.getContext("2d"); c.scale(r, r); c.clearRect(0, 0, w, h);
  c.font = `12px ${css("--ui")}`;
  const muted = css("--muted"), line = css("--line");
  if (pts.length < 2) {
    c.fillStyle = muted; c.textAlign = "center";
    c.fillText(S.log.length ? t("h_no_range") : t("h_empty"), w / 2, h / 2);
    $("hStats").innerHTML = ""; chartPts = []; return;
  }
  const vs = pts.map(p => p.v).concat(prev.map(p => p.v));
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi - lo < 4) { const m = (hi + lo) / 2; lo = m - 2; hi = m + 2; }
  const rtl = document.documentElement.dir === "rtl";
  const pad = { l: rtl ? 10 : 40, r: rtl ? 40 : 10, t: 10, b: 24 }, W = w - pad.l - pad.r, H = h - pad.t - pad.b;
  const X = ts => { const f = (ts - from) / (now - from); return pad.l + (rtl ? 1 - f : f) * W; };
  const Y = v => pad.t + (1 - (v - lo) / (hi - lo)) * H;
  c.strokeStyle = line; c.fillStyle = muted; c.lineWidth = 1; c.textAlign = rtl ? "left" : "right";
  for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4, y = Y(v); c.beginPath(); c.moveTo(pad.l, y); c.lineTo(w - pad.r, y); c.stroke(); c.fillText(v.toFixed(dec), rtl ? w - pad.r + 6 : pad.l - 6, y + 4); }
  c.textAlign = "center";
  const step = S.range > 24 ? 86400e3 : 6 * 3600e3;
  const tz = new Date().getTimezoneOffset() * 60000;
  for (let x = Math.ceil((from - tz) / step) * step + tz; x < now; x += step) c.fillText(S.range > 24 ? wday(new Date(x)) : timeStr(x), X(x), h - 6);
  const path = (list, dash, alpha) => {
    c.beginPath(); let pv = null;
    list.forEach(p => { const x = X(p.ts), y = Y(p.v); pv && p.ts - pv < 20 * 60e3 ? c.lineTo(x, y) : c.moveTo(x, y); pv = p.ts; });
    c.setLineDash(dash); c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = 2.2; c.lineJoin = "round"; c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
  };
  if (prev.length) path(prev, [5, 5], .5);
  // soft area under today's line
  const grad = c.createLinearGradient(0, pad.t, 0, h - pad.b);
  grad.addColorStop(0, color + "44"); grad.addColorStop(1, color + "00");
  c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(X(p.ts), Y(p.v)) : c.moveTo(X(p.ts), Y(p.v)));
  c.lineTo(X(pts[pts.length - 1].ts), h - pad.b); c.lineTo(X(pts[0].ts), h - pad.b); c.closePath(); c.fillStyle = grad; c.fill();
  path(pts, [], 1);
  chartPts = pts.map(p => ({ x: X(p.ts), y: Y(p.v), p, unit, dec }));
  const tv = pts.map(p => p.v), avg = tv.reduce((a, b) => a + b, 0) / tv.length;
  $("hStats").innerHTML = [["lowest", Math.min(...tv)], ["average", avg], ["highest", Math.max(...tv)]]
    .map(([k, v]) => `<div><span class="small muted">${t(k)}</span><b>${v.toFixed(dec)}${unit}</b></div>`).join("");
}
function chartHover(e) {
  const tip = $("tip");
  if (!chartPts.length) { tip.style.display = "none"; return; }
  const rect = $("chart").getBoundingClientRect(), mx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  let best = chartPts[0];
  for (const q of chartPts) if (Math.abs(q.x - mx) < Math.abs(best.x - mx)) best = q;
  tip.textContent = `${best.p.v.toFixed(best.dec)}${best.unit} · ${dateStr(best.p.ts, { weekday: "short" })} ${timeStr(best.p.ts)}`;
  tip.style.left = best.x + "px"; tip.style.top = best.y + "px"; tip.style.display = "block";
}
function drawHeat() {
  const el = $("heat");
  if (!el) return;
  const k = S.series, [, unit, cvar, dec] = SER[k];
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push(d.getTime()); }
  const cells = days.map(() => Array.from({ length: 24 }, () => []));
  for (const p of S.log) {
    if (typeof p[k] !== "number") continue;
    const di = days.findIndex((d, i) => p.t >= d && p.t < d + 86400e3);
    if (di >= 0) cells[di][new Date(p.t).getHours()].push(p[k]);
  }
  const avgs = cells.flat().filter(a => a.length).map(a => a.reduce((x, y) => x + y, 0) / a.length);
  const lo = avgs.length ? Math.min(...avgs) : 0, hi = avgs.length ? Math.max(...avgs) : 1;
  let html = "<span></span>" + Array.from({ length: 24 }, (_, h) => `<span style="justify-content:center">${h % 6 === 0 ? h : ""}</span>`).join("");
  days.forEach((d, di) => {
    html += `<span>${wday(new Date(d))}</span>`;
    for (let h = 0; h < 24; h++) {
      const a = cells[di][h];
      if (!a.length) { html += "<i></i>"; continue; }
      const v = a.reduce((x, y) => x + y, 0) / a.length, f = hi > lo ? (v - lo) / (hi - lo) : .5;
      html += `<i title="${v.toFixed(dec)}${unit} · ${h}:00" style="background:color-mix(in srgb,var(${cvar}) ${Math.round(18 + f * 82)}%,var(--track))"></i>`;
    }
  });
  el.innerHTML = html;
}
function drawUsage() {
  const el = $("ubars");
  if (!el) return;
  const u = S.live.use || {};
  const rows = (u.days || []).slice(0, 6).reverse().map(d => ({ d: d.d, L: d.L || 0, k: d.kWh || 0 }));
  rows.push({ d: u.today?.d || 0, L: u.today?.L || 0, k: u.today?.kWh || 0, today: true });
  const mL = Math.max(0.1, ...rows.map(r => r.L)), mK = Math.max(0.01, ...rows.map(r => r.k));
  el.innerHTML = rows.map(r => `<div class="c"><span class="num" style="font-size:12px;color:var(--text)">${fmt(r.L, 1)}</span>
    <div class="pair"><i style="height:${(r.L / mL * 100).toFixed(0)}%"></i><u style="height:${(r.k / mK * 100).toFixed(0)}%"></u></div>
    <span>${r.today ? t("today") : r.d ? wday(new Date(r.d * 86400000 + 43200000)) : ""}</span></div>`).join("");
}
function csv() {
  if (!S.log.length) { toast(t("h_empty")); return; }
  const rows = [["time", "air_temp_c", "humidity_pct", "soil_pct", "soil_temp_c", "tank_pct"]]
    .concat(S.log.map(x => [new Date(x.t).toISOString(), x.T, x.H, x.S, x.ST, x.W]));
  download(`${(S.live.s?.name || "greenhouse").replace(/\W+/g, "-")}-history.csv`, rows.map(r => r.join(",")).join("\n"), "text/csv");
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
/* Printable report: the browser's "Save as PDF" keeps Dari and Pashto text right. */
function report() {
  const s = S.live.s || {}, l = cfg(), pts = S.log.filter(p => p.t >= Date.now() - S.range * 3600e3);
  const st = k => { const v = pts.map(p => p[k]).filter(x => typeof x === "number"); return v.length ? [Math.min(...v), v.reduce((a, b) => a + b, 0) / v.length, Math.max(...v)] : null; };
  const img = $("chart")?.toDataURL("image/png");
  const u = S.live.use || {};
  const rows = [["T", "m_air_temp", "°C", 1], ["H", "m_hum", "%", 0], ["S", "m_soil_moist", "%", 0], ["ST", "m_soil_temp", "°C", 1], ["W", "m_water_tank", "%", 0]]
    .map(([k, n, un, d]) => { const v = st(k); return v ? `<tr><td>${t(n)}</td><td>${v[0].toFixed(d)}${un}</td><td>${v[1].toFixed(d)}${un}</td><td>${v[2].toFixed(d)}${un}</td></tr>` : ""; }).join("");
  $("report").innerHTML = `<style>
    @media print{body>*:not(#report){display:none!important}#report{display:block!important}}
    #report{font-family:var(--ui);color:#111;background:#fff;padding:24px}
    #report h1{font-size:26px;margin:0}#report table{width:100%;border-collapse:collapse;margin:14px 0}
    #report td,#report th{border-bottom:1px solid #ddd;padding:8px;text-align:start}#report img{width:100%;border:1px solid #ddd;border-radius:8px}
    </style>
    <h1>${t("report_title")}: ${esc(s.name || "")}</h1>
    <p>${t("report_period", t(S.range === 24 ? "r_24h" : "r_7d"))} · ${t("report_made", new Date().toLocaleString(LOC))}</p>
    <p>${summary(s)} · ${t("health_l")}: ${s.temperature !== undefined ? health(s) : "--"} · ${modeName(s.mode)}</p>
    <table><tr><th></th><th>${t("lowest")}</th><th>${t("average")}</th><th>${t("highest")}</th></tr>${rows}</table>
    ${img ? `<img src="${img}" alt="">` : ""}
    <p>${t("water_today")}: ${t("liters", fmt(u.today?.L || 0, 1))} · ${t("power_today")}: ${t("kwh", fmt(u.today?.kWh || 0, 2))}</p>
    <p>${t("s_limits")}: ${fmt(l.tempMin)}–${fmt(l.tempMax)}°C · ${t("f_hmax")} ${fmt(l.humMax)} · ${t("f_smin")} ${fmt(l.soilMin)}</p>
    <h2 style="font-size:18px">${t("tl_title")}</h2>
    <table>${events().slice(0, 15).map(e => { const i = evInfo(e); return `<tr><td>${e.t ? new Date(e.t).toLocaleString(LOC) : ""}</td><td>${esc(i.title)}</td><td>${esc(i.sub)}</td></tr>`; }).join("")}</table>
    <p style="color:#666">${t("credits")} Mostafa Mesbah Aabedi, Milad Ahmadi · ${t("team")}</p>`;
  $("report").hidden = false;
  setTimeout(() => { print(); $("report").hidden = true; }, 200);
}

/* ---------- journal ---------- */
async function loadJournal() {
  const g = S.cur;
  if (!g) return;
  try {
    const r = await fetch(base(g) + '/journal.json?orderBy="$key"&limitToLast=60');
    const j = await r.json();
    S.journal = j ? Object.entries(j).map(([id, v]) => Object.assign({ id }, v)).sort((a, b) => (b.t || 0) - (a.t || 0)) : [];
  } catch (e) { S.journal = S.journal || []; }
  if (S.view === "journal") renderJournal();
}
function renderJournal() {
  const el = $("v-journal");
  S.built.journal = true;
  const list = S.journal;
  const grams = (list || []).filter(e => e.k === "harvest").reduce((a, e) => a + (+e.g || 0), 0);
  el.innerHTML = `<div class="vtitle"><h1>${t("j_title")}</h1>${grams ? `<span class="tag g">${t("j_total", Math.round(grams))}</span>` : ""}</div>
    ${S.ro ? "" : `<section class="panel jadd">
      <div class="chips" id="jKind">${[["note", "j_note"], ["photo", "j_photo"], ["harvest", "j_harvest"]].map(([k, n], i) => `<button class="chip" data-k="${k}" aria-pressed="${i === 0}">${t(n)}</button>`).join("")}</div>
      <textarea id="jText" placeholder="${esc(t("j_text_ph"))}"></textarea>
      <label class="f" id="jGramsL" hidden>${t("j_grams")}<input type="number" id="jGrams" min="0" inputmode="numeric"></label>
      <label class="btn ghost" id="jPhotoL" hidden style="text-align:center;cursor:pointer">${t("j_pick")}<input type="file" id="jPhoto" accept="image/*" capture="environment" hidden></label>
      <img id="jPrev" hidden style="max-width:160px;border-radius:14px">
      <button class="btn" id="jSave">${t("j_save")}</button>
    </section>`}
    <div class="jlist" id="jList">${list === null ? "" : list.length ? list.map(jRow).join("") : `<p class="muted">${t("j_empty")}</p>`}</div>`;
  el.querySelectorAll(".je img[data-id]").forEach(i => i.onclick = () => showPhoto(i.dataset.id, i.src));
  el.querySelectorAll(".je .del").forEach(b => b.onclick = () => confirmBox(t("j_delete_q"), "", t("delete"), () => delJournal(b.dataset.id), true));
  if (S.ro) return;
  let kind = "note", photo = null;
  el.querySelectorAll("#jKind [data-k]").forEach(b => b.onclick = () => {
    kind = b.dataset.k;
    el.querySelectorAll("#jKind [data-k]").forEach(q => q.setAttribute("aria-pressed", q === b));
    $("jGramsL").hidden = kind !== "harvest"; $("jPhotoL").hidden = kind !== "photo"; $("jPrev").hidden = kind !== "photo" || !photo;
  });
  $("jPhoto").onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    photo = { full: await shrink(f, 1280, .72), thumb: await shrink(f, 320, .6) };
    $("jPrev").src = photo.thumb; $("jPrev").hidden = false;
  };
  $("jSave").onclick = async () => {
    const text = $("jText").value.trim(), g = +$("jGrams").value || 0;
    if (!text && !(kind === "photo" && photo) && !(kind === "harvest" && g)) return;
    $("jSave").disabled = true; $("jSave").textContent = t("j_saving");
    const entry = { t: { ".sv": "timestamp" }, k: kind, x: text };
    if (kind === "harvest") entry.g = g;
    if (kind === "photo" && photo) entry.th = photo.thumb;
    try {
      const r = await fetch(base(S.cur) + "/journal.json", { method: "POST", body: JSON.stringify(entry) });
      const { name } = await r.json();
      if (kind === "photo" && photo) await fetch(base(S.cur) + `/photos/${name}.json`, { method: "PUT", body: JSON.stringify(photo.full) });
      const vk = S.live.s?.view;
      if (vk) {
        const vb = `https://${S.cur.db}/hbrt/${vk}`;
        fetch(vb + `/journal/${name}.json`, { method: "PUT", body: JSON.stringify(entry) });
        if (kind === "photo" && photo) fetch(vb + `/photos/${name}.json`, { method: "PUT", body: JSON.stringify(photo.full) });
      }
    } catch (e) { toast(t("not_sent")); }
    loadJournal();
  };
}
function jRow(e) {
  const icon = e.k === "harvest" ? ["basket", "--light"] : e.k === "photo" ? ["camera", "--vent"] : ["note", "--soil"];
  return `<div class="je">${e.th ? `<img src="${e.th}" data-id="${e.id}" alt="">` : `<span class="ic" style="background:color-mix(in srgb,var(${icon[1]}) 18%,var(--panel));color:var(${icon[1]})">${ICON[icon[0]].replace("<svg", '<svg width="22" height="22"')}</span>`}
    <div class="tx"><div class="when">${e.t ? dateStr(e.t, { weekday: "short", day: "numeric", month: "short" }) + " · " + timeStr(e.t) : ""}</div>
    ${e.k === "harvest" ? `<b>${t("j_harvested", e.g || 0)}</b>` : ""}${e.x ? `<p>${esc(e.x)}</p>` : ""}</div>
    ${S.ro ? "" : `<button class="del" data-id="${e.id}" aria-label="${t("delete")}">${ICON.trash.replace("<svg", '<svg width="18" height="18"')}</button>`}</div>`;
}
async function delJournal(id) {
  const vk = S.live.s?.view;
  for (const b of [base(S.cur)].concat(vk ? [`https://${S.cur.db}/hbrt/${vk}`] : [])) {
    fetch(b + `/journal/${id}.json`, { method: "DELETE" });
    fetch(b + `/photos/${id}.json`, { method: "DELETE" });
  }
  S.journal = (S.journal || []).filter(e => e.id !== id);
  renderJournal();
}
async function showPhoto(id, thumb) {
  sheet(`<span class="grab"></span><img class="photo" id="bigPhoto" src="${thumb}" alt=""><button class="btn ghost wide" style="margin-top:12px" id="phClose">${t("close")}</button>`);
  $("phClose").onclick = () => sheet(null);
  try { const r = await fetch(base(S.cur) + `/photos/${id}.json`); const d = await r.json(); if (d && $("bigPhoto")) $("bigPhoto").src = d; } catch (e) {}
}
function shrink(file, max, q) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", q));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

/* ---------- settings ---------- */
function renderSettings() {
  const el = $("v-settings");
  const s = S.live.s, c = S.live.cfg;
  if (!S.built.settings || (!S.built.settingsCfg && c)) {
    S.built.settings = true;
    S.built.settingsCfg = !!c;
    buildSettings(el);
  }
  settingsLive();
}
function sec(id, title, sub, body) {
  return `<section class="panel sec" id="sec-${id}"><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ""}${body}</section>`;
}
function sw(id, on, label, sub) {
  return `<div class="swrow"><div class="t"><b>${label}</b>${sub ? `<span>${sub}</span>` : ""}</div><button class="switch" id="${id}" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}"></button></div>`;
}
function buildSettings(el) {
  const l = cfg(), s = S.live.s || {}, ro = S.ro;
  const dayBtns = (mask, i) => `<div class="days" data-i="${i}">${[0, 1, 2, 3, 4, 5, 6].map(d => `<button data-d="${d}" aria-pressed="${!!(mask & (1 << d))}">${wday(new Date(2024, 0, 7 + d))}</button>`).join("")}</div>`;
  const slots = (l.sched || []).map((x, i) => slotHtml(x, i, dayBtns)).join("");
  const ruleRows = (l.rules || []).map((r, i) => ruleHtml(r, i)).join("");
  const crops = Object.keys(CROPS);
  const plantDate = l.plantDay ? new Date(l.plantDay * 86400000).toISOString().slice(0, 10) : "";
  const parts = [];
  if (!ro) {
    parts.push(sec("name", t("s_name"), "", `<div class="row"><input type="text" id="nameIn" maxlength="32" placeholder="${esc(t("name_ph"))}" value="${esc(s.name || "")}" style="flex:1;min-width:180px"><button class="btn" id="nameSave">${t("save_name")}</button></div>`));
    parts.push(sec("crop", t("s_crop"), "", `<div class="form">
        <label class="f">${t("crop_q")}<select id="cropSel"><option value="">${t("c_none")}</option>${crops.map(k => `<option value="${k}" ${l.crop === k ? "selected" : ""}>${t("c_" + k)}</option>`).join("")}</select></label>
        <label class="f">${t("plant_date")}<input type="date" id="plantIn" value="${plantDate}"></label></div>
        ${sw("stageSw", l.autoStage, t("auto_stage"), t("auto_stage_sub"))}
        <button class="btn soft wide" id="cropSave">${t("save_crop")}</button>`));
    parts.push(sec("limits", t("s_limits"), t("limits_sub"), `
        <p class="small muted" style="margin:0 0 8px">${t("presets_sub")}</p>
        <div class="chips" id="presets" style="margin-bottom:14px">${crops.map(k => `<button class="chip" data-p="${k}">${t("c_" + k)}</button>`).join("")}</div>
        <div class="form">${[["tempMax", "f_tmax", 1], ["tempMin", "f_tmin", 1], ["humMax", "f_hmax", 1], ["soilMin", "f_smin", 0], ["waterMin", "f_wmin", 0], ["pumpMax", "f_pmax", 0]]
          .map(([k, n, d]) => `<label class="f">${t(n)}<input type="number" id="f-${k}" step="${d ? "0.5" : "1"}" inputmode="decimal" value="${l[k] ?? ""}"></label>`).join("")}</div>
        <button class="btn soft wide" id="limSave" style="margin-top:14px">${t("save_gh")}</button>`));
    parts.push(sec("lights", t("s_lights"), "", `${sw("schedSw", l.lightSched, t("light_sched"), t("light_sched_sub"))}
        <div class="form" id="schedTimes" ${l.lightSched ? "" : "hidden"}><label class="f">${t("lights_on_at")}<input type="time" id="lOn" step="1800" value="${hhmm(l.lightOn)}"></label><label class="f">${t("lights_off_at")}<input type="time" id="lOff" step="1800" value="${hhmm(l.lightOff)}"></label></div>
        <p class="small muted" id="lightHours"></p>
        <button class="btn soft wide" id="lightSave">${t("save")}</button>`));
    parts.push(sec("times", t("s_water_times"), t("wt_sub"), `<div id="slots">${slots}</div>
        <button class="link" id="slotAdd">+ ${t("wt_add")}</button>
        ${sw("rainSw", l.rainSkip !== false, t("rain_skip"), "")}
        <button class="btn soft wide" id="timesSave">${t("save_times")}</button>`));
    parts.push(sec("rules", t("s_rules"), t("rules_sub"), `<div id="rules" class="stack">${ruleRows || `<p class="small muted" id="noRules">${t("rule_none")}</p>`}</div>
        <button class="link" id="ruleAdd">+ ${t("rule_add")}</button>
        <button class="btn soft wide" id="rulesSave" style="margin-top:10px">${t("rule_save")}</button>`));
    parts.push(sec("alerts", t("s_alerts"), t("alerts_sub"), `<div class="chips" id="alertChips">${ALERTS.map((a, i) => `<button class="chip" data-i="${i}" aria-pressed="${!!((l.alertMask ?? 511) & (1 << i))}">${t("al_" + a + "_n")}</button>`).join("")}</div>
        ${sw("quietSw", l.quiet !== false, t("quiet"), t("quiet_sub"))}
        <div class="form" id="quietTimes"><label class="f">${t("from")}<input type="time" id="qFrom" value="${hhmm(l.quietFrom ?? 1320)}"></label><label class="f">${t("to")}<input type="time" id="qTo" value="${hhmm(l.quietTo ?? 420)}"></label></div>
        ${sw("sumSw", l.dailySummary !== false, t("daily_summary"), "")}
        <button class="btn soft wide" id="alertsSave">${t("save")}</button>
        ${sw("notifSw", LS.get("hbrt.notify", false) && "Notification" in window && Notification.permission === "granted", t("browser_notif"), "")}
        <p class="small" id="notifNote" style="color:var(--danger)" hidden>${t("notif_blocked")}</p>`));
    parts.push(sec("tg", t("s_tg"), t("tg_sub"), `<ol class="steps"><li>${t("tg_step1")}</li><li>${t("tg_step2")}</li><li>${t("tg_step3")}</li></ol>
        <div class="row" style="margin-top:12px"><input type="password" id="tgTok" autocomplete="off" placeholder="${esc(t("tg_token"))}" style="flex:1;min-width:200px"><button class="btn" id="tgSave">${t("tg_save")}</button></div>
        <div class="swrow"><div class="t"><b id="tgState"></b><span id="tgChat"></span></div><button class="btn ghost" id="tgTest">${t("tg_test")}</button></div>
        <label class="f">${t("tg_lang")}<select id="tgLang">${[["en", "English"], ["fa", "دری"], ["ps", "پښتو"]].map(([k, n]) => `<option value="${k}" ${(l.lang || "en") === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <button class="link" id="tgRemove" style="color:var(--danger);margin-top:8px">${t("tg_remove")}</button>`));
    parts.push(sec("usage", t("s_usage"), "", `<div class="form">
        <label class="f">${t("flow")}<input type="number" id="flowIn" min="1" value="${l.flowMl}"></label>
        <label class="f">${t("tank_size")}<input type="number" id="tankIn" min="1" value="${l.tankL}"></label></div>
        <p class="tiny muted">${t("flow_help")}</p>
        <p class="small muted" style="margin:12px 0 6px">${t("watts")}</p>
        <div class="form">${DEV.slice(0, 4).map(x => `<label class="f">${devName(x.d)}<input type="number" id="w-${x.d}" min="0" value="${(l.watt || {})[x.d] ?? ""}"></label>`).join("")}</div>
        <button class="btn soft wide" id="useSave" style="margin-top:14px">${t("save")}</button>`));
    parts.push(sec("loc", t("s_location"), "", `<div class="form"><label class="f">${t("lat")}<input type="number" id="latIn" step="0.0001" value="${l.lat ?? 34.35}"></label><label class="f">${t("lon")}<input type="number" id="lonIn" step="0.0001" value="${l.lon ?? 62.2}"></label></div>
        <div class="row" style="margin-top:12px"><button class="btn ghost" id="geoBtn">${t("use_my_loc")}</button><button class="btn ghost" id="heratBtn">${t("loc_herat")}</button><span class="grow"></span><button class="btn soft" id="locSave">${t("save")}</button></div>`));
    parts.push(sec("cal", t("s_cal"), t("cal_sub"), `
        <div class="cal"><b>${t("cal_soil")}</b><div class="row"><span class="small muted grow" id="rawS"></span></div>
          <div class="row"><span class="small grow">${t("cal_soil_dry")}</span><button class="btn ghost" data-cal="soilDry">${t("cal_dry_btn")}</button></div>
          <div class="row"><span class="small grow">${t("cal_soil_wet")}</span><button class="btn ghost" data-cal="soilWet">${t("cal_wet_btn")}</button></div></div>
        <div class="cal" style="margin-top:16px"><b>${t("cal_tank")}</b><div class="row"><span class="small muted grow" id="rawW"></span></div>
          <div class="row"><span class="small grow">${t("cal_tank_empty")}</span><button class="btn ghost" data-cal="waterEmpty">${t("cal_empty_btn")}</button></div>
          <div class="row"><span class="small grow">${t("cal_tank_full")}</span><button class="btn ghost" data-cal="waterFull">${t("cal_full_btn")}</button></div></div>
        <button class="link" data-cal="reset" style="margin-top:10px">${t("cal_reset")}</button>`));
  }
  parts.push(sec("share", t("s_share"), "", `
      ${ro ? "" : `<b>${t("share_ctrl")}</b><p class="small muted" style="margin:2px 0 10px">${t("share_ctrl_sub")}</p>
      <div class="row"><button class="btn" id="shareCtrl">${t("share")}</button><button class="btn ghost" id="copyCtrl">${t("copy_link")}</button><button class="btn ghost" id="qrCtrl">${t("qr")}</button></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">`}
      <b>${t("share_view")}</b><p class="small muted" style="margin:2px 0 10px">${t("share_view_sub")}</p>
      <div class="row" id="viewRow"></div>`));
  if (!ro) parts.push(sec("board", t("s_board"), "", `<div class="row"><b class="grow" id="fwLine"></b><span class="small muted" id="fwLatest"></span></div>
      <div class="row" style="margin:10px 0 14px"><button class="btn" id="otaBtn">${t("fw_update")}</button><span class="small" id="otaState"></span></div>
      <div class="kv" id="hpKv"></div>
      <p class="small muted" style="margin:12px 0 4px" id="wifiLine"></p>
      <p class="tiny muted" style="margin:0 0 12px">${t("wifi_change_note")}</p>
      <button class="btn danger" id="rebootBtn">${t("reboot")}</button>`));
  parts.push(sec("look", t("s_look"), "", `<p class="small muted" style="margin:0 0 8px">${t("theme")}</p>
      <div class="chips" id="themeChips">${["system", "light", "dark"].map(k => `<button class="chip" data-th="${k}" aria-pressed="${LS.get("hbrt.theme", "system") === k}">${t("th_" + k)}</button>`).join("")}</div>
      <p class="small muted" style="margin:14px 0 8px">${t("language")}</p>
      <div class="chips" id="langChips">${[["en", "English"], ["fa", "دری"], ["ps", "پښتو"]].map(([k, n]) => `<button class="chip" data-l="${k}" aria-pressed="${LANG === k}">${n}</button>`).join("")}</div>`));
  parts.push(sec("exhibit", t("exhibition"), t("exhibition_sub"), `<button class="btn" id="exBtn">${ICON.tv.replace("<svg", '<svg width="18" height="18" style="vertical-align:-4px;margin-inline-end:6px"')}${t("exhibition")}</button>`));
  parts.push(`<section class="panel sec"><button class="btn danger" id="forgetBtn">${t("forget")}</button></section>`);
  parts.push(`<div class="credits">${t("credits")}<strong>Mostafa Mesbah Aabedi</strong><strong>Milad Ahmadi</strong>${t("team")}</div>`);
  const navIds = [...parts.join("").matchAll(/<section class="panel sec" id="sec-(\w+)"><h2>([^<]*)<\/h2>/g)];
  el.innerHTML = `<div class="vtitle"><h1>${t("s_title")}</h1></div>
    <nav class="secnav" aria-label="${esc(t("s_title"))}">${navIds.map(m => `<a href="#sec-${m[1]}">${m[2]}</a>`).join("")}</nav>
    <div>${parts.join("")}</div>`;
  el.querySelectorAll(".secnav a").forEach(a => a.onclick = e => { e.preventDefault(); $(a.getAttribute("href").slice(1))?.scrollIntoView({ behavior: "smooth" }); });
  wireSettings(el, dayBtns);
}
function slotHtml(x, i, dayBtns) {
  return `<div class="slot" data-slot="${i}"><input type="time" value="${hhmm(x.m ?? 360)}" class="sm"><label class="row" style="gap:6px"><input type="number" class="ss" min="1" max="600" value="${x.s ?? 20}" style="width:76px">${t("wt_secs")}</label>${dayBtns(x.d ?? 127, i)}<button class="iconbtn sdel" aria-label="${t("delete")}">${ICON.trash.replace("<svg", '<svg width="18" height="18"')}</button></div>`;
}
function ruleHtml(r, i) {
  const opt = (list, v) => list.map(([k, n]) => `<option value="${k}" ${k === v ? "selected" : ""}>${n}</option>`).join("");
  return `<div class="ruleline" data-rule="${i}">
    <span>${t("rule_if")}</span>
    <select class="rs">${opt(SENS.map(([k, n]) => [k, t(n)]), r.s)}</select>
    <select class="ro">${opt([["<", t("below")], [">", t("above")]], r.o)}</select>
    <input type="number" class="rv" step="0.5" value="${r.v ?? 30}">
    <span>${t("rule_then")}</span>
    <select class="rd">${opt(DEV.map(x => [x.d, devName(x.d)]), r.d)}</select>
    <select class="ron">${opt([["1", t("on")], ["0", t("off")]], r.on === false ? "0" : "1")}</select>
    <button class="iconbtn rdel" aria-label="${t("delete")}">${ICON.trash.replace("<svg", '<svg width="18" height="18"')}</button></div>`;
}
function wireSettings(el, dayBtns) {
  const q = sel => el.querySelector(sel);
  const toggle = id => { const b = $(id); if (b) b.onclick = () => b.setAttribute("aria-checked", b.getAttribute("aria-checked") !== "true"); };
  const on = id => $(id)?.getAttribute("aria-checked") === "true";
  const ok = async (obj, msg) => { if (await send(obj)) toast(msg || t("saved")); };
  ["stageSw", "schedSw", "rainSw", "quietSw", "sumSw"].forEach(toggle);
  if ($("nameSave")) $("nameSave").onclick = () => { const n = $("nameIn").value.trim(); if (n) ok({ device: "name", value: n }, t("name_saved")); };
  if ($("cropSave")) $("cropSave").onclick = () => {
    const v = $("plantIn").value;
    ok({ device: "config", crop: $("cropSel").value, plantDay: v ? Math.floor(new Date(v + "T12:00:00Z").getTime() / 86400000) : 0, autoStage: on("stageSw") });
  };
  el.querySelectorAll("#presets [data-p]").forEach(b => b.onclick = () => {
    const p = PRESETS[b.dataset.p];
    $("f-tempMin").value = p[0]; $("f-tempMax").value = p[1]; $("f-humMax").value = p[2]; $("f-soilMin").value = p[3];
    el.querySelectorAll("#presets [data-p]").forEach(x => x.setAttribute("aria-pressed", x === b));
  });
  if ($("limSave")) $("limSave").onclick = () => {
    const c = { device: "config" };
    for (const k of ["tempMax", "tempMin", "humMax", "soilMin", "waterMin", "pumpMax"]) { const v = parseFloat($("f-" + k).value); if (isNaN(v)) { toast(t("err_numbers")); return; } c[k] = v; }
    if (c.tempMin >= c.tempMax) { toast(t("err_minmax")); return; }
    if (c.pumpMax < 5 || c.pumpMax > 600) { toast(t("err_pump")); return; }
    ok(c);
  };
  const hours = () => { if (!$("lOn")) return; const h = ((mins($("lOff").value) - mins($("lOn").value) + 1440) % 1440) / 60; $("lightHours").textContent = on("schedSw") ? t("hours_light", h.toFixed(1)) : ""; $("schedTimes").hidden = !on("schedSw"); };
  if ($("schedSw")) { $("schedSw").addEventListener("click", hours); $("lOn").oninput = hours; $("lOff").oninput = hours; hours(); }
  if ($("lightSave")) $("lightSave").onclick = () => ok({ device: "config", lightSched: on("schedSw"), lightOn: mins($("lOn").value), lightOff: mins($("lOff").value) });
  const wireSlots = () => {
    el.querySelectorAll(".slot .days button").forEach(b => b.onclick = () => b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true"));
    el.querySelectorAll(".slot .sdel").forEach(b => b.onclick = () => b.closest(".slot").remove());
  };
  wireSlots();
  if ($("slotAdd")) $("slotAdd").onclick = () => {
    if (el.querySelectorAll(".slot").length >= 4) return;
    $("slots").insertAdjacentHTML("beforeend", slotHtml({ m: 1080, s: 20, d: 127 }, el.querySelectorAll(".slot").length, dayBtns));
    wireSlots();
  };
  if ($("timesSave")) $("timesSave").onclick = () => {
    const sched = [...el.querySelectorAll(".slot")].map(r => ({
      m: mins(r.querySelector(".sm").value), s: clamp(+r.querySelector(".ss").value || 20, 1, 600),
      d: [...r.querySelectorAll(".days button")].reduce((a, b) => a | (b.getAttribute("aria-pressed") === "true" ? 1 << +b.dataset.d : 0), 0),
    }));
    ok({ device: "config", sched, rainSkip: on("rainSw") });
  };
  const wireRules = () => el.querySelectorAll(".rdel").forEach(b => b.onclick = () => b.closest(".ruleline").remove());
  wireRules();
  if ($("ruleAdd")) $("ruleAdd").onclick = () => {
    if (el.querySelectorAll(".ruleline").length >= 6) return;
    $("noRules")?.remove();
    $("rules").insertAdjacentHTML("beforeend", ruleHtml({ s: "S", o: "<", v: 25, d: "pump", on: true }, 0));
    wireRules();
  };
  if ($("rulesSave")) $("rulesSave").onclick = () => {
    const rules = [...el.querySelectorAll(".ruleline")].map(r => ({ s: r.querySelector(".rs").value, o: r.querySelector(".ro").value, v: parseFloat(r.querySelector(".rv").value) || 0, d: r.querySelector(".rd").value, on: r.querySelector(".ron").value === "1" }));
    ok({ device: "config", rules });
  };
  el.querySelectorAll("#alertChips .chip").forEach(b => b.onclick = () => b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true"));
  if ($("alertsSave")) $("alertsSave").onclick = () => {
    const mask = [...el.querySelectorAll("#alertChips .chip")].reduce((a, b) => a | (b.getAttribute("aria-pressed") === "true" ? 1 << +b.dataset.i : 0), 0);
    ok({ device: "config", alertMask: mask, quiet: on("quietSw"), quietFrom: mins($("qFrom").value), quietTo: mins($("qTo").value), dailySummary: on("sumSw") });
  };
  if ($("notifSw")) $("notifSw").onclick = async () => {
    const want = $("notifSw").getAttribute("aria-checked") !== "true";
    if (want) {
      const p = "Notification" in window ? await Notification.requestPermission() : "denied";
      if (p !== "granted") { $("notifNote").hidden = false; return; }
    }
    LS.set("hbrt.notify", want);
    $("notifSw").setAttribute("aria-checked", want);
  };
  if ($("tgSave")) $("tgSave").onclick = () => { const v = $("tgTok").value.trim(); if (v) { ok({ device: "config", tgToken: v }); $("tgTok").value = ""; } };
  if ($("tgTest")) $("tgTest").onclick = () => ok({ device: "tgtest" }, t("tg_test"));
  if ($("tgRemove")) $("tgRemove").onclick = () => ok({ device: "config", tgToken: "" });
  if ($("tgLang")) $("tgLang").onchange = () => ok({ device: "config", lang: $("tgLang").value });
  if ($("useSave")) $("useSave").onclick = () => {
    const watt = {};
    DEV.slice(0, 4).forEach(x => { const v = parseFloat($("w-" + x.d).value); if (!isNaN(v)) watt[x.d] = v; });
    ok({ device: "config", flowMl: +$("flowIn").value || 20, tankL: +$("tankIn").value || 20, watt });
  };
  if ($("geoBtn")) $("geoBtn").onclick = () => navigator.geolocation?.getCurrentPosition(p => { $("latIn").value = p.coords.latitude.toFixed(4); $("lonIn").value = p.coords.longitude.toFixed(4); }, () => toast(t("not_sent")));
  if ($("heratBtn")) $("heratBtn").onclick = () => { $("latIn").value = 34.35; $("lonIn").value = 62.2; };
  if ($("locSave")) $("locSave").onclick = () => ok({ device: "config", lat: parseFloat($("latIn").value), lon: parseFloat($("lonIn").value) });
  el.querySelectorAll("[data-cal]").forEach(b => b.onclick = () => ok({ device: "cal", value: b.dataset.cal }, t("cal_done")));
  if ($("shareCtrl")) {
    $("shareCtrl").onclick = () => shareUrl(ctrlLink(S.cur), S.live.s?.name);
    $("copyCtrl").onclick = () => copy(ctrlLink(S.cur));
    $("qrCtrl").onclick = () => qrSheet(ctrlLink(S.cur), t("share_ctrl"));
  }
  if ($("otaBtn")) $("otaBtn").onclick = () => confirmBox(t("fw_update"), t("fw_confirm"), t("fw_update"), () => send({ device: "ota" }));
  if ($("rebootBtn")) $("rebootBtn").onclick = () => confirmBox(t("reboot"), t("reboot_q"), t("reboot"), () => send({ device: "reboot" }), true);
  el.querySelectorAll("[data-th]").forEach(b => b.onclick = () => { setTheme(b.dataset.th); el.querySelectorAll("[data-th]").forEach(x => x.setAttribute("aria-pressed", x === b)); S.built.control = false; });
  el.querySelectorAll("[data-l]").forEach(b => b.onclick = () => { setLang(b.dataset.l); renderAll(); });
  $("exBtn").onclick = openExhibit;
  $("forgetBtn").onclick = () => confirmBox(t("forget"), t("forget_q", S.live.s?.name || S.cur.name || ""), t("delete"), () => {
    S.list = S.list.filter(g => g.key !== S.cur.key); saveList();
    S.list.length ? open(S.list[0]) : showWelcome();
    view("home");
  }, true);
  if (!S.fwLatest && !S.ro) fetch("https://api.github.com/repos/mostafaaabedia-tech/Greenhouse_Kotlin/releases/latest").then(r => r.json()).then(j => { S.fwLatest = (j.tag_name || "").replace(/^[^\d]*/, ""); settingsLive(); }).catch(() => {});
}
function settingsLive() {
  const s = S.live.s;
  if (!s) return;
  if ($("rawS")) { $("rawS").textContent = t("cal_raw", s.raw?.s ?? "--") + " · " + fmt(s.soil) + "%"; $("rawW").textContent = t("cal_raw", s.raw?.w ?? "--") + " · " + fmt(s.water) + "%"; }
  const c = S.live.cfg || {};
  if ($("tgState")) {
    const st = s.tg || "off";
    $("tgState").textContent = st === "ok" ? t("tg_ok") : st === "wait" ? t("tg_wait") : st === "err" ? t("tg_err") : st === "on" ? t("connecting") : t("tg_off");
    $("tgState").style.color = st === "ok" ? "var(--brand)" : st === "err" ? "var(--danger)" : "";
    $("tgChat").textContent = c.tgChat ? "chat " + c.tgChat : "";
    $("tgTest").disabled = st !== "ok";
    $("tgRemove").hidden = !c.tgSet;
  }
  if ($("fwLine")) {
    $("fwLine").textContent = t("fw", s.fw || "?");
    $("fwLatest").textContent = S.fwLatest ? (S.fwLatest === s.fw ? t("fw_uptodate") : t("fw_latest", S.fwLatest)) : "";
    const ota = s.ota || "";
    $("otaState").textContent = ota.startsWith("failed") ? t("fw_failed", ota.slice(8)) : ota && ota !== "done" ? t("fw_updating") : "";
    $("otaState").style.color = ota.startsWith("failed") ? "var(--danger)" : "var(--muted)";
    const hp = s.hp || {}, rr = { 1: "rr_power", 3: "rr_sw", 4: "rr_panic", 5: "rr_wdt", 6: "rr_wdt", 7: "rr_wdt", 9: "rr_brown" }[hp.rr] || "rr_other";
    $("hpKv").innerHTML = [[t("hp_signal"), `${s.rssi ?? "--"} dBm`], [t("hp_uptime"), s.uptime ? dur(s.uptime) : "--"], [t("hp_heap"), hp.heap ? Math.round(hp.heap / 1024) + " KB" : "--"],
      [t("hp_reset"), t(rr)], [t("hp_drops"), hp.drops ?? "--"], [t("hp_cloud"), hp.cerr ?? "--"]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
    $("wifiLine").textContent = s.ssid ? `${t("wifi_name")}: ${s.ssid} · ${s.ip || ""}` : "";
  }
  const vr = $("viewRow");
  if (vr) {
    const vk = s.view;
    const want = vk ? "has" : "none";
    if (vr.dataset.state !== want + S.ro) {
      vr.dataset.state = want + S.ro;
      if (S.ro) {
        vr.innerHTML = `<button class="btn" id="shareView">${t("share")}</button><button class="btn ghost" id="copyView">${t("copy_link")}</button><button class="btn ghost" id="qrView">${t("qr")}</button>`;
      } else if (vk) {
        vr.innerHTML = `<button class="btn" id="shareView">${t("share")}</button><button class="btn ghost" id="copyView">${t("copy_link")}</button><button class="btn ghost" id="qrView">${t("qr")}</button><button class="link" id="viewOff" style="color:var(--danger)">${t("view_remove")}</button>`;
      } else {
        vr.innerHTML = `<button class="btn ghost" id="viewOn">${t("view_make")}</button>`;
      }
      const link = () => S.ro ? `${page()}#v=${S.cur.key}@${S.cur.db}` : viewLink(S.cur, S.live.s.view);
      if ($("shareView")) { $("shareView").onclick = () => shareUrl(link(), S.live.s?.name); $("copyView").onclick = () => copy(link()); $("qrView").onclick = () => qrSheet(link(), t("share_view")); }
      if ($("viewOff")) $("viewOff").onclick = () => send({ device: "view", value: false });
      if ($("viewOn")) $("viewOn").onclick = async () => { if (await send({ device: "view", value: true })) toast(t("view_wait")); };
    }
  }
}

/* ---------- exhibition mode ---------- */
function openExhibit() {
  const ex = $("exhibit");
  ex.innerHTML = `<button class="iconbtn xexit" id="xExit" aria-label="${t("exhibit_exit")}">✕</button>
    <div class="dial">${dialSvg("x")}</div>
    <div><div class="xname" id="xName"></div><div class="xsay" id="xSay"></div>
      <div class="xnums">${[["xT", "m_air_temp"], ["xH", "m_hum"], ["xS", "m_soil_moist"], ["xW", "m_water_tank"]].map(([id, k]) => `<div><span>${t(k)}</span><b id="${id}">--</b></div>`).join("")}</div>
      <div class="xqr" id="xQr"></div></div>
    <div class="xteam">${t("team")}</div>`;
  ex.classList.add("on");
  $("xExit").onclick = closeExhibit;
  document.documentElement.requestFullscreen?.().catch(() => {});
  S.exQr = "";
  renderExhibit();
}
function closeExhibit() { $("exhibit").classList.remove("on"); if (document.fullscreenElement) document.exitFullscreen?.(); }
function renderExhibit() {
  const s = S.live.s;
  if (!s) return;
  updateDial("x", s);
  $("xName").textContent = s.name || "";
  $("xSay").textContent = summary(s);
  $("xT").textContent = fmt(s.temperature, 1) + "°"; $("xH").textContent = fmt(s.humidity) + "%"; $("xS").textContent = fmt(s.soil) + "%"; $("xW").textContent = fmt(s.water) + "%";
  const link = S.ro ? `${page()}#v=${S.cur.key}@${S.cur.db}` : s.view ? viewLink(S.cur, s.view) : "";
  if (link && S.exQr !== link) {
    S.exQr = link;
    qrImg(link).then(img => { $("xQr").innerHTML = `<span class="qrbox">${img}</span><p>${t("exhibit_scan")}</p>`; });
  } else if (!link && S.exQr !== "none") {
    S.exQr = "none";
    $("xQr").innerHTML = `<button class="btn" id="xMake">${t("view_make")}</button>`;
    $("xMake").onclick = () => send({ device: "view", value: true });
  }
}

/* ---------- small UI helpers ---------- */
function sheet(html) {
  const sh = $("sheet");
  if (html === null) { sh.classList.remove("on"); return; }
  $("sheetBox").innerHTML = html;
  sh.classList.add("on");
  setTimeout(() => $("sheetBox").querySelector("button,input")?.focus(), 50);
}
function confirmBox(title, body, okLabel, fn, danger) {
  sheet(`<span class="grab"></span><h2>${esc(title)}</h2>${body ? `<p class="muted">${esc(body)}</p>` : ""}
    <div class="row" style="margin-top:16px"><button class="btn ${danger ? "danger" : ""} grow" id="cOk">${esc(okLabel)}</button><button class="btn ghost grow" id="cNo">${t("cancel")}</button></div>`);
  $("cOk").onclick = () => { sheet(null); fn(); };
  $("cNo").onclick = () => sheet(null);
}
let tt;
function toast(m) { const e = $("toast"); e.textContent = m; e.classList.add("on"); clearTimeout(tt); tt = setTimeout(() => e.classList.remove("on"), 2400); }
async function copy(text) { try { await navigator.clipboard.writeText(text); toast(t("copied")); } catch (e) { prompt("", text); } }
async function shareUrl(url, name) {
  try { if (navigator.share) { await navigator.share({ title: "HBRT: " + (name || ""), url }); return; } } catch (e) { return; }
  copy(url);
}
function loadScript(src) {
  return new Promise((res, rej) => { if ([...document.scripts].some(s => s.src === src)) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function qrImg(url) {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js");
  const q = qrcode(0, "M"); q.addData(url); q.make();
  return `<img src="${q.createDataURL(8, 2)}" alt="QR">`;
}
async function qrSheet(url, title) {
  sheet(`<span class="grab"></span><h2>${esc(title)}</h2><div style="text-align:center;margin:16px 0" id="qrHere"></div><button class="btn ghost wide" id="qrClose">${t("close")}</button>`);
  $("qrClose").onclick = () => sheet(null);
  try { $("qrHere").innerHTML = `<span class="qrbox">${await qrImg(url)}</span>`; } catch (e) { $("qrHere").textContent = url; }
}
async function notifyAlerts(s) {
  const al = s.al || [];
  const prev = S.prevAl;
  S.prevAl = al.slice();
  if (prev === null || !LS.get("hbrt.notify", false) || !("Notification" in window) || Notification.permission !== "granted") return;
  for (const a of al) {
    if (prev.includes(a)) continue;
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const body = alertText(a, s);
      if (reg) reg.showNotification(s.name || "HBRT", { body, icon: "icon.svg", tag: "hbrt-" + a });
      else new Notification(s.name || "HBRT", { body });
    } catch (e) {}
  }
}

/* ---------- welcome + greenhouse picker ---------- */
function showApp() { $("welcome").hidden = true; $("app").hidden = false; }
function showWelcome() {
  close(); S.cur = null;
  $("app").hidden = true;
  const w = $("welcome");
  w.hidden = false;
  w.innerHTML = `<svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true"><use href="#i-leaf"/></svg>
    <h1>${t("w_title")}</h1><p class="muted">${t("w_sub")}</p>
    <ol><li>${t("w_1")}</li><li>${t("w_2")}</li><li>${t("w_3")}</li></ol>
    <form id="addForm" class="stack" style="margin-top:20px"><label class="f">${t("share_link")}<input id="addIn" type="url" inputmode="url" autocomplete="off" required placeholder="https://mostafaaabedia-tech.github.io/HBRT-AGRO/#g=…"></label>
    <button class="btn wide">${t("add_gh")}</button><p id="addErr" class="small" style="color:var(--danger);margin:0"></p></form>
    <div class="langpick">${[["en", "English"], ["fa", "دری"], ["ps", "پښتو"]].map(([k, n]) => `<button class="chip" data-l="${k}" aria-pressed="${LANG === k}">${n}</button>`).join("")}</div>
    <div class="credits">${t("credits")}<strong>Mostafa Mesbah Aabedi</strong><strong>Milad Ahmadi</strong>${t("team")}</div>`;
  $("addForm").onsubmit = e => { e.preventDefault(); addFrom($("addIn"), $("addErr")); };
  w.querySelectorAll("[data-l]").forEach(b => b.onclick = () => { setLang(b.dataset.l); showWelcome(); });
}
function addFrom(input, err) {
  const ref = parseRef(input.value);
  if (!ref) { err.textContent = t("bad_link"); return; }
  sheet(null);
  open(addRef(ref));
}
function pickSheet() {
  sheet(`<span class="grab"></span><h2 style="margin-bottom:12px">${t("gh_title")}</h2><div id="ghList">${S.list.map(g => `
    <button class="ghrow ${S.cur && g.key === S.cur.key ? "cur" : ""}" data-k="${g.key}"><span class="av">${esc((g.name || "G")[0].toUpperCase())}</span>
    <span class="grow"><b>${esc(g.name || "Greenhouse")}</b><span class="mini" id="mini-${g.key}">${g.ro ? t("view_only") : ""}</span></span></button>`).join("")}</div>
    <form id="addForm2" class="stack" style="margin-top:14px"><label class="f">${t("gh_add_more")}<input id="addIn2" type="url" inputmode="url" autocomplete="off" required></label>
    <button class="btn wide">${t("add_gh")}</button><p id="addErr2" class="small" style="color:var(--danger);margin:0"></p></form>`);
  $("ghList").querySelectorAll(".ghrow").forEach(b => b.onclick = () => { sheet(null); open(S.list.find(g => g.key === b.dataset.k)); });
  $("addForm2").onsubmit = e => { e.preventDefault(); addFrom($("addIn2"), $("addErr2")); };
  // quick live numbers for every greenhouse
  S.list.forEach(async g => {
    try {
      const r = await fetch(base(g) + "/live/s.json"); const s = await r.json();
      const el = $("mini-" + g.key);
      if (s && el) {
        const fresh = s.t && Date.now() - (s.t - S.skew) < 60000;
        el.innerHTML = `<span style="color:var(--temp)">${fmt(s.temperature, 1)}°</span><span style="color:var(--hum)">${fmt(s.humidity)}%</span><span style="color:var(--soil)">${fmt(s.soil)}%</span><span>${fresh ? t("live") : t("offline")}</span>`;
      }
    } catch (e) {}
  });
}

/* ---------- start ---------- */
setLang(LANG);
setTheme(LS.get("hbrt.theme", "system"));
matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => { setTheme(LS.get("hbrt.theme", "system")); S.built.control = false; scheduleRender(); });
$("pickBtn").onclick = pickSheet;
$("logo").onclick = e => { e.preventDefault(); view("home"); };
$("sheet").addEventListener("click", e => { if (e.target.id === "sheet") sheet(null); });
addEventListener("keydown", e => { if (e.key === "Escape") { sheet(null); closeExhibit(); } });
document.addEventListener("visibilitychange", () => { if (!document.hidden) beat(); });
addEventListener("online", () => S.cur && open(S.cur));
addEventListener("resize", () => { if (S.view === "history" && S.built.history) { drawChart(); } });
setInterval(() => { if (S.cur) { renderTop(); if (S.view === "home" && S.live.s) $("hMeta").textContent = t("updated_ago", ago(Date.now() - S.at)) + (S.live.s.uptime ? " · " + t("running_for", dur(S.live.s.uptime)) : ""); } }, 5000);
setInterval(() => { if (S.cur && S.view === "history") loadLog(true); }, 300000);

loadList();
const fromLink = parseRef(location.hash);
if (fromLink) {
  const g = addRef(fromLink);
  history.replaceState(null, "", location.pathname);   // keep the private key out of the address bar
  open(g);
} else if (S.list.length) {
  const k = LS.get(STORE + ".cur", null);
  open(S.list.find(g => g.key === k) || S.list[0]);
} else showWelcome();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

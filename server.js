"use strict";
/* Kaygan Zeminde Şut kayıt sitesi. Harici paket gerektirmez (Node 18+). */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ""; // kodda tutulmaz, ortam değişkeniyle verilir
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, "data.json");
const LIMIT = 16;
const INDEX = path.join(__dirname, "public", "index.html");

const DEFAULT_CONFIG = {
  title: "Kaygan Zeminde Şut",
  desc: "Zemin kaygan, kontenjan 16 kişi. Yerini ayır, ilk gelen sahaya çıkar.",
  when: "",
  open: true,
};

/* ---------- Veri ---------- */
let data = { config: { ...DEFAULT_CONFIG }, slots: {} };
try {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  data.config = { ...DEFAULT_CONFIG, ...(raw.config || {}) };
  data.slots = raw.slots || {};
} catch (e) { /* ilk açılış */ }

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) { console.error("Kayıt dosyası yazılamadı:", e.message); }
}

/* ---------- Yardımcılar ---------- */
const sessions = new Map(); // yönetici oturumları: token -> bitiş zamanı
const hits = new Map();     // hız sınırı: anahtar -> [zaman damgaları]

function limited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (v < now) sessions.delete(k);
  for (const [k, v] of hits) if (!v.some((t) => now - t < 120000)) hits.delete(k);
}, 60000).unref();

function ip(req) {
  const xf = req.headers["x-forwarded-for"];
  return (xf ? String(xf).split(",")[0].trim() : req.socket.remoteAddress) || "?";
}
function sameStr(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function maskName(n) {
  const p = String(n).trim().split(/\s+/);
  return p.length < 2 ? p[0] : p[0] + " " + p[p.length - 1].charAt(0).toLocaleUpperCase("tr-TR") + ".";
}
function clean(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
function clientToken(req) {
  const t = String(req.headers["x-client-token"] || "");
  return /^[A-Za-z0-9_-]{8,64}$/.test(t) ? t : "";
}
function isAdmin(req) {
  const m = /^Bearer (\S+)$/.exec(String(req.headers.authorization || ""));
  if (!m) return false;
  const exp = sessions.get(m[1]);
  return !!exp && exp > Date.now();
}
function taken() { return Object.keys(data.slots).length; }
function mineOf(token) {
  if (!token) return 0;
  for (const n of Object.keys(data.slots)) if (data.slots[n].token === token) return Number(n);
  return 0;
}

function send(res, status, body, extra) {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  }, extra || {}));
  res.end(json);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 20000) { reject(new Error("big")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch (e) { reject(new Error("json")); }
    });
    req.on("error", reject);
  });
}

/* ---------- API ---------- */
function publicState(token) {
  const mine = mineOf(token);
  const slots = {};
  for (const n of Object.keys(data.slots)) {
    const s = data.slots[n];
    slots[n] = { name: Number(n) === mine ? s.name : maskName(s.name) };
  }
  return { config: data.config, limit: LIMIT, slots, mine };
}
function adminState() {
  const slots = {};
  for (const n of Object.keys(data.slots)) {
    const s = data.slots[n];
    slots[n] = { name: s.name, contact: s.contact, at: s.at };
  }
  return { slots };
}

async function api(req, res, url) {
  const route = req.method + " " + url;
  const token = clientToken(req);

  if (route === "GET /api/state") return send(res, 200, publicState(token));

  let body = {};
  if (req.method === "POST") {
    try { body = await readBody(req); }
    catch (e) { return send(res, 400, { error: "bad_request" }); }
  }

  if (route === "POST /api/register") {
    if (limited("reg:" + ip(req), 40, 60000)) return send(res, 429, { error: "rate" });
    if (!token) return send(res, 400, { error: "token" });
    const name = clean(body.name, 40), contact = clean(body.contact, 60);
    if (name.length < 3 || name.split(" ").length < 2) return send(res, 400, { error: "name" });
    if (contact.length < 5) return send(res, 400, { error: "contact" });
    if (!data.config.open) return send(res, 403, { error: "closed" });
    if (mineOf(token)) return send(res, 409, { error: "already", n: mineOf(token) });
    for (let i = 1; i <= LIMIT; i++) {
      if (!data.slots[i]) {
        data.slots[i] = { name, contact, token, at: Date.now() };
        save();
        return send(res, 200, { n: i });
      }
    }
    return send(res, 409, { error: "full" });
  }

  if (route === "POST /api/cancel") {
    const n = mineOf(token);
    if (!n) return send(res, 404, { error: "none" });
    delete data.slots[n]; save();
    return send(res, 200, { ok: true });
  }

  if (route === "POST /api/admin/login") {
    if (limited("login:" + ip(req), 6, 60000)) return send(res, 429, { error: "rate" });
    if (!ADMIN_PASSWORD || !sameStr(body.password, ADMIN_PASSWORD)) return send(res, 401, { error: "password" });
    const t = crypto.randomBytes(24).toString("hex");
    sessions.set(t, Date.now() + 12 * 3600 * 1000);
    return send(res, 200, { token: t });
  }

  if (url.startsWith("/api/admin/")) {
    if (!isAdmin(req)) return send(res, 401, { error: "auth" });

    if (route === "GET /api/admin/state") return send(res, 200, adminState());

    if (route === "POST /api/admin/config") {
      const title = clean(body.title, 60);
      if (!title) return send(res, 400, { error: "title" });
      data.config = {
        title,
        desc: clean(body.desc, 400),
        when: clean(body.when, 80),
        open: body.open !== false,
      };
      save();
      return send(res, 200, { config: data.config });
    }
    if (route === "POST /api/admin/slot/delete") {
      const n = Number(body.n);
      if (!Number.isInteger(n) || n < 1 || n > LIMIT) return send(res, 400, { error: "n" });
      delete data.slots[n]; save();
      return send(res, 200, { ok: true });
    }
    if (route === "POST /api/admin/reset") {
      data.slots = {}; save();
      return send(res, 200, { ok: true });
    }
    if (route === "POST /api/admin/logout") {
      const m = /^Bearer (\S+)$/.exec(String(req.headers.authorization || ""));
      if (m) sessions.delete(m[1]);
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: "not_found" });
}

/* ---------- Sunucu ---------- */
const server = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];
  try {
    if (url.startsWith("/api/")) return await api(req, res, url);
    if (url === "/healthz") return send(res, 200, { ok: true, taken: taken() });
    if ((req.method === "GET" || req.method === "HEAD") && (url === "/" || url === "/index.html")) {
      const html = fs.readFileSync(INDEX);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
      });
      return res.end(req.method === "HEAD" ? undefined : html);
    }
    res.writeHead(302, { Location: "/" });
    res.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: "server" });
  }
});

server.listen(PORT, () => {
  console.log("Site hazır: http://localhost:" + PORT);
  if (!ADMIN_PASSWORD) console.warn("UYARI: ADMIN_PASSWORD tanımlı değil, yönetici girişi kapalı.");
});

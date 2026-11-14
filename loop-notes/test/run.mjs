// Runs the server functions against stubbed Google, Firecrawl, Claude and Redis. No keys or network needed: npm test
import assert from "node:assert/strict";
Object.assign(process.env, { ANTHROPIC_API_KEY: "k", FIRECRAWL_API_KEY: "k", GOOGLE_CLIENT_ID: "cid", UPSTASH_REDIS_REST_URL: "https://redis.test", UPSTASH_REDIS_REST_TOKEN: "t", ADMIN_KEY: "admin", DAILY_SEARCHES_PER_USER: "2" });
const db = new Map(), calls = { search: 0, scrape: 0, claude: 0 };
let claudeFails = false;
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  if (url.startsWith("https://oauth2.googleapis.com/tokeninfo")) {
    const t = new URL(url).searchParams.get("id_token");
    if (t.startsWith("good")) return json({ aud: "cid", iss: "accounts.google.com", exp: String(Math.floor(Date.now() / 1000) + 600), email_verified: "true", sub: t, email: t + "@x.test" });
    if (t === "wrongaud") return json({ aud: "other", iss: "accounts.google.com", exp: String(Math.floor(Date.now() / 1000) + 600), email_verified: "true", sub: "z" });
    return json({ error: "invalid" }, 400);
  }
  if (url === "https://redis.test") {
    const [c, k, ...a] = JSON.parse(opt.body);
    if (c === "GET") return json({ result: db.get(k) ?? null });
    if (c === "SET") { db.set(k, a[0]); return json({ result: "OK" }); }
    if (c === "INCR" || c === "DECR") { const n = (+db.get(k) || 0) + (c === "INCR" ? 1 : -1); db.set(k, n); return json({ result: n }); }
    if (c === "EXPIRE" || c === "LTRIM") return json({ result: 1 });
    if (c === "LPUSH") { db.set(k, [a[0], ...(db.get(k) || [])]); return json({ result: 1 }); }
    if (c === "LRANGE") return json({ result: db.get(k) || [] });
  }
  if (url.endsWith("/v2/search")) { calls.search++; return json({ success: true, data: { web: [
    { url: "https://www.reddit.com/r/x/1", title: "Acme SDE interview", description: "Round 1 graphs" },
    { url: "https://example.com/a", title: "Acme process", description: "3 rounds" },
    { url: "javascript:alert(1)", title: "bad", description: "" }] } }); }
  if (url.endsWith("/v2/scrape")) { calls.scrape++; return json({ success: true, data: { markdown: "In March 2026 I interviewed at Acme. ".repeat(20) } }); }
  if (url.startsWith("https://api.anthropic.com")) { calls.claude++;
    if (claudeFails) return json({ error: { message: "overloaded" } }, 529);
    const review = JSON.parse(opt.body).max_tokens === 600;
    return json({ content: [{ type: "text", text: review ? "Good start." : 'Here you go:\n{"summary":"s","caveats":"thin","rounds":[{"name":"Coding","what":"w","share":80,"topics":["Graphs"]}],"questions":[{"q":"Shortest path with a stop","round":"Coding","topic":"Graphs","src":1,"date":"2026-03","mentions":2,"hint":"h"},{"q":"Bad src","src":99,"date":"soon"}],"plan":[{"day":"Day 1","title":"t","minutes":60,"tasks":["a","b"]}]}' }] });
  }
  throw new Error("unexpected fetch " + url);
};
const call = async (mod, { method = "POST", token, body, query } = {}) => {
  const out = {}; const res = { setHeader() {}, status(c) { out.status = c; return res; }, json(o) { out.body = o; } };
  await (await import(mod)).default({ method, headers: token ? { authorization: "Bearer " + token } : {}, body, query }, res);
  return out;
};
const R = "../api/research.js";
let r = await call(R, { body: { company: "Acme", role: "SDE" } }); assert.equal(r.status, 401);
r = await call(R, { token: "wrongaud", body: { company: "Acme", role: "SDE" } }); assert.equal(r.status, 401);
r = await call(R, { token: "good1", body: { company: "A", role: "" } }); assert.equal(r.status, 400);
r = await call(R, { token: "good1", body: { company: "Acme", role: "SDE" } });
assert.equal(r.status, 200); assert.equal(r.body.cached, false);
const rep = r.body.report;
assert.equal(rep.mode, "live"); assert.equal(rep.sources.length, 2); assert.equal(rep.pagesRead, 2);
assert.deepEqual([rep.questions[0].src, rep.questions[0].date], [1, "2026-03"]);
assert.deepEqual([rep.questions[1].src, rep.questions[1].date], [null, null]);
const before = { ...calls };
r = await call(R, { token: "good2", body: { company: " acme ", role: "sde" } });
assert.equal(r.body.cached, true); assert.deepEqual(calls, before, "cache hit must not spend credits");
claudeFails = true; r = await call(R, { token: "good1", body: { company: "Beta", role: "SDE" } }); assert.equal(r.status, 502); claudeFails = false;
r = await call(R, { token: "good1", body: { company: "Beta", role: "SDE" } }); assert.equal(r.status, 200, "failed run was refunded");
r = await call(R, { token: "good1", body: { company: "Gamma", role: "SDE" } }); assert.equal(r.status, 429, "third new search of the day is refused");
r = await call("../api/review.js", { token: "good1", body: { company: "Acme", role: "SDE", question: "Q", approach: "short" } }); assert.equal(r.status, 400);
r = await call("../api/review.js", { token: "good1", body: { company: "Acme", role: "SDE", question: "Q", approach: "x".repeat(130) } }); assert.equal(r.body.text, "Good start.");
r = await call("../api/feedback.js", { token: "good1", body: { message: "The date on question 2 is wrong", kind: "question" } }); assert.equal(r.status, 200);
r = await call("../api/feedback.js", { method: "GET", query: { key: "nope" } }); assert.equal(r.status, 403);
r = await call("../api/feedback.js", { method: "GET", query: { key: "admin" } }); assert.equal(r.body.count, 1);
r = await call("../api/config.js", { method: "GET" }); assert.deepEqual(r.body, { googleClientId: "cid", dailyLimit: 2, ready: true });
console.log("all server checks passed");

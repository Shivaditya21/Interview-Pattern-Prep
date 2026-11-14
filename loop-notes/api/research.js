import { cfg, HttpError, missingConfig, send, handle, body, clean, redis, take, giveBack, requireUser, webSearch, readPage, claude, parseJson, promptLive, promptMemory, normalise } from "../lib/core.js";

const FIRST_HAND = /reddit\.com|leetcode\.com|medium\.com|teamblind\.com|glassdoor\.|geeksforgeeks\.org|substack\.com|dev\.to|hashnode/;
const httpUrl = u => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

export default function handler(req, res) {
  return handle(res, async () => {
    if (req.method !== "POST") throw new HttpError(405, "Use POST.");
    if (missingConfig().length) throw new HttpError(503, "The site isn't fully set up yet.");
    const user = await requireUser(req);
    const b = body(req), company = clean(b.company, 80), role = clean(b.role, 80);
    if (company.length < 2 || role.length < 2) throw new HttpError(400, "Enter a company and a role.");
    const c = cfg(), cacheKey = "rep:v1:" + `${company}|${role}`.toLowerCase();

    const hit = await redis("GET", cacheKey);
    if (hit) { try { return send(res, 200, { report: JSON.parse(hit), cached: true }); } catch {} }

    if (!(await take("u:" + user.id, c.perUser))) throw new HttpError(429, `You have used today's ${c.perUser} new searches. Reports other people already ran still open instantly. Come back tomorrow.`);
    if (!(await take("all", c.total))) { await giveBack("u:" + user.id); throw new HttpError(429, "The site has reached today's research budget. Try again tomorrow."); }
    const refund = () => Promise.all([giveBack("u:" + user.id), giveBack("all")]);

    try {
      const yr = new Date().getFullYear();
      const found = await Promise.allSettled([
        webSearch(`${company} ${role} interview experience`, 8),
        webSearch(`${company} ${role} interview questions asked reddit leetcode`, 8),
        webSearch(`${company} ${role} interview process rounds ${yr}`, 6),
      ]);
      if (found.every(f => f.status === "rejected")) throw new HttpError(502, "Web search isn't answering right now. Try again in a minute.");
      const seen = new Set(), hits = [];
      for (const h of found.flatMap(f => f.status === "fulfilled" ? f.value : [])) {
        const url = httpUrl(h?.url); if (!url || seen.has(url)) continue; seen.add(url);
        hits.push({ title: clean(h.title, 160), url, snippet: clean(h.description || h.snippet, 600), read: false, text: "" });
      }
      const top = hits.slice(0, 20);
      const pick = [...top].sort((a, z) => (FIRST_HAND.test(z.url) ? 1 : 0) - (FIRST_HAND.test(a.url) ? 1 : 0)).slice(0, 5);
      const pages = await Promise.allSettled(pick.map(h => readPage(h.url)));
      pages.forEach((p, i) => { if (p.status === "fulfilled" && p.value.length > 200) { pick[i].read = true; pick[i].text = p.value.replace(/!\[[^\]]*\]\([^)]*\)/g, "").slice(0, 6000); } });

      const base = { id: "r" + Date.now(), company, role, createdAt: new Date().toISOString(), mode: top.length ? "live" : "memory",
        sources: top.map(h => ({ title: h.title, url: h.url, read: h.read })), pagesRead: top.filter(h => h.read).length };
      const evidence = top.map((h, i) => `[${i + 1}] ${h.title}\nURL: ${h.url}\nSnippet: ${h.snippet}${h.text ? `\nPage text:\n${h.text}` : ""}`).join("\n\n---\n\n");
      let raw;
      try { raw = parseJson(await claude(top.length ? promptLive(company, role, evidence) : promptMemory(company, role))); }
      catch (e) { console.error(e); throw new HttpError(502, "The analysis didn't finish. Try the search again."); }
      const report = normalise(raw, base);
      await redis("SET", cacheKey, JSON.stringify(report), "EX", c.cacheDays * 86400).catch(() => {});
      send(res, 200, { report, cached: false });
    } catch (e) { await refund(); throw e; }
  });
}

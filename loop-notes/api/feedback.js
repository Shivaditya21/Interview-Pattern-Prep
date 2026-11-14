import { HttpError, send, handle, body, clean, redis, take, requireUser } from "../lib/core.js";

// POST: a signed-in tester reports a problem. GET ?key=ADMIN_KEY: the owner reads the reports.
export default function handler(req, res) {
  return handle(res, async () => {
    if (req.method === "GET") {
      const admin = (process.env.ADMIN_KEY || "").trim();
      if (!admin || req.query?.key !== admin) throw new HttpError(403, "Not allowed.");
      const rows = await redis("LRANGE", "feedback", 0, 499);
      return send(res, 200, { count: rows.length, feedback: rows.map(r => { try { return JSON.parse(r); } catch { return { raw: r }; } }) });
    }
    if (req.method !== "POST") throw new HttpError(405, "Use POST.");
    const user = await requireUser(req);
    const b = body(req), message = typeof b.message === "string" ? b.message.trim().slice(0, 2000) : "";
    if (message.length < 5) throw new HttpError(400, "Say a little more about what went wrong.");
    if (!(await take("fb:" + user.id, 20))) throw new HttpError(429, "That's a lot of reports for one day. Thank you. Send more tomorrow.");
    const row = { at: new Date().toISOString(), email: user.email, kind: clean(b.kind, 40), company: clean(b.company, 80), role: clean(b.role, 80), question: clean(b.question, 320), message };
    await redis("LPUSH", "feedback", JSON.stringify(row));
    await redis("LTRIM", "feedback", 0, 1999);
    send(res, 200, { ok: true });
  });
}

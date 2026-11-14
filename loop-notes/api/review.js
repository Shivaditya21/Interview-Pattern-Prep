import { cfg, HttpError, missingConfig, send, handle, body, clean, take, requireUser, claude, promptReview } from "../lib/core.js";

export default function handler(req, res) {
  return handle(res, async () => {
    if (req.method !== "POST") throw new HttpError(405, "Use POST.");
    if (missingConfig().length) throw new HttpError(503, "The site isn't fully set up yet.");
    const user = await requireUser(req);
    const b = body(req), company = clean(b.company, 80), role = clean(b.role, 80), question = clean(b.question, 320);
    const approach = typeof b.approach === "string" ? b.approach.trim().slice(0, 6000) : "";
    if (!question || approach.length < 120) throw new HttpError(400, "Write at least 120 characters of your approach first.");
    if (!(await take("rv:" + user.id, cfg().reviews))) throw new HttpError(429, "You have used today's approach reviews. Come back tomorrow.");
    let text;
    try { text = await claude(promptReview(company, role, question, approach), 600); }
    catch (e) { console.error(e); throw new HttpError(502, "The review didn't finish. Try again."); }
    send(res, 200, { text: text.trim() });
  });
}

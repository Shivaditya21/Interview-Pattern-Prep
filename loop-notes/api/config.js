import { cfg, missingConfig, send } from "../lib/core.js";

export default function handler(req, res) {
  const c = cfg();
  send(res, 200, { googleClientId: c.googleClientId, dailyLimit: c.perUser, ready: missingConfig().length === 0 });
}

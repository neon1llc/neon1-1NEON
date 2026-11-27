// apps/api/src/routes/trin.ts - Ask Trin about this organization's work. Capped twice before any model call:
// questions per person per day, and the month's estimated model spend across all organizations ($5 by default).
// Logs carry counts and cost only, never what was asked or answered.


import { TrinAsk, type TrinReply } from "@1neon/domain";
import { HTTPException } from "hono/http-exception";
import { body, fail, need, who } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { cite, gather, material, nudges, RULES, search } from "../trin/trin.ts";


// Prices in dollars per million tokens: Nova Lite in and out, and Titan V2 embeddings (about four characters a token)
const PRICE = { input: 0.06, output: 0.24, embed: 0.02 };
const DAILY_PER_PERSON = 40;


export function trinRoutes(app: App, k: Kit) {
  const { d, repo } = k;

  app.post("/t/:tid/trin", async (c) => {
    need(c, "read");
    if (!d.trin) fail(503, "trin_off", "Trin isn't available here.");
    const ask = await body(c, TrinAsk);
    const { user } = who(c);
    const t = c.get("tenant");
    const day = new Date().toISOString().slice(0, 10);
    if ((await repo.table.increment("COUNTER", `TRIN#${user.id}#${day}`, 1, Math.floor(Date.now() / 1000) + 3 * 86_400)) > DAILY_PER_PERSON) {
      fail(429, "trin_daily", "That's a lot of questions for one day. Trin is back tomorrow.");
    }
    const month = day.slice(0, 7);
    if (Number((await repo.table.get("COUNTER", `TRIN#${month}`))?.n ?? 0) >= d.trin.monthlyUsd * 1_000_000) {
      fail(429, "trin_month", "Trin has reached this month's limit and is back on the 1st.");
    }
    const started = Date.now();
    try {
      const { chunks, projects, items } = await gather(repo, t.id, t.slug);
      const { top, embedChars } = await search(repo, d.trin.model, t.id, chunks, ask);
      const today = new Date().toLocaleDateString("en-CA", { timeZone: t.timeZone ?? "America/New_York" });
      const inView = ask.projectId ? projects.find((p) => p.id === ask.projectId) : undefined;
      const question = `${material(top, nudges(projects, items, today), today)}\n\n${inView ? `Project in view: ${inView.key} ${inView.name}\n\n` : ""}Question: ${ask.question}`;
      const r = await d.trin.model.answer(RULES, [...ask.history.map((h) => ({ role: h.role, text: h.text })), { role: "user" as const, text: question }]);
      // Millionths of a dollar: tokens times dollars per million tokens
      const micros = Math.ceil(r.inputTokens * PRICE.input + r.outputTokens * PRICE.output + (embedChars / 4) * PRICE.embed);
      await repo.table.increment("COUNTER", `TRIN#${month}`, micros);
      // Each [n] becomes a link to its piece; the cited pieces come back as the sources
      const { answer, sources } = cite(r.text.trim(), top);
      console.log(JSON.stringify({ message: "trin", pieces: chunks.length, top: top.length, ms: Date.now() - started, micros }));
      const reply: TrinReply = { answer: answer || "I couldn't find anything on that yet.", sources };
      return c.json(reply);
    } catch (e) {
      if (e instanceof HTTPException) throw e;
      console.error(JSON.stringify({ level: "error", message: "trin failed", error: (e as Error).name }));
      fail(503, "trin_unavailable", "Trin couldn't answer. Try again.");
    }
  });
}

// packages/domain/src/trin.ts - What the browser sends Trin and what comes back. Trin answers from the
// organization's own work (projects, items, pages) and names where it found things.


import { z } from "zod";


/** A question, the project in view (answers lean toward it), and the last few turns */
export const TrinAsk = z.object({
  question: z.string().trim().min(1).max(1000),
  projectId: z.string().max(64).optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(8).default([]),
});
export type TrinAsk = z.infer<typeof TrinAsk>;

/** The answer, and the places it drew on, each a link inside 1NEON */
export interface TrinReply {
  answer: string;
  sources: { title: string; href: string }[];
}

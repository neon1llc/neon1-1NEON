// apps/api/src/trin/bedrock.ts - Trin's models in production: an Amazon Nova model through Bedrock's Converse
// API to answer, and Titan Text Embeddings V2 (256 numbers per piece) to search. Signed with the function's
// own role, which may call only these two (infra/modules/api, and the neon1-boundary-1neon ceiling). Imported
// only by the Lambda handler.


import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import type { TrinModel } from "./trin.ts";


/** Bedrock calls bounded to 15 seconds each, a few embeddings at a time */
export function bedrockTrin(modelId: string, embedId: string, region = process.env.AWS_REGION ?? "us-east-1"): TrinModel {
  const client = new BedrockRuntimeClient({ region, maxAttempts: 2, requestHandler: { requestTimeout: 15_000 } as never });
  const one = async (text: string) => {
    const r = await client.send(new InvokeModelCommand({ modelId: embedId, contentType: "application/json", accept: "application/json", body: JSON.stringify({ inputText: text.slice(0, 8000), dimensions: 256, normalize: true }) }));
    return (JSON.parse(new TextDecoder().decode(r.body)) as { embedding: number[] }).embedding;
  };
  return {
    async embed(texts) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += 8) out.push(...(await Promise.all(texts.slice(i, i + 8).map(one))));
      return out;
    },
    async answer(system, messages) {
      const r = await client.send(new ConverseCommand({
        modelId,
        system: [{ text: system }],
        messages: messages.map((m) => ({ role: m.role, content: [{ text: m.text }] })),
        inferenceConfig: { maxTokens: 700, temperature: 0.3 },
      }));
      const text = r.output?.message?.content?.map((c) => c.text ?? "").join("") ?? "";
      return { text, inputTokens: r.usage?.inputTokens ?? 0, outputTokens: r.usage?.outputTokens ?? 0 };
    },
  };
}

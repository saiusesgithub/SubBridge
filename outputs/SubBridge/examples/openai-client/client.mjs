import OpenAI from "openai";

if (!process.env.SUBBRIDGE_TOKEN || !process.env.SUBBRIDGE_MODEL) throw new Error("Set SUBBRIDGE_TOKEN and SUBBRIDGE_MODEL to a configured gateway token and available model ID.");
const client = new OpenAI({ baseURL: process.env.SUBBRIDGE_BASE_URL ?? "http://127.0.0.1:8787/v1", apiKey: process.env.SUBBRIDGE_TOKEN, maxRetries: 0 });
const response = await client.chat.completions.create({
  model: process.env.SUBBRIDGE_MODEL,
  messages: [{ role: "user", content: "Say hello in one short sentence." }]
});
console.log(response.choices[0]?.message.content);

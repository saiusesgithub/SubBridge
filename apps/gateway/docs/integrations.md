# Integration examples

All examples call the local endpoint and read `SUBBRIDGE_TOKEN` from the process environment. The `gpt-6-luna` model is illustrative; check `/v1/models` and your provider's account/model access first.

## Plain curl

```sh
export SUBBRIDGE_TOKEN="<gateway-token>"
curl http://127.0.0.1:8787/v1/chat/completions -H "Authorization: Bearer $SUBBRIDGE_TOKEN" -H "Content-Type: application/json" -d '{"model":"gpt-6-luna","messages":[{"role":"user","content":"Hello from my app!"}]}'
```

## JavaScript / TypeScript, official OpenAI SDK

```sh
mkdir subbridge-js && cd subbridge-js
npm init -y
npm install openai
```

Save as `index.mjs`:

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://127.0.0.1:8787/v1",
  apiKey: process.env.SUBBRIDGE_TOKEN,
});

const response = await client.chat.completions.create({
  model: "gpt-6-luna", // example; choose an ID available from your provider
  messages: [{ role: "user", content: "Hello from my app!" }],
});
console.log(response.choices[0].message.content);
```

Run `SUBBRIDGE_TOKEN="your-local-token" node index.mjs` (POSIX) or set `$env:SUBBRIDGE_TOKEN = "your-local-token"` then run `node index.mjs` (PowerShell).

## Python, official OpenAI SDK

```sh
python -m venv .venv
# Activate .venv for your shell. On macOS/Linux use `source .venv/bin/activate`; in PowerShell use `.venv\Scripts\Activate.ps1`.
python -m pip install openai
```

Save as `main.py`:

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8787/v1",
    api_key=os.environ["SUBBRIDGE_TOKEN"],
)
response = client.chat.completions.create(
    model="gpt-6-luna",  # example; check your provider's available model IDs
    messages=[{"role": "user", "content": "Hello from my app!"}],
)
print(response.choices[0].message.content)
```

Run `SUBBRIDGE_TOKEN="your-local-token" python main.py` (POSIX) or set `$env:SUBBRIDGE_TOKEN = "your-local-token"` then run `python main.py` (PowerShell).

## Next.js backend route

```sh
npx create-next-app@latest subbridge-next --typescript --app --no-src-dir --use-npm
cd subbridge-next
npm install openai
```

Add `.env.local` (server-side only):

```dotenv
SUBBRIDGE_TOKEN=<gateway-token>
SUBBRIDGE_MODEL=gpt-6-luna
```

Save `app/api/chat/route.ts`:

```typescript
import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({ baseURL: "http://127.0.0.1:8787/v1", apiKey: process.env.SUBBRIDGE_TOKEN });

export async function POST(request: Request) {
  const { message } = await request.json() as { message?: string };
  if (typeof message !== "string" || !message.trim()) return NextResponse.json({ error: "message is required" }, { status: 400 });
  try {
    const result = await client.chat.completions.create({ model: process.env.SUBBRIDGE_MODEL ?? "gpt-6-luna", messages: [{ role: "user", content: message }] });
    return NextResponse.json({ text: result.choices[0]?.message.content ?? "" });
  } catch (error) {
    console.error("SubBridge request failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }
}
```

Run `npm run dev` and POST `{"message":"Hi"}` to `http://localhost:3000/api/chat`. Keep the token on the server; never expose it through a `NEXT_PUBLIC_` variable.

## FastAPI backend

```sh
python -m venv .venv
python -m pip install fastapi uvicorn openai
```

Save as `main.py`:

```python
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from openai import OpenAI, OpenAIError

app = FastAPI()
client = OpenAI(base_url="http://127.0.0.1:8787/v1", api_key=os.environ["SUBBRIDGE_TOKEN"])

class ChatRequest(BaseModel):
    message: str

@app.post("/chat")
def chat(body: ChatRequest):
    try:
        result = client.chat.completions.create(
            model=os.getenv("SUBBRIDGE_MODEL", "gpt-6-luna"),
            messages=[{"role": "user", "content": body.message}],
        )
        return {"text": result.choices[0].message.content or ""}
    except OpenAIError as exc:
        raise HTTPException(status_code=502, detail="SubBridge request failed") from exc
```

Set `SUBBRIDGE_TOKEN` and run `uvicorn main:app --host 127.0.0.1 --port 8000`. Send `{"message":"Hi"}` to `POST http://127.0.0.1:8000/chat`.

## Simple command-line chatbot

Save this as `chat.mjs` in the JavaScript example folder:

```javascript
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "http://127.0.0.1:8787/v1", apiKey: process.env.SUBBRIDGE_TOKEN });
const terminal = readline.createInterface({ input: stdin, output: stdout });
try {
  while (true) {
    const prompt = await terminal.question("you> ");
    if (["/quit", "/exit"].includes(prompt.trim())) break;
    const result = await client.chat.completions.create({ model: process.env.SUBBRIDGE_MODEL ?? "gpt-6-luna", messages: [{ role: "user", content: prompt }] });
    console.log(`assistant> ${result.choices[0]?.message.content ?? ""}`);
  }
} finally { terminal.close(); }
```

Run `SUBBRIDGE_TOKEN="your-local-token" node chat.mjs` (POSIX) or set `$env:SUBBRIDGE_TOKEN = "your-local-token"` then run `node chat.mjs` (PowerShell). This example starts a fresh one-message conversation each turn.

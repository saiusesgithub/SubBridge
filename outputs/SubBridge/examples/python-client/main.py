import os
import sys
from openai import OpenAI

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

if not os.getenv("SUBBRIDGE_TOKEN") or not os.getenv("SUBBRIDGE_MODEL"):
    raise RuntimeError("Set SUBBRIDGE_TOKEN and SUBBRIDGE_MODEL from your local SubBridge setup.")

client = OpenAI(
    base_url=os.getenv("SUBBRIDGE_BASE_URL", "http://127.0.0.1:8787/v1"),
    api_key=os.environ["SUBBRIDGE_TOKEN"],
    max_retries=0,
)
result = client.chat.completions.create(
    model=os.environ["SUBBRIDGE_MODEL"],
    messages=[{"role": "user", "content": "Reply with a short greeting."}],
)
print(result.choices[0].message.content)

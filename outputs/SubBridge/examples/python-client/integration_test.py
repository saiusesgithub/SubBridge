import os
from openai import APIError, OpenAI

token = os.environ["SUBBRIDGE_TOKEN"]
model = os.environ["SUBBRIDGE_MODEL"]
base = os.getenv("SUBBRIDGE_BASE_URL", "http://127.0.0.1:8787/v1")
client = OpenAI(base_url=base, api_key=token, max_retries=0)

normal = client.chat.completions.create(model=model, messages=[{"role": "user", "content": "Reply with exactly python-sdk-ok"}])
assert normal.object == "chat.completion" and normal.model == model and normal.choices[0].message.content
print("PASS Python SDK normal completion")

conversation = client.chat.completions.create(model=model, messages=[{"role": "user", "content": "Remember this word: bluejay."}, {"role": "assistant", "content": "I will remember bluejay."}, {"role": "user", "content": "What was the word?"}])
assert "bluejay" in (conversation.choices[0].message.content or "").lower()
print("PASS Python SDK multi-message conversation")

stream = client.chat.completions.create(model=model, stream=True, messages=[{"role": "user", "content": "Reply with exactly python-stream-ok"}])
text = ""
finished = False
for chunk in stream:
    text += chunk.choices[0].delta.content or ""
    finished = finished or chunk.choices[0].finish_reason == "stop"
assert "python-stream-ok" in text.lower() and finished
print("PASS Python SDK SSE stream")

try:
    client.chat.completions.create(model=model, messages=[])
    raise AssertionError("Expected invalid request exception")
except APIError as error:
    assert error.status_code == 400
print("PASS Python SDK API error mapping")

bad_auth = OpenAI(base_url=base, api_key="invalid-subbridge-token", max_retries=0)
try:
    bad_auth.models.list()
    raise AssertionError("Expected authentication error")
except APIError as error:
    assert error.status_code == 401
print("PASS Python SDK authentication rejection")

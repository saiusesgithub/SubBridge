# Official OpenAI Python SDK example

Uses the official OpenAI Python SDK with SubBridge's Chat Completions endpoint. Tested with Python 3.13.3 and OpenAI SDK 3.28.0 in the local verification environment. Set the model to an ID available through your configured provider.

```powershell
cd examples/python-client
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:SUBBRIDGE_TOKEN = '<your local gateway token>'
$env:SUBBRIDGE_MODEL = '<available model ID>'
.venv\Scripts\python.exe main.py
```

macOS/Linux:

```sh
cd examples/python-client
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
export SUBBRIDGE_TOKEN='<your local gateway token>'
export SUBBRIDGE_MODEL='<available model ID>'
python main.py
```

`python integration_test.py` covers regular completion, multi-message context, SSE, invalid requests and bad-token rejection. It makes actual provider calls and may consume usage; run only when intended. Codex streaming returns the final response in an SSE chunk, not token-by-token text.

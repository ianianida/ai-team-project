#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
MODEL_PYTHON="${MODEL_SERVER_PYTHON:-.venv/bin/python}"
if [[ ! -x "$MODEL_PYTHON" ]] || ! command -v ngrok >/dev/null; then
  echo "Install the Python requirements and ngrok first; see HTTPS_SETUP.md." >&2
  exit 1
fi
"$MODEL_PYTHON" - <<'PY'
from dotenv import dotenv_values
from urllib.request import urlopen
from urllib.error import HTTPError
import os

if not (os.getenv("MODEL_SERVER_API_KEY") or dotenv_values(".env").get("MODEL_SERVER_API_KEY")):
    raise SystemExit("Set MODEL_SERVER_API_KEY and restart the model server before opening a tunnel.")
port = os.getenv("MODEL_SERVER_PORT", "8001")
with urlopen(f"http://127.0.0.1:{port}/health", timeout=10) as response:
    if response.status != 200:
        raise SystemExit("Start the model server first.")
try:
    urlopen(f"http://127.0.0.1:{port}/labels", timeout=10)
except HTTPError as exc:
    if exc.code != 401:
        raise SystemExit("Check model-server authentication before opening a tunnel.")
else:
    raise SystemExit("Model server is not enforcing the shared API key. Restart it first.")
PY
# Specify the account's dev domain explicitly: some agents otherwise use a random URL.
NGROK_HOST="$("$MODEL_PYTHON" - <<'PY'
from dotenv import dotenv_values
import os, re
host = os.getenv("NGROK_DOMAIN") or dotenv_values(".env").get("NGROK_DOMAIN", "")
if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]*\.ngrok-free\.(app|dev)", host):
    raise SystemExit("Set NGROK_DOMAIN to your free dev domain from dashboard.ngrok.com/domains.")
print(host)
PY
)"
exec ngrok http "http://127.0.0.1:${MODEL_SERVER_PORT:-8001}" --url "https://$NGROK_HOST" --inspect=false

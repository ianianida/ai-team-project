#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
MODEL_PYTHON="${MODEL_SERVER_PYTHON:-.venv/bin/python}"
if [[ ! -x "$MODEL_PYTHON" ]]; then
  echo "Create model-server/.venv and install requirements.txt first." >&2
  exit 1
fi
exec "$MODEL_PYTHON" -m uvicorn main:create_app --factory --host "${MODEL_SERVER_HOST:-127.0.0.1}" --port "${MODEL_SERVER_PORT:-8001}"

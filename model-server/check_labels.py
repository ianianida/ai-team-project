"""Check the six rental labels against the running model's actual class map."""

import argparse
import json
import os
from pathlib import Path

from dotenv import load_dotenv
import httpx

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8001")
    args = parser.parse_args()
    load_dotenv(ROOT / ".env", override=False)
    headers = {}
    if key := os.getenv("MODEL_SERVER_API_KEY"):
        headers["X-API-Key"] = key
    expected = json.loads((ROOT.parent / "supabase" / "item-labels.json").read_text(encoding="utf-8"))
    with httpx.Client(base_url=args.base_url, headers=headers, timeout=10) as client:
        health = client.get("/health")
        health.raise_for_status()
        if health.json()["model"]["name"] != expected["model"]:
            raise SystemExit("The running model does not match item-labels.json")
        response = client.get("/model/classes")
        response.raise_for_status()
    actual = {row["id"]: row["name"] for row in response.json()["classes"]}
    failures = []
    for label in expected["labels"]:
        correct = actual.get(label["model_class_id"]) == label["model_label"]
        print(f"{'OK' if correct else 'FAIL'} {label['name']}: {label['model_label']} ({label['model_class_id']})")
        if not correct:
            failures.append(label["model_label"])
    if failures:
        raise SystemExit("Unsupported model labels: " + ", ".join(failures))
    print(f"Verified {len(expected['labels'])} labels. No DB writes or accuracy evaluation were performed.")


if __name__ == "__main__":
    main()

from io import BytesIO
import sys
from pathlib import Path

import httpx
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import Settings, create_app


class FakeEngine:
    """Contract tests only. Real YOLO inference is verified separately."""
    model = None
    device = "cpu"
    names = {80: "Calculator", 129: "Computer mouse", 438: "Scissors"}

    def load(self):
        self.model = object()

    def predict(self, image):
        return [
            {"class_id": 80, "model_label": "Calculator", "score": 0.9, "box": [1, 1, 20, 20]},
            {"class_id": 129, "model_label": "Computer mouse", "score": 0.8, "box": [20, 20, 40, 40]},
        ]


def image_file():
    stream = BytesIO()
    Image.new("RGB", (64, 48), "white").save(stream, "PNG")
    return {"file": ("photo.png", stream.getvalue(), "image/png")}


def configured(**kwargs):
    return Settings(supabase_url="https://test.supabase.co", supabase_key="sb_secret_test", **kwargs)


def test_live_http_catalog_mapping_keeps_real_ids_and_unknown_unmapped():
    requests = []

    def database(request):
        requests.append(request)
        return httpx.Response(200, json=[{"id": "db-calculator-id", "name": "공학용 계산기", "model_label": "Calculator"}])

    with TestClient(create_app(configured(), FakeEngine(), httpx.MockTransport(database))) as client:
        response = client.post("/predict", files=image_file())
        assert response.status_code == 200
        data = response.json()
        assert data["predictions"][0]["catalog_label"]["id"] == "db-calculator-id"
        assert data["predictions"][0]["catalog_label"]["name"] == "공학용 계산기"
        assert data["predictions"][1]["catalog_label"] is None
        assert data["predictions"][1]["match_status"] == "unmapped"
        assert data["requires_confirmation"] is True
        assert data["catalog"]["connected"] is True
        assert all(request.method == "GET" for request in requests)
        assert requests[0].url.params["is_active"] == "eq.true"
        assert "authorization" not in requests[0].headers


def test_duplicate_mapping_is_ambiguous_and_never_chooses_an_id():
    rows = [
        {"id": "first", "name": "계산기 A", "model_label": "Calculator"},
        {"id": "second", "name": "계산기 B", "model_label": " calculator "},
    ]
    with TestClient(create_app(configured(), FakeEngine(), httpx.MockTransport(lambda _: httpx.Response(200, json=rows)))) as client:
        prediction = client.post("/predict", files=image_file()).json()["predictions"][0]
        assert prediction["match_status"] == "ambiguous"
        assert prediction["catalog_label"] is None
        assert len(prediction["candidates"]) == 2


def test_database_failure_does_not_return_a_fake_catalog_match_or_secret():
    transport = httpx.MockTransport(lambda _: httpx.Response(401, json={"message": "sb_secret_test"}))
    with TestClient(create_app(configured(), FakeEngine(), transport)) as client:
        response = client.post("/predict", files=image_file())
        assert response.status_code == 503
        assert "sb_secret_test" not in response.text
        assert client.get("/health").json()["catalog"]["connected"] is False


def test_no_database_is_explicit_and_does_not_invent_rows():
    with TestClient(create_app(Settings(), FakeEngine())) as client:
        data = client.post("/predict", files=image_file()).json()
        assert data["status"] == "catalog_not_configured"
        assert data["catalog"]["connected"] is False
        assert all(row["catalog_label"] is None for row in data["predictions"])
        assert client.get("/labels").status_code == 503


def test_invalid_images_and_missing_api_keys_are_rejected():
    with TestClient(create_app(Settings(api_key="local-test-key"), FakeEngine())) as client:
        assert client.post("/predict", files=image_file()).status_code == 401
        response = client.post("/predict", headers={"X-API-Key": "local-test-key"}, files={"file": ("broken.jpg", b"not-an-image", "image/jpeg")})
        assert response.status_code == 415


def test_catalog_refresh_replaces_names_without_restarting_model():
    current = [{"id": "one", "name": "이전 이름", "model_label": "Calculator"}]
    with TestClient(create_app(configured(), FakeEngine(), httpx.MockTransport(lambda _: httpx.Response(200, json=list(current))))) as client:
        current[0] = {"id": "one", "name": "바뀐 이름", "model_label": "Calculator"}
        assert client.post("/labels/reload").status_code == 200
        data = client.post("/predict", files=image_file()).json()
        assert data["predictions"][0]["catalog_label"]["name"] == "바뀐 이름"

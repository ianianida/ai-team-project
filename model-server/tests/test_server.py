from io import BytesIO
import sys
from pathlib import Path

import httpx
import pytest
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


class CapturingEngine(FakeEngine):
    received = None

    def predict(self, image):
        self.received = image.copy()
        return super().predict(image)


def encoded_file(image, format, **save_options):
    data = BytesIO()
    image.save(data, format, **save_options)
    mime = {"PNG": "image/png", "WEBP": "image/webp", "JPEG": "image/jpeg"}[format]
    return {"file": ("photo." + format.lower(), data.getvalue(), mime)}


@pytest.mark.parametrize("format", ["PNG", "WEBP"])
def test_transparent_uploads_reach_model_with_white_background_and_opaque_pixels_preserved(format):
    photo = Image.new("RGBA", (16, 12), (0, 0, 0, 0))
    photo.putpixel((1, 0), (12, 23, 34, 255))
    photo.putpixel((2, 0), (0, 0, 0, 128))
    engine = CapturingEngine()
    options = {"lossless": True} if format == "WEBP" else {}
    with TestClient(create_app(Settings(), engine)) as client:
        assert client.post("/predict", files=encoded_file(photo, format, **options)).status_code == 200
    assert engine.received.mode == "RGB"
    assert engine.received.size == photo.size
    assert engine.received.getpixel((0, 0)) == (255, 255, 255)
    assert engine.received.getpixel((1, 0)) == (12, 23, 34)
    assert engine.received.getpixel((2, 0)) == (127, 127, 127)


def test_palette_transparency_is_composited_before_model_inference():
    photo = Image.new("P", (16, 12), 0)
    photo.putpalette([0, 0, 0, 20, 30, 40] + [0] * 762)
    photo.putpixel((1, 0), 1)
    engine = CapturingEngine()
    with TestClient(create_app(Settings(), engine)) as client:
        assert client.post("/predict", files=encoded_file(photo, "PNG", transparency=0)).status_code == 200
    assert engine.received.getpixel((0, 0)) == (255, 255, 255)
    assert engine.received.getpixel((1, 0)) == (20, 30, 40)


def test_opaque_rgb_upload_is_not_reencoded_or_changed():
    photo = Image.new("RGB", (16, 12), (17, 31, 49))
    engine = CapturingEngine()
    with TestClient(create_app(Settings(), engine)) as client:
        assert client.post("/predict", files=encoded_file(photo, "PNG")).status_code == 200
    assert engine.received.mode == "RGB"
    assert engine.received.tobytes() == photo.tobytes()


def test_camera_exif_orientation_is_still_applied():
    photo = Image.new("RGB", (20, 12), (100, 50, 20))
    exif = Image.Exif()
    exif[274] = 6
    engine = CapturingEngine()
    with TestClient(create_app(Settings(), engine)) as client:
        response = client.post("/predict", files=encoded_file(photo, "JPEG", exif=exif))
        assert response.status_code == 200
        assert response.json()["image"] == {"width": 12, "height": 20}
    assert engine.received.size == (12, 20)

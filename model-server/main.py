"""YOLO inference with read-only Supabase label resolution."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from io import BytesIO
import logging
import os
from pathlib import Path
import re
import secrets
import threading
import time
import unicodedata
import warnings

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
import httpx

ROOT = Path(__file__).resolve().parent
MODEL_NAME = "yolov8n-oiv7.pt"
load_dotenv(ROOT / ".env", override=False)
os.environ.setdefault("YOLO_CONFIG_DIR", str(ROOT / ".cache" / "ultralytics"))
logger = logging.getLogger("model_server")


@dataclass(frozen=True)
class Settings:
    supabase_url: str = ""
    supabase_key: str = ""
    schema: str = "public"
    table: str = "item_labels"
    id_column: str = "id"
    name_column: str = "name"
    model_column: str = "model_label"
    active_column: str = "is_active"
    cache_seconds: float = 60
    device: str = "auto"
    confidence: float = 0.25
    image_size: int = 640
    max_detections: int = 20
    max_upload_mb: int = 10
    api_key: str = ""
    allowed_origins: tuple[str, ...] = ("http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173")

    @classmethod
    def from_env(cls) -> Settings:
        result = cls(
            supabase_url=os.getenv("SUPABASE_URL", "").rstrip("/"),
            supabase_key=os.getenv("SUPABASE_KEY", ""),
            schema=os.getenv("SUPABASE_SCHEMA", "public"),
            table=os.getenv("SUPABASE_LABEL_TABLE", "item_labels"),
            id_column=os.getenv("SUPABASE_LABEL_ID_COLUMN", "id"),
            name_column=os.getenv("SUPABASE_LABEL_NAME_COLUMN", "name"),
            model_column=os.getenv("SUPABASE_LABEL_MODEL_COLUMN", "model_label"),
            active_column=os.getenv("SUPABASE_LABEL_ACTIVE_COLUMN", "is_active"),
            cache_seconds=float(os.getenv("LABEL_CACHE_SECONDS", "60")),
            device=os.getenv("MODEL_DEVICE", "auto"),
            confidence=float(os.getenv("MODEL_CONFIDENCE", "0.25")),
            image_size=int(os.getenv("MODEL_IMAGE_SIZE", "640")),
            max_detections=int(os.getenv("MODEL_MAX_DETECTIONS", "20")),
            max_upload_mb=int(os.getenv("MAX_UPLOAD_MB", "10")),
            api_key=os.getenv("MODEL_SERVER_API_KEY", ""),
            allowed_origins=tuple(x.strip() for x in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173").split(",") if x.strip()),
        )
        for value in (result.schema, result.table, result.id_column, result.name_column, result.model_column):
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value):
                raise ValueError("Supabase schema/table/column settings must be simple identifiers")
        if result.active_column and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", result.active_column):
            raise ValueError("Invalid active column")
        if bool(result.supabase_url) != bool(result.supabase_key):
            raise ValueError("Set both SUPABASE_URL and SUPABASE_KEY, or leave both empty")
        if result.supabase_url and not result.supabase_url.startswith("https://"):
            raise ValueError("SUPABASE_URL must use HTTPS")
        if not 0 < result.confidence <= 1 or result.max_upload_mb <= 0 or result.cache_seconds < 0:
            raise ValueError("Invalid confidence, upload limit, or cache duration")
        return result

    @property
    def configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_key)


def normalize(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).replace("_", " ").casefold().split())


class CatalogError(Exception):
    pass


class CatalogLabel(BaseModel):
    id: str
    name: str
    model_label: str


class SupabaseCatalog:
    """Only SELECT requests; no fallback rows and no database writes."""

    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings = settings
        self.client = client
        self.rows: list[CatalogLabel] | None = None
        self.loaded_at = 0.0
        self.last_error: str | None = None
        self.lock = asyncio.Lock()

    async def fetch(self, force: bool = False) -> list[CatalogLabel]:
        s = self.settings
        if not s.configured:
            return []
        async with self.lock:
            if not force and self.rows is not None and time.monotonic() - self.loaded_at < s.cache_seconds:
                return self.rows
            headers = {"apikey": s.supabase_key, "Accept-Profile": s.schema}
            # New sb_secret keys are API keys, not JWTs. Legacy keys are JWTs.
            if s.supabase_key.count(".") == 2:
                headers["Authorization"] = f"Bearer {s.supabase_key}"
            columns = list(dict.fromkeys([s.id_column, s.name_column, s.model_column]))
            params = {"select": ",".join(columns), "order": f"{s.id_column}.asc", "limit": "1000"}
            if s.active_column:
                params[s.active_column] = "eq.true"
            rows: list[CatalogLabel] = []
            try:
                for offset in range(0, 100_000, 1000):
                    response = await self.client.get(
                        f"{s.supabase_url}/rest/v1/{s.table}",
                        headers=headers,
                        params={**params, "offset": str(offset)},
                    )
                    response.raise_for_status()
                    page = response.json()
                    if not isinstance(page, list):
                        raise ValueError("Expected a JSON row array")
                    for row in page:
                        values = [row.get(s.id_column), row.get(s.name_column), row.get(s.model_column)]
                        if any(value is None or not str(value).strip() for value in values):
                            raise ValueError("Label rows require id, name and model_label")
                        rows.append(CatalogLabel(id=str(values[0]), name=str(values[1]), model_label=str(values[2])))
                    if len(page) < 1000:
                        break
                else:
                    raise ValueError("Label catalog exceeds the configured safety limit")
            except (httpx.HTTPError, ValueError, TypeError, AttributeError) as exc:
                # Never include request headers, keys, or upstream response bodies.
                code = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
                self.last_error = f"Supabase label read failed{f' (HTTP {code})' if code else ''}"
                raise CatalogError(self.last_error) from None
            self.rows, self.loaded_at, self.last_error = rows, time.monotonic(), None
            return rows

    def status(self) -> dict:
        if not self.settings.configured:
            return {"status": "not_configured", "connected": False, "label_count": 0}
        return {
            "status": "error" if self.last_error else "connected" if self.rows is not None else "not_checked",
            "connected": self.rows is not None and self.last_error is None,
            "label_count": len(self.rows or []),
        }


class YoloEngine:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.model = None
        self.names: dict[int, str] = {}
        self.device = "not_loaded"
        self.lock = threading.Lock()

    def load(self):
        import torch
        from ultralytics import YOLO

        path = ROOT / "models" / MODEL_NAME
        path.parent.mkdir(parents=True, exist_ok=True)
        self.model = YOLO(str(path))
        self.names = dict(self.model.names)
        required = {"Calculator", "Scissors", "Computer mouse"}
        if not required.issubset(set(self.names.values())):
            raise RuntimeError("Wrong model: expected the Open Images V7 label set")
        self.device = self.settings.device
        if self.device == "auto":
            self.device = "cuda:0" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
        # Warm up before reporting the model as ready.
        self.predict(Image.new("RGB", (640, 640), "white"))

    def predict(self, image: Image.Image) -> list[dict]:
        if self.model is None:
            raise RuntimeError("Model is not loaded")
        with self.lock:
            result = self.model.predict(
                source=image,
                device=self.device,
                imgsz=self.settings.image_size,
                conf=self.settings.confidence,
                max_det=self.settings.max_detections,
                verbose=False,
                save=False,
            )[0]
            predictions = []
            for box in result.boxes:
                class_id = int(box.cls.item())
                predictions.append({
                    "class_id": class_id,
                    "model_label": self.names[class_id],
                    "score": float(box.conf.item()),
                    "box": [round(float(x), 2) for x in box.xyxy[0].tolist()],
                })
            return sorted(predictions, key=lambda row: row["score"], reverse=True)


def resolve_predictions(predictions: list[dict], labels: list[CatalogLabel]) -> list[dict]:
    by_name: dict[str, list[CatalogLabel]] = {}
    for label in labels:
        by_name.setdefault(normalize(label.model_label), []).append(label)
    result = []
    for detection in predictions:
        matches = by_name.get(normalize(detection["model_label"]), [])
        result.append({
            **detection,
            "match_status": "matched" if len(matches) == 1 else "ambiguous" if matches else "unmapped",
            "catalog_label": matches[0].model_dump() if len(matches) == 1 else None,
            "candidates": [label.model_dump() for label in matches] if len(matches) > 1 else [],
        })
    return result


def create_app(settings: Settings | None = None, engine=None, transport=None) -> FastAPI:
    s = settings or Settings.from_env()
    predictor = engine or YoloEngine(s)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with httpx.AsyncClient(timeout=10, follow_redirects=False, transport=transport) as client:
            app.state.catalog = SupabaseCatalog(s, client)
            await run_in_threadpool(predictor.load)
            if s.configured:
                try:
                    await app.state.catalog.fetch()
                except CatalogError as exc:
                    logger.warning("%s; inference requests will return 503 until the catalog recovers", exc)
            yield

    app = FastAPI(title="공용 물품 모델 서버", version="1.0.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=list(s.allowed_origins), allow_methods=["GET", "POST"], allow_headers=["Content-Type", "X-API-Key"])

    @app.middleware("http")
    async def limit_body(request, call_next):
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > s.max_upload_mb * 1024 * 1024 + 1024 * 1024:
            return JSONResponse(status_code=413, content={"detail": "Upload is too large"})
        return await call_next(request)

    def authenticate(x_api_key: str | None = Header(default=None)):
        if s.api_key and not secrets.compare_digest(x_api_key or "", s.api_key):
            raise HTTPException(status_code=401, detail="Invalid model server API key")

    async def get_labels() -> list[CatalogLabel]:
        try:
            return await app.state.catalog.fetch()
        except CatalogError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from None

    @app.get("/health")
    async def health():
        return {
            "model": {"name": MODEL_NAME, "loaded": predictor.model is not None, "device": predictor.device, "class_count": len(predictor.names)},
            "catalog": app.state.catalog.status(),
        }

    @app.get("/model/classes", dependencies=[Depends(authenticate)])
    async def model_classes(q: str = Query(default="", max_length=100)):
        return {"classes": [{"id": key, "name": value} for key, value in predictor.names.items() if normalize(q) in normalize(value)]}

    @app.get("/labels", dependencies=[Depends(authenticate)])
    async def labels():
        if not s.configured:
            raise HTTPException(status_code=503, detail="Supabase is not configured; set SUPABASE_URL and SUPABASE_KEY")
        rows = await get_labels()
        supported = {normalize(name) for name in predictor.names.values()}
        return {"labels": [{**row.model_dump(), "model_supported": normalize(row.model_label) in supported} for row in rows]}

    @app.post("/labels/reload", dependencies=[Depends(authenticate)])
    async def reload_labels():
        if not s.configured:
            raise HTTPException(status_code=503, detail="Supabase is not configured")
        try:
            rows = await app.state.catalog.fetch(force=True)
        except CatalogError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from None
        return {"label_count": len(rows), "catalog": app.state.catalog.status()}

    @app.post("/predict", dependencies=[Depends(authenticate)])
    async def predict(file: UploadFile = File(...)):
        data = await file.read(s.max_upload_mb * 1024 * 1024 + 1)
        await file.close()
        if len(data) > s.max_upload_mb * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"Images must be at most {s.max_upload_mb} MB")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(BytesIO(data)) as source:
                    if source.format not in {"JPEG", "PNG", "WEBP"}:
                        raise HTTPException(status_code=415, detail="Use a JPEG, PNG, or WebP image")
                    if source.width * source.height > 25_000_000:
                        raise HTTPException(status_code=413, detail="Image dimensions exceed 25 megapixels")
                    image = ImageOps.exif_transpose(source).convert("RGB")
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise HTTPException(status_code=415, detail="Invalid or unsupported image") from None
        labels = await get_labels()
        started = time.perf_counter()
        predictions = await run_in_threadpool(predictor.predict, image)
        resolved = resolve_predictions(predictions, labels)
        return {
            "model": MODEL_NAME,
            "image": {"width": image.width, "height": image.height},
            "inference_ms": round((time.perf_counter() - started) * 1000, 1),
            "catalog": app.state.catalog.status(),
            "status": "catalog_not_configured" if not s.configured else "no_detection" if not resolved else "review_required",
            "requires_confirmation": True,
            "predictions": resolved,
        }

    return app

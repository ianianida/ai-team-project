"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  canvasPhoto,
  prepareReturnPhoto,
  type PreparedPhoto,
} from "@/lib/return-photo";

type Label = {
  id: string;
  name: string;
  model_label: string;
  model_supported?: boolean;
};
type Detection = {
  model_label: string;
  score: number;
  box: [number, number, number, number];
  match_status: "matched" | "unmapped" | "ambiguous";
  catalog_label: Label | null;
};
type Prediction = {
  image: { width: number; height: number };
  catalog: { connected: boolean; label_count: number };
  predictions: Detection[];
};
type Photo = PreparedPhoto & { url: string };
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-field bg-surface px-4 py-2.5 font-semibold hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";

function CameraIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="m8 5 1.5-2h5L16 5h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function cameraMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "카메라 권한을 허용해 주세요. 사진 선택이나 휴대폰 기본 카메라도 사용할 수 있어요.";
  if (name === "NotFoundError")
    return "연결된 카메라를 찾지 못했어요. 사진을 선택해 주세요.";
  if (name === "NotReadableError")
    return "다른 앱이 카메라를 사용 중일 수 있어요. 카메라를 닫고 다시 시도해 주세요.";
  return "카메라를 열지 못했어요. 사진 선택이나 휴대폰 기본 카메라를 사용해 주세요.";
}

export default function ReturnCapture() {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [result, setResult] = useState<Prediction | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [returning, setReturning] = useState(false);
  const [returnStarted, setReturnStarted] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnedQuantity, setReturnedQuantity] = useState<number | null>(null);
  const returnAttempt = useRef<{ request_id: string; label_id: string } | null>(null);
  const returnLock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<"closed" | "opening" | "open">(
    "closed",
  );
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [labels, setLabels] = useState<Label[]>([]);
  const [labelsError, setLabelsError] = useState(false);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const resultPanel = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nativeCameraInput = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const cameraVersion = useRef(0);
  const photoVersion = useRef(0);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cameraVersion.current += 1;
      photoVersion.current += 1;
      stream.current?.getTracks().forEach((track) => track.stop());
      request.current?.abort();
    };
  }, []);

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/model/labels", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog unavailable");
        const data = await response.json();
        if (!Array.isArray(data.labels)) throw new Error("invalid catalog");
        if (!controller.signal.aborted) {
          setLabels(
            data.labels.filter((label: Label) => label.model_supported),
          );
          setLabelsError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLabelsError(true);
      });
    return () => controller.abort();
  }, [catalogVersion]);

  useEffect(() => {
    if (!cameraStream || !video.current) return;
    video.current.srcObject = cameraStream;
    video.current.play().catch(() => {
      cameraStream.getTracks().forEach((track) => track.stop());
      if (mounted.current && stream.current === cameraStream) {
        stream.current = null;
        setCameraStream(null);
        setCameraState("closed");
        setCameraReady(false);
        setCameraError(
          "카메라 미리보기를 시작하지 못했어요. 기본 카메라 촬영을 이용해 주세요.",
        );
      }
    });
  }, [cameraStream]);

  function closeCamera() {
    cameraVersion.current += 1;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCameraStream(null);
    setCameraState("closed");
    setCameraReady(false);
  }

  async function openCamera() {
    if (preparing || recognizing || returnStarted || cameraState !== "closed") return;
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      nativeCameraInput.current?.click();
      return;
    }
    const version = ++cameraVersion.current;
    setCameraState("opening");
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1600 },
          height: { ideal: 1200 },
        },
        audio: false,
      });
      if (!mounted.current || version !== cameraVersion.current) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = nextStream;
      setCameraStream(nextStream);
      setCameraState("open");
    } catch (cause) {
      if (mounted.current && version === cameraVersion.current) {
        setCameraState("closed");
        setCameraError(cameraMessage(cause));
      }
    }
  }

  async function choosePhoto(file: File) {
    if (returnStarted) return;
    closeCamera();
    const version = ++photoVersion.current;
    request.current?.abort();
    setPreparing(true);
    setPhoto(null);
    setError(null);
    setResult(null);
    setSelectedId("");
    setConfirmed(false);
    try {
      const prepared = await prepareReturnPhoto(file);
      if (mounted.current && version === photoVersion.current) {
        setPhoto({ ...prepared, url: URL.createObjectURL(prepared.blob) });
        setCameraError(null);
      }
    } catch (cause) {
      if (mounted.current && version === photoVersion.current)
        setError(
          cause instanceof Error ? cause.message : "사진을 불러오지 못했어요.",
        );
    } finally {
      if (mounted.current && version === photoVersion.current)
        setPreparing(false);
    }
  }

  async function takePhoto() {
    if (!video.current || !cameraReady) return;
    setPreparing(true);
    setError(null);
    try {
      const prepared = await canvasPhoto(
        video.current,
        video.current.videoWidth,
        video.current.videoHeight,
      );
      if (!mounted.current) return;
      setPhoto({ ...prepared, url: URL.createObjectURL(prepared.blob) });
      setResult(null);
      setSelectedId("");
      setConfirmed(false);
      setCameraError(null);
      closeCamera();
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error ? cause.message : "다시 촬영해 주세요.",
        );
    } finally {
      if (mounted.current) setPreparing(false);
    }
  }

  async function recognize() {
    if (!photo || request.current || returnStarted) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 55_000);
    setRecognizing(true);
    setError(null);
    setResult(null);
    setSelectedId("");
    setConfirmed(false);
    try {
      const form = new FormData();
      const extension =
        photo.blob.type === "image/png"
          ? "png"
          : photo.blob.type === "image/webp"
            ? "webp"
            : "jpg";
      form.append("file", photo.blob, `return-photo.${extension}`);
      const response = await fetch("/api/model/predict", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.message || "물품을 인식하지 못했어요. 다시 시도해 주세요.",
        );
      if (
        !Array.isArray(data.predictions) ||
        !data.image?.width ||
        !data.image?.height ||
        !data.catalog?.connected
      )
        throw new Error(
          "물품 목록과 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
      if (controller.signal.aborted || !mounted.current) return;
      const prediction = data as Prediction;
      setResult(prediction);
      const best = prediction.predictions.find(
        (item) => item.match_status === "matched" && item.catalog_label,
      );
      setSelectedId(best?.catalog_label?.id || "");
      window.requestAnimationFrame(() => {
        if (
          mounted.current &&
          window.matchMedia("(max-width: 1023px)").matches
        ) {
          resultPanel.current?.scrollIntoView({
            block: "start",
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "auto"
              : "smooth",
          });
        }
      });
    } catch (cause) {
      if (mounted.current)
        setError(
          controller.signal.aborted
            ? "인식을 중단했어요. 사진을 확인하고 다시 시도해 주세요."
            : cause instanceof Error
              ? cause.message
              : "연결이 원활하지 않아요. 다시 시도해 주세요.",
        );
    } finally {
      window.clearTimeout(timeout);
      request.current = null;
      if (mounted.current) setRecognizing(false);
    }
  }

  async function confirmReturn() {
    if (!selectedLabel || !photo || returnLock.current || confirmed) return;
    returnLock.current = true;
    setReturning(true);
    setReturnStarted(true);
    setReturnError(null);
    returnAttempt.current ??= { request_id: crypto.randomUUID(), label_id: selectedLabel.id };
    try {
      const response = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(returnAttempt.current),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "반납을 저장하지 못했어요.");
      if (data.status !== "returned" || data.item?.label_id !== returnAttempt.current.label_id ||
          !Number.isInteger(data.item?.quantity) || data.item.quantity < 0) {
        throw new Error("반납 결과를 확인하지 못했어요. 다시 반납 완료를 눌러 주세요.");
      }
      if (mounted.current) {
        setReturnedQuantity(data.item.quantity);
        setConfirmed(true);
      }
    } catch (cause) {
      if (mounted.current) setReturnError((cause instanceof Error ? cause.message : "반납 저장을 확인하지 못했어요.") + " 같은 사진에서 반납 완료를 다시 누르면 중복 없이 재시도해요.");
    } finally {
      returnLock.current = false;
      if (mounted.current) setReturning(false);
    }
  }

  function resetPhoto() {
    if (returnLock.current || (returnAttempt.current && !confirmed)) return;
    returnAttempt.current = null;
    setReturnStarted(false);
    setReturnedQuantity(null);
    setReturnError(null);
    closeCamera();
    photoVersion.current += 1;
    setPhoto(null);
    setResult(null);
    setSelectedId("");
    setConfirmed(false);
    setError(null);
  }

  const busy = preparing || recognizing || returning;
  const photoBusy = busy || returnStarted;
  const matches = (result?.predictions || []).filter(
    (item, index, all) =>
      item.match_status === "matched" &&
      item.catalog_label &&
      all.findIndex(
        (other) => other.catalog_label?.id === item.catalog_label?.id,
      ) === index,
  );
  const selectedDetection = matches.find(
    (item) => item.catalog_label?.id === selectedId,
  );
  const selectedLabel =
    selectedDetection?.catalog_label ||
    labels.find((label) => label.id === selectedId);
  const box = selectedDetection?.box;

  return (
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <section
        aria-labelledby="photo-heading"
        className="overflow-hidden rounded-xl border border-line bg-surface"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="photo-heading" className="font-bold">
            1. 물품 사진
          </h2>
          <span className="text-sm text-muted">한 번에 한 개씩</span>
        </div>
        <div className="p-5">
          {cameraState !== "closed" ? (
            <div className="overflow-hidden rounded-lg bg-ink">
              <video
                ref={video}
                aria-label="카메라 미리보기"
                autoPlay
                muted
                playsInline
                onLoadedData={() => setCameraReady(true)}
                className="aspect-[4/3] w-full object-contain"
              />
              <div className="flex flex-wrap items-center justify-center gap-3 p-3">
                <button
                  type="button"
                  className={primary}
                  onClick={takePhoto}
                  disabled={!cameraReady || preparing}
                >
                  <CameraIcon />
                  사진 찍기
                </button>
                <button
                  type="button"
                  className={secondary}
                  onClick={closeCamera}
                  disabled={photoBusy}
                >
                  카메라 닫기
                </button>
              </div>
              {cameraState === "opening" && (
                <p
                  role="status"
                  className="pb-4 text-center text-sm text-white"
                >
                  브라우저에서 카메라 사용을 허용해 주세요.
                </p>
              )}
            </div>
          ) : photo ? (
            <div className="relative overflow-hidden rounded-lg border border-line bg-paper/40">
              {/* Blob URLs are local previews, with dimensions known after decoding. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt="반납할 물품 사진"
                width={photo.width}
                height={photo.height}
                className="block max-h-[28rem] w-full object-contain"
              />
              {result && box && (
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox={`0 0 ${result.image.width} ${result.image.height}`}
                >
                  <rect
                    x={box[0]}
                    y={box[1]}
                    width={Math.max(0, box[2] - box[0])}
                    height={Math.max(0, box[3] - box[1])}
                    fill="rgba(27,101,81,0.09)"
                    stroke="#1b6551"
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-field bg-paper/35 px-6 text-center">
              <CameraIcon className="mb-4 h-11 w-11 text-brand" />
              <p className="font-semibold">반납할 물품을 보여주세요</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                물품 전체가 보이도록 촬영하거나
                <br />
                이미 찍어둔 사진을 선택해 주세요.
              </p>
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            aria-label="물품 사진 파일"
            hidden
            disabled={photoBusy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void choosePhoto(file);
            }}
          />
          <input
            ref={nativeCameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="휴대폰 카메라 촬영"
            hidden
            disabled={photoBusy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void choosePhoto(file);
            }}
          />
          {cameraState === "closed" && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                className={secondary}
                disabled={photoBusy}
                onClick={openCamera}
              >
                <CameraIcon />
                카메라 켜기
              </button>
              <button
                type="button"
                className={secondary}
                disabled={photoBusy}
                onClick={() => fileInput.current?.click()}
              >
                사진 선택
              </button>
            </div>
          )}
          <button
            type="button"
            className="mt-3 min-h-10 text-sm font-semibold text-brand underline-offset-4 hover:underline disabled:opacity-50"
            disabled={photoBusy}
            onClick={() => {
              closeCamera();
              nativeCameraInput.current?.click();
            }}
          >
            휴대폰 기본 카메라로 촬영
          </button>
          {cameraError && (
            <p
              role="alert"
              className="mt-2 rounded-lg bg-warn/10 p-3 text-sm leading-6 text-warn"
            >
              {cameraError}
            </p>
          )}
          <p className="mt-2 text-xs leading-5 text-muted">
            큰 사진은 전송 전에 자동으로 줄여요. JPG·PNG·WebP 사진을 권장해요.
          </p>
          <div className="mt-5 flex gap-3 border-t border-line pt-5">
            <button
              type="button"
              className={`${primary} flex-1`}
              onClick={recognize}
              disabled={!photo || photoBusy || cameraState !== "closed"}
            >
              {preparing
                ? "사진 준비 중…"
                : recognizing
                  ? "물품 인식 중…"
                  : result
                    ? "다시 인식하기"
                    : "물품 인식하기"}
            </button>
            {recognizing ? (
              <button
                type="button"
                className={secondary}
                onClick={() => request.current?.abort()}
              >
                중단
              </button>
            ) : (
              photo && (
                <button
                  type="button"
                  className={secondary}
                  disabled={photoBusy}
                  onClick={resetPhoto}
                >
                  초기화
                </button>
              )
            )}
          </div>
          <div aria-live="polite" aria-atomic="true">
            {preparing && (
              <p role="status" className="mt-3 text-sm text-muted">
                사진을 불러오고 있어요.
              </p>
            )}
            {recognizing && (
              <p role="status" className="mt-3 text-sm text-muted">
                사진에서 물품을 찾고 있어요. 잠시만 기다려 주세요.
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-warn/10 p-3 text-sm leading-6 text-warn"
              >
                {error}
              </p>
            )}
          </div>
        </div>
      </section>

      <section
        ref={resultPanel}
        aria-labelledby="result-heading"
        className="rounded-xl border border-line bg-surface"
      >
        <h2
          id="result-heading"
          className="border-b border-line px-5 py-4 font-bold"
        >
          2. 물품 이름 확인
        </h2>
        <div className="p-5" aria-live="polite" aria-busy={recognizing}>
          {confirmed && selectedLabel ? (
            <div
              role="status"
              className="rounded-lg border border-brand/40 bg-brand/5 p-5"
            >
              <span className="text-sm font-semibold text-brand">
                반납 완료
              </span>
              <p className="mt-2 text-3xl font-extrabold">
                {selectedLabel.name}
              </p>
              <p className="mt-3 text-sm leading-6 text-muted">
                수량이 1개 늘었어요. 현재 수량: {returnedQuantity}개
              </p>
              <Link href="/items" className={`${secondary} mt-4 w-full`}>물품 수량 확인</Link>
              <button
                type="button"
                className={`${primary} mt-5 w-full`}
                onClick={resetPhoto}
              >
                다음 물품 반납
              </button>
            </div>
          ) : (
            <>
              {!result && (
                <p className="rounded-lg bg-paper/50 px-4 py-6 text-center text-sm leading-6 text-muted">
                  사진을 촬영·선택하고 인식하면
                  <br />
                  이곳에 물품 이름이 표시돼요.
                </p>
              )}
              {result && matches.length === 0 && (
                <div className="rounded-lg bg-warn/10 p-4 text-sm leading-6">
                  <p className="font-semibold text-warn">
                    {result.predictions.length === 0
                      ? "사진에서 물품을 찾지 못했어요."
                      : "등록된 대여 물품과 연결하지 못했어요."}
                  </p>
                  <p className="mt-1 text-muted">
                    밝은 곳에서 다시 촬영하거나 아래 목록에서 물품을 직접 선택해
                    주세요.
                  </p>
                </div>
              )}
              {matches.length > 0 && (
                <>
                  <p className="mb-3 text-sm text-muted">
                    인식한 물품이 맞는지 확인해 주세요.
                  </p>
                  <div className="space-y-2">
                    {matches.map((item) => (
                      <button
                        key={item.catalog_label!.id}
                        type="button"
                        aria-pressed={selectedId === item.catalog_label!.id}
                        disabled={photoBusy}
                        onClick={() => {
                          setSelectedId(item.catalog_label!.id);
                          setConfirmed(false);
                        }}
                        className={`flex min-h-20 w-full items-center justify-between gap-3 rounded-lg border p-4 text-left focus-visible:outline-2 focus-visible:outline-brand ${selectedId === item.catalog_label!.id ? "border-brand bg-brand/5" : "border-line hover:border-brand"}`}
                      >
                        <span className="text-xl font-bold">
                          {item.catalog_label!.name}
                        </span>
                        <span className="text-right text-xs leading-5 text-muted">
                          인식 점수
                          <br />
                          <strong className="text-sm text-brand">
                            {(item.score * 100).toFixed(1)}%
                          </strong>
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    인식 점수는 물품을 판단하는 참고 값이에요.
                  </p>
                </>
              )}
              <div className="mt-6 border-t border-line pt-5">
                <label htmlFor="return-label" className="text-sm font-semibold">
                  물품 직접 선택
                </label>
                <p className="mt-1 text-xs leading-5 text-muted">
                  자동 인식이 다르면 등록된 이름으로 바꿀 수 있어요.
                </p>
                <select
                  id="return-label"
                  value={selectedId}
                  disabled={photoBusy || labels.length === 0 || !photo}
                  onChange={(event) => {
                    setSelectedId(event.target.value);
                    setConfirmed(false);
                  }}
                  className="mt-3 min-h-11 w-full rounded-lg border border-field bg-surface px-3 py-2 text-base focus:outline-2 focus:outline-brand disabled:opacity-50"
                >
                  <option value="">물품을 선택해 주세요</option>
                  {labels.map((label) => (
                    <option key={label.id} value={label.id}>
                      {label.name}
                    </option>
                  ))}
                </select>
                {labelsError && (
                  <p role="alert" className="mt-2 text-sm text-warn">
                    물품 목록을 불러오지 못했어요.{" "}
                    <button
                      type="button"
                      className="min-h-10 font-semibold underline"
                      onClick={() => setCatalogVersion((value) => value + 1)}
                    >
                      다시 불러오기
                    </button>
                  </p>
                )}
              </div>
              {returnError && <p role="alert" className="mt-4 rounded-lg bg-warn/10 p-3 text-sm text-warn">{returnError}</p>}
              <button
                type="button"
                className={`${primary} mt-5 w-full`}
                disabled={!selectedLabel || busy || cameraState !== "closed"}
                onClick={confirmReturn}
              >
                {returning ? "반납 저장 중…" : selectedLabel
                  ? `${selectedLabel.name} 반납 완료 (+1)`
                  : "물품을 선택해 주세요"}
              </button>
            </>
          )}
          <p className="mt-5 text-xs leading-5 text-muted">
            사진 인식만으로 수량은 바뀌지 않아요. 물품을 확인하고 반납 완료를 누르면 수량이 1개 늘어요.
          </p>
        </div>
      </section>
    </div>
  );
}

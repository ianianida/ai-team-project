const headers = { "Cache-Control": "no-store" };
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024;

export class ModelRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function modelError(error: unknown): Response {
  return Response.json(
    { message: error instanceof ModelRequestError ? error.message : "모델 서버에 연결할 수 없습니다." },
    { status: error instanceof ModelRequestError ? error.status : 502, headers },
  );
}

/** Only the server reads the tunnel URL and shared key. Never return either. */
export async function callModel(path: "/health" | "/labels" | "/predict", body?: FormData): Promise<Response> {
  const base = process.env.MODEL_SERVER_URL;
  const key = process.env.MODEL_SERVER_API_KEY;
  if (!base || !key) {
    throw new ModelRequestError(503, "모델 서버 연결 설정이 필요합니다.");
  }

  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new ModelRequestError(503, "모델 서버 주소 설정을 확인해 주세요.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new ModelRequestError(503, "모델 서버는 HTTPS 기본 주소로 설정해 주세요.");
  }
  url.pathname = path;

  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "X-API-Key": key, "ngrok-skip-browser-warning": "true" },
    body,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(body ? 45_000 : 10_000),
  });

  if (!response.ok) {
    // Upstream error bodies may contain infrastructure details; do not relay them.
    if (response.status === 401 || response.status === 403) {
      throw new ModelRequestError(502, "모델 서버 인증 설정을 확인해 주세요.");
    }
    if (response.status === 413 || response.status === 415) {
      throw new ModelRequestError(response.status, "사진의 크기와 형식을 확인해 주세요.");
    }
    throw new ModelRequestError(503, "모델 서버 또는 물품 DB를 사용할 수 없습니다.");
  }

  const result: unknown = await response.json();
  return Response.json(result, { headers });
}

/** Keep multipart uploads below Vercel's 4.5 MB request-body limit. */
export async function imageForm(request: Request): Promise<FormData> {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;") || !request.body) {
    throw new ModelRequestError(400, "file 필드에 사진을 첨부해 주세요.");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ModelRequestError(413, "사진은 4MB 이하로 첨부해 주세요.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let input: FormData;
  try {
    input = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
  } catch {
    throw new ModelRequestError(400, "사진 첨부 형식을 확인해 주세요.");
  }
  const file = input.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new ModelRequestError(400, "file 필드에 사진을 첨부해 주세요.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ModelRequestError(413, "사진은 4MB 이하로 첨부해 주세요.");
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new ModelRequestError(415, "JPEG, PNG, WebP 사진을 사용해 주세요.");
  }
  const output = new FormData();
  output.append("file", file, "item-photo");
  return output;
}

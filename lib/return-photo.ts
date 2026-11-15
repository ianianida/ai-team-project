export type PreparedPhoto = { blob: Blob; width: number; height: number };

export async function canvasPhoto(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<PreparedPhoto> {
  if (!width || !height)
    throw new Error("사진을 준비하지 못했어요. 다시 촬영해 주세요.");
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이 브라우저에서 사진을 처리할 수 없어요.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("사진 변환에 실패했어요.")),
      "image/jpeg",
      0.88,
    );
  });
  if (blob.size > 4 * 1024 * 1024)
    throw new Error("사진이 너무 커요. 더 작은 사진을 선택해 주세요.");
  return { blob, width: canvas.width, height: canvas.height };
}

export async function prepareReturnPhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml")
    throw new Error(
      "사진 파일을 선택해 주세요. JPG, PNG, WebP를 사용할 수 있어요.",
    );
  if (file.size > 20 * 1024 * 1024)
    throw new Error("원본 사진은 20MB 이하로 선택해 주세요.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      // Browser decoding applies EXIF orientation before drawing to the canvas.
      await image.decode();
    } catch {
      throw new Error(
        "사진을 열 수 없어요. JPG, PNG, WebP 사진으로 다시 선택해 주세요.",
      );
    }
    if (
      file.size <= 4 * 1024 * 1024 &&
      ["image/jpeg", "image/png", "image/webp"].includes(file.type) &&
      image.naturalWidth * image.naturalHeight <= 25_000_000
    ) {
      // Keep server-supported originals: unnecessary resampling can alter detections.
      return {
        blob: file,
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    }
    return await canvasPhoto(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

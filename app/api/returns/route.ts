import { callModel, modelError } from "@/lib/model-proxy";

export async function POST(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ message: "같은 사이트에서 반납해 주세요." }, { status: 403, headers });
  }
  try {
    const text = await request.text();
    if (text.length > 1024) return Response.json({ message: "요청이 너무 커요." }, { status: 413, headers });
    const body = JSON.parse(text);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(body?.request_id) || !uuid.test(body?.label_id)) {
      return Response.json({ message: "선택한 물품을 확인해 주세요." }, { status: 400, headers });
    }
    return await callModel("/returns", JSON.stringify({ request_id: body.request_id, label_id: body.label_id }));
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ message: "잘못된 요청이에요." }, { status: 400, headers });
    return modelError(error);
  }
}

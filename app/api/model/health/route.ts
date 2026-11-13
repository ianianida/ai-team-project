import { callModel, modelError } from "@/lib/model-proxy";

export async function GET(): Promise<Response> {
  try {
    return await callModel("/health");
  } catch (error) {
    return modelError(error);
  }
}

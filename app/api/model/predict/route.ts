import { callModel, imageForm, modelError } from "@/lib/model-proxy";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  try {
    return await callModel("/predict", await imageForm(request));
  } catch (error) {
    return modelError(error);
  }
}

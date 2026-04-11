import { getProviderInfo } from "@/lib/llm";

export async function GET() {
  try {
    const info = getProviderInfo();
    return Response.json(info);
  } catch (err) {
    return Response.json(
      { configured: false, provider: null, model: null, embeddingSupport: false, error: String(err) },
      { status: 500 }
    );
  }
}

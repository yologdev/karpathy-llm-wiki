import { getProviderInfo } from "@/lib/llm";

export async function GET() {
  const info = getProviderInfo();
  return Response.json(info);
}

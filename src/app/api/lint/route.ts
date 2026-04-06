import { NextResponse } from "next/server";
import { lint } from "@/lib/lint";

export async function POST() {
  try {
    const result = await lint();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Lint error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { getPangleCategoryOptions } from "@/lib/pangle";

export async function GET() {
  try {
    const data = await getPangleCategoryOptions();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Không tải được danh sách category Pangle" },
      { status: 500 }
    );
  }
}

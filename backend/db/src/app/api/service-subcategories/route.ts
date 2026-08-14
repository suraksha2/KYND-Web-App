import { NextResponse } from "next/server";
import { getServiceSubcategories } from "@/lib/service-subcategories-db";

export async function GET() {
  try {
    const subcategories = await getServiceSubcategories();
    return NextResponse.json({ data: subcategories }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/service-subcategories]", err);
    return NextResponse.json(
      { error: "Failed to fetch service subcategories." },
      { status: 500 }
    );
  }
}

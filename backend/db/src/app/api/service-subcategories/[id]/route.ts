import { NextRequest, NextResponse } from "next/server";
import { getServiceSubcategoryById } from "@/lib/service-subcategories-db";

type RouteContext = { params: { id: string } };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const subcategory = await getServiceSubcategoryById(params.id);
    if (!subcategory) {
      return NextResponse.json(
        { error: "Service subcategory not found." },
        { status: 404 }
      );
    }
    return NextResponse.json({ data: subcategory }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/service-subcategories/[id]]", err);
    return NextResponse.json(
      { error: "Failed to fetch service subcategory." },
      { status: 500 }
    );
  }
}

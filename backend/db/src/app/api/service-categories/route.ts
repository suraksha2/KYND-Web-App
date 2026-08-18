import { NextRequest, NextResponse } from "next/server";
import {
  getServiceCategories,
  createServiceCategory,
} from "@/lib/service-categories-db";
import { CreateServiceCategoryInput } from "@/lib/service-category-types";

// Reads live data (DB / filesystem) on every request — never prerender.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const categories = await getServiceCategories();
    return NextResponse.json({ data: categories }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch service categories." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: CreateServiceCategoryInput = await req.json();

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "Category name is required." },
        { status: 400 }
      );
    }

    const created = await createServiceCategory({
      name: body.name.trim(),
      description: body.description?.trim() ?? "",
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create service category." },
      { status: 500 }
    );
  }
}

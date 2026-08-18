import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "data", "client-categories.json");

// Reads live data (DB / filesystem) on every request — never prerender.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await fs.readFile(DATA_PATH, "utf-8");
    const categories = JSON.parse(data);
    return NextResponse.json({ data: categories }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/client-categories]", err);
    return NextResponse.json({ error: "Failed to fetch client categories." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Category name is required." }, { status: 400 });
    }
    const data = await fs.readFile(DATA_PATH, "utf-8");
    const categories = JSON.parse(data);
    const newCategory = {
      id: Date.now(),
      name: body.name.trim(),
      description: body.description?.trim() ?? "",
    };
    categories.push(newCategory);
    await fs.writeFile(DATA_PATH, JSON.stringify(categories, null, 2), "utf-8");
    return NextResponse.json({ data: newCategory }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/client-categories]", err);
    return NextResponse.json({ error: "Failed to create client category." }, { status: 500 });
  }
}

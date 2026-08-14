import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";

const IMAGE_EXTENSIONS = [".webp", ".png", ".jpg", ".jpeg", ".svg", ".gif", ".avif"];

export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "images");
    const entries = await readdir(dir, { withFileTypes: true });

    const images = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          !entry.name.startsWith(".") &&
          IMAGE_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())
      )
      .map((entry) => `/images/${entry.name}`)
      .sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ data: images }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to list images." }, { status: 500 });
  }
}

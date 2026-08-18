import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/mysql";

// Reads live data (DB / filesystem) on every request — never prerender.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [rows] = await pool.query(
      `SELECT id, profile_name, profile_email, profile_role, bio FROM settings LIMIT 1`
    );
    return NextResponse.json({ data: rows }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/settings]", err);
    return NextResponse.json({ error: "Failed to fetch settings." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { profile_name, profile_email, profile_role, bio } = body;

    // Check if settings record exists
    const [existing] = await pool.query(`SELECT id FROM settings LIMIT 1`);

    if (Array.isArray(existing) && existing.length > 0) {
      // Update existing record
      await pool.query(
        `UPDATE settings SET profile_name = ?, profile_email = ?, profile_role = ?, bio = ? WHERE id = ?`,
        [profile_name, profile_email, profile_role, bio, (existing as any)[0].id]
      );
    } else {
      // Insert new record
      await pool.query(
        `INSERT INTO settings (profile_name, profile_email, profile_role, bio) VALUES (?, ?, ?, ?)`,
        [profile_name, profile_email, profile_role, bio]
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[PUT /api/settings]", err);
    return NextResponse.json({ error: "Failed to update settings." }, { status: 500 });
  }
}

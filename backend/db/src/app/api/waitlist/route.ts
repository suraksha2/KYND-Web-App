import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/mysql";

// Reads live data (DB / filesystem) on every request — never prerender.
export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function GET() {
  try {
    const [rows] = await pool.query(
      `SELECT id, email, phone, source, created_at FROM waitlist ORDER BY created_at DESC`
    );
    return NextResponse.json({ data: rows }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/waitlist]", err);
    return NextResponse.json({ error: "Failed to fetch waitlist." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, phone, source } = await req.json();
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!EMAIL_RE.test(cleanEmail)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }

    const [result] = await pool.query(
      `INSERT INTO waitlist (email, phone, source) VALUES (?, ?, ?)`,
      [cleanEmail, (typeof phone === 'string' && phone.trim()) || null, source || 'landing']
    );
    return NextResponse.json({ id: (result as any).insertId, alreadyJoined: false }, { status: 201 });
  } catch (err: any) {
    // Signing up twice is not an error for the visitor — they are on the list.
    if (err?.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ alreadyJoined: true }, { status: 200 });
    }
    console.error("[POST /api/waitlist]", err);
    return NextResponse.json({ error: "Failed to join the waitlist." }, { status: 500 });
  }
}

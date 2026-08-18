import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import bcrypt from 'bcryptjs';

// Reads live data (DB / filesystem) on every request — never prerender.
export const dynamic = 'force-dynamic'

// GET all service providers
export async function GET() {
  try {
    const [rows] = await pool.query(
      `SELECT 
        id,
        name,
        email,
        mobile,
        services,
        city,
        status,
        rating,
        total_jobs,
        avatar,
        joined,
        created_at
      FROM service_providers 
      ORDER BY created_at DESC`
    );
    return NextResponse.json({ data: rows }, { status: 200 });
  } catch (error) {
    console.error('[GET /api/service-providers]', error);
    return NextResponse.json(
      { error: 'Failed to fetch service providers' },
      { status: 500 }
    );
  }
}

// POST create new service provider
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, mobile, services, city, status = 'active', avatar, password } = body;

    if (!name || !email || !mobile || !services || !city) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Optional login password for the provider portal.
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const [result] = await pool.query(
      `INSERT INTO service_providers (name, email, password_hash, mobile, services, city, status, avatar)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email.trim().toLowerCase(), passwordHash, mobile, JSON.stringify(services), city, status, avatar || null]
    );

    return NextResponse.json(
      { 
        success: true, 
        id: (result as any).insertId 
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/service-providers]', error);
    return NextResponse.json(
      { error: 'Failed to create service provider' },
      { status: 500 }
    );
  }
}

// PUT update service provider
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, email, mobile, services, city, status, avatar, password } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Provider ID is required' },
        { status: 400 }
      );
    }

    // Only update the password when a new one is explicitly provided.
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE service_providers SET password_hash = ? WHERE id = ?',
        [passwordHash, id]
      );
    }

    const [result] = await pool.query(
      `UPDATE service_providers 
       SET name = ?, email = ?, mobile = ?, services = ?, city = ?, status = ?, avatar = ?
       WHERE id = ?`,
      [name, email.trim().toLowerCase(), mobile, JSON.stringify(services), city, status, avatar, id]
    );

    return NextResponse.json(
      { success: true },
      { status: 200 }
    );
  } catch (error) {
    console.error('[PUT /api/service-providers]', error);
    return NextResponse.json(
      { error: 'Failed to update service provider' },
      { status: 500 }
    );
  }
}

// DELETE service provider
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Provider ID is required' },
        { status: 400 }
      );
    }

    await pool.query('DELETE FROM service_providers WHERE id = ?', [id]);

    return NextResponse.json(
      { success: true },
      { status: 200 }
    );
  } catch (error) {
    console.error('[DELETE /api/service-providers]', error);
    return NextResponse.json(
      { error: 'Failed to delete service provider' },
      { status: 500 }
    );
  }
}

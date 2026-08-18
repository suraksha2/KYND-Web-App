import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import bcrypt from 'bcryptjs';
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, secret } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'All fields are required.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check admin secret if provided
    let assignedRole = 'user';
    if (secret) {
      if (secret === process.env.ADMIN_SIGNUP_SECRET) {
        assignedRole = 'super_admin';
      } else {
        return NextResponse.json(
          { error: 'Invalid admin signup secret.' },
          { status: 403 }
        );
      }
    }

    // Check if user already exists
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [normalizedEmail]
    );

    if (Array.isArray(existingUsers) && existingUsers.length > 0) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user without explicitly listing 'joined', relying on DEFAULT CURRENT_DATE
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), normalizedEmail, passwordHash, assignedRole, 'active']
    );

    const insertResult = result as any;
    const userId = insertResult.insertId;

    const [newUsers] = await pool.query(
      'SELECT created_at FROM users WHERE id = ?',
      [userId]
    );
    const createdAt = (newUsers as any[])[0]?.created_at;
    
    // Issue session token
    const token = await createSessionToken({
      id: userId,
      email: normalizedEmail,
      role: assignedRole,
    });

    const response = NextResponse.json(
      {
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        role: assignedRole,
        createdAt,
        token,
      },
      { status: 201 }
    );

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Unable to create account.', details: error.message },
      { status: 500 }
    );
  }
}

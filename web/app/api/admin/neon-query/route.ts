import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

// Neon API configuration
const NEON_API_URL = "https://api.neon.tech/v2";
const NEON_API_KEY = process.env.NEON_API_KEY;
const PROJECT_ID = process.env.NEON_PROJECT_ID;
const DATABASE_NAME = process.env.NEON_DATABASE_NAME || "neondb";

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user details to check admin status
    const body = await req.json();
    const { query } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Basic SQL injection protection - only allow SELECT queries
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery.startsWith('select') && !trimmedQuery.startsWith('with')) {
      return NextResponse.json({ error: "Only SELECT queries are allowed" }, { status: 400 });
    }

    // Block dangerous keywords
    const dangerousKeywords = ['drop', 'delete', 'update', 'insert', 'alter', 'create', 'truncate'];
    if (dangerousKeywords.some(keyword => trimmedQuery.includes(keyword))) {
      return NextResponse.json({ error: "Query contains forbidden keywords" }, { status: 400 });
    }

    if (!NEON_API_KEY || !PROJECT_ID) {
      return NextResponse.json({ error: "Neon API configuration missing" }, { status: 500 });
    }

    // Call Neon API to execute query
    const neonResponse = await fetch(`${NEON_API_URL}/projects/${PROJECT_ID}/databases/${DATABASE_NAME}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NEON_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        result_format: 'array'
      })
    });

    if (!neonResponse.ok) {
      const errorData = await neonResponse.text();
      console.error('Neon API error:', errorData);
      return NextResponse.json({ error: "Neon API error" }, { status: 500 });
    }

    const data = await neonResponse.json();
    
    return NextResponse.json({
      rows: data.rows || [],
      columns: data.columns || [],
      time: data.time || 0
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Neon query error:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

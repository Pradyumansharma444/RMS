import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * One-time migration endpoint.
 * Adds `deleted_at` column to marks_uploads and `pdf_url` column for saved gadget sheets.
 * Safe to call multiple times — uses IF NOT EXISTS via Supabase RPC.
 */
export async function POST(req: NextRequest) {
  try {
    // Use supabaseAdmin to run raw SQL via the postgres function
    // We use a workaround: insert a dummy value and catch the error to detect column presence,
    // OR we query information_schema directly.

    const checks = await Promise.all([
      supabaseAdmin.rpc("exec_sql", {
        sql: `ALTER TABLE marks_uploads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;`
      }),
      supabaseAdmin.rpc("exec_sql", {
        sql: `ALTER TABLE marks_uploads ADD COLUMN IF NOT EXISTS pdf_url TEXT DEFAULT NULL;`
      }),
    ]);

    const errors = checks.filter(c => c.error).map(c => c.error?.message);
    if (errors.length > 0) {
      // Fallback: try information_schema select to verify
      return NextResponse.json({
        warning: "exec_sql RPC not available. Apply these SQL statements in Supabase SQL editor:",
        sql: [
          "ALTER TABLE marks_uploads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;",
          "ALTER TABLE marks_uploads ADD COLUMN IF NOT EXISTS pdf_url TEXT DEFAULT NULL;"
        ],
        errors
      }, { status: 207 });
    }

    return NextResponse.json({ success: true, message: "Migration applied: deleted_at and pdf_url columns ensured." });
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
      sql: [
        "ALTER TABLE marks_uploads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;",
        "ALTER TABLE marks_uploads ADD COLUMN IF NOT EXISTS pdf_url TEXT DEFAULT NULL;"
      ]
    }, { status: 500 });
  }
}

export async function GET() {
  // Return the SQL to apply manually if POST fails
  return NextResponse.json({
    instructions: "Run these SQL statements in your Supabase SQL editor:",
    sql: [
      "ALTER TABLE marks_uploads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;",
      "ALTER TABLE marks_uploads ADD COLUMN IF NOT EXISTS pdf_url TEXT DEFAULT NULL;"
    ]
  });
}

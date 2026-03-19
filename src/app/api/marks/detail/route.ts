import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  const mark_id = req.nextUrl.searchParams.get("mark_id");

  if (!uid || !mark_id) {
    return NextResponse.json({ error: "uid and mark_id required" }, { status: 400 });
  }

  // Get admin info
  const { data: admin } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!admin) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  const { data: student, error } = await supabaseAdmin
    .from("student_marks")
    .select("*")
    .eq("id", mark_id)
    .eq("college_id", admin.id)
    .single();

  if (error || !student) {
    return NextResponse.json({ error: "Student marks not found" }, { status: 404 });
  }

  return NextResponse.json({ student }, {
    headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" },
  });
}

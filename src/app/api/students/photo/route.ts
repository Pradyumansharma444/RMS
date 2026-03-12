import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function PUT(req: NextRequest) {
  const { uid, student_id, photo_url } = await req.json();
  if (!uid || !student_id || !photo_url) {
    return NextResponse.json({ error: "uid, student_id, photo_url required" }, { status: 400 });
  }

  const { data: college } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("students")
    .update({ photo_url, updated_at: new Date().toISOString() })
    .eq("id", student_id)
    .eq("college_id", college.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

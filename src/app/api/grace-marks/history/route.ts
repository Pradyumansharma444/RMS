import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid");

  if (!uid) {
    return NextResponse.json({ error: "uid required" }, { status: 400 });
  }

  // Get college info
  const { data: college } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!college) {
    return NextResponse.json({ error: "College not found" }, { status: 404 });
  }

  // Fetch history
  const { data, error } = await supabaseAdmin
    .from("grace_marks")
    .select("*")
    .eq("college_id", college.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ history: [] });
  }

  // Enrich with student info from student_marks using mark_id
  const markIds = [...new Set(data.map((h: any) => h.mark_id).filter(Boolean))];
  const { data: markData } = await supabaseAdmin
    .from("student_marks")
    .select("id, student_name, roll_number, department, year")
    .in("id", markIds);

  const markMap = new Map((markData || []).map((m: any) => [m.id, m]));

  const enriched = data.map((h: any) => ({
    ...h,
    student_name: markMap.get(h.mark_id)?.student_name || null,
    roll_number: markMap.get(h.mark_id)?.roll_number || null,
    department: markMap.get(h.mark_id)?.department || null,
    year: markMap.get(h.mark_id)?.year || null,
  }));

  return NextResponse.json({ history: enriched });
}

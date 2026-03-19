import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const { data: college } = await supabaseAdmin.from("colleges").select("id").eq("firebase_uid", uid).single();
  if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

  const { data: graceRows, error: graceError } = await supabaseAdmin
    .from("grace_marks")
    .select("*")
    .eq("college_id", college.id)
    .limit(5);

  const markIds = [...new Set((graceRows || []).map((r: any) => r.mark_id).filter(Boolean))];

  // Test 1: query student_marks by id WITHOUT college_id filter
  const { data: matchById, error: matchByIdError } = markIds.length > 0
    ? await supabaseAdmin
        .from("student_marks")
        .select("id, student_name, roll_number, department, year, semester, result")
        .in("id", markIds)
        .limit(5)
    : { data: [], error: null };

  // Test 2: query student_marks by id WITH college_id filter
  const { data: matchByIdWithCollege, error: matchByIdWithCollegeError } = markIds.length > 0
    ? await supabaseAdmin
        .from("student_marks")
        .select("id, student_name, roll_number, department, year, semester, result")
        .eq("college_id", college.id)
        .in("id", markIds)
        .limit(5)
    : { data: [], error: null };

  // Test 3: check all columns available in student_marks
  const { data: sampleMarks, error: sampleError } = markIds.length > 0
    ? await supabaseAdmin
        .from("student_marks")
        .select("*")
        .in("id", markIds)
        .limit(1)
    : { data: [], error: null };

  return NextResponse.json({
    college_id: college.id,
    grace_rows_sample: graceRows,
    grace_error: graceError,
    mark_ids: markIds,
    // Without college_id filter
    match_by_id_no_filter: matchById,
    match_by_id_no_filter_error: matchByIdError,
    // With college_id filter
    match_by_id_with_college: matchByIdWithCollege,
    match_by_id_with_college_error: matchByIdWithCollegeError,
    // Sample to see stored college_id
    sample_marks_college_ids: sampleMarks,
    sample_marks_error: sampleError,
  });
}

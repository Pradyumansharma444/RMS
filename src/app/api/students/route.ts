import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET all students for a college
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  const department = req.nextUrl.searchParams.get("department");
  const year = req.nextUrl.searchParams.get("year");

  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const { data: college } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

    let query = supabaseAdmin
      .from("students")
      .select("id, roll_number, name, department, year, photo_url, created_at, enrollment_no, abc_id, university_exam_seat_no, gender")
      .eq("college_id", college.id)
      .order("roll_number", { ascending: true });

  if (department) query = query.eq("department", department);
  if (year) query = query.eq("year", year);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ students: data });
}

// DELETE a student
export async function DELETE(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  const studentId = req.nextUrl.searchParams.get("id");

  if (!uid || !studentId) {
    return NextResponse.json({ error: "uid and student id required" }, { status: 400 });
  }

  // 1. Verify college
  const { data: college } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

  // 2. Delete student (cascades should handle other records if configured, but let's be safe)
  // In a real MU system, we might have marks, attendance, etc.
  const { error } = await supabaseAdmin
    .from("students")
    .delete()
    .eq("id", studentId)
    .eq("college_id", college.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: "Student deleted successfully" });
}

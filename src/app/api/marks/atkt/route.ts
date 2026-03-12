import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid");
  const department = searchParams.get("department");
  const year = searchParams.get("year");
  const upload_id = searchParams.get("upload_id");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "10");

  if (!uid) {
    return NextResponse.json({ error: "uid required" }, { status: 400 });
  }

  const { data: college } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!college) {
    return NextResponse.json({ error: "College not found" }, { status: 404 });
  }

  let query = supabaseAdmin
    .from("student_marks")
    .select("id, roll_number, student_name, department, year, total_marks, obtained_marks, percentage, result, cgpa, subjects", { count: "exact" })
    .eq("college_id", college.id)
    .or("result.ilike.%ATKT%,result.ilike.%FAIL%,result.ilike.%F A I L%");

  if (department && department !== "all") query = query.eq("department", department);
  if (year && year !== "all") query = query.eq("year", year);
  if (upload_id && upload_id !== "all") query = query.eq("upload_id", upload_id);

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await query
    .order("student_name", { ascending: true })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Compute ATKT subject count from subjects JSON array
  const students = (data || []).map((s: any) => {
    let atktCount = 0;
    if (Array.isArray(s.subjects)) {
      atktCount = s.subjects.filter((sub: any) => sub.is_pass === false || sub.grade === "F").length;
    }
    return {
      id: s.id,
      roll_number: s.roll_number,
      student_name: s.student_name,
      department: s.department,
      semester: s.year,
      total_marks: s.total_marks,
      obtained_marks: s.obtained_marks,
      percentage: s.percentage,
      result: s.result,
      cgpa: s.cgpa,
      atkt_count: atktCount,
    };
  });

  return NextResponse.json({
    students,
    total: count ?? 0,
    page,
    limit,
    total_pages: Math.ceil((count ?? 0) / limit),
  });
}

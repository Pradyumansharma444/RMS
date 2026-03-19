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

  // Exclude student_marks whose upload is soft-deleted (in recycle bin or permanently deleted)
  // Try with deleted_at column first; fall back to status-only filter if column doesn't exist
  let activeUploads: { id: string }[] | null = null;
  const { data: d1, error: e1 } = await supabaseAdmin
    .from("marks_uploads")
    .select("id")
    .eq("college_id", college.id)
    .is("deleted_at", null)
    .neq("status", "deleted");

  if (!e1) {
    activeUploads = d1;
  } else {
    // deleted_at column doesn't exist — fall back to status filter only
    const { data: d2 } = await supabaseAdmin
      .from("marks_uploads")
      .select("id")
      .eq("college_id", college.id)
      .neq("status", "deleted");
    activeUploads = d2;
  }

  const activeUploadIds = (activeUploads || []).map((u: any) => u.id);
  if (activeUploadIds.length === 0) {
    return NextResponse.json({ students: [], total: 0, page, limit, total_pages: 0 });
  }

  // Fetch all candidate rows (those whose result field says FAIL/ATKT OR those whose
  // subjects JSON contains at least one failing subject).  We fetch a broad set and
  // filter in-memory so that students whose result field was incorrectly set to PASS
  // (e.g. stale data) are still caught.
  let query = supabaseAdmin
    .from("student_marks")
    .select("id, roll_number, student_name, department, year, total_marks, obtained_marks, percentage, result, cgpa, subjects")
    .eq("college_id", college.id)
    .in("upload_id", activeUploadIds);

  if (department && department !== "all") query = query.eq("department", department);
  if (year && year !== "all") query = query.eq("year", year);
  if (upload_id && upload_id !== "all") query = query.eq("upload_id", upload_id);

  const { data: allData, error } = await query.order("student_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter: keep only students who have at least one failing (non-CC, non-ABS) subject,
  // evaluated live from the subjects JSON — this is the source of truth.
  const isSubjectFailing = (sub: any) => {
    if (!sub) return false;
    if (sub.is_cc || sub.subject_code === "CC Subject" || sub.subject_name === "CC Subject") return false;
    const grade = String(sub.grade || "").toUpperCase().trim();
    if (grade === "ABS" || grade === "AB" || grade === "ABSENT") return false;
    // Check is_pass first, then grade
    if (sub.is_pass === false) return true;
    if (grade === "F") return true;
    // Fallback: check 40% of max_marks
    if (sub.max_marks > 0 && (sub.obtained_marks ?? 0) < Math.ceil(sub.max_marks * 0.4)) return true;
    return false;
  };

  const failingStudentsRaw = (allData || []).filter((s: any) => {
    if (!Array.isArray(s.subjects)) return false;
    return s.subjects.some((sub: any) => isSubjectFailing(sub));
  });

  // Apply pagination manually
  const total = failingStudentsRaw.length;
  const from = (page - 1) * limit;
  const pagedData = failingStudentsRaw.slice(from, from + limit);

  const students = pagedData.map((s: any) => {
    const atktCount = Array.isArray(s.subjects)
      ? s.subjects.filter((sub: any) => isSubjectFailing(sub)).length
      : 0;
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
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

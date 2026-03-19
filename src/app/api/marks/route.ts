import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  const upload_id = req.nextUrl.searchParams.get("upload_id");
  const department = req.nextUrl.searchParams.get("department");
  const year = req.nextUrl.searchParams.get("year");

  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const { data: college } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

  // If a specific upload_id is requested, verify it has not been soft-deleted
  if (upload_id) {
    const { data: uploadRow, error: uploadCheckErr } = await supabaseAdmin
      .from("marks_uploads")
      .select("id, deleted_at, status")
      .eq("id", upload_id)
      .single();

    if (!uploadCheckErr && uploadRow) {
      const isDeleted =
        uploadRow.status === "deleted" ||
        (uploadRow.deleted_at !== null && uploadRow.deleted_at !== undefined);
      if (isDeleted) {
        return NextResponse.json({ marks: [] });
      }
    }
  } else {
    // No upload_id filter — collect active upload IDs to scope query
    let activeUploadIds: string[] = [];
    const { data: activeUploads, error: uploadsError } = await supabaseAdmin
      .from("marks_uploads")
      .select("id")
      .eq("college_id", college.id)
      .is("deleted_at", null)
      .neq("status", "deleted");

    if (!uploadsError && activeUploads) {
      activeUploadIds = activeUploads.map((u: any) => u.id);
    } else {
      const { data: fallbackUploads } = await supabaseAdmin
        .from("marks_uploads")
        .select("id")
        .eq("college_id", college.id)
        .neq("status", "deleted");
      activeUploadIds = (fallbackUploads || []).map((u: any) => u.id);
    }

    if (activeUploadIds.length === 0) {
      return NextResponse.json({ marks: [] });
    }

    let query = supabaseAdmin
      .from("student_marks")
      .select("id, roll_number, student_name, department, year, division, percentage, result, cgpa, subjects")
      .eq("college_id", college.id)
      .in("upload_id", activeUploadIds)
      .order("roll_number", { ascending: true });

    if (department) query = query.eq("department", department);
    if (year) query = query.eq("year", year);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ marks: data }, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    });
  }

  let query = supabaseAdmin
    .from("student_marks")
    .select("id, roll_number, student_name, department, year, division, percentage, result, cgpa, subjects")
    .eq("college_id", college.id)
    .order("roll_number", { ascending: true });

  if (upload_id) query = query.eq("upload_id", upload_id);
  if (department) query = query.eq("department", department);
  if (year) query = query.eq("year", year);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ marks: data }, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
  });
}

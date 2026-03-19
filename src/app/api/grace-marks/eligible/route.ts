import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid");
  const subjectName = searchParams.get("subject_name");
  const graceRange = searchParams.get("grace_range");
  const year = searchParams.get("year");
  const department = searchParams.get("department");

  if (!uid || !subjectName || !graceRange) {
    return NextResponse.json({ error: "uid, subject_name and grace_range required" }, { status: 400 });
  }

  const { data: college } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!college) {
    return NextResponse.json({ error: "College not found" }, { status: 404 });
  }

  // Collect active (non-deleted) upload IDs for this college
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
    // Fallback: schema without deleted_at column
    const { data: fallbackUploads } = await supabaseAdmin
      .from("marks_uploads")
      .select("id")
      .eq("college_id", college.id)
      .neq("status", "deleted");
    activeUploadIds = (fallbackUploads || []).map((u: any) => u.id);
  }

  if (activeUploadIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const { data, error } = await supabaseAdmin.rpc("get_eligible_students", {
    college_uuid: college.id,
    subject_name_text: subjectName,
    grace_range_value: parseFloat(graceRange),
    year_filter: year === "All" ? null : year,
    dept_filter: department === "All" ? null : department,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Post-filter: remove students whose upload has been soft-deleted
  const activeSet = new Set(activeUploadIds);
  const filtered = (data || []).filter((row: any) =>
    !row.upload_id || activeSet.has(row.upload_id)
  );

  return NextResponse.json({ data: filtered }, {
    headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" },
  });
}

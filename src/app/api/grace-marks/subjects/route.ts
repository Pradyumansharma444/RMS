import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid");
  const year = searchParams.get("year");
  const department = searchParams.get("department");
  const upload_id = searchParams.get("upload_id");

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

  // Handle 'all' or 'All' filters
  const yearFilter = !year || year.toLowerCase() === "all" ? null : year;
  const deptFilter = !department || department.toLowerCase() === "all" ? null : department;
  const uploadIdFilter = !upload_id || upload_id.toLowerCase() === "all" ? null : upload_id;

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

  // If a specific upload_id is requested but it is deleted, return empty
  if (uploadIdFilter && !activeUploadIds.includes(uploadIdFilter)) {
    return NextResponse.json({ data: [] });
  }

  // Use raw SQL to extract unique subjects from JSONB — scoped to active uploads
  const { data, error } = await supabaseAdmin.rpc("get_unique_subjects", {
    college_uuid: college.id,
    year_filter: yearFilter,
    dept_filter: deptFilter,
    upload_id_filter: uploadIdFilter,
  });

  if (error) {
    console.error("RPC Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Post-filter: remove any subjects that come from deleted uploads
  // (RPC may not honour the active-upload scope natively)
  const activeSet = new Set(activeUploadIds);
  const filtered = (data || []).filter((row: any) =>
    !row.upload_id || activeSet.has(row.upload_id)
  );

  return NextResponse.json({ data: filtered }, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
  });
}

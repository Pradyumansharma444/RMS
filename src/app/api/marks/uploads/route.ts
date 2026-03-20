import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  const bin = req.nextUrl.searchParams.get("bin"); // "1" = fetch deleted items
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const { data: college } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

  if (bin === "1") {
    // Prefer deleted_at when available, fallback to status="deleted" for schemas without deleted_at
    const { data, error } = await supabaseAdmin
      .from("marks_uploads")
      .select("*")
      .eq("college_id", college.id)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (!error) return NextResponse.json({ uploads: data });

    const fallback = await supabaseAdmin
      .from("marks_uploads")
      .select("*")
      .eq("college_id", college.id)
      .eq("status", "deleted")
      .order("created_at", { ascending: false });
    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });

    const uploads = (fallback.data || []).map((u: any) => ({
      ...u,
      deleted_at: u.deleted_at || u.created_at || null,
    }));
    return NextResponse.json({ uploads });
  }

  // Normal fetch — only non-deleted
  const primary = await supabaseAdmin
    .from("marks_uploads")
    .select("*")
    .eq("college_id", college.id)
    .is("deleted_at", null)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  const CACHE = { headers: { "Cache-Control": "no-store" } };

  if (!primary.error) {
    return NextResponse.json({ uploads: primary.data || [] }, CACHE);
  }

  // Fallback path for schemas that don't have deleted_at
  const fallback = await supabaseAdmin
    .from("marks_uploads")
    .select("*")
    .eq("college_id", college.id)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });
  if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
  return NextResponse.json({ uploads: fallback.data || [] }, CACHE);
}

export async function DELETE(req: NextRequest) {
  const uploadId = req.nextUrl.searchParams.get("id");
  const permanent = req.nextUrl.searchParams.get("permanent"); // "1" = hard delete
  if (!uploadId) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (permanent === "1") {
    // Hard delete from recycle bin
    await supabaseAdmin
      .from("student_marks")
      .delete()
      .eq("upload_id", uploadId);

    const { error } = await supabaseAdmin
      .from("marks_uploads")
      .delete()
      .eq("id", uploadId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Soft delete — idempotent: if already deleted, return success immediately
  const { data: existing } = await supabaseAdmin
    .from("marks_uploads")
    .select("id, deleted_at, status")
    .eq("id", uploadId)
    .single();

  if (!existing) return NextResponse.json({ error: "Record not found" }, { status: 404 });

  // Already in recycle bin — treat as success (idempotent)
  if (existing.deleted_at !== null || existing.status === "deleted") {
    return NextResponse.json({ success: true, already_deleted: true });
  }

  const now = new Date().toISOString();
  const primary = await supabaseAdmin
    .from("marks_uploads")
    .update({ deleted_at: now, status: "deleted" })
    .eq("id", uploadId);

  if (!primary.error) return NextResponse.json({ success: true });

  const fallback = await supabaseAdmin
    .from("marks_uploads")
    .update({ status: "deleted" })
    .eq("id", uploadId);

  if (fallback.error) {
    return NextResponse.json({ success: false, error: fallback.error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  // Restore from recycle bin
  const uploadId = req.nextUrl.searchParams.get("id");
  if (!uploadId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const primary = await supabaseAdmin
    .from("marks_uploads")
    .update({ deleted_at: null, status: "completed" })
    .eq("id", uploadId);

  if (!primary.error) return NextResponse.json({ success: true });

  const fallback = await supabaseAdmin
    .from("marks_uploads")
    .update({ status: "completed" })
    .eq("id", uploadId);

  if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

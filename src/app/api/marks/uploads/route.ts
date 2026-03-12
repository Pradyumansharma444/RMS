import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const { data: college } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

    const { data, error } = await supabaseAdmin
      .from("marks_uploads")
      .select("*")
      .eq("college_id", college.id)
      .order("created_at", { ascending: false });
  
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ uploads: data });
}

export async function DELETE(req: NextRequest) {
  const uploadId = req.nextUrl.searchParams.get("id");
  if (!uploadId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("marks_uploads")
    .delete()
    .eq("id", uploadId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

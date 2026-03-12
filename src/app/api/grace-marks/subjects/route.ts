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

  // Use raw SQL to extract unique subjects from JSONB
  const { data, error } = await supabaseAdmin.rpc("get_unique_subjects", {
    college_uuid: college.id,
    year_filter: yearFilter,
    dept_filter: deptFilter,
    upload_id_filter: uploadIdFilter
  });

  if (error) {
    console.error("RPC Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}

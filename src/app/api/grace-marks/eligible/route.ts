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

  const { data, error } = await supabaseAdmin.rpc("get_eligible_students", {
    college_uuid: college.id,
    subject_name_text: subjectName,
    grace_range_value: parseFloat(graceRange),
    year_filter: year === "All" ? null : year,
    dept_filter: department === "All" ? null : department
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

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

  return NextResponse.json({ marks: data });
}

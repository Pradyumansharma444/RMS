import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { uid, mark_id, subjects } = await req.json();

  if (!uid || !mark_id || !subjects) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Get admin info
  const { data: admin } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!admin) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  // Fetch the original record to get metadata (like upload_id, student_id, etc.)
  const { data: original, error: fetchError } = await supabaseAdmin
    .from("student_marks")
    .select("*")
    .eq("id", mark_id)
    .eq("college_id", admin.id)
    .single();

  if (fetchError || !original) {
    return NextResponse.json({ error: "Original record not found" }, { status: 404 });
  }

  // Recalculate totals
  let totalObtained = 0;
  let hasFail = false;
  
  // Clean up and validate subjects
  const updatedSubjects = subjects.map((sub: any) => {
    const int = parseFloat(sub.int_marks) || 0;
    const theo = parseFloat(sub.theo_marks) || 0;
    const prac = parseFloat(sub.prac_marks) || 0;
    const obtained = int + theo + prac;
    const max = parseFloat(sub.max_marks) || 100;
    const passing = max * 0.4;
    const is_pass = obtained >= passing;
    
    if (!is_pass && sub.subject_name !== 'CC Subject') {
      hasFail = true;
    }
    
    totalObtained += obtained;
    
    return {
      ...sub,
      int_marks: int,
      theo_marks: theo,
      prac_marks: prac,
      obtained_marks: obtained,
      is_pass,
      grade: is_pass ? (obtained >= (max * 0.8) ? 'O' : (obtained >= (max * 0.7) ? 'A' : (obtained >= (max * 0.6) ? 'B' : 'C'))) : 'F',
      gp: is_pass ? (obtained >= (max * 0.8) ? 10 : (obtained >= (max * 0.7) ? 9 : (obtained >= (max * 0.6) ? 8 : 7))) : 0
    };
  });

  const totalMarks = parseFloat(original.total_marks) || 0;
  const percentage = totalMarks > 0 ? (totalObtained / totalMarks) * 100 : 0;
  const resultStatus = hasFail ? "FAIL" : "P A S S";

  // Update student_marks
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("student_marks")
    .update({
      subjects: updatedSubjects,
      obtained_marks: totalObtained,
      percentage: Number(percentage.toFixed(2)),
      result: resultStatus
    })
    .eq("id", mark_id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Update student_results for consistency
  await supabaseAdmin
    .from("student_results")
    .update({
      obtained_marks: totalObtained,
      percentage: Number(percentage.toFixed(2)),
      result_status: resultStatus
    })
    .eq("upload_id", original.upload_id)
    .eq("student_id", original.student_id);

  return NextResponse.json({ success: true, student: updated });
}

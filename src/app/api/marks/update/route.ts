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
  // Strict 40% per head: Internal AND External must each independently pass 40%
  const updatedSubjects = subjects.map((sub: any) => {
    const int = parseFloat(sub.int_marks) || 0;
    const theo = parseFloat(sub.theo_marks) || 0;
    const prac = parseFloat(sub.prac_marks) || 0;
    const obtained = int + theo + prac;
    const max = parseFloat(sub.max_marks) || 100;

    // Determine max marks per component for 40% threshold
    // Assume internal max = 20 for 50-max subjects (int max is typically 20, ext max is 30)
    // Use stored int_max / ext_max if available, else derive from component ratio
    const intMax = parseFloat(sub.int_max) || (sub.theo_marks != null ? Math.round(max * 0.4) : 0);
    const extMax = parseFloat(sub.ext_max) || (sub.theo_marks != null ? Math.round(max * 0.6) : max);

    // 40% threshold per head
    const intMinPass = intMax > 0 ? intMax * 0.4 : 0;
    const extMinPass = extMax > 0 ? extMax * 0.4 : 0;

    // Subject-level pass: overall ≥40% AND each available head ≥40%
    const overallPass = obtained >= max * 0.4;
    const intPass = intMax <= 0 || int >= intMinPass;
    const extPass = (sub.theo_marks == null && sub.prac_marks == null) || theo >= extMinPass;
    const is_pass = overallPass && intPass && extPass;

    if (!is_pass && sub.subject_name !== 'CC Subject') {
      hasFail = true;
    }

    totalObtained += obtained;

    const pct = max > 0 ? obtained / max : 0;
    const grade = is_pass
      ? (pct >= 0.80 ? 'O' : pct >= 0.70 ? 'A+' : pct >= 0.60 ? 'A' : pct >= 0.55 ? 'B+' : pct >= 0.50 ? 'B' : 'C')
      : 'F';
    const gp = is_pass
      ? (pct >= 0.80 ? 10 : pct >= 0.70 ? 9 : pct >= 0.60 ? 8 : pct >= 0.55 ? 7 : pct >= 0.50 ? 6 : 5)
      : 0;

    return {
      ...sub,
      int_marks: int,
      theo_marks: theo,
      prac_marks: prac,
      obtained_marks: obtained,
      is_pass,
      grade,
      gp,
    };
  });

  const totalMarks = parseFloat(original.total_marks) || 0;
  const percentage = totalMarks > 0 ? (totalObtained / totalMarks) * 100 : 0;
  const resultStatus = hasFail ? "FAIL" : "P A S S";

  // Calculate EC (Credits Earned) and ECG (Grade Points × Credits)
  let ec = 0;
  let ecg = 0;
  for (const sub of updatedSubjects) {
    const credits = parseFloat(sub.credits) || 2;
    const gp = parseFloat(sub.gp) || 0;
    const earned = sub.is_pass ? credits : 0;
    ec += earned;
    ecg += gp * credits;
  }
  const totalCredits = updatedSubjects.reduce((acc: number, s: any) => acc + (parseFloat(s.credits) || 2), 0);
  const sgpi = totalCredits > 0 ? ecg / totalCredits : 0;
  // CGPA = same as SGPI for a single semester update (multi-semester needs historical data)
  const cgpa = Number(sgpi.toFixed(2));

  // Update student_marks
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("student_marks")
    .update({
      subjects: updatedSubjects,
      obtained_marks: totalObtained,
      percentage: Number(percentage.toFixed(2)),
      result: resultStatus,
      ec: Number(ec.toFixed(2)),
      ecg: Number(ecg.toFixed(2)),
      sgpi: Number(sgpi.toFixed(2)),
      cgpa,
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

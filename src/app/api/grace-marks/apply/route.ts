import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { mark_ids, subject_name, uid, grace_amt, grace_internal, grace_external } = await req.json();

  if (!mark_ids || !Array.isArray(mark_ids) || !subject_name || !uid) {
    return NextResponse.json({ error: "mark_ids (array), subject_name and uid required" }, { status: 400 });
  }

  const internalNum = grace_internal != null ? Number(grace_internal) : 0;
  const externalNum = grace_external != null ? Number(grace_external) : 0;
  const totalGrace =
    grace_amt != null && grace_amt !== ""
      ? Number(grace_amt)
      : internalNum + externalNum;
  if (totalGrace <= 0) {
    return NextResponse.json({ error: "Provide grace_amt or grace_internal/grace_external" }, { status: 400 });
  }

  const { data: admin } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!admin) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  const results: string[] = [];
  const errors: { mark_id: string; error: string }[] = [];

  for (const mark_id of mark_ids) {
    const { data: row, error: fetchError } = await supabaseAdmin
      .from("student_marks")
      .select("*")
      .eq("id", mark_id)
      .eq("college_id", admin.id)
      .single();

    if (fetchError || !row) {
      errors.push({ mark_id, error: fetchError?.message || "Record not found" });
      continue;
    }

    const subjects = Array.isArray(row.subjects) ? row.subjects : [];
    const subIndex = subjects.findIndex(
      (s: any) => (s.subject_name || "").trim().toLowerCase() === (subject_name || "").trim().toLowerCase()
    );
    if (subIndex < 0) {
      errors.push({ mark_id, error: `Subject '${subject_name}' not found` });
      continue;
    }

    const sub = subjects[subIndex] as any;
    const int = parseFloat(sub.int_marks) || 0;
    const theo = parseFloat(sub.theo_marks) || 0;
    const prac = parseFloat(sub.prac_marks) || 0;
    const newInt = int + internalNum;
    const newTheo = theo + externalNum;
    const obtained = newInt + newTheo + prac;
    const max = parseFloat(sub.max_marks) || 100;
    const passing = max * 0.4;
    const is_pass = obtained >= passing;
    const grade = is_pass
      ? obtained >= max * 0.8 ? "O" : obtained >= max * 0.7 ? "A" : obtained >= max * 0.6 ? "B" : "C"
      : "F";
    const gp = is_pass
      ? obtained >= max * 0.8 ? 10 : obtained >= max * 0.7 ? 9 : obtained >= max * 0.6 ? 8 : 7
      : 0;

    const updatedSubjects = [...subjects];
    updatedSubjects[subIndex] = {
      ...sub,
      int_marks: newInt,
      theo_marks: newTheo,
      prac_marks: prac,
      obtained_marks: obtained,
      is_pass,
      grade,
      gp
    };

    let totalObtained = 0;
    let hasFail = false;
    for (const s of updatedSubjects) {
      const o = parseFloat((s as any).obtained_marks) || 0;
      totalObtained += o;
      if (!(s as any).is_pass && (s as any).subject_name !== "CC Subject") hasFail = true;
    }
    const totalMarks = parseFloat(row.total_marks) || 0;
    const percentage = totalMarks > 0 ? (totalObtained / totalMarks) * 100 : 0;
    const resultStatus = hasFail ? "FAIL" : "P A S S";

    const { error: updateError } = await supabaseAdmin
      .from("student_marks")
      .update({
        subjects: updatedSubjects,
        obtained_marks: totalObtained,
        percentage: Number(percentage.toFixed(2)),
        result: resultStatus
      })
      .eq("id", mark_id)
      .eq("college_id", admin.id);

    if (updateError) {
      errors.push({ mark_id, error: updateError.message });
      continue;
    }

    await supabaseAdmin
      .from("student_results")
      .update({
        obtained_marks: totalObtained,
        percentage: Number(percentage.toFixed(2)),
        result_status: resultStatus
      })
      .eq("upload_id", row.upload_id)
      .eq("student_id", row.student_id);

    // Record grace marks history (original_marks = int_grace, grace_given = ext_grace, final_marks = total_grace)
    try {
      await supabaseAdmin.from("grace_marks").insert({
        college_id: admin.id,
        student_id: row.student_id || null,
        mark_id: mark_id,
        subject_name: subject_name,
        original_marks: internalNum,
        grace_given: externalNum,
        final_marks: totalGrace,
      });
    } catch {}

    results.push(mark_id);
  }

  return NextResponse.json({
    success: true,
    applied_count: results.length,
    failed_count: errors.length,
    errors: errors.length > 0 ? errors : undefined
  });
}

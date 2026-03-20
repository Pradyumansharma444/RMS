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

  // Batch-fetch all mark rows in a single query instead of N individual queries
  const { data: allRows, error: batchFetchErr } = await supabaseAdmin
    .from("student_marks")
    .select("*")
    .in("id", mark_ids)
    .eq("college_id", admin.id);

  if (batchFetchErr) {
    return NextResponse.json({ error: batchFetchErr.message }, { status: 500 });
  }
  const rowMap = new Map<string, any>((allRows || []).map((r: any) => [r.id, r]));

  // Batch-fetch previously applied grace for all mark_ids so we can enforce
  // the O.5042-A cumulative 1% aggregate cap (new + already applied ≤ 1%).
  const { data: existingGraceRows } = await supabaseAdmin
    .from("grace_marks")
    .select("mark_id, final_marks")
    .in("mark_id", mark_ids)
    .eq("college_id", admin.id);

  // Sum up grace already applied per mark_id (final_marks stores total grace per entry)
  const priorGraceByMarkId = new Map<string, number>();
  for (const g of existingGraceRows || []) {
    const prev = priorGraceByMarkId.get(g.mark_id) ?? 0;
    priorGraceByMarkId.set(g.mark_id, prev + (Number(g.final_marks) || 0));
  }

  // Accumulate all updates so we can batch them at the end
  const markUpdates: { id: string; payload: Record<string, any> }[] = [];
  const resultUpdates: { upload_id: string; student_id: string; payload: Record<string, any> }[] = [];
  const graceInserts: Record<string, any>[] = [];

  for (const mark_id of mark_ids) {
    const row = rowMap.get(mark_id);
    if (!row) {
      errors.push({ mark_id, error: "Record not found" });
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

    // O.5042-A strict cumulative 1% aggregate cap:
    // (grace already applied to this student) + (new grace) must not exceed 1% of aggregate.
    const aggregateMax = subjects.reduce((sum: number, s: any) => sum + (parseFloat(s.max_marks) || 0), 0);
    const maxAllowedGrace = Math.ceil(aggregateMax * 0.01);
    const priorGrace = priorGraceByMarkId.get(mark_id) ?? 0;
    const cumulativeGrace = priorGrace + totalGrace;
    if (cumulativeGrace > maxAllowedGrace) {
      errors.push({
        mark_id,
        error: `Cumulative grace (prior ${priorGrace} + new ${totalGrace} = ${cumulativeGrace}) exceeds O.5042-A 1% cap of ${maxAllowedGrace} marks — student must remain FAIL`,
      });
      continue;
    }

    // Mumbai University: strict 40% per head (internal AND external independently)
    // Use stored max_int/max_ext; fallback to standard 40/60 split of subject max.
    const rawMaxInt = parseFloat(sub.max_int) || 0;
    const rawMaxExt = parseFloat(sub.max_ext) || parseFloat(sub.max_theo) || 0;
    const hasHeadMax = rawMaxInt > 0 && rawMaxExt > 0;
    const maxInt = hasHeadMax ? rawMaxInt : Math.round(max * 0.4);
    const maxExt = hasHeadMax ? rawMaxExt : (max - maxInt);
    // Only apply per-head rule when both int and ext marks are present
    const hasIntMarks = sub.int_marks != null;
    const hasExtMarks = sub.theo_marks != null;
    let is_pass: boolean;
    if (hasIntMarks && hasExtMarks) {
      // Both heads defined — each must independently meet 40%
      const passInt = Math.ceil(maxInt * 0.4);
      const passExt = Math.ceil(maxExt * 0.4);
      is_pass = newInt >= passInt && newTheo >= passExt;
    } else {
      // Single-head subject — 40% of total max
      const passing = Math.ceil(max * 0.4);
      is_pass = obtained >= passing;
    }

    // Correct grade scale (Mumbai University 10-point system)
    function getGradeLocal(pct: number): string {
      if (pct >= 85) return "O";
      if (pct >= 75) return "A+";
      if (pct >= 65) return "A";
      if (pct >= 55) return "B+";
      if (pct >= 45) return "B";
      if (pct >= 40) return "C";
      return "F";
    }
    function getGPLocal(g: string): number {
      const m: Record<string, number> = { O: 10, "A+": 9, A: 8, "B+": 7, B: 6, C: 5, F: 0 };
      return m[g] ?? 0;
    }
    const pct = max > 0 ? (obtained / max) * 100 : 0;
    const grade = is_pass ? getGradeLocal(pct) : "F";
    const gp = getGPLocal(grade);

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
    let ec = 0;
    let ecg = 0;
    for (const s of updatedSubjects) {
      const o = parseFloat((s as any).obtained_marks) || 0;
      totalObtained += o;
      if (!(s as any).is_pass && (s as any).subject_name !== "CC Subject") hasFail = true;
      const credits = parseFloat((s as any).credits) || 2;
      const gpVal = parseFloat((s as any).gp) || 0;
      const earned = (s as any).is_pass ? credits : 0;
      ec += earned;
      ecg += gpVal * credits;
    }
    const totalMarks = parseFloat(row.total_marks) || 0;
    const percentage = totalMarks > 0 ? (totalObtained / totalMarks) * 100 : 0;
    const resultStatus = hasFail ? "FAIL" : "PASS";
    const totalCredits = updatedSubjects.reduce((acc: number, s: any) => acc + (parseFloat(s.credits) || 2), 0);
    const sgpi = totalCredits > 0 ? ecg / totalCredits : 0;
    const cgpa = Number(sgpi.toFixed(2));

    markUpdates.push({
      id: mark_id,
      payload: {
        subjects: updatedSubjects,
        obtained_marks: totalObtained,
        percentage: Number(percentage.toFixed(2)),
        result: resultStatus,
        ec: Number(ec.toFixed(2)),
        ecg: Number(ecg.toFixed(2)),
        sgpi: Number(sgpi.toFixed(2)),
        cgpa,
      },
    });

    if (row.upload_id && row.student_id) {
      resultUpdates.push({
        upload_id: row.upload_id,
        student_id: row.student_id,
        payload: {
          obtained_marks: totalObtained,
          percentage: Number(percentage.toFixed(2)),
          result_status: resultStatus,
        },
      });
    }

    graceInserts.push({
      college_id: admin.id,
      student_id: row.student_id || null,
      mark_id: mark_id,
      subject_name: subject_name,
      original_marks: internalNum,
      grace_given: externalNum,
      final_marks: totalGrace,
    });

    results.push(mark_id);
  }

  // ── Execute all writes in parallel ────────────────────────────────────────
  const writePromises: Promise<any>[] = [];

  // Batch-upsert student_marks (upsert by id) — runs in parallel
  for (let i = 0; i < markUpdates.length; i++) {
    const { id, payload } = markUpdates[i];
    writePromises.push(
      supabaseAdmin.from("student_marks").update(payload).eq("id", id).eq("college_id", admin.id)
        .then(({ error }) => {
          if (error) errors.push({ mark_id: id, error: error.message });
        })
    );
  }

  // Batch-insert grace_marks in one call
  if (graceInserts.length > 0) {
    writePromises.push(
      supabaseAdmin.from("grace_marks").insert(graceInserts).then(() => {/* non-fatal */})
    );
  }

  // student_results: group by upload_id to minimise queries
  for (const ru of resultUpdates) {
    writePromises.push(
      supabaseAdmin.from("student_results")
        .update(ru.payload)
        .eq("upload_id", ru.upload_id)
        .eq("student_id", ru.student_id)
        .then(() => {/* non-fatal */})
    );
  }

  await Promise.all(writePromises);

  // Clear cached PDFs for all affected uploads so next generation picks up +@ grace notation
  const affectedUploadIds = [
    ...new Set(
      [...(allRows || [])].map((r: any) => r.upload_id).filter(Boolean)
    )
  ];
  if (affectedUploadIds.length > 0) {
    await supabaseAdmin
      .from("marks_uploads")
      .update({ pdf_url: null })
      .in("id", affectedUploadIds);
  }

  return NextResponse.json({
    success: true,
    applied_count: results.length,
    failed_count: errors.length,
    errors: errors.length > 0 ? errors : undefined
  });
}

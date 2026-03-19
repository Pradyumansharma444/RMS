import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/grace-marks/ordinance-search
 * Returns all students from grace_marks who received grace via Apply Ordinance: Yes
 * (identified by grace_given > 0 or by the symbol in subject grade).
 *
 * Query params: uid, upload_id (required), rule (optional: "O.5042-A" | "O.5045-A" | "O.229" | "O.5044-A")
 *
 * Response columns: Roll No | Name | Subject | Original Marks | Grace Added (@) | Ordinance Type
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid");
  const uploadId = searchParams.get("upload_id");
  const ruleFilter = searchParams.get("rule") || null;

  if (!uid || !uploadId) {
    return NextResponse.json({ error: "uid and upload_id required" }, { status: 400 });
  }

  const { data: college } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!college) {
    return NextResponse.json({ error: "College not found" }, { status: 404 });
  }

  // Fetch all student_marks for this upload to get their subjects with grace symbols
  const { data: studentMarks, error: smError } = await supabaseAdmin
    .from("student_marks")
    .select("id, roll_number, student_name, department, year, result, subjects, sgpi, cgpa, upload_id")
    .eq("college_id", college.id)
    .eq("upload_id", uploadId);

  if (smError) {
    return NextResponse.json({ error: smError.message }, { status: 500 });
  }

  if (!studentMarks || studentMarks.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // Also fetch grace_marks records for these students for cross-reference
  const markIds = studentMarks.map((s: any) => s.id);
  const { data: graceMarksData } = await supabaseAdmin
    .from("grace_marks")
    .select("mark_id, subject_name, original_marks, grace_given, final_marks")
    .eq("college_id", college.id)
    .in("mark_id", markIds);

  // Build grace lookup: mark_id|subject_name_lower → { original_marks, grace_given, final_marks }
  const graceLookup = new Map<string, { original_marks: number; grace_given: number; final_marks: number }>();
  for (const g of (graceMarksData || [])) {
    const key = `${g.mark_id}|${(g.subject_name || "").trim().toLowerCase()}`;
    graceLookup.set(key, {
      original_marks: g.original_marks ?? 0,
      grace_given: g.grace_given ?? 0,
      final_marks: g.final_marks ?? 0,
    });
  }

  const results: any[] = [];

  for (const student of (studentMarks as any[])) {
    const subjects = Array.isArray(student.subjects) ? student.subjects : [];

    // Check O.229: CC subject participation (SGPI bonus)
    const ccSubject = subjects.find((s: any) =>
      s.is_cc || s.subject_code === "CC Subject" ||
      /NSS|NCC|DLLE|CULTURAL/i.test(s.subject_name || "")
    );
    const hasCCParticipation = ccSubject && (ccSubject.obtained_marks > 0 || ccSubject.is_pass);

    // Scan each subject for grace symbols or grace_marks records
    for (const sub of subjects) {
      const grade = String(sub.grade ?? "").trim();
      const subjectNameLower = (sub.subject_name || "").trim().toLowerCase();
      const graceKey = `${student.id}|${subjectNameLower}`;
      const graceRecord = graceLookup.get(graceKey);

      // Detect ordinance type from grade symbol
      let ordinanceType: string | null = null;
      let graceAmount = 0;
      let originalMarks = sub.obtained_marks ?? 0;

      if (grade.endsWith("*")) {
        ordinanceType = "O.5042-A";
        if (graceRecord) {
          graceAmount = graceRecord.grace_given;
          originalMarks = graceRecord.original_marks;
        }
      } else if (grade.endsWith("@")) {
        ordinanceType = "O.5045-A";
        if (graceRecord) {
          graceAmount = graceRecord.grace_given;
          originalMarks = graceRecord.original_marks;
        }
      } else if (graceRecord && graceRecord.grace_given > 0) {
        // Grace from grace_marks table but no symbol — treat as manual or O.5042-A
        ordinanceType = "O.5042-A";
        graceAmount = graceRecord.grace_given;
        originalMarks = graceRecord.original_marks;
      }

      // O.5044-A: Distinction Grace — subject approaching distinction (grade near A/A+)
      // Original marks ≥ 72 and < 75 (within 3 marks of A+ threshold), student is passing
      const origPct = sub.max_marks > 0 ? (sub.obtained_marks / sub.max_marks) * 100 : 0;
      if (!ordinanceType && sub.is_pass && origPct >= 72 && origPct < 75) {
        // This could have been graced under O.5044-A — detect from grade having "★" or "D" suffix
        if (grade.includes("★") || grade.endsWith("D")) {
          ordinanceType = "O.5044-A";
          if (graceRecord) {
            graceAmount = graceRecord.grace_given;
            originalMarks = graceRecord.original_marks;
          }
        }
      }

      if (!ordinanceType) continue;

      // Apply rule filter if provided
      if (ruleFilter && ruleFilter !== ordinanceType) continue;

      // Parse grace from subject_name format "7@1" if needed (e.g. overDisplay)
      // Also check if grace info is embedded in the grade string
      if (graceAmount === 0 && graceRecord) {
        graceAmount = graceRecord.grace_given;
        originalMarks = graceRecord.original_marks;
      }

      // Derive Before INT / Before EXT from subject data
      // int_marks = original internal (before grace), ext_marks = original external (before grace)
      const rawInt = typeof sub.int_marks === "number" ? sub.int_marks : (parseFloat(sub.int_marks) || 0);
      const rawExt = typeof sub.theo_marks === "number" ? sub.theo_marks : (parseFloat(sub.theo_marks) || 0);
      // For grace breakdown: grace_int is internal grace, grace_ext is external grace
      const graceIntAmt  = graceRecord ? (graceRecord.original_marks ?? 0) : 0;
      const graceExtAmt  = graceRecord ? (graceRecord.grace_given ?? 0) : 0;
      const graceTotalAmt = graceRecord ? (graceRecord.final_marks ?? (graceIntAmt + graceExtAmt)) : graceAmount;

      results.push({
        roll_number: student.roll_number,
        student_name: student.student_name,
        department: student.department,
        year: student.year,
        subject_name: (sub.subject_name || "").replace(/[*@★D]$/, "").trim(),
        // Before grace marks (original marks per head)
        int_marks: rawInt - graceIntAmt,
        ext_marks: rawExt - graceExtAmt,
        // Grace added per head
        grace_int: graceIntAmt,
        grace_ext: graceExtAmt,
        grace_total: graceTotalAmt,
        // Legacy fields kept for compatibility
        original_marks: originalMarks,
        grace_given: graceAmount,
        final_marks: sub.obtained_marks,
        ordinance_type: ordinanceType,
        result: student.result,
        mark_id: student.id,
        sgpi: student.sgpi,
        has_o229: hasCCParticipation ? true : false,
      });
    }

    // O.229 SGPI bonus entries — show CC subject students with bonus
    if (hasCCParticipation && (!ruleFilter || ruleFilter === "O.229")) {
      results.push({
        roll_number: student.roll_number,
        student_name: student.student_name,
        department: student.department,
        year: student.year,
        subject_name: ccSubject.subject_name,
        original_marks: ccSubject.obtained_marks ?? 0,
        grace_given: 0,
        final_marks: ccSubject.obtained_marks ?? 0,
        ordinance_type: "O.229",
        ordinance_note: "+0.1 SGPI Bonus",
        result: student.result,
        mark_id: student.id,
        sgpi: student.sgpi,
        has_o229: true,
      });
    }
  }

  return NextResponse.json({ data: results, total: results.length });
}

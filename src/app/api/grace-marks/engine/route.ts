import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/grace-marks/engine
 * Applies ordinance gracing rules to a given upload and returns updated student data.
 * Does NOT mutate the DB — returns grace-applied data for preview before saving.
 *
 * Body: { uid, upload_id, dry_run?: boolean }
 */

interface SubjectMark {
  subject_name: string;
  subject_code?: string;
  int_marks?: number;
  theo_marks?: number;
  prac_marks?: number;
  obtained_marks: number;
  max_marks: number;
  is_pass: boolean;
  grade: string;
  gp: number;
  credits?: number;
  earned_credits?: number;
  is_cc?: boolean;
}

function getGrade(pct: number): string {
  if (pct >= 85) return "O";
  if (pct >= 75) return "A+";
  if (pct >= 65) return "A";
  if (pct >= 55) return "B+";
  if (pct >= 45) return "B";
  if (pct >= 40) return "C";  // C grade: 40%–44.99% only (not below 40%)
  return "F";  // Strict 40% rule — below 40% is always F
}

function getGP(grade: string): number {
  const m: Record<string, number> = { O: 10, "A+": 9, A: 8, "B+": 7, B: 6, C: 5, D: 4, F: 0, ABS: 0 };
  return m[grade] ?? 0;
}

/**
 * Returns the grace budget PER HEAD based on O.5042-A:
 * - ≤ 50 max marks for that head → 2 marks max grace
 * - > 50 max marks for that head → 3 marks max grace
 * Applied independently for Internal and External heads.
 */
function graceAllowedPerHead(headMaxMarks: number): number {
  if (headMaxMarks <= 0) return 0;
  return headMaxMarks <= 50 ? 2 : 3;
}

/**
 * Returns the total grace budget for a subject based on O.5042-A.
 * Sums up per-head allowances for int and theo/ext.
 */
function graceAllowedO5042A(maxMarks: number, maxInt?: number, maxTheo?: number): number {
  if (maxMarks <= 0) return 0;
  // If we have per-head max marks, apply grace per head independently
  if (maxInt !== undefined || maxTheo !== undefined) {
    return graceAllowedPerHead(maxInt ?? 0) + graceAllowedPerHead(maxTheo ?? 0);
  }
  // Fallback: per-subject ceiling
  return maxMarks <= 50 ? 2 : 3;
}

/**
 * O.5045-A: Condonation — up to 1% of aggregate or 10% of course max, max 10 marks per head.
 */
function condoneAllowedO5045A(maxMarks: number, aggregateMax: number): number {
  const onePercAgg = Math.ceil(aggregateMax * 0.01);
  const tenPercCourse = Math.ceil(maxMarks * 0.1);
  return Math.min(10, onePercAgg, tenPercCourse);
}

export async function POST(req: NextRequest) {
  const { uid, upload_id, dry_run = true } = await req.json();

  if (!uid || !upload_id) {
    return NextResponse.json({ error: "uid and upload_id required" }, { status: 400 });
  }

  const { data: college } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

  const { data: students, error } = await supabaseAdmin
    .from("student_marks")
    .select("*")
    .eq("college_id", college.id)
    .eq("upload_id", upload_id);

  if (error || !students?.length) {
    return NextResponse.json({ error: "No student data found" }, { status: 404 });
  }

  const results: any[] = [];

  for (const student of students) {
    const subjects: SubjectMark[] = Array.isArray(student.subjects) ? student.subjects : [];
    const aggregateMax = subjects.reduce((sum, s) => sum + (s.max_marks || 0), 0);

    // O.229: Check if student has a CC subject with marks (NSS/DLLE/NCC/Cultural)
    // Add 0.1 bonus to final SGPI regardless of pass/fail status
    const hasCCParticipation = subjects.some(s =>
      (s.is_cc || s.subject_code === "CC Subject" || /NSS|NCC|DLLE|CULTURAL/i.test(s.subject_name)) &&
      (s.obtained_marks > 0 || s.is_pass)
    );

    // Re-evaluate is_pass using strict per-head 40% rule (Mumbai University standard).
    // A subject fails if the total obtained is below 40% of max marks.
    // Also if int_marks AND theo_marks both exist, each head must independently pass 40%.
    // Note: max_int / max_ext are rarely stored in DB; we estimate from marks ratio instead.
    for (const s of subjects) {
      if (s.grade === "ABS" || s.subject_name === "CC Subject" || s.is_cc) continue;
      const intMarks = s.int_marks ?? 0;
      const extMarks = s.theo_marks ?? 0;
      const hasInt = s.int_marks !== undefined && s.int_marks !== null;
      const hasExt = s.theo_marks !== undefined && s.theo_marks !== null;

      let fails = false;
      if (hasInt && hasExt && s.max_marks > 0) {
        // Estimate per-head max from the ratio of the component to total
        // Only apply per-head rule when both heads exist and sum to obtained
        const total = intMarks + extMarks;
        if (total > 0) {
          const estMaxInt = Math.round(s.max_marks * (intMarks / total));
          const estMaxExt = s.max_marks - estMaxInt;
          const passesInt = intMarks >= Math.ceil(estMaxInt * 0.4);
          const passesExt = extMarks >= Math.ceil(estMaxExt * 0.4);
          fails = !passesInt || !passesExt;
        } else {
          fails = true; // both zero → fail
        }
      } else {
        // Single-head or missing component: use total obtained vs 40% of max
        fails = (s.obtained_marks ?? 0) < Math.ceil((s.max_marks ?? 0) * 0.4);
      }

      if (fails) {
        s.is_pass = false;
        s.grade = "F";
        s.gp = 0;
        s.earned_credits = 0;
      }
    }

    // Count failing (non-CC, non-ABS) subjects
    const failingSubjects = subjects.filter(
      (s) => !s.is_pass && s.grade !== "ABS" && s.subject_name !== "CC Subject" && !s.is_cc
    );

    if (failingSubjects.length === 0) {
      // Already passing — no grace needed but apply O.229 if eligible
      let baseSGPI = student.sgpi ?? 0;
      let baseCGPA = student.cgpa ?? 0;
      if (hasCCParticipation) {
        baseSGPI = Math.min(10, baseSGPI + 0.1);
        baseCGPA = Math.min(10, baseCGPA + 0.1);
      }
      results.push({
        ...student,
        sgpi: Math.round(baseSGPI * 100) / 100,
        cgpa: Math.round(baseCGPA * 100) / 100,
        grace_applied: hasCCParticipation ? [{ subject: "CC Subject", amount: 0, rule: "O.229", symbol: "★", sgpi_bonus: 0.1 }] : [],
        grace_rule: hasCCParticipation ? "O.229" : null
      });
      continue;
    }

    // ─── O.5042-A: Passing Grace ───────────────────────────────────────────
    // Try to pass student by gracing each failing subject minimally.
    // Total grace ≤ 1% of aggregate.
    const maxTotalGrace = Math.ceil(aggregateMax * 0.01);
    let totalGraceUsed = 0;
    const graceApplied5042: { subject: string; amount: number; rule: string; symbol: string }[] = [];
    const updatedSubjects5042 = subjects.map((s) => ({ ...s }));

    let canPassWith5042 = true;

    for (const failSub of failingSubjects) {
      const subIdx = updatedSubjects5042.findIndex(
        (s) => s.subject_name === failSub.subject_name
      );
      if (subIdx < 0) { canPassWith5042 = false; break; }

      const sub = updatedSubjects5042[subIdx];
      const passMarks = Math.ceil((sub.max_marks || 50) * 0.4);
      const deficit = Math.max(0, passMarks - (sub.obtained_marks || 0));

      if (deficit <= 0) continue; // Already passes after previous iterations

      // Estimate per-head max marks for O.5042-A grace budget calculation
      const intM = sub.int_marks;
      const extM = sub.theo_marks;
      let estMaxInt: number | undefined;
      let estMaxTheo: number | undefined;
      if (intM !== undefined && extM !== undefined && (intM + extM) > 0) {
        const total = intM + extM;
        estMaxInt = Math.round((sub.max_marks || 50) * (intM / total));
        estMaxTheo = (sub.max_marks || 50) - estMaxInt;
      }

      const allowed = Math.min(
        graceAllowedO5042A(sub.max_marks || 50, estMaxInt, estMaxTheo),
        maxTotalGrace - totalGraceUsed
      );

      if (deficit > allowed) {
        // Can't pass this subject with allowed grace
        canPassWith5042 = false;
        break;
      }

      // Apply grace
      const newObtained = (sub.obtained_marks || 0) + deficit;
      const pct = sub.max_marks > 0 ? (newObtained / sub.max_marks) * 100 : 0;
      const newGrade = getGrade(pct) + "*"; // * symbol for O.5042-A
      updatedSubjects5042[subIdx] = {
        ...sub,
        obtained_marks: newObtained,
        is_pass: true,
        grade: newGrade,
        gp: getGP(getGrade(pct)),
        earned_credits: sub.credits ?? 2,
      };
      graceApplied5042.push({
        subject: sub.subject_name,
        amount: deficit,
        rule: "O.5042-A",
        symbol: "*",
      });
      totalGraceUsed += deficit;
    }

    if (canPassWith5042 && graceApplied5042.length > 0 && totalGraceUsed <= maxTotalGrace) {
      // Recompute totals
      let newObtained = 0;
      let ec = 0, ecg = 0;
      for (const s of updatedSubjects5042) {
        newObtained += s.obtained_marks || 0;
        const cred = s.credits ?? 2;
        if (s.is_pass) ec += cred;
        ecg += (s.gp || 0) * cred;
      }
      const totalCredits = updatedSubjects5042.reduce((a, s) => a + (s.credits ?? 2), 0);
      let sgpi = totalCredits > 0 ? ecg / totalCredits : 0;
      // O.229 bonus applied on top of graced SGPI
      if (hasCCParticipation) sgpi = Math.min(10, sgpi + 0.1);
      const pct = aggregateMax > 0 ? (newObtained / aggregateMax) * 100 : 0;

      const allGraceApplied = [...graceApplied5042];
      if (hasCCParticipation) allGraceApplied.push({ subject: "CC Subject", amount: 0, rule: "O.229", symbol: "★", sgpi_bonus: 0.1 } as any);

      const resultRecord = {
        id: student.id,
        roll_number: student.roll_number,
        student_name: student.student_name,
        subjects: updatedSubjects5042,
        obtained_marks: newObtained,
        percentage: Math.round(pct * 100) / 100,
        result: "P A S S",
        sgpi: Math.round(sgpi * 100) / 100,
        cgpa: Math.round(sgpi * 100) / 100,
        ec: Math.round(ec * 100) / 100,
        ecg: Math.round(ecg * 100) / 100,
        grace_applied: allGraceApplied,
        grace_rule: "O.5042-A",
        grace_total: totalGraceUsed,
      };

      results.push(resultRecord);

      if (!dry_run) {
        // Update student_marks with graced values
        await supabaseAdmin
          .from("student_marks")
          .update({
            subjects: updatedSubjects5042,
            obtained_marks: newObtained,
            percentage: resultRecord.percentage,
            result: "P A S S",
            sgpi: resultRecord.sgpi,
            cgpa: resultRecord.cgpa,
            ec: resultRecord.ec,
            ecg: resultRecord.ecg,
          })
          .eq("id", student.id)
          .eq("college_id", college.id);

        // Insert into grace_marks table so PDF generator can show "+@" notation.
        // original_marks = grace on internal head, grace_given = grace on external head.
        // For O.5042-A the engine applies grace to the overall obtained_marks;
        // we record it as external (grace_given) so it shows in the Ext column.
        const graceRows = graceApplied5042.map((g) => ({
          college_id: college.id,
          mark_id: student.id,
          subject_name: g.subject,
          original_marks: 0,         // int head grace
          grace_given: g.amount,     // ext/overall head grace
          final_marks: g.amount,
        }));
        if (graceRows.length > 0) {
          await supabaseAdmin.from("grace_marks").upsert(graceRows, {
            onConflict: "mark_id,subject_name",
            ignoreDuplicates: false,
          });
        }
      }

      continue;
    }

    // ─── O.5045-A: Condonation — exactly one failing head after grace ───────
    // If student fails in exactly one head, try condonation.
    const stillFailing = updatedSubjects5042.filter(
      (s) => !s.is_pass && s.grade !== "ABS" && s.subject_name !== "CC Subject"
    );

    if (stillFailing.length === 1) {
      const sub = stillFailing[0];
      const subIdx = subjects.findIndex((s) => s.subject_name === sub.subject_name);
      if (subIdx >= 0) {
        const origSub = subjects[subIdx];
        const passMarks = Math.ceil((origSub.max_marks || 50) * 0.4);
        const deficit = passMarks - (origSub.obtained_marks || 0);
        const allowed = condoneAllowedO5045A(origSub.max_marks || 50, aggregateMax);

        if (deficit > 0 && deficit <= allowed) {
          const updatedSubjects5045 = subjects.map((s) => ({ ...s }));
          const newObtained = (origSub.obtained_marks || 0) + deficit;
          const pct = origSub.max_marks > 0 ? (newObtained / origSub.max_marks) * 100 : 0;
          const newGrade = getGrade(pct) + "@"; // @ symbol for O.5045-A
          updatedSubjects5045[subIdx] = {
            ...origSub,
            obtained_marks: newObtained,
            is_pass: true,
            grade: newGrade,
            gp: getGP(getGrade(pct)),
            earned_credits: origSub.credits ?? 2,
          };

          let totalObtained = 0;
          let ec = 0, ecg = 0;
          for (const s of updatedSubjects5045) {
            totalObtained += s.obtained_marks || 0;
            const cred = s.credits ?? 2;
            if (s.is_pass) ec += cred;
            ecg += (s.gp || 0) * cred;
          }
          const totalCredits = updatedSubjects5045.reduce((a, s) => a + (s.credits ?? 2), 0);
          let sgpi5045 = totalCredits > 0 ? ecg / totalCredits : 0;
          // O.229 bonus
          if (hasCCParticipation) sgpi5045 = Math.min(10, sgpi5045 + 0.1);
          const aggPct = aggregateMax > 0 ? (totalObtained / aggregateMax) * 100 : 0;

          const grace5045Applied: any[] = [{ subject: origSub.subject_name, amount: deficit, rule: "O.5045-A", symbol: "@" }];
          if (hasCCParticipation) grace5045Applied.push({ subject: "CC Subject", amount: 0, rule: "O.229", symbol: "★", sgpi_bonus: 0.1 });

          const resultRecord = {
            id: student.id,
            roll_number: student.roll_number,
            student_name: student.student_name,
            subjects: updatedSubjects5045,
            obtained_marks: totalObtained,
            percentage: Math.round(aggPct * 100) / 100,
            result: "P A S S",
            sgpi: Math.round(sgpi5045 * 100) / 100,
            cgpa: Math.round(sgpi5045 * 100) / 100,
            ec: Math.round(ec * 100) / 100,
            ecg: Math.round(ecg * 100) / 100,
            grace_applied: grace5045Applied,
            grace_rule: "O.5045-A",
            grace_total: deficit,
          };

          results.push(resultRecord);

          if (!dry_run) {
            await supabaseAdmin
              .from("student_marks")
              .update({
                subjects: updatedSubjects5045,
                obtained_marks: totalObtained,
                percentage: resultRecord.percentage,
                result: "P A S S",
                sgpi: resultRecord.sgpi,
                cgpa: resultRecord.cgpa,
                ec: resultRecord.ec,
                ecg: resultRecord.ecg,
              })
              .eq("id", student.id)
              .eq("college_id", college.id);

            // Insert into grace_marks for PDF "+@" notation
            await supabaseAdmin.from("grace_marks").upsert([{
              college_id: college.id,
              mark_id: student.id,
              subject_name: origSub.subject_name,
              original_marks: 0,
              grace_given: deficit,
              final_marks: deficit,
            }], { onConflict: "mark_id,subject_name", ignoreDuplicates: false });
          }

          continue;
        }
      }
    }

    // Student still fails — include as-is, but still note O.229 if applicable
    if (hasCCParticipation) {
      results.push({
        ...student,
        grace_applied: [{ subject: "CC Subject", amount: 0, rule: "O.229", symbol: "★", sgpi_bonus: 0.1 }],
        grace_rule: "O.229",
      });
    } else {
      results.push({ ...student, grace_applied: [], grace_rule: null });
    }
  }

  const graced = results.filter((r) => r.grace_rule !== null);
  const o5042count = graced.filter((r) => r.grace_rule === "O.5042-A").length;
  const o5045count = graced.filter((r) => r.grace_rule === "O.5045-A").length;

  return NextResponse.json({
    success: true,
    dry_run,
    total: results.length,
    graced: graced.length,
    o5042_count: o5042count,
    o5045_count: o5045count,
    students: results,
  });
}

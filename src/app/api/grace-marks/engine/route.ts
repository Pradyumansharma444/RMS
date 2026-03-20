import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/grace-marks/engine
 * Applies all 5 University of Mumbai ordinance gracing rules in the correct
 * sequential pipeline and returns updated student data.
 * Does NOT mutate the DB when dry_run=true — returns grace-applied data for preview.
 *
 * Pipeline order (per official ordinance flowchart 42→44→45→43→229):
 *   Stage 1 – O.229   : Extracurricular pre-pass (5% cap per head, symbol #)
 *   Stage 2 – O.5042-A: Head-wise passing grace  (2/3 marks per head, ≤1% agg, symbol @)
 *   Stage 3 – O.5044-A: Grade elevation A → A+   (≤1% agg or 10 marks)
 *   Stage 4 – O.5045-A: Condonation (exactly 1 failing head, ≤10% head / 1% agg / 10 max, symbol *)
 *   Stage 5 – O.5043-A: Grade elevation A+ → O   (≤1% agg or 10 marks)
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

// ── Grade helpers ─────────────────────────────────────────────────────────────
function getGrade(pct: number): string {
  if (pct >= 85) return "O";
  if (pct >= 75) return "A+";
  if (pct >= 65) return "A";
  if (pct >= 55) return "B+";
  if (pct >= 45) return "B";
  if (pct >= 40) return "C";
  return "F";
}

function getGP(grade: string): number {
  const m: Record<string, number> = { O: 10, "A+": 9, A: 8, "B+": 7, B: 6, C: 5, D: 4, F: 0, ABS: 0 };
  return m[grade] ?? 0;
}

// ── Passing threshold helpers ─────────────────────────────────────────────────

/**
 * Check whether a subject passes using strict per-head 40% rule.
 * Both int and ext must independently clear 40% if both heads are present.
 * Returns { passes: boolean, intFails: boolean, extFails: boolean }
 */
function checkPass(sub: SubjectMark): { passes: boolean; intFails: boolean; extFails: boolean } {
  if (sub.grade === "ABS" || sub.is_cc || sub.subject_code === "CC Subject") {
    return { passes: true, intFails: false, extFails: false };
  }
  const intM = sub.int_marks;
  const extM = sub.theo_marks;
  const hasInt = intM !== undefined && intM !== null;
  const hasExt = extM !== undefined && extM !== null;

  if (hasInt && hasExt) {
    if (intM! + extM! === 0) return { passes: false, intFails: true, extFails: true };
    // Use stored max_int / max_ext when available (set by upload parser from header).
    // Fallback: standard Mumbai University 40/60 split of subject total max.
    const totalMax = sub.max_marks || 50;
    const storedMaxInt = (sub as any).max_int;
    const storedMaxExt = (sub as any).max_ext ?? (sub as any).max_theo;
    const maxInt = (storedMaxInt > 0) ? storedMaxInt : Math.round(totalMax * 0.4);
    const maxExt = (storedMaxExt > 0) ? storedMaxExt : (totalMax - maxInt);
    const intPasses = intM! >= Math.ceil(maxInt * 0.4);
    const extPasses = extM! >= Math.ceil(maxExt * 0.4);
    return { passes: intPasses && extPasses, intFails: !intPasses, extFails: !extPasses };
  }
  const passes = (sub.obtained_marks ?? 0) >= Math.ceil((sub.max_marks ?? 50) * 0.4);
  return { passes, intFails: !passes, extFails: false };
}

/**
 * O.5042-A grace budget per head:
 *   max marks ≤ 50  → 2 grace marks
 *   max marks > 50  → 3 grace marks
 */
function graceAllowedO5042A(headMax: number): number {
  if (headMax <= 0) return 0;
  return headMax <= 50 ? 2 : 3;
}

/**
 * O.229 grace budget per head: 5% of that head's max marks
 */
function graceAllowedO229(headMax: number): number {
  return Math.floor(headMax * 0.05);
}

/**
 * O.5045-A condonation budget for a failing head:
 *   min( 10% of that head's max, 1% of aggregate, hard cap 10 )
 */
function condoneAllowedO5045A(headMax: number, aggregateMax: number): number {
  return Math.min(10, Math.ceil(headMax * 0.1), Math.ceil(aggregateMax * 0.01));
}

// ── SGPI recalculation helper ─────────────────────────────────────────────────
function recalcTotals(subjects: SubjectMark[]) {
  let obtained = 0, ec = 0, ecg = 0;
  const totalCredits = subjects.reduce((a, s) => a + (s.credits ?? 2), 0);
  for (const s of subjects) {
    obtained += s.obtained_marks || 0;
    const cred = s.credits ?? 2;
    if (s.is_pass) ec += cred;
    ecg += (s.gp || 0) * cred;
  }
  const sgpi = totalCredits > 0 ? ecg / totalCredits : 0;
  return { obtained, ec, ecg, sgpi, totalCredits };
}

// ── Route handler ─────────────────────────────────────────────────────────────
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
    const rawSubjects: SubjectMark[] = Array.isArray(student.subjects) ? student.subjects : [];
    const aggregateMax = rawSubjects.reduce((sum, s) => sum + (s.max_marks || 0), 0);
    const maxTotalGrace = Math.ceil(aggregateMax * 0.01); // 1% aggregate cap for O.5042-A

    // ── Check extracurricular eligibility (O.229) ────────────────────────────
    const hasCCParticipation = rawSubjects.some(s =>
      (s.is_cc || s.subject_code === "CC Subject" || /NSS|NCC|DLLE|CULTURAL|SPORTS/i.test(s.subject_name)) &&
      (s.obtained_marks > 0 || s.is_pass)
    );

    // ── Stage 0: Re-evaluate is_pass using strict 40% per-head rule ──────────
    let workingSubjects: SubjectMark[] = rawSubjects.map(s => {
      if (s.grade === "ABS" || s.is_cc || s.subject_code === "CC Subject") return { ...s };
      const { passes } = checkPass(s);
      if (!passes) {
        return { ...s, is_pass: false, grade: "F", gp: 0, earned_credits: 0 };
      }
      // Recompute grade from percentage if currently passing
      const pct = s.max_marks > 0 ? (s.obtained_marks / s.max_marks) * 100 : 0;
      const grade = getGrade(pct);
      return { ...s, is_pass: true, grade, gp: getGP(grade), earned_credits: s.credits ?? 2 };
    });

    const graceApplied: { subject: string; amount: number; rule: string; symbol: string; head?: string; sgpi_bonus?: number }[] = [];
    let o229Bank = hasCCParticipation ? 10 : 0; // O.229 10-mark bank

    // Helper: get currently failing non-CC, non-ABS subjects
    const getFailingSubjects = (subs: SubjectMark[]) =>
      subs.filter(s => !s.is_pass && s.grade !== "ABS" && !s.is_cc && s.subject_code !== "CC Subject");

    let failingNow = getFailingSubjects(workingSubjects);

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 1 — O.229: Extracurricular grace (5% per head, from 10-mark bank)
    //           Symbol: # on the grade
    // ═══════════════════════════════════════════════════════════════════════════
    if (hasCCParticipation && failingNow.length > 0) {
      const updatedFor229 = workingSubjects.map(s => ({ ...s }));

      for (const failSub of failingNow) {
        if (o229Bank <= 0) break;
        const idx = updatedFor229.findIndex(s => s.subject_name === failSub.subject_name);
        if (idx < 0) continue;
        const sub = updatedFor229[idx];
        const { intFails, extFails } = checkPass(sub);

        const intM = sub.int_marks ?? 0;
        const extM = sub.theo_marks ?? 0;
        const hasInt = sub.int_marks !== undefined && sub.int_marks !== null;
        const hasExt = sub.theo_marks !== undefined && sub.theo_marks !== null;

        let applied229 = 0;
        let newInt = intM;
        let newExt = extM;

        if (hasInt && hasExt) {
          // Use standard 40/60 split — do NOT derive max from student's own marks ratio
          const totalMax = sub.max_marks || 50;
          const smInt = (sub as any).max_int;
          const smExt = (sub as any).max_ext ?? (sub as any).max_theo;
          const estMaxInt = (smInt > 0) ? smInt : Math.round(totalMax * 0.4);
          const estMaxExt = (smExt > 0) ? smExt : (totalMax - estMaxInt);

          // Fix int head if failing
          if (intFails) {
            const intPassMark = Math.ceil(estMaxInt * 0.4);
            const intDeficit = intPassMark - intM;
            const intBudget229 = Math.min(graceAllowedO229(estMaxInt), o229Bank);
            if (intDeficit > 0 && intDeficit <= intBudget229) {
              newInt = intM + intDeficit;
              o229Bank -= intDeficit;
              applied229 += intDeficit;
            }
          }
          // Fix ext head if failing (after potentially fixing int)
          if (extFails) {
            const extPassMark = Math.ceil(estMaxExt * 0.4);
            const extDeficit = extPassMark - extM;
            const extBudget229 = Math.min(graceAllowedO229(estMaxExt), o229Bank);
            if (extDeficit > 0 && extDeficit <= extBudget229) {
              newExt = extM + extDeficit;
              o229Bank -= extDeficit;
              applied229 += extDeficit;
            }
          }
        } else {
          // Single-head
          const passM = Math.ceil(sub.max_marks * 0.4);
          const deficit = passM - sub.obtained_marks;
          const budget229 = Math.min(graceAllowedO229(sub.max_marks), o229Bank);
          if (deficit > 0 && deficit <= budget229) {
            newInt = sub.int_marks !== undefined ? sub.int_marks! + deficit : sub.int_marks!;
            applied229 += deficit;
            o229Bank -= deficit;
          }
        }

        if (applied229 > 0) {
          const newObtained = (hasInt && hasExt) ? newInt + newExt + (sub.prac_marks ?? 0) : sub.obtained_marks + applied229;
          const pct = sub.max_marks > 0 ? (newObtained / sub.max_marks) * 100 : 0;
          const grade = getGrade(pct) + "#"; // # symbol for O.229
          updatedFor229[idx] = {
            ...sub,
            int_marks: hasInt ? newInt : sub.int_marks,
            theo_marks: hasExt ? newExt : sub.theo_marks,
            obtained_marks: newObtained,
            is_pass: true,
            grade,
            gp: getGP(getGrade(pct)),
            earned_credits: sub.credits ?? 2,
          };
          graceApplied.push({ subject: sub.subject_name, amount: applied229, rule: "O.229", symbol: "#" });
        }
      }

      workingSubjects = updatedFor229;
      failingNow = getFailingSubjects(workingSubjects);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 2 — O.5042-A: Head-wise passing grace
    //           Budget per head: 2 marks (≤50 max) or 3 marks (>50 max)
    //           Total across all subjects: ≤ 1% of aggregate
    //           Symbol: @ on the grade
    //           IMPORTANT: Rollback ALL O.5042-A if student still fails after applying
    // ═══════════════════════════════════════════════════════════════════════════
    if (failingNow.length > 0) {
      const snapshot5042 = workingSubjects.map(s => ({ ...s }));
      let totalGrace5042Used = 0;
      let can5042Pass = true;
      const grace5042Records: { subject: string; amount: number; rule: string; symbol: string }[] = [];

      for (const failSub of failingNow) {
        const idx = snapshot5042.findIndex(s => s.subject_name === failSub.subject_name);
        if (idx < 0) { can5042Pass = false; break; }
        const sub = snapshot5042[idx];
        const { intFails, extFails } = checkPass(sub);

        const intM = sub.int_marks ?? 0;
        const extM = sub.theo_marks ?? 0;
        const hasInt = sub.int_marks !== undefined && sub.int_marks !== null;
        const hasExt = sub.theo_marks !== undefined && sub.theo_marks !== null;

        let applied5042 = 0;
        let newInt = intM;
        let newExt = extM;

        if (hasInt && hasExt) {
          // Use standard 40/60 split — do NOT derive max from student's own marks ratio
          const totalMax5042 = sub.max_marks || 50;
          const sm5042Int = (sub as any).max_int;
          const sm5042Ext = (sub as any).max_ext ?? (sub as any).max_theo;
          const estMaxInt = (sm5042Int > 0) ? sm5042Int : Math.round(totalMax5042 * 0.4);
          const estMaxExt = (sm5042Ext > 0) ? sm5042Ext : (totalMax5042 - estMaxInt);

          if (intFails) {
            const intPassMark = Math.ceil(estMaxInt * 0.4);
            const intDeficit = intPassMark - intM;
            const intBudget = Math.min(graceAllowedO5042A(estMaxInt), maxTotalGrace - totalGrace5042Used);
            if (intDeficit > 0 && intDeficit <= intBudget) {
              newInt = intM + intDeficit;
              applied5042 += intDeficit;
            } else if (intDeficit > 0) {
              can5042Pass = false; break;
            }
          }
          if (extFails) {
            const extPassMark = Math.ceil(estMaxExt * 0.4);
            const extDeficit = extPassMark - extM;
            const extBudget = Math.min(graceAllowedO5042A(estMaxExt), maxTotalGrace - totalGrace5042Used - (newInt - intM));
            if (extDeficit > 0 && extDeficit <= extBudget) {
              newExt = extM + extDeficit;
              applied5042 += extDeficit;
            } else if (extDeficit > 0) {
              can5042Pass = false; break;
            }
          }
        } else {
          // Single-head
          const passM = Math.ceil(sub.max_marks * 0.4);
          const deficit = passM - sub.obtained_marks;
          const budget = Math.min(graceAllowedO5042A(sub.max_marks), maxTotalGrace - totalGrace5042Used);
          if (deficit > 0 && deficit <= budget) {
            applied5042 = deficit;
            newInt = sub.int_marks !== undefined ? sub.int_marks! + deficit : sub.int_marks!;
          } else if (deficit > 0) {
            can5042Pass = false; break;
          }
        }

        if (applied5042 > 0) {
          const newObtained = (hasInt && hasExt)
            ? newInt + newExt + (sub.prac_marks ?? 0)
            : sub.obtained_marks + applied5042;
          const pct = sub.max_marks > 0 ? (newObtained / sub.max_marks) * 100 : 0;
          const grade = getGrade(pct) + "@"; // @ symbol for O.5042-A
          snapshot5042[idx] = {
            ...sub,
            int_marks: hasInt ? newInt : sub.int_marks,
            theo_marks: hasExt ? newExt : sub.theo_marks,
            obtained_marks: newObtained,
            is_pass: true,
            grade,
            gp: getGP(getGrade(pct)),
            earned_credits: sub.credits ?? 2,
          };
          grace5042Records.push({ subject: sub.subject_name, amount: applied5042, rule: "O.5042-A", symbol: "@" });
          totalGrace5042Used += applied5042;
        }
      }

      if (can5042Pass && grace5042Records.length > 0) {
        // Verify no failures remain after applying O.5042-A
        const stillFailing5042 = getFailingSubjects(snapshot5042);
        if (stillFailing5042.length === 0) {
          workingSubjects = snapshot5042;
          graceApplied.push(...grace5042Records);
          failingNow = [];
        }
        // else: rollback — don't apply O.5042-A, workingSubjects stays unchanged
      }

      failingNow = getFailingSubjects(workingSubjects);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 3 — O.5044-A: Grade elevation A → A+
    //           Applied only if student has PASSED all subjects
    //           Marks needed ≤ min(1% aggregate, 10)
    //           Elevates subjects at the boundary from A to A+
    // ═══════════════════════════════════════════════════════════════════════════
    if (failingNow.length === 0) {
      const elev5044Budget = Math.min(maxTotalGrace, 10);
      let elev5044Used = 0;
      const snapshot5044 = workingSubjects.map(s => ({ ...s }));

      for (let idx = 0; idx < snapshot5044.length; idx++) {
        const sub = snapshot5044[idx];
        if (!sub.is_pass || sub.is_cc || sub.subject_code === "CC Subject") continue;
        const pct = sub.max_marks > 0 ? (sub.obtained_marks / sub.max_marks) * 100 : 0;
        // Elevate A → A+ if within boundary (65% threshold for A+, currently A at 65%-)
        if (pct >= 60 && pct < 65) {
          const marksTo65 = Math.ceil((sub.max_marks * 0.65) - sub.obtained_marks);
          if (marksTo65 > 0 && marksTo65 <= (elev5044Budget - elev5044Used)) {
            const newObtained = sub.obtained_marks + marksTo65;
            const newPct = sub.max_marks > 0 ? (newObtained / sub.max_marks) * 100 : 0;
            snapshot5044[idx] = {
              ...sub,
              obtained_marks: newObtained,
              grade: getGrade(newPct),
              gp: getGP(getGrade(newPct)),
            };
            graceApplied.push({ subject: sub.subject_name, amount: marksTo65, rule: "O.5044-A", symbol: "^" });
            elev5044Used += marksTo65;
          }
        }
      }
      if (elev5044Used > 0) workingSubjects = snapshot5044;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 4 — O.5045-A: Condonation (exactly 1 failing head)
    //           Budget: min(10% of failing head's max, 1% aggregate, hard cap 10)
    //           Symbol: * on the grade
    // ═══════════════════════════════════════════════════════════════════════════
    if (failingNow.length === 1) {
      const failSub = failingNow[0];
      const idx = workingSubjects.findIndex(s => s.subject_name === failSub.subject_name);
      if (idx >= 0) {
        const sub = workingSubjects[idx];
        const passM = Math.ceil(sub.max_marks * 0.4);
        const deficit = passM - sub.obtained_marks;
        const condBudget = condoneAllowedO5045A(sub.max_marks, aggregateMax);

        if (deficit > 0 && deficit <= condBudget) {
          const snapshot5045 = workingSubjects.map(s => ({ ...s }));
          const newObtained = sub.obtained_marks + deficit;
          const pct = sub.max_marks > 0 ? (newObtained / sub.max_marks) * 100 : 0;
          const grade = getGrade(pct) + "*"; // * symbol for O.5045-A
          snapshot5045[idx] = {
            ...sub,
            obtained_marks: newObtained,
            is_pass: true,
            grade,
            gp: getGP(getGrade(pct)),
            earned_credits: sub.credits ?? 2,
          };
          workingSubjects = snapshot5045;
          graceApplied.push({ subject: sub.subject_name, amount: deficit, rule: "O.5045-A", symbol: "*" });
          failingNow = [];
        }
      }

      failingNow = getFailingSubjects(workingSubjects);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 5 — O.5043-A: Grade elevation A+ → O
    //           Applied only if student passes all subjects
    //           Marks needed ≤ min(1% aggregate, 10)
    // ═══════════════════════════════════════════════════════════════════════════
    if (failingNow.length === 0) {
      const elev5043Budget = Math.min(maxTotalGrace, 10);
      let elev5043Used = 0;
      const snapshot5043 = workingSubjects.map(s => ({ ...s }));

      for (let idx = 0; idx < snapshot5043.length; idx++) {
        const sub = snapshot5043[idx];
        if (!sub.is_pass || sub.is_cc || sub.subject_code === "CC Subject") continue;
        const pct = sub.max_marks > 0 ? (sub.obtained_marks / sub.max_marks) * 100 : 0;
        // Elevate A+ → O if within boundary (85% threshold for O)
        if (pct >= 80 && pct < 85) {
          const marksTo85 = Math.ceil((sub.max_marks * 0.85) - sub.obtained_marks);
          if (marksTo85 > 0 && marksTo85 <= (elev5043Budget - elev5043Used)) {
            const newObtained = sub.obtained_marks + marksTo85;
            const newPct = sub.max_marks > 0 ? (newObtained / sub.max_marks) * 100 : 0;
            snapshot5043[idx] = {
              ...sub,
              obtained_marks: newObtained,
              grade: getGrade(newPct),
              gp: getGP(getGrade(newPct)),
            };
            graceApplied.push({ subject: sub.subject_name, amount: marksTo85, rule: "O.5043-A", symbol: "^" });
            elev5043Used += marksTo85;
          }
        }
      }
      if (elev5043Used > 0) workingSubjects = snapshot5043;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 6 — O.229 SGPI bonus (if CC and student passes ALL on their own)
    //           Only if O.229 was NOT used for passing assistance above
    // ═══════════════════════════════════════════════════════════════════════════
    const o229UsedForPassing = graceApplied.some(g => g.rule === "O.229");
    const studentNowPasses = getFailingSubjects(workingSubjects).length === 0;

    // Recompute totals
    const { obtained, ec, ecg, sgpi } = recalcTotals(workingSubjects);
    const pctOverall = aggregateMax > 0 ? (obtained / aggregateMax) * 100 : 0;

    // Apply O.229 SGPI bonus: +0.1 if CC participant AND did NOT need O.229 to pass
    let finalSGPI = sgpi;
    if (hasCCParticipation && studentNowPasses && !o229UsedForPassing) {
      finalSGPI = Math.min(10, sgpi + 0.1);
      graceApplied.push({ subject: "CC Subject", amount: 0, rule: "O.229", symbol: "★", sgpi_bonus: 0.1 });
    }

    const anyGrace = graceApplied.length > 0;
    const graceRule = anyGrace
      ? (graceApplied.find(g => g.rule !== "O.229") ?? graceApplied[0]).rule
      : null;

    const resultRecord = {
      id: student.id,
      roll_number: student.roll_number,
      student_name: student.student_name,
      subjects: workingSubjects,
      obtained_marks: obtained,
      percentage: Math.round(pctOverall * 100) / 100,
      result: studentNowPasses ? "P A S S" : "FAIL",
      sgpi: Math.round(finalSGPI * 100) / 100,
      cgpa: Math.round(finalSGPI * 100) / 100,
      ec: Math.round(ec * 100) / 100,
      ecg: Math.round(ecg * 100) / 100,
      grace_applied: graceApplied,
      grace_rule: graceRule,
      grace_total: graceApplied.reduce((a, g) => a + g.amount, 0),
    };

    results.push(resultRecord);

    // ── Persist if not dry-run ────────────────────────────────────────────────
    if (!dry_run && anyGrace) {
      await supabaseAdmin
        .from("student_marks")
        .update({
          subjects: workingSubjects,
          obtained_marks: obtained,
          percentage: resultRecord.percentage,
          result: resultRecord.result,
          sgpi: resultRecord.sgpi,
          cgpa: resultRecord.cgpa,
          ec: resultRecord.ec,
          ecg: resultRecord.ecg,
        })
        .eq("id", student.id)
        .eq("college_id", college.id);

      // Build grace_marks rows for PDF "+@" notation
      // Group by subject, accumulate int_grace and ext_grace per subject
      const graceBySubject = new Map<string, { int_grace: number; ext_grace: number }>();
      for (const g of graceApplied) {
        if (g.rule === "O.229" && g.amount === 0) continue; // SGPI bonus only, no marks
        const key = g.subject.trim().toLowerCase();
        const prev = graceBySubject.get(key) ?? { int_grace: 0, ext_grace: 0 };
        // Attribute grace to ext head by default (shows in Ext column)
        graceBySubject.set(key, { int_grace: prev.int_grace, ext_grace: prev.ext_grace + g.amount });
      }

      const graceRows = Array.from(graceBySubject.entries()).map(([subjectLower, val]) => {
        // Find the original subject name (case-preserving)
        const origSub = rawSubjects.find(s => s.subject_name.trim().toLowerCase() === subjectLower);
        return {
          college_id: college.id,
          mark_id: student.id,
          subject_name: origSub?.subject_name ?? subjectLower,
          original_marks: val.int_grace,  // int head grace
          grace_given: val.ext_grace,     // ext head grace
          final_marks: val.int_grace + val.ext_grace,
        };
      });

      if (graceRows.length > 0) {
        await supabaseAdmin.from("grace_marks").upsert(graceRows, {
          onConflict: "mark_id,subject_name",
          ignoreDuplicates: false,
        });
      }
    }
  }

  const graced = results.filter(r => (r.grace_applied?.length ?? 0) > 0);

  // Clear cached PDF so the next generation picks up the +@ grace notation
  if (!dry_run && graced.length > 0) {
    await supabaseAdmin
      .from("marks_uploads")
      .update({ pdf_url: null })
      .eq("id", upload_id);
  }

  // Count per rule — a student may have multiple rules applied; count each rule occurrence
  const allRules = results.flatMap(r => r.grace_applied?.map((g: any) => g.rule) ?? []);
  const countRule = (rule: string) => allRules.filter((r: string) => r === rule).length;

  return NextResponse.json({
    success: true,
    dry_run,
    total: results.length,
    graced: graced.length,
    o5042_count: countRule("O.5042-A"),
    o5045_count: countRule("O.5045-A"),
    o229_count:  countRule("O.229"),
    o5044_count: countRule("O.5044-A"),
    o5043_count: countRule("O.5043-A"),
    students: results,
  });
}

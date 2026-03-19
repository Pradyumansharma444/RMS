import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import ExcelJS from "exceljs";

function getGrade(pct: number): string {
  if (pct >= 85) return "O";
  if (pct >= 75) return "A+";
  if (pct >= 65) return "A";
  if (pct >= 55) return "B+";
  if (pct >= 45) return "B";
  if (pct >= 35) return "C";
  if (pct >= 30) return "D";
  return "F";
}

function getGP(grade: string): number {
  const map: Record<string, number> = {
    O: 10, "A+": 9, A: 8, "B+": 7, B: 6, C: 5, D: 4, F: 0,
  };
  return map[grade] ?? 0;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const uid = formData.get("uid") as string;

  if (!file || !uid) {
    return NextResponse.json({ error: "file and uid are required" }, { status: 400 });
  }

  if (!file.name.match(/\.(xlsx|xls)$/i)) {
    return NextResponse.json(
      { error: "Only Excel files (.xlsx, .xls) are allowed" },
      { status: 400 }
    );
  }

  // Resolve college
  const { data: college } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!college) {
    return NextResponse.json({ error: "College not found" }, { status: 404 });
  }

  // Parse workbook
  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) {
    return NextResponse.json({ error: "No worksheet found in file" }, { status: 400 });
  }

  // ── Find header row ─────────────────────────────────────────────────────────
  // Supports two formats:
  // New (template/export): Roll Number, Student Name, Department, Subject,
  //                        Internal Marks (20), Max External (30)
  // Legacy: Mark ID, Roll Number, Subject Name, Internal Marks, External Marks,
  //         Total Obtained, Max Marks
  type ColMap = {
    markId: number;       // 0 if not present (new format)
    rollNumber: number;
    subjectName: number;
    intMarks: number;
    extMarks: number;
    totalObtained: number;
    maxMarks: number;
  };

  let headerRowNum: number | null = null;
  let cols: ColMap | null = null;

  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const map: Record<string, number> = {};
    row.eachCell({ includeEmpty: false }, (cell, colIdx) => {
      const v = String(cell.value ?? "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\s*\(\d+\)\s*$/, ""); // strip "(20)", "(30)" etc. from end
      map[v] = colIdx;
    });

    const has = (keys: string[]) => keys.find((k) => map[k] != null);

    // New format: Roll Number + Subject (no Mark ID required)
    if (has(["roll number"]) && has(["subject", "subject name"])) {
      headerRowNum = r;
      cols = {
        markId: 0, // not present
        rollNumber: map["roll number"],
        subjectName: map["subject"] ?? map["subject name"],
        intMarks: map["internal marks"] ?? 0,
        extMarks: map["max external"] ?? map["external marks"] ?? 0,
        totalObtained: 0,
        maxMarks: 0,
        // semester column is informational only — not needed for lookup
      };
      break;
    }

    // Legacy format: Mark ID + Roll Number + Subject Name
    if (has(["mark id"]) && has(["roll number"]) && has(["subject name"])) {
      headerRowNum = r;
      cols = {
        markId: map["mark id"],
        rollNumber: map["roll number"],
        subjectName: map["subject name"],
        intMarks: map["internal marks"] ?? 0,
        extMarks: map["external marks"] ?? 0,
        totalObtained: map["total obtained"] ?? 0,
        maxMarks: map["max marks"] ?? 0,
      };
      break;
    }
  }

  if (!headerRowNum || !cols) {
    return NextResponse.json(
      {
        error:
          "Header row not found. The file must contain columns: Roll Number, Subject, Internal Marks (20), Max External (30).",
      },
      { status: 400 }
    );
  }

  // ── Parse data rows ──────────────────────────────────────────────────────────
  type SubjectPatch = {
    subject_name: string;
    int_marks: number;
    ext_marks: number;
    total_obtained: number;
    max_marks: number;
  };

  // Group by roll_number (new format) or mark_id (legacy format)
  const byRollNumber = new Map<string, SubjectPatch[]>();
  const byMarkId = new Map<string, SubjectPatch[]>();
  const isLegacy = cols.markId > 0;

  for (let r = headerRowNum + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);

    const rollNumber = String(row.getCell(cols.rollNumber).value ?? "").trim();
    const subjectName = String(row.getCell(cols.subjectName).value ?? "").trim();

    if (!rollNumber || !subjectName) continue;
    // Skip example/template rows with non-numeric roll numbers
    if (subjectName.toLowerCase().includes("example") || rollNumber.toLowerCase().includes("example")) continue;

    const safeNum = (col: number) => {
      if (!col) return 0;
      const v = row.getCell(col).value;
      const n = parseFloat(String(v ?? ""));
      return isNaN(n) ? 0 : n;
    };

    const patch: SubjectPatch = {
      subject_name: subjectName,
      int_marks: safeNum(cols.intMarks),
      ext_marks: safeNum(cols.extMarks),
      total_obtained: safeNum(cols.totalObtained),
      max_marks: safeNum(cols.maxMarks),
    };

    if (isLegacy) {
      const markId = String(row.getCell(cols.markId).value ?? "").trim();
      if (!markId) continue;
      if (!byMarkId.has(markId)) byMarkId.set(markId, []);
      byMarkId.get(markId)!.push(patch);
    } else {
      if (!byRollNumber.has(rollNumber)) byRollNumber.set(rollNumber, []);
      byRollNumber.get(rollNumber)!.push(patch);
    }
  }

  const totalParsed = isLegacy ? byMarkId.size : byRollNumber.size;
  if (totalParsed === 0) {
    return NextResponse.json(
      { error: "No valid data rows found in the file" },
      { status: 400 }
    );
  }

  // ── Fetch original records & update ─────────────────────────────────────────
  let originals: any[] = [];
  let fetchErr: any = null;

  if (isLegacy) {
    const markIds = Array.from(byMarkId.keys());
    const res = await supabaseAdmin
      .from("student_marks")
      .select("*")
      .in("id", markIds)
      .eq("college_id", college.id);
    originals = res.data || [];
    fetchErr = res.error;
  } else {
    const rollNumbers = Array.from(byRollNumber.keys());
    const res = await supabaseAdmin
      .from("student_marks")
      .select("*")
      .in("roll_number", rollNumbers)
      .eq("college_id", college.id);
    originals = res.data || [];
    fetchErr = res.error;
  }

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  let updated_count = 0;
  const errors: string[] = [];

  for (const orig of originals) {
    const patches = isLegacy
      ? byMarkId.get(orig.id)
      : byRollNumber.get(orig.roll_number);
    if (!patches) continue;

    const patchMap = new Map(patches.map((p) => [p.subject_name.toLowerCase(), p]));

    const subjects: any[] = (orig.subjects as any[]) || [];
    const updatedSubjects = subjects.map((sub: any) => {
      const key = String(sub.subject_name ?? "").toLowerCase();
      const p = patchMap.get(key);
      if (!p) return sub; // leave unchanged

      const intM = p.int_marks;
      const theoM = p.ext_marks; // ext column maps to theo_marks
      const pracM = 0;
      const obtained = p.total_obtained > 0 ? p.total_obtained : intM + theoM;
      const maxM = p.max_marks > 0 ? p.max_marks : sub.max_marks ?? 100;
      const passing = maxM * 0.4;
      const is_pass = obtained >= passing;
      const pct = maxM > 0 ? (obtained / maxM) * 100 : 0;
      const grade = getGrade(pct);

      return {
        ...sub,
        int_marks: intM,
        theo_marks: theoM,
        prac_marks: pracM,
        obtained_marks: obtained,
        max_marks: maxM,
        is_pass,
        grade,
        gp: getGP(grade),
        earned_credits: is_pass ? (sub.credits ?? 2) : 0,
      };
    });

    // Recalculate overall totals
    let totalObtained = 0;
    let hasFail = false;
    for (const sub of updatedSubjects) {
      totalObtained += sub.obtained_marks ?? 0;
      if (sub.is_pass === false && sub.subject_name !== "CC Subject") hasFail = true;
    }

    const totalMarks: number = orig.total_marks ?? 0;
    const percentage = totalMarks > 0 ? (totalObtained / totalMarks) * 100 : 0;
    const result = hasFail ? "FAIL" : "P A S S";

    const { error: upErr } = await supabaseAdmin
      .from("student_marks")
      .update({
        subjects: updatedSubjects,
        obtained_marks: totalObtained,
        percentage: Math.round(percentage * 100) / 100,
        result,
      })
      .eq("id", orig.id);

    if (upErr) {
      errors.push(`${orig.roll_number}: ${upErr.message}`);
    } else {
      updated_count++;
      if (orig.upload_id && orig.student_id) {
        await supabaseAdmin
          .from("student_results")
          .update({
            obtained_marks: totalObtained,
            percentage: Math.round(percentage * 100) / 100,
            result_status: result,
          })
          .eq("upload_id", orig.upload_id)
          .eq("student_id", orig.student_id);
      }
    }
  }

  return NextResponse.json({
    success: true,
    updated_count,
    total_rows_in_file: totalParsed,
    errors: errors.length > 0 ? errors : undefined,
    message: `${updated_count} student record(s) updated successfully`,
  });
}

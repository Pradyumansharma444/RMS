import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import ExcelJS from "exceljs";

interface SubjectMark {
  subject_name: string;
  subject_code?: string;
  max_marks: number;
  obtained_marks: number;
  is_pass: boolean;
  grade: string;
  gp: number;
  int_marks?: number;
  theo_marks?: number;
  prac_marks?: number;
  credits?: number;
  earned_credits?: number;
  is_cc?: boolean;
}

interface ParsedStudentMark {
  roll_number: string;
  student_name: string;
  department: string;
  year: string;
  division?: string;
  ern?: string;
  enrollment_no?: string;
  abc_id?: string;
  university_exam_seat_no?: string;
  gender?: string;
  subjects: SubjectMark[];
  total_marks: number;
  obtained_marks: number;
  percentage: number;
  result: string;
  cgpa: number;
  ec?: number;
  ecg?: number;
  sgpi?: number;
}

function getGrade(pct: number): string {
  if (pct >= 85) return "O";
  if (pct >= 75) return "A+";
  if (pct >= 65) return "A";
  if (pct >= 55) return "B+";
  if (pct >= 45) return "B";
  if (pct >= 40) return "C";  // 40%–44.99% → C (passes, per Mumbai Univ)
  return "F";                  // below 40% → always FAIL
}

function getGP(grade: string): number {
  const gmap: Record<string, number> = { "O": 10, "A+": 9, "A": 8, "B+": 7, "B": 6, "C": 5, "F": 0 };
  return gmap[grade] ?? 0;
}

function calcCGPA(pct: number): number {
  if (pct >= 85) return 10.0;
  if (pct >= 75) return 9.0;
  if (pct >= 65) return 8.0;
  if (pct >= 55) return 7.0;
  if (pct >= 45) return 6.0;
  if (pct >= 40) return 5.0;  // C grade threshold
  return 0.0;
}

function normalizeHeader(v: string): string {
  return String(v || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function isTheoLikeHeader(v: string): boolean {
  const val = normalizeHeader(v);
  return (
    val.includes("theo") ||
    val.includes("theory") ||
    val === "th" ||
    val === "ext" ||
    val.includes("external") ||
    val === "ese" ||
    val.includes("end sem") ||
    val.includes("sem end") ||
    val === "see"
  );
}

/** Safely extract a string from any ExcelJS cell value (handles formulas, rich-text, errors, numbers) */
function cellStr(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  // Formula result object: { result, formula }
  if (typeof value === "object" && "result" in (value as object)) {
    return cellStr((value as any).result);
  }
  // Rich-text array: [{ text: "..." }, ...]
  if (typeof value === "object" && "richText" in (value as object)) {
    return (value as any).richText.map((r: any) => r.text ?? "").join("").trim();
  }
  // Error value: { error: "#REF!" }
  if (typeof value === "object" && "error" in (value as object)) return "";
  // Date
  if (value instanceof Date) return value.toLocaleDateString("en-IN");
  return String(value).trim();
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const uid = formData.get("uid") as string;
  const department = formData.get("department") as string;
  const year = formData.get("year") as string;
  const exam_name = (formData.get("exam_name") as string) || "Examination";
  const semester = formData.get("semester") as string;
  const hod_name = formData.get("hod_name") as string;
  const title_suffix = formData.get("title_suffix") as string;

  if (!file || !uid || !department || !year) {
    return NextResponse.json({ error: "file, uid, department and year required" }, { status: 400 });
  }

  if (!file.name.match(/\.(xlsx|xls)$/i)) {
    return NextResponse.json({ error: "Only Excel files (.xlsx, .xls) are allowed" }, { status: 400 });
  }

  const { data: college } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return NextResponse.json({ error: "No worksheet found" }, { status: 400 });

  // ── Phase 1: find header row ───────────────────────────
  let headerRowNum: number | null = null;
  const baseColIdx: Record<string, number> = {};

  // Find the row containing basic headers
  for (let i = 1; i <= Math.min(30, worksheet.rowCount); i++) {
    const row = worksheet.getRow(i);
    const vals: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      vals[colNumber] = normalizeHeader(cellStr(cell.value as ExcelJS.CellValue));
    });

    const hasRoll = vals.findIndex((v) => v && (v.includes("roll") || v.includes("seat") || v.includes("enroll") || v.includes("sr no") || v.includes("s.no")));
    const hasName = vals.findIndex((v) => v && (v.includes("name") || v.includes("candidate") || v.includes("learner")));
    if (hasRoll >= 0 && hasName >= 0) {
      console.log(`[Header Detection] Found header at row ${headerRowNum}: Roll/Seat at ${hasRoll}, Name at ${hasName}`);
      headerRowNum = i;
      break;
    }
  }

  if (headerRowNum === null) {
    console.warn("[Header Detection] Failed to find header row in first 30 rows.");
    return NextResponse.json({
      error: "Header row not found. Ensure the sheet has columns: Roll Number and Name.",
    }, { status: 400 });
  }

  // Scan multiple rows around header to build a full picture
  const rowH = worksheet.getRow(headerRowNum);
  const rowA1 = worksheet.getRow(headerRowNum + 1);
  const rowA2 = worksheet.getRow(headerRowNum + 2);
  const rowPrev = worksheet.getRow(Math.max(1, headerRowNum - 1));

  const maxCols = Math.min(250, rowH.cellCount + 100);
  for (let i = 1; i <= maxCols; i++) {
    const vH = normalizeHeader(cellStr(rowH.getCell(i).value as ExcelJS.CellValue));
    const vA1 = normalizeHeader(cellStr(rowA1.getCell(i).value as ExcelJS.CellValue));
    const vA2 = normalizeHeader(cellStr(rowA2.getCell(i).value as ExcelJS.CellValue));
    const vP = normalizeHeader(cellStr(rowPrev.getCell(i).value as ExcelJS.CellValue));
    
    // Check all candidates for base columns
    const combined = (vH + " " + vA1 + " " + vA2 + " " + vP).trim();
    const combinedAll = combined;

    // Roll: strict to avoid mislabeling enrollment as roll
    if (!baseColIdx.roll && (
      vH === "roll" || vH === "roll no" || vH === "roll number" || vH === "roll no." ||
      vH === "sr no" || vH === "sr." || vH === "no." || vH === "s.no" || vH === "sr no."
    )) baseColIdx.roll = i;
    else if (!baseColIdx.university_exam_seat_no && (
      combinedAll.includes("exam seat") || combinedAll.includes("university seat") ||
      combinedAll.includes("university exam seat") || combinedAll.includes("seat no")
    )) baseColIdx.university_exam_seat_no = i;
    else if (!baseColIdx.enrollment_no && (
      combinedAll.includes("ern") || combinedAll.includes("enroll") ||
      combinedAll.includes("p.r.n") || combinedAll.includes("prn") ||
      combinedAll.includes("perm") || combinedAll.includes("reg. no") ||
      combinedAll.includes("reg no") || combinedAll.includes("registration") ||
      combinedAll.includes("mu no") || combinedAll.includes("mu.no") ||
      // MU-style: column header might just say "MU" or contain "MU"
      vH === "mu" || vH === "mu no" || vH === "mu.no" || vH === "mu number"
    )) baseColIdx.enrollment_no = i;
    else if (!baseColIdx.name && combinedAll.includes("name")) baseColIdx.name = i;
    else if (!baseColIdx.div && combinedAll.includes("div")) baseColIdx.div = i;
    else if (!baseColIdx.abc && combinedAll.includes("abc")) baseColIdx.abc = i;
    else if (!baseColIdx.gender && combinedAll.includes("gender")) baseColIdx.gender = i;
    else if (!baseColIdx.total && (vH === "total" || vH === "total marks" || vH === "grand total" || vA1 === "total" || vA2 === "total")) baseColIdx.total = i;
    else if (!baseColIdx.pct && (vH.includes("percent") || vH === "%" || vA1.includes("percent") || vA2.includes("percent"))) baseColIdx.pct = i;
    else if (!baseColIdx.result && (vH.includes("result") || vH === "status" || vH === "remark" || vA1.includes("result") || vA2.includes("result"))) baseColIdx.result = i;
    else if (!baseColIdx.sgpi && (vH.includes("cgpa") || vH.includes("sgpa") || vH.includes("sgpi") || vA1.includes("cgpa") || vA2.includes("cgpa"))) baseColIdx.sgpi = i;
    else if (!baseColIdx.ec && (vH === "ec" || vH === "credit" || vA1 === "ec" || vA1 === "credit" || vA2 === "credit")) baseColIdx.ec = i;
    else if (!baseColIdx.ecg && (vH === "ecg" || vH === "credit points" || vA1 === "ecg" || vA2 === "ecg")) baseColIdx.ecg = i;
    else if (!baseColIdx.cc_subject && (combinedAll.includes("cc subject") || combinedAll.includes("extra curricular"))) baseColIdx.cc_subject = i;
  }

  // Auto-detect MU-style enrollment numbers from data rows if not already found
  // MU enrollment numbers follow pattern: MU followed by digits (e.g., MU202402101)
  if (!baseColIdx.enrollment_no) {
    const sampleRow = worksheet.getRow(headerRowNum + 1);
    const maxSample = Math.min(250, sampleRow.cellCount + 10);
    for (let i = 1; i <= maxSample; i++) {
      const val = cellStr(sampleRow.getCell(i).value as ExcelJS.CellValue).trim();
      if (/^[A-Z]{1,4}\d{6,12}$/i.test(val) && !String(val).toLowerCase().includes("roll")) {
        // Looks like an enrollment/registration number (MU202402101, etc.)
        // Make sure it's not the roll column
        if (i !== baseColIdx.roll) {
          baseColIdx.enrollment_no = i;
          console.log(`[Auto-detect] MU-style enrollment number detected at column ${i}: ${val}`);
          break;
        }
      }
    }
  }
  
  console.log("[Column Mapping]", baseColIdx);


  // Detect Subjects (Regular and CC)
  const subjectGroups: {
    name: string;
    code: string;
    intCol?: number;
    pracCol?: number;
    theoCol?: number;
    overCol?: number;
    maxCol?: number;
    gradeCol?: number;
    gpCol?: number;
    crCol?: number;
    earnCol?: number;
    maxInt: number;
    maxPrac: number;
    maxTheo: number;
    maxTotal: number;
    isCC?: boolean;
  }[] = [];

  let lastKnownSubjName = "";
  let lastKnownSubjCode = "";

  for (let i = 1; i <= maxCols; i++) {
    const vH = normalizeHeader(cellStr(rowH.getCell(i).value as ExcelJS.CellValue));
    const vA1 = normalizeHeader(cellStr(rowA1.getCell(i).value as ExcelJS.CellValue));
    const vA2 = normalizeHeader(cellStr(rowA2.getCell(i).value as ExcelJS.CellValue));

    // Check which row has the component headers.
    // IMPORTANT: Check sub-header rows (vA2, vA1) BEFORE the subject-name row (vH),
    // so that subject names containing "int" (e.g. "Introduction...") don't get
    // misidentified as an internal-marks column.
    const isComponentVal = (val: string) =>
      val === "int" || val.startsWith("internal") || val === "ia" || val === "in" ||
      val.includes("prac") || val === "pr" ||
      isTheoLikeHeader(val) ||
      val === "over" || val === "total" || val === "tot" || val === "marks" ||
      val === "max" || val === "max marks" || val === "out of" ||
      val === "gr" || val === "grade" ||
      val === "gp" || val === "grade point" ||
      val === "cr" || val === "credit" ||
      val === "earn" || val === "earned";
    const v = [vA2, vA1, vH].find(isComponentVal) || "";

    // Detect component types
    // Use startsWith("internal") so "introduction" or "integer" don't false-match
    const isInt = v === "int" || v.startsWith("internal") || v === "ia" || v === "in";
    const isPrac = v.includes("prac") || v === "pr";
    const isTheo = isTheoLikeHeader(v);
    const isOver = v === "over" || v === "total" || v === "tot" || v === "marks";
    const isMax = v === "max" || v === "max marks" || v === "out of";
    const isGrade = v === "gr" || v === "grade";
    const isGP = v === "gp" || v === "grade point";
    const isCr = v === "cr" || v === "credit";
    const isEarn = v === "earn" || v === "earned" || v === "earned credits";

    if (isInt || isPrac || isTheo || isOver || isMax || isGrade || isGP || isCr || isEarn) {
      // Find the subject name/code from above/current.
      let subjNameRaw = "";
      let subjCodeRaw = "";

      // Try current and previous columns, and multiple rows
      for (let offset = 0; offset >= -5; offset--) {
        const checkIdx = i + offset;
        if (checkIdx < 1) break;
        
        // Subject name is usually in Row 1 (rowH)
        subjNameRaw = cellStr(rowH.getCell(checkIdx).value as ExcelJS.CellValue);
        // Subject code is usually in Row 2 (rowA1)
        subjCodeRaw = cellStr(rowA1.getCell(checkIdx).value as ExcelJS.CellValue);
        
        if (subjNameRaw) break;
      }

      if (!subjNameRaw && lastKnownSubjName) {
        subjNameRaw = lastKnownSubjName;
        subjCodeRaw = lastKnownSubjCode;
      }

      if (!subjNameRaw) continue;

      // Sanitize: remove newlines and redundant spaces
      let subjName = subjNameRaw.replace(/[\n\r]+/g, " ").replace(/\s+/g, " ").trim();
      let subjCode = subjCodeRaw.replace(/[\n\r]+/g, " ").replace(/\s+/g, " ").trim();

      // Rule: If name is the long CC category header, treat it as CC Subject
      const isCCCategory = subjName.toUpperCase().includes("NSS/DLLE/CULTURAL") || 
                           subjName.toUpperCase().includes("CC SUBJECT") || 
                           subjName.toUpperCase().includes("CO-CURRICULAR");
      
      if (isCCCategory) {
        subjName = "CC Subject";
        if (!subjCode) subjCode = "CC Subject";
      }

      // Update carry-over
      lastKnownSubjName = subjName;
      lastKnownSubjCode = subjCode;


      // If code is same as name or looks like the name, try to shorten it
      if (subjCode === subjName && subjCode.length > 15) {
        subjCode = subjCode.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 8);
      }
      
      const isCC = subjName === "CC Subject" || subjCode === "CC Subject" || subjName.includes("NATIONAL SERVICE SCHEME") || isCCCategory;

      // Extract max marks from current header "Internal (20)" or "External (30)"
      // These are component maxima, NOT the subject total
      const maxMatch = v.match(/\((\d+)\)/);
      // Component max (used to sum up to total). For overall/max column, use 50 default.
      const maxVal = maxMatch ? parseInt(maxMatch[1]) : 50;

      // Check if we can pair this with an existing group
      // For CC subjects, we want to be more aggressive about merging groups even if names slightly differ
      let lastGroup = subjectGroups[subjectGroups.length - 1];
      if (isCC) {
        const existingCC = subjectGroups.find(g => g.isCC);
        if (existingCC) lastGroup = existingCC;
      }

      if (lastGroup && (lastGroup.name === subjName || (isCC && lastGroup.isCC))) {
        // For CC subjects, don't overwrite if already set, as we want to keep the one with marks
        if (isInt && (isCC ? !lastGroup.intCol : true)) { lastGroup.intCol = i; lastGroup.maxInt = maxVal; }
        else if (isPrac && (isCC ? !lastGroup.pracCol : true)) { lastGroup.pracCol = i; lastGroup.maxPrac = maxVal; }
        else if (isTheo && (isCC ? !lastGroup.theoCol : true)) { lastGroup.theoCol = i; lastGroup.maxTheo = maxVal; }
        else if (isOver && (isCC ? !lastGroup.overCol : true)) { lastGroup.overCol = i; }
        else if (isMax && (isCC ? !lastGroup.maxCol : true)) { lastGroup.maxCol = i; }
        else if (isGrade && (isCC ? !lastGroup.gradeCol : true)) { lastGroup.gradeCol = i; }
        else if (isGP && (isCC ? !lastGroup.gpCol : true)) { lastGroup.gpCol = i; }
        else if (isCr && (isCC ? !lastGroup.crCol : true)) { lastGroup.crCol = i; }
        else if (isEarn && (isCC ? !lastGroup.earnCol : true)) { lastGroup.earnCol = i; }

        // Recompute total from component maxima; only fall back to 50 if all components are zero
        const compSum = (lastGroup.maxInt || 0) + (lastGroup.maxPrac || 0) + (lastGroup.maxTheo || 0);
        lastGroup.maxTotal = compSum > 0 ? compSum : lastGroup.maxTotal;
      } else {
        const newMaxInt  = isInt  ? maxVal : 0;
        const newMaxPrac = isPrac ? maxVal : 0;
        const newMaxTheo = isTheo ? maxVal : 0;
        const compSum = newMaxInt + newMaxPrac + newMaxTheo;
        subjectGroups.push({
          name: subjName,
          code: subjCode,
          intCol: isInt ? i : undefined,
          pracCol: isPrac ? i : undefined,
          theoCol: isTheo ? i : undefined,
          overCol: isOver ? i : undefined,
          maxCol: isMax ? i : undefined,
          gradeCol: isGrade ? i : undefined,
          gpCol: isGP ? i : undefined,
          crCol: isCr ? i : undefined,
          earnCol: isEarn ? i : undefined,
          maxInt: newMaxInt,
          maxPrac: newMaxPrac,
          maxTheo: newMaxTheo,
          // Use component sum if available; for non-component columns (over/max/grade/gp)
          // default to 50 since we don't know the total yet — it will be overridden by maxCol data
          maxTotal: compSum > 0 ? compSum : (isOver || isMax || isGrade || isGP || isCr || isEarn ? 50 : maxVal),
          isCC
        });
      }
    }
  }

  console.log(`[Subject Detection] Found ${subjectGroups.length} subjects:`, subjectGroups.map(s => s.name));

  // ── Phase 3: parse data rows ───────────────────────────────────────────────
  const students: ParsedStudentMark[] = [];
  const startRow = headerRowNum + 1;

  for (let r = startRow; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const rollRaw = row.getCell(baseColIdx.roll || 1).value;
    const nameRaw = row.getCell(baseColIdx.name || 2).value;
    
    if (!rollRaw && !nameRaw) continue;

    const roll = cellStr(rollRaw as ExcelJS.CellValue);
    const name = cellStr(nameRaw as ExcelJS.CellValue);
    if (!roll || !name) continue;

    // Skip template/header rows that got imported as data
    const rollLower = roll.toLowerCase();
    const nameLower = name.toLowerCase();
    if (
      nameLower.includes("full name of the students") ||
      (nameLower.includes("surname") && nameLower.includes("mothers name")) ||
      nameLower.includes("name of the students") ||
      rollLower.includes("roll number") ||
      rollLower.includes("enrollment") ||
      rollLower.includes("external") ||
      rollLower === "sr no" ||
      rollLower === "sr." ||
      rollLower === "no."
    ) continue;

    const ern = (baseColIdx.ern || baseColIdx.enrollment_no) ? cellStr(row.getCell(baseColIdx.ern || baseColIdx.enrollment_no || 0).value as ExcelJS.CellValue) || undefined : undefined;
    const enrollment_no = baseColIdx.enrollment_no ? cellStr(row.getCell(baseColIdx.enrollment_no).value as ExcelJS.CellValue) || undefined : undefined;
    const abc_id = (baseColIdx.abc_id || baseColIdx.abc) ? cellStr(row.getCell(baseColIdx.abc_id || baseColIdx.abc || 0).value as ExcelJS.CellValue) || undefined : undefined;
    const university_exam_seat_no = baseColIdx.university_exam_seat_no ? cellStr(row.getCell(baseColIdx.university_exam_seat_no).value as ExcelJS.CellValue) || undefined : undefined;
    const gender = baseColIdx.gender ? cellStr(row.getCell(baseColIdx.gender).value as ExcelJS.CellValue) || undefined : undefined;
    const div = baseColIdx.div ? cellStr(row.getCell(baseColIdx.div).value as ExcelJS.CellValue) || undefined : undefined;

    const subjects: SubjectMark[] = [];
    let totObtained = 0;
    let totMax = 0;
    let hasFail = false;

    subjectGroups.forEach((sg) => {
      let obtained = 0;
      let int_marks: number | undefined;
      let theo_marks: number | undefined;
      let prac_marks: number | undefined;
      let grade: string | undefined;
      let gp: number | undefined;
      let credits: number | undefined;
      let earned: number | undefined;

      /** Returns numeric value, or undefined if cell is blank/dash/pure-absent.
       *  For "@ABS" entries like "3 @ABS", extracts and returns the numeric part (3),
       *  so the actual marks are preserved and displayed in the gadget sheet.
       *  Grade is set to "ABS" separately via hasABSFlag below.
       */
      const getVal = (col?: number): number | undefined => {
        if (!col) return undefined;
        const raw = cellStr(row.getCell(col).value as ExcelJS.CellValue);
        const trimmed = raw.trim();
        // Treat blank/dash/pure absence keywords as missing
        if (!trimmed || trimmed === "-" || trimmed === "--" || trimmed === "–"
            || trimmed.toUpperCase() === "AB" || trimmed.toUpperCase() === "ABSENT"
            || trimmed.toUpperCase() === "A") return undefined;
        // "@ABS" suffix: extract the numeric prefix so marks are still stored
        // e.g. "3 @ABS" → 3,  "@ABS" alone → undefined (no numeric part)
        if (/@ABS/i.test(trimmed)) {
          const numPart = parseFloat(trimmed);
          return isNaN(numPart) ? undefined : numPart;
        }
        const n = parseFloat(trimmed);
        return isNaN(n) ? undefined : n;
      };

      /** True if cell contains @ABS flag — marks student absent regardless of marks value */
      const hasABSFlag = (col?: number): boolean => {
        if (!col) return false;
        return /@ABS/i.test(cellStr(row.getCell(col).value as ExcelJS.CellValue).trim());
      };

      /** True if the cell is a pure absent marker (blank / dash / AB) — no marks at all */
      const isAbsent = (col?: number): boolean => {
        if (!col) return false;
        const raw = cellStr(row.getCell(col).value as ExcelJS.CellValue).trim();
        return (
          raw === "-" || raw === "--" || raw === "–" || raw === "" ||
          raw.toUpperCase() === "AB" || raw.toUpperCase() === "ABSENT" ||
          raw.toUpperCase() === "A"
        );
      };

      if (sg.intCol) { int_marks = getVal(sg.intCol); obtained += (int_marks || 0); }
      if (sg.pracCol) { prac_marks = getVal(sg.pracCol); obtained += (prac_marks || 0); }
      if (sg.theoCol) { theo_marks = getVal(sg.theoCol); obtained += (theo_marks || 0); }

      // If there's an explicit "Over" (Total) column, use it instead of sum
      if (sg.overCol) {
        const overVal = getVal(sg.overCol);
        if (overVal !== undefined) obtained = overVal;
      }

      if (sg.gradeCol) grade = cellStr(row.getCell(sg.gradeCol).value as ExcelJS.CellValue).trim();
      if (sg.gpCol) gp = getVal(sg.gpCol);
      if (sg.crCol) credits = getVal(sg.crCol);
      if (sg.earnCol) earned = getVal(sg.earnCol);

      let finalMax = sg.maxTotal;
      if (sg.maxCol) {
        const m = getVal(sg.maxCol);
        if (m) finalMax = m;
      }

      let finalName = sg.name;
      let finalCode = sg.code;

      // Rule 3: CC Subject Name Detection — read the student's specific CC cell value
      // The header says "CC Subject" but each student row has their actual activity
      // (e.g. "NATIONAL SERVICE SCHEME" or "INTRODUCTION TO CULTURAL ACTIVITIES")
      if (sg.isCC) {
        // First priority: read value directly from the CC column (baseColIdx.cc_subject)
        if (baseColIdx.cc_subject) {
          const ccCellVal = cellStr(row.getCell(baseColIdx.cc_subject).value as ExcelJS.CellValue).trim();
          if (ccCellVal && ccCellVal.toUpperCase() !== "CC SUBJECT" && ccCellVal.length > 2) {
            finalName = ccCellVal.toUpperCase();
          }
        }
        // Fallback: scan the row for cells that look like CC activity names
        if (finalName === "CC Subject" || finalName === sg.name) {
          const ccKeywords = ["NATIONAL SERVICE SCHEME", "INTRODUCTION TO CULTURAL", "SPORTS", "NSS", "DLLE", "CULTURAL", "NCC", "YOGA", "EXTENSION"];
          for (let col = 1; col <= maxCols; col++) {
            const val = cellStr(row.getCell(col).value as ExcelJS.CellValue).trim();
            const valUpper = val.toUpperCase();
            if (ccKeywords.some(k => valUpper.includes(k))) {
              // Accept both short codes and full names
              if (val.length >= 3) { finalName = valUpper; break; }
            }
          }
        }
        // Always keep code as "CC Subject" for consistent identification
        finalCode = "CC Subject";
      }

      // ── Absent detection ──────────────────────────────────────────────────
      // Mark ABS if:
      //   - any marks column has a @ABS flag (e.g. "3 @ABS") → student marked absent by admin
      //   - external/prac column has a pure dash/AB/blank marker
      //   - external column exists and value is exactly 0 (user entered 0 → student is absent)
      const theoABSFlag = sg.theoCol ? hasABSFlag(sg.theoCol) : false;
      const pracABSFlag = sg.pracCol ? hasABSFlag(sg.pracCol) : false;
      const intABSFlag = sg.intCol ? hasABSFlag(sg.intCol) : false;
      const theoAbsent = sg.theoCol ? isAbsent(sg.theoCol) : false;
      const pracAbsent = sg.pracCol ? isAbsent(sg.pracCol) : false;
      const theoZero = sg.theoCol ? (theo_marks === 0) : false;
      const pracZero = sg.pracCol && !sg.theoCol ? (prac_marks === 0) : false;
      const isStudentAbsent = theoABSFlag || pracABSFlag || intABSFlag || theoAbsent || pracAbsent || theoZero || pracZero;

      if (isStudentAbsent) grade = "ABS";
      // If the Excel sheet itself already says ABS / AB in the grade column keep it
      if (grade && (grade.toUpperCase() === "ABS" || grade.toUpperCase() === "AB")) {
        grade = "ABS";
      }

      const passMarks = Math.ceil(finalMax * 0.4);
      // ABS always = fail
      let isPass: boolean;
      if (grade === "ABS") {
        isPass = false;
      } else if (grade) {
        // Use grade string — F means fail, anything else passes
        // (C grade at 40% is passing per Mumbai University)
        isPass = grade !== "F" && grade !== "AB";
      } else {
        // No grade from sheet — evaluate from obtained marks
        // Also apply per-head 40% rule if we have both int and theo marks
        if (int_marks !== undefined && theo_marks !== undefined && sg.maxInt > 0 && sg.maxTheo > 0) {
          const passesInt = int_marks >= Math.ceil(sg.maxInt * 0.4);
          const passesExt = theo_marks >= Math.ceil(sg.maxTheo * 0.4);
          isPass = passesInt && passesExt;
        } else {
          isPass = obtained >= passMarks;
        }
      }
      if (!isPass && !sg.isCC) hasFail = true;

      const pct = finalMax > 0 ? (obtained / finalMax) * 100 : 0;
      // For ABS don't compute a numeric grade — keep "ABS"
      const finalGrade = grade === "ABS" ? "ABS" : (grade || getGrade(pct));

      subjects.push({
        subject_name: finalName,
        subject_code: finalCode,
        max_marks: finalMax,
        obtained_marks: obtained,
        is_pass: isPass,
        grade: finalGrade,
        // ABS has GP = 0, no earned credits
        gp: finalGrade === "ABS" ? 0 : (gp ?? getGP(finalGrade)),
        int_marks,
        theo_marks,
        prac_marks,
        credits: credits ?? 2,
        earned_credits: finalGrade === "ABS" ? 0 : (earned ?? (isPass ? (credits ?? 2) : 0)),
        is_cc: sg.isCC ?? false,
      });

      totObtained += obtained;
      totMax += finalMax;
    });

    if (subjects.length === 0) continue;

    const safeNum = (v: any) => {
      if (v === null || v === undefined || v === "") return 0;
      if (v === "AB" || v === "Absent") return 0;
      const n = Number(v);
      return isNaN(n) ? 0 : n;
    };

    const pct = totMax > 0 ? (totObtained / totMax) * 100 : 0;
    const totalCredits = subjects.reduce((acc, s) => acc + (s.credits || 0), 0);
    const derivedECG = subjects.reduce((acc, s) => acc + ((s.gp || 0) * (s.credits || 0)), 0);
    const ec = baseColIdx.ec ? safeNum(row.getCell(baseColIdx.ec).value) : subjects.reduce((acc, s) => acc + (s.earned_credits || 0), 0);
    const ecg = baseColIdx.ecg ? safeNum(row.getCell(baseColIdx.ecg).value) : derivedECG;
    const sheetSGPI = baseColIdx.sgpi ? safeNum(row.getCell(baseColIdx.sgpi).value) : null;
    const computedSGPI = totalCredits > 0 ? (derivedECG / totalCredits) : 0;
    const normalizedSGPI = sheetSGPI !== null && sheetSGPI >= 0 && sheetSGPI <= 10 ? sheetSGPI : computedSGPI;

    // O.229: Add 0.1 GPA bonus to SGPI if student has a CC subject (NSS/DLLE/NCC/Cultural)
    // and has successfully completed it (is_pass = true or marks are present)
    const hasCCSubject = subjects.some(s => s.is_cc || s.subject_code === "CC Subject");
    const ccPassed = hasCCSubject && subjects.some(s => (s.is_cc || s.subject_code === "CC Subject") && (s.obtained_marks > 0 || s.is_pass));
    const o229Bonus = ccPassed ? 0.1 : 0;

    const sgpi = Math.round(Math.max(0, Math.min(10, normalizedSGPI + o229Bonus)) * 100) / 100;

    students.push({
      roll_number: roll,
      student_name: name,
      department,
      year,
      division: div,
      ern: ern || enrollment_no,
      enrollment_no: enrollment_no || ern,
      abc_id,
      university_exam_seat_no,
      gender,
      subjects,
      total_marks: totMax,
      obtained_marks: totObtained,
      percentage: Math.round(pct * 100) / 100,
      result: hasFail ? "FAIL" : "P A S S",
      // Only store SGPI/CGPA when student has passed all subjects (no ABS, no fail)
      cgpa: hasFail ? 0 : (sgpi || calcCGPA(pct)),
      ec,
      ecg,
      sgpi: hasFail ? undefined : sgpi,
    });
  }

  if (students.length === 0) {
    return NextResponse.json({ 
      error: "No valid marks records found", 
      details: "Check if header row (Roll/Name) exists and data starts correctly after it." 
    }, { status: 400 });
  }

  // De-duplicate students by roll_number
  const uniqueStudents: ParsedStudentMark[] = [];
  const seenRolls = new Set<string>();
  
  for (let i = students.length - 1; i >= 0; i--) {
    const s = students[i];
    if (!seenRolls.has(s.roll_number)) {
      seenRolls.add(s.roll_number);
      uniqueStudents.unshift(s);
    }
  }

  // Save to DB — detect existing upload for same dept+year+semester and UPDATE it instead
  // of creating a duplicate. This prevents stale records when re-uploading the same batch.
  const { data: existingUpload } = await supabaseAdmin
    .from("marks_uploads")
    .select("id")
    .eq("college_id", college.id)
    .eq("department", department)
    .eq("year", year)
    .eq("semester", semester || "")
    .neq("status", "deleted")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let uploadRec: { id: string } | null = null;
  let upErr: any = null;

  if (existingUpload?.id) {
    // Update existing record — overwrite metadata & reset status
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("marks_uploads")
      .update({
        exam_name,
        file_name: file.name,
        status: "processing",
        hod_name,
        title_suffix,
        pdf_url: null, // invalidate cached PDF so it regenerates
      })
      .eq("id", existingUpload.id)
      .select("id")
      .single();
    uploadRec = updated;
    upErr = updErr;

    // Delete old student_marks for this upload so fresh data replaces them cleanly.
    // Grace marks reference student_marks.id (mark_id), so fetch those IDs first
    // before deleting student_marks, then purge orphaned grace entries.
    if (uploadRec) {
      const { data: oldMarkIds } = await supabaseAdmin
        .from("student_marks").select("id").eq("upload_id", uploadRec.id).eq("college_id", college.id);
      if (oldMarkIds && oldMarkIds.length > 0) {
        await supabaseAdmin.from("grace_marks").delete().in("mark_id", oldMarkIds.map((r: any) => r.id));
      }
      await supabaseAdmin.from("student_marks").delete().eq("upload_id", uploadRec.id).eq("college_id", college.id);
    }
  } else {
    // Create new upload record
    const { data: inserted_rec, error: insertErr } = await supabaseAdmin
      .from("marks_uploads")
      .insert({
        college_id: college.id,
        exam_name,
        department,
        year,
        file_name: file.name,
        status: "processing",
        semester,
        hod_name,
        title_suffix,
      })
      .select()
      .single();
    uploadRec = inserted_rec;
    upErr = insertErr;
  }

  if (upErr || !uploadRec) {
    return NextResponse.json({ error: "Failed to create upload record" }, { status: 500 });
  }

  // Build all DB rows first (no I/O)
  const allRows = uniqueStudents.map((s) => ({
    college_id: college.id,
    upload_id: uploadRec.id,
    roll_number: s.roll_number,
    student_name: s.student_name,
    department: s.department,
    year: s.year,
    division: s.division || null,
    ern: s.ern || null,
    enrollment_no: s.enrollment_no || null,
    abc_id: s.abc_id || null,
    university_exam_seat_no: s.university_exam_seat_no || null,
    gender: s.gender || null,
    subjects: s.subjects,
    total_marks: s.total_marks,
    obtained_marks: s.obtained_marks,
    percentage: s.percentage,
    result: s.result,
    cgpa: s.cgpa,
    ec: s.ec || null,
    ecg: s.ecg || null,
    sgpi: s.sgpi || null,
    exam_name,
  }));

  // Split into larger batches and execute up to 3 batches in parallel for speed
  const BATCH = 100;
  const PARALLEL = 3;
  let inserted = 0;

  for (let i = 0; i < allRows.length; i += BATCH * PARALLEL) {
    const parallelBatches: Promise<{ error: any }>[] = [];
    for (let j = 0; j < PARALLEL; j++) {
      const slice = allRows.slice(i + j * BATCH, i + (j + 1) * BATCH);
      if (slice.length === 0) break;
      parallelBatches.push(
        supabaseAdmin.from("student_marks").upsert(slice, { onConflict: "college_id,upload_id,roll_number" })
      );
    }
    const results = await Promise.all(parallelBatches);
    for (const { error: dbErr } of results) {
      if (dbErr) {
        await supabaseAdmin.from("marks_uploads").update({ status: "failed" }).eq("id", uploadRec.id);
        return NextResponse.json({ error: `DB save error: ${dbErr.message}` }, { status: 500 });
      }
    }
    inserted += parallelBatches.length * BATCH;
  }
  inserted = Math.min(inserted, allRows.length);

  await supabaseAdmin
    .from("marks_uploads")
    .update({ status: "completed", total_students: allRows.length })
    .eq("id", uploadRec.id);

  return NextResponse.json({
    success: true,
    upload_id: uploadRec.id,
    inserted,
    message: `${inserted} student marks saved`,
  });
}

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
  if (pct >= 35) return "C";
  if (pct >= 30) return "D";
  return "F";
}

function getGP(grade: string): number {
  const gmap: Record<string, number> = { "O": 10, "A+": 9, "A": 8, "B+": 7, "B": 6, "C": 5, "D": 4, "F": 0 };
  return gmap[grade] || 0;
}

function calcCGPA(pct: number): number {
  if (pct >= 85) return 10.0;
  if (pct >= 75) return 9.0;
  if (pct >= 65) return 8.0;
  if (pct >= 55) return 7.0;
  if (pct >= 45) return 6.0;
  if (pct >= 35) return 5.0;
  return 0.0;
}

function normalizeHeader(v: string): string {
  return String(v || "").toLowerCase().trim().replace(/\s+/g, " ");
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
      vals[colNumber] = normalizeHeader(String(cell.value ?? ""));
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
    const vH = normalizeHeader(String(rowH.getCell(i).value ?? ""));
    const vA1 = normalizeHeader(String(rowA1.getCell(i).value ?? ""));
    const vA2 = normalizeHeader(String(rowA2.getCell(i).value ?? ""));
    const vP = normalizeHeader(String(rowPrev.getCell(i).value ?? ""));
    
    // Check all candidates for base columns
    const combined = (vH + " " + vA1 + " " + vA2 + " " + vP);
    if (combined === "roll" || combined === "roll no" || combined === "roll number") baseColIdx.roll = i;
    else if (combined.includes("exam seat") || combined.includes("university seat") || combined.includes("university exam seat")) baseColIdx.university_exam_seat_no = i;
    else if (combined.includes("ern") || combined.includes("enroll") || combined.includes("p.r.n") || combined.includes("prn")) baseColIdx.enrollment_no = i;
    else if (combined.includes("name")) baseColIdx.name = i;
    else if (combined.includes("div")) baseColIdx.div = i;
    else if (combined.includes("abc")) baseColIdx.abc = i;
    else if (combined.includes("gender")) baseColIdx.gender = i;
    else if (vH === "total" || vH === "total marks" || vH === "grand total" || vA1 === "total" || vA2 === "total") baseColIdx.total = i;
    else if (vH.includes("percent") || vH === "%" || vA1.includes("percent") || vA2.includes("percent")) baseColIdx.pct = i;
    else if (vH.includes("result") || vH === "status" || vH === "remark" || vA1.includes("result") || vA2.includes("result")) baseColIdx.result = i;
    else if (vH.includes("cgpa") || vH.includes("sgpa") || vH.includes("sgpi") || vA1.includes("cgpa") || vA2.includes("cgpa")) baseColIdx.sgpi = i;
    else if (vH === "ec" || vH === "credit" || vA1 === "ec" || vA1 === "credit" || vA2 === "credit") baseColIdx.ec = i;
    else if (vH === "ecg" || vH === "credit points" || vA1 === "ecg" || vA2 === "ecg") baseColIdx.ecg = i;
    else if (combined.includes("cc subject") || combined.includes("extra curricular")) baseColIdx.cc_subject = i;
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
    const vH = normalizeHeader(String(rowH.getCell(i).value ?? ""));
    const vA1 = normalizeHeader(String(rowA1.getCell(i).value ?? ""));
    const vA2 = normalizeHeader(String(rowA2.getCell(i).value ?? ""));
    
    // Check which row has the component headers
    const v = [vH, vA1, vA2].find(val => 
      val.includes("int") || val === "ia" || val === "in" ||
      val.includes("prac") || val === "pr" ||
      val.includes("theo") || val === "th" || val === "ext" || val.includes("external") ||
      val === "over" || val === "total" || val === "tot" || val === "marks" ||
      val === "max" || val === "max marks" || val === "out of" ||
      val === "gr" || val === "grade" ||
      val === "gp" || val === "grade point" ||
      val === "cr" || val === "credit" ||
      val === "earn" || val === "earned"
    ) || "";

    // Detect component types
    const isInt = v.includes("int") || v === "ia" || v === "in";
    const isPrac = v.includes("prac") || v === "pr";
    const isTheo = v.includes("theo") || v === "th" || v === "ext" || v.includes("external");
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
        subjNameRaw = String(rowH.getCell(checkIdx).value || "").trim();
        // Subject code is usually in Row 2 (rowA1)
        subjCodeRaw = String(rowA1.getCell(checkIdx).value || "").trim();
        
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

      // Extract max marks from current header "Internal (20)"
      const maxMatch = v.match(/\((\d+)\)/);
      const maxVal = maxMatch ? parseInt(maxMatch[1]) : (isInt ? 20 : (isTheo ? 30 : 50));

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
        
        lastGroup.maxTotal = (lastGroup.maxInt || 0) + (lastGroup.maxPrac || 0) + (lastGroup.maxTheo || 0);
      } else {
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
          maxInt: isInt ? maxVal : 0,
          maxPrac: isPrac ? maxVal : 0,
          maxTheo: isTheo ? maxVal : 0,
          maxTotal: maxVal,
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

    const roll = String(rollRaw ?? "").trim();
    const name = String(nameRaw ?? "").trim();
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

    const ern = baseColIdx.ern ? String(row.getCell(baseColIdx.ern).value ?? "").trim() : undefined;
    const enrollment_no = baseColIdx.enrollment_no ? String(row.getCell(baseColIdx.enrollment_no).value ?? "").trim() : undefined;
    const abc_id = baseColIdx.abc_id ? String(row.getCell(baseColIdx.abc_id).value ?? "").trim() : undefined;
    const university_exam_seat_no = baseColIdx.university_exam_seat_no ? String(row.getCell(baseColIdx.university_exam_seat_no).value ?? "").trim() : undefined;
    const gender = baseColIdx.gender ? String(row.getCell(baseColIdx.gender).value ?? "").trim() : undefined;
    const div = baseColIdx.div ? String(row.getCell(baseColIdx.div).value ?? "").trim() : undefined;

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

      const getVal = (col?: number) => {
        if (!col) return undefined;
        const val = row.getCell(col).value;
        if (val === "AB" || val === "Absent") return 0;
        const n = parseFloat(String(val));
        return isNaN(n) ? undefined : n;
      };

      if (sg.intCol) { int_marks = getVal(sg.intCol); obtained += (int_marks || 0); }
      if (sg.pracCol) { prac_marks = getVal(sg.pracCol); obtained += (prac_marks || 0); }
      if (sg.theoCol) { theo_marks = getVal(sg.theoCol); obtained += (theo_marks || 0); }
      
      // If there's an explicit "Over" (Total) column, use it instead of sum
      if (sg.overCol) {
        const overVal = getVal(sg.overCol);
        if (overVal !== undefined) obtained = overVal;
      }

      if (sg.gradeCol) grade = String(row.getCell(sg.gradeCol).value || "").trim();
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

      // Rule 3: CC Subject Name Detection (Search current row for CC keywords)
      if (sg.isCC) {
        const ccKeywords = ["SPORTS", "NSS", "DLLE", "CULTURAL", "NCC", "YOGA", "EXTENSION"];
        for (let col = 1; col <= maxCols; col++) {
          const val = String(row.getCell(col).value || "").trim().toUpperCase();
          if (ccKeywords.some(k => val.includes(k))) {
            // Found a CC specific name, use it if it's short (likely the code/type)
            if (val.length < 20) {
              finalName = val;
              break;
            }
          }
        }
      }

      const passMarks = Math.ceil(finalMax * 0.4); 
      const isPass = grade ? (grade !== "F" && grade !== "D" && grade !== "AB") : (obtained >= passMarks);
      if (!isPass && !sg.isCC) hasFail = true; 

      const pct = finalMax > 0 ? (obtained / finalMax) * 100 : 0;
      const finalGrade = grade || getGrade(pct);

      subjects.push({
        subject_name: finalName,
        subject_code: finalCode,
        max_marks: finalMax,
        obtained_marks: obtained,
        is_pass: isPass,
        grade: finalGrade,
        gp: gp ?? getGP(finalGrade),
        int_marks,
        theo_marks,
        prac_marks,
        credits: credits ?? 2,
        earned_credits: earned ?? (isPass ? (credits ?? 2) : 0)
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
    const ec = baseColIdx.ec ? safeNum(row.getCell(baseColIdx.ec).value) : subjects.reduce((acc, s) => acc + (s.earned_credits || 0), 0);
    const ecg = baseColIdx.ecg ? safeNum(row.getCell(baseColIdx.ecg).value) : subjects.reduce((acc, s) => acc + (s.gp * (s.credits || 0)), 0);
    const sgpi = baseColIdx.sgpi ? safeNum(row.getCell(baseColIdx.sgpi).value) : (ec > 0 ? Math.round((ecg / ec) * 100) / 100 : 0);

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
      cgpa: sgpi || calcCGPA(pct),
      ec,
      ecg,
      sgpi,
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

  // Save to DB
  const { data: uploadRec, error: upErr } = await supabaseAdmin
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

  if (upErr || !uploadRec) {
    return NextResponse.json({ error: "Failed to create upload record" }, { status: 500 });
  }

  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < uniqueStudents.length; i += BATCH) {
    const batch = uniqueStudents.slice(i, i + BATCH).map((s) => ({
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

    const { error: dbErr } = await supabaseAdmin
      .from("student_marks")
      .upsert(batch, { onConflict: "college_id,upload_id,roll_number" });

    if (dbErr) {
      await supabaseAdmin.from("marks_uploads").update({ status: "failed" }).eq("id", uploadRec.id);
      return NextResponse.json({ error: `DB save error: ${dbErr.message}` }, { status: 500 });
    }
    inserted += batch.length;
  }

  await supabaseAdmin
    .from("marks_uploads")
    .update({ status: "completed", total_students: inserted })
    .eq("id", uploadRec.id);

  return NextResponse.json({
    success: true,
    upload_id: uploadRec.id,
    inserted,
    message: `${inserted} student marks saved`,
  });
}

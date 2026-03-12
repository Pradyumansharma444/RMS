import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import ExcelJS from "exceljs";

interface StudentRow {
  roll_number: string;
  enrollment_no?: string;
  abc_id?: string;
  university_exam_seat_no?: string;
  gender?: string;
  name: string;
  department: string;
  year: string;
  division?: string;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const uid = formData.get("uid") as string;

  if (!file || !uid) {
    return NextResponse.json({ error: "file and uid required" }, { status: 400 });
  }

  // Validate file type
  const allowedTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ];
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/i)) {
    return NextResponse.json({ error: "Only Excel files (.xlsx, .xls) are allowed" }, { status: 400 });
  }

  // Get college_id
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
  if (!worksheet) {
    return NextResponse.json({ error: "No worksheet found in Excel file" }, { status: 400 });
  }

  // Find header row
  let headerRow: number | null = null;
  const headers: Record<string, number> = {};
  
  worksheet.eachRow((row, rowNum) => {
    if (headerRow !== null) return;
    const values = row.values as (string | null | undefined)[];
    const rowStr = values.map(v => String(v || "").toLowerCase().trim());
    if (
      (rowStr.some(v => v.includes("roll")) || rowStr.some(v => v.includes("enrollment"))) &&
      rowStr.some(v => v.includes("name"))
    ) {
      headerRow = rowNum;
      rowStr.forEach((v, i) => {
        if (v === "roll" || v === "roll number" || v === "roll no") headers.roll_number = i;
        else if (v.includes("enrollment")) headers.enrollment_no = i;
        else if (v.includes("abc")) headers.abc_id = i;
        else if (v.includes("exam seat") || v.includes("university seat") || v.includes("university exam seat")) headers.university_exam_seat_no = i;
        else if (v.includes("gender")) headers.gender = i;
        else if (v.includes("name") && !v.includes("college")) headers.name = i;
        else if (v.includes("dept") || v.includes("department") || v.includes("branch")) headers.department = i;
        else if (v.includes("year") || v.includes("class")) headers.year = i;
        else if (v.includes("div") || v.includes("division")) headers.division = i;
      });

      // Fallback for roll/enrollment if not explicitly found by strict check
      if (headers.roll_number === undefined) {
        rowStr.forEach((v, i) => {
          if (v.includes("roll")) headers.roll_number = i;
        });
      }
      if (headers.enrollment_no === undefined) {
        rowStr.forEach((v, i) => {
          if (v.includes("enrollment")) headers.enrollment_no = i;
        });
      }
    }
  });

  if (headerRow === null) {
    return NextResponse.json({
      error: "Could not find header row. Ensure columns: Roll Number, Name, Department, Year"
    }, { status: 400 });
  }

  const students: StudentRow[] = [];
  const errors: string[] = [];

  worksheet.eachRow((row, rowNum) => {
    if (rowNum <= headerRow!) return;
    const values = row.values as (string | number | null | undefined)[];

    const rollRaw = headers.roll_number !== undefined ? values[headers.roll_number] : undefined;
    const enrollRaw = headers.enrollment_no !== undefined ? values[headers.enrollment_no] : undefined;
    const abcRaw = headers.abc_id !== undefined ? values[headers.abc_id] : undefined;
    const seatRaw = headers.university_exam_seat_no !== undefined ? values[headers.university_exam_seat_no] : undefined;
    const genderRaw = headers.gender !== undefined ? values[headers.gender] : undefined;
    const nameRaw = values[headers.name];
    const deptRaw = values[headers.department];
    const yearRaw = values[headers.year];
    const divRaw = headers.division !== undefined ? values[headers.division] : undefined;

    const roll = String(rollRaw || "").trim();
    const enrollment_no = enrollRaw ? String(enrollRaw).trim() : undefined;
    const abc_id = abcRaw ? String(abcRaw).trim() : undefined;
    const university_exam_seat_no = seatRaw ? String(seatRaw).trim() : undefined;
    const gender = genderRaw ? String(genderRaw).trim() : undefined;
    const name = String(nameRaw || "").trim();
    const dept = String(deptRaw || "").trim();
    const year = String(yearRaw || "").trim();
    const division = divRaw ? String(divRaw).trim() : undefined;

    if (!roll && !name) return; // skip empty rows

    if (!roll) { errors.push(`Row ${rowNum}: Missing roll number`); return; }
    if (!name) { errors.push(`Row ${rowNum}: Missing student name`); return; }
    if (!dept) { errors.push(`Row ${rowNum}: Missing department`); return; }
    if (!year) { errors.push(`Row ${rowNum}: Missing year`); return; }

    students.push({ 
      roll_number: roll, 
      enrollment_no,
      abc_id,
      university_exam_seat_no,
      gender,
      name, 
      department: dept, 
      year, 
      division 
    });
  });

  if (students.length === 0) {
    return NextResponse.json({ error: "No valid student records found", parse_errors: errors }, { status: 400 });
  }

  // Upsert students in batches
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < students.length; i += batchSize) {
    const batch = students.slice(i, i + batchSize).map(s => ({
      college_id: college.id,
      roll_number: s.roll_number,
      enrollment_no: s.enrollment_no || null,
      abc_id: s.abc_id || null,
      university_exam_seat_no: s.university_exam_seat_no || null,
      gender: s.gender || null,
      name: s.name,
      department: s.department,
      year: s.year,
      division: s.division || null,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabaseAdmin
      .from("students")
      .upsert(batch, { onConflict: "college_id,roll_number" });
    if (error) {
      return NextResponse.json({ error: `DB error: ${error.message}` }, { status: 500 });
    }
    inserted += batch.length;
  }

  return NextResponse.json({
    success: true,
    inserted,
    parse_errors: errors,
    message: `${inserted} students uploaded${errors.length ? `, ${errors.length} rows skipped` : ""}`,
  });
}

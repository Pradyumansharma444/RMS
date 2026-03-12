import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import ExcelJS from "exceljs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid");
  const department = searchParams.get("department");
  const year = searchParams.get("year");

  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const { data: college } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();
  if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

  let query = supabaseAdmin
    .from("student_marks")
    .select("id, roll_number, student_name, department, year, subjects, result")
    .eq("college_id", college.id)
    .or("result.ilike.%ATKT%,result.ilike.%FAIL%,result.ilike.%F A I L%")
    .order("student_name", { ascending: true });

  if (department && department !== "all") query = query.eq("department", department);
  if (year && year !== "all") query = query.eq("year", year);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Build rows: one row per failed subject, merge student info for multiple ATKTs
  type ExportRow = {
    mark_id: string;
    roll_number: string;
    student_name: string;
    department: string;
    semester: string;
    subject_name: string;
    subject_code: string;
    int_marks: number | string;
    ext_marks: number | string;
    obtained: number;
    max_marks: number;
    is_pass: boolean;
  };

  const rows: ExportRow[] = [];

  for (const s of data || []) {
    const subs = (s.subjects as any[]) || [];
    const failedSubs = subs.filter((sub) => sub.is_pass === false || sub.grade === "F" || sub.grade === "D");
    for (const sub of failedSubs) {
      const extMarks = (sub.theo_marks ?? 0) + (sub.prac_marks ?? 0);
      rows.push({
        mark_id: s.id,
        roll_number: s.roll_number,
        student_name: s.student_name,
        department: s.department,
        semester: s.year,
        subject_name: sub.subject_name,
        subject_code: sub.subject_code || "",
        int_marks: sub.int_marks ?? "–",
        ext_marks: extMarks || "–",
        obtained: sub.obtained_marks ?? 0,
        max_marks: sub.max_marks ?? 50,
        is_pass: sub.is_pass,
      });
    }
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("ATKT Students");

  const BOLD_FONT = { bold: true, size: 11, name: "Times New Roman" };
  const CENTER = { horizontal: "center" as const, vertical: "middle" as const, wrapText: true };
  const THIN = { style: "thin" as const };
  const BORDER = { left: THIN, right: THIN, top: THIN, bottom: THIN };

  // Header row
  const headers = [
    "Mark ID", "Roll Number", "Student Name", "Department", "Semester",
    "Subject Name", "Subject Code", "Internal Marks", "External Marks",
    "Total Obtained", "Max Marks"
  ];
  const colWidths = [28, 16, 28, 18, 18, 40, 16, 16, 16, 14, 12];
  headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = colWidths[i];
  });
  ws.getRow(1).height = 30;

  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { ...BOLD_FONT, color: { argb: "FFFFFFFF" } };
    cell.alignment = CENTER;
    cell.border = BORDER;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1a1a2e" } };
  });

  // Group rows by student for merging
  // Find runs of same mark_id
  let dataRowStart = 2;
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    // Find how many consecutive rows have the same mark_id
    let j = i;
    while (j < rows.length && rows[j].mark_id === r.mark_id) j++;
    const count = j - i; // number of subjects for this student

    for (let k = 0; k < count; k++) {
      const row = rows[i + k];
      const excelRow = ws.addRow([
        row.mark_id,
        row.roll_number,
        row.student_name,
        row.department,
        row.semester,
        row.subject_name,
        row.subject_code,
        row.int_marks,
        row.ext_marks,
        row.obtained,
        row.max_marks,
      ]);

      excelRow.height = 18;
      excelRow.eachCell((cell, colNumber) => {
        cell.font = BOLD_FONT;
        cell.alignment = CENTER;
        cell.border = BORDER;
        // Highlight failed total in red
        if (colNumber === 10) {
          cell.font = { ...BOLD_FONT, color: { argb: "FFCC0000" } };
        }
      });
    }

    // Merge student info columns (A–E = cols 1–5) if more than 1 ATKT subject
    if (count > 1) {
      const startRow = dataRowStart;
      const endRow = dataRowStart + count - 1;
      for (let col = 1; col <= 5; col++) {
        ws.mergeCells(startRow, col, endRow, col);
        const cell = ws.getCell(startRow, col);
        cell.alignment = CENTER;
        cell.border = BORDER;
      }
    }

    dataRowStart += count;
    i = j;
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as Buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=ATKT_Students.xlsx`,
    },
  });
}

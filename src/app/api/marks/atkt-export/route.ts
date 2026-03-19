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

  // Exclude student_marks whose upload is soft-deleted — handle schemas with/without deleted_at
  let activeUploads: { id: string }[] | null = null;
  const { data: d1, error: e1 } = await supabaseAdmin
    .from("marks_uploads")
    .select("id")
    .eq("college_id", college.id)
    .is("deleted_at", null)
    .neq("status", "deleted");

  if (!e1) {
    activeUploads = d1;
  } else {
    const { data: d2 } = await supabaseAdmin
      .from("marks_uploads")
      .select("id")
      .eq("college_id", college.id)
      .neq("status", "deleted");
    activeUploads = d2;
  }

  const activeUploadIds = (activeUploads || []).map((u: any) => u.id);
  if (activeUploadIds.length === 0) {
    // Return empty Excel
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("ATKT Students");
    const emptyBytes = await wb.xlsx.writeBuffer();
    return new NextResponse(emptyBytes, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="atkt-students.xlsx"`,
      },
    });
  }

  let query = supabaseAdmin
    .from("student_marks")
    .select("id, roll_number, student_name, department, year, semester, subjects, result")
    .eq("college_id", college.id)
    .in("upload_id", activeUploadIds)
    .or("result.ilike.%ATKT%,result.ilike.%FAIL%,result.ilike.%F A I L%")
    .order("student_name", { ascending: true });

  if (department && department !== "all") query = query.eq("department", department);
  if (year && year !== "all") query = query.eq("year", year);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Map year number to FY/SY/TY label
  const yearMap: Record<string, string> = { "1": "FY", "2": "SY", "3": "TY", FY: "FY", SY: "SY", TY: "TY" };

  // Build flat rows grouped per student
  type StudentGroup = {
    roll_number: string;
    student_name: string;
    course: string;
    year: string;
    semester: string;
    subjects: { subject_name: string; int_marks: number | string; ext_marks: number | string }[];
  };

  const groups: StudentGroup[] = [];

  for (const s of data || []) {
    const subs = (s.subjects as any[]) || [];
    const failedSubs = subs.filter(
      (sub) => sub.is_pass === false || sub.grade === "F" || sub.grade === "D"
    );
    if (failedSubs.length === 0) continue;
    groups.push({
      roll_number: s.roll_number,
      student_name: s.student_name,
      course: s.department ?? "", // department column stores course name e.g. "BSC Information Technology"
      year: yearMap[s.year ?? ""] || s.year || "",
      semester: s.semester ?? s.year ?? "",
      subjects: failedSubs.map((sub) => ({
        subject_name: sub.subject_name,
        int_marks: sub.int_marks != null ? sub.int_marks : "",
        ext_marks:
          (sub.theo_marks ?? 0) + (sub.prac_marks ?? 0) > 0
            ? (sub.theo_marks ?? 0) + (sub.prac_marks ?? 0)
            : "",
      })),
    });
  }

  // ── Build workbook ─────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("ATKT Students");

  // Column widths: Roll No | Student Name | Course | Year | Semester | Subject | Int Marks | Ext Marks
  const colWidths = [15.796875, 25.796875, 35, 12, 15.796875, 55, 16.8984375, 15.69921875];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // Styles
  const HEADER_FONT: Partial<ExcelJS.Font> = {
    bold: true, size: 12, name: "Calibri", family: 2,
    color: { theme: 1 }, scheme: "minor",
  };
  const DATA_FONT: Partial<ExcelJS.Font> = {
    size: 12, name: "Calibri", family: 2,
    color: { theme: 1 }, scheme: "minor",
  };
  const HEADER_FILL: ExcelJS.Fill = {
    type: "pattern", pattern: "solid",
    fgColor: { theme: 3, tint: 0.5999938962981048 },
    bgColor: { indexed: 64 },
  };
  const DATA_FILL: ExcelJS.Fill = { type: "pattern", pattern: "none" };
  const THIN_BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { indexed: 64 } };
  const CELL_BORDER: Partial<ExcelJS.Borders> = {
    left: THIN_BORDER, right: THIN_BORDER,
    top: THIN_BORDER, bottom: THIN_BORDER,
  };
  const CENTER_ALIGN: Partial<ExcelJS.Alignment> = {
    horizontal: "center", vertical: "middle", wrapText: true,
  };
  const LEFT_ALIGN: Partial<ExcelJS.Alignment> = {
    horizontal: "left", vertical: "middle", wrapText: true,
  };

  const styleHeader = (cell: ExcelJS.Cell) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.border = CELL_BORDER;
    cell.alignment = CENTER_ALIGN;
  };

  const styleData = (cell: ExcelJS.Cell, colNum: number) => {
    cell.font = DATA_FONT;
    cell.fill = DATA_FILL;
    cell.border = CELL_BORDER;
    // Col 6 = Subject → left align; everything else center
    cell.alignment = colNum === 6 ? LEFT_ALIGN : CENTER_ALIGN;
  };

  // ── Header row ────────────────────────────────────────────────────────────
  const headers = [
    "Roll Number", "Student Name", "Course",
    "Year", "Semester", "Subject", "Internal Marks (20)", "Max External (30)",
  ];
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => styleHeader(cell));

  // ── Data rows ─────────────────────────────────────────────────────────────
  for (const group of groups) {
    const count = group.subjects.length;
    const startRowNum = ws.rowCount + 1;

    for (let k = 0; k < count; k++) {
      const sub = group.subjects[k];
      const excelRow = ws.addRow([
        group.roll_number,
        group.student_name,
        group.course,
        group.year,
        group.semester,
        sub.subject_name,
        sub.int_marks,
        sub.ext_marks,
      ]);
      excelRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        styleData(cell, colNum);
      });
    }

    // Merge cols 1–5 (Roll Number, Student Name, Course, Year, Semester)
    // ONLY when student has 2 or more ATKT subjects
    if (count >= 2) {
      const endRowNum = startRowNum + count - 1;
      for (let col = 1; col <= 5; col++) {
        ws.mergeCells(startRowNum, col, endRowNum, col);
        const cell = ws.getCell(startRowNum, col);
        cell.font = DATA_FONT;
        cell.fill = DATA_FILL;
        cell.border = CELL_BORDER;
        cell.alignment = CENTER_ALIGN;
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as Buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=ATKT_Students.xlsx`,
    },
  });
}

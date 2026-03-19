import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

export async function GET(_req: NextRequest) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("ATKT Students");

  // Column widths — exact match to template
  const colWidths = [15.796875, 25.796875, 15.796875, 15.796875, 59.796875, 16.8984375, 15.69921875];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

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
    cell.alignment = colNum === 5
      ? { horizontal: "left", vertical: "middle", wrapText: true }
      : CENTER_ALIGN;
  };

  // Header row
  const headers = [
    "Roll Number", "Student Name", "Department",
    "Semester", "Subject", "Internal Marks (20)", "Max External (30)",
  ];
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => styleHeader(cell));

  // Example data — 3 students: 2 subjects, 2 subjects, 3 subjects
  type ExRow = { roll: string; name: string; dept: string; sem: string; subject: string };
  const examples: ExRow[][] = [
    [
      { roll: "202602103", name: "Aditya Kulkarni", dept: "FYIT", sem: "Semester 1", subject: "Combinational & Sequantial Design" },
      { roll: "202602103", name: "Aditya Kulkarni", dept: "FYIT", sem: "Semester 1", subject: "Foundation of Behavioural Skills (VEC)" },
    ],
    [
      { roll: "202602105", name: "Ishaan Deshmukh", dept: "FYIT", sem: "Semester 1", subject: "Programming with C (Major I)" },
      { roll: "202602105", name: "Ishaan Deshmukh", dept: "FYIT", sem: "Semester 1", subject: "Indian Knowledge System" },
    ],
    [
      { roll: "202602112", name: "Harsh Vyas", dept: "FYIT", sem: "Semester 1", subject: "Office Tools for Data Management" },
      { roll: "202602112", name: "Harsh Vyas", dept: "FYIT", sem: "Semester 1", subject: "Environmental Management and Sustainable Development - I (OE - I)" },
      { roll: "202602112", name: "Harsh Vyas", dept: "FYIT", sem: "Semester 1", subject: "Indian Knowledge System" },
    ],
  ];

  for (const group of examples) {
    const count = group.length;
    const startRowNum = ws.rowCount + 1;

    for (const ex of group) {
      const row = ws.addRow([ex.roll, ex.name, ex.dept, ex.sem, ex.subject, null, null]);
      row.eachCell({ includeEmpty: true }, (cell, colNum) => styleData(cell, colNum));
    }

    // Merge cols 1–4 for students with 2+ subjects
    if (count >= 2) {
      const endRowNum = startRowNum + count - 1;
      for (let col = 1; col <= 4; col++) {
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
      "Content-Disposition": "attachment; filename=Update_Marks_Template.xlsx",
    },
  });
}

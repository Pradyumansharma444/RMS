import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

const SUBJECTS = [
  { name: "Programming with C \n(Major I)",                                          code: 1011111 },
  { name: "Database Management Systems (Major II)",                                  code: 1011112 },
  { name: "Programming with C + Database Management Systems \n(Major - III)",        code: 1011113 },
  { name: "Combinational & Sequantial Design",                                       code: 1011411 },
  { name: "Office Tools for Data Management",                                        code: 1011412 },
  { name: "Foundation of Behavioural Skills \n(VEC)",                               code: 2541515 },
  { name: "Introduction to Communication Skills\n (AEC)",                           code: 2511511 },
  { name: "Environmental Management and Sustainable Development - I\n(OE - I)",     code: 2541516 },
  { name: "Marketing Mix - I \n(OE - II)",                                          code: 1281311 },
  { name: "Indian Knowledge System",                                                 code: 2531511 },
  { name: "NSS/DLLE/CULTURAL\n/SPORTS",                                             code: null    },
];

// Column widths from official template
const COL_WIDTHS: Record<number, number> = {
  1:  12.77734375,   // Roll Number
  2:  24.88671875,   // University Exam Seat No
  3:  14.6640625,    // Enrollment No
  4:  13.109375,     // ABC ID
  5:  58.33203125,   // Full Name
  6:  14.21875,      // Gender
};
// Subject cols 7-28: alternating Int(7.66) / Ext(8.33)
for (let i = 7; i <= 28; i++) {
  COL_WIDTHS[i] = i % 2 === 1 ? 7.6640625 : 8.33203125;
}
COL_WIDTHS[29] = 146.21875; // CC Subject long header
COL_WIDTHS[30] = 13.21875;  // Departments
COL_WIDTHS[31] = 7.88671875; // Credits

const CELL_FONT = { bold: true, size: 12, color: { theme: 1 }, name: "Times New Roman", family: 1 };
const CENTER_ALIGN = { horizontal: "center" as const, vertical: "middle" as const, wrapText: true };
const THIN_BORDER: Partial<ExcelJS.Border> = { style: "thin" as const };
const FULL_BORDER = { left: THIN_BORDER, right: THIN_BORDER, top: THIN_BORDER, bottom: THIN_BORDER };

function styleCell(cell: ExcelJS.Cell, value: ExcelJS.CellValue, borders = true) {
  cell.value = value;
  cell.font = CELL_FONT;
  cell.alignment = CENTER_ALIGN;
  if (borders) cell.border = FULL_BORDER;
}

export async function GET(req: NextRequest) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Marksheet Tamplate");

  // ── Set column widths ──────────────────────────────────────────────────────
  for (const [col, width] of Object.entries(COL_WIDTHS)) {
    ws.getColumn(Number(col)).width = width;
  }

  // ── Row heights ────────────────────────────────────────────────────────────
  ws.getRow(1).height = 99.75;
  ws.getRow(2).height = 15.6;
  ws.getRow(3).height = 31.2;

  // ── Freeze top 3 rows ─────────────────────────────────────────────────────
  ws.views = [
    {
      state:           "frozen",
      ySplit:          3,
      topLeftCell:     "A4",
      activeCell:      "A4",
      workbookViewId:  0,
    } as any,
  ];

  // ── Row 1 – identification headers (merged A1:A3, B1:B3, C1:C3, D1:D3, E1:E3) ──
  const idHeaders = [
    "Roll Number",
    "University Exam Seat No",
    "Enrollment No",
    "ABC ID",
    "Full Name of the Students (Surname Students Name Fathers Name Mothers Name)",
  ];
  idHeaders.forEach((h, idx) => {
    const col = idx + 1;
    const addr = `${ws.getColumn(col).letter}1`;
    styleCell(ws.getCell(addr), h);
    ws.mergeCells(1, col, 3, col);
  });

  // Gender (M/F) – col 6, row 1 only (no vertical merge)
  styleCell(ws.getCell("F1"), "Gender (M/F)");

  // ── Subject columns ────────────────────────────────────────────────────────
  // Each subject occupies 2 columns (Int + Ext).
  // Row 1: subject name  (merged over 2 cols)
  // Row 2: subject code  (merged over 2 cols)
  // Row 3: Internal(20) | External(30)
  let subStartCol = 7;

  for (const subj of SUBJECTS) {
    const col1 = subStartCol;
    const col2 = subStartCol + 1;
    const letter1 = ws.getColumn(col1).letter;
    const letter2 = ws.getColumn(col2).letter;

    // Row 1 – name (merged)
    styleCell(ws.getCell(`${letter1}1`), subj.name);
    ws.mergeCells(1, col1, 1, col2);

    // Row 2 – code (merged)
    styleCell(ws.getCell(`${letter1}2`), subj.code ?? "");
    ws.mergeCells(2, col1, 2, col2);

    // Row 3 – Int / Ext
    styleCell(ws.getCell(`${letter1}3`), "Internal (20)");
    styleCell(ws.getCell(`${letter2}3`), "External (30)");

    subStartCol += 2;
  }

  // ── CC Subject column (col 29) ─────────────────────────────────────────────
  // Row 1: long NSS/CC header
  styleCell(ws.getCell("AC1"),
    "NATIONAL SERVICE SCHEME /INTRODUCTION TO CULTURAL ACTIVITIES /  EXTENSION WORK/ INTRODUCTION TO SPORTS, PHYSICAL LITERACY, HEALTH AND FITNESS AND YOG");
  // Row 2: "CC Subject"
  styleCell(ws.getCell("AC2"), "CC Subject");

  // ── Departments column (col 30) ────────────────────────────────────────────
  styleCell(ws.getCell("AD1"), "Departments");

  // ── Credits column (col 31) ───────────────────────────────────────────────
  styleCell(ws.getCell("AE1"), "Credits");

  // ── Bold / alignment for all 3 header rows ─────────────────────────────────
  [1, 2, 3].forEach((r) => {
    ws.getRow(r).font      = CELL_FONT;
    ws.getRow(r).alignment = CENTER_ALIGN;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as Buffer, {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=Marks_Template.xlsx",
    },
  });
}

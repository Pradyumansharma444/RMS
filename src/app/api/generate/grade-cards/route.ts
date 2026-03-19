import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from "pdf-lib";
import JSZip from "jszip";

interface SubjectMark {
  subject_name: string;
  subject_code?: string;
  max_marks: number;
  obtained_marks: number;
  is_pass: boolean;
  grade: string;
  gp: number;
  int_marks?: number;
  prac_marks?: number;
  theo_marks?: number;
  credits?: number;
  earned_credits?: number;
  is_cc?: boolean;
}

interface StudentMark {
  id: string;
  roll_number: string;
  student_name: string;
  department: string;
  year: string;
  division?: string;
  subjects: SubjectMark[];
  total_marks: number;
  obtained_marks: number;
  percentage: number;
  result: string;
  cgpa: number;
  exam_name: string;
  ec?: number; // Credits Earned
  ern?: string; // PRN / Reg. No
  enrollment_no?: string;
  abc_id?: string;
  university_exam_seat_no?: string;
  gender?: string;
  sgpi?: number;
}

interface Student {
  roll_number: string;
  name: string;
  photo_url?: string;
  enrollment_no?: string;
  abc_id?: string;
  university_exam_seat_no?: string;
  gender?: string;
}

interface College {
  id: string;
  name: string;
  email: string;
  banner_url?: string;
  logo_url?: string;
  principal_signature_url?: string;
  hod_signature_url?: string;
  university_stamp_url?: string;
}

const W = 595.28; // A4 width
const H = 841.89; // A4 height
const M = 40;     // margins

const BLUE = rgb(0.1, 0.2, 0.55);
const BLACK = rgb(0, 0, 0);

// Word-wrap a string to fit within maxWidth at given fontSize, return array of lines
function wrapText(text: string, font: PDFFont | undefined, size: number, maxWidth: number): string[] {
  if (!text) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (getTextWidth(test, font, size) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      // If a single word is too wide, truncate it
      if (getTextWidth(word, font, size) > maxWidth) {
        let truncated = word;
        while (truncated.length > 1 && getTextWidth(truncated + "…", font, size) > maxWidth) {
          truncated = truncated.slice(0, -1);
        }
        lines.push(truncated + "…");
        current = "";
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// Robust text width measurement with fallback
function getTextWidth(text: string, font: PDFFont | undefined, size: number): number {
  if (!text) return 0;
  if (!font) return text.length * size * 0.5;
  try {
    if (font && typeof font.widthOfTextAtSize === 'function') {
      return font.widthOfTextAtSize(text, size);
    }
  } catch (e) {}
  return text.length * size * 0.5;
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont | undefined, size: number, color = BLACK) {
  if (!text) return;
  const sanitized = String(text).replace(/[^\x00-\x7F]/g, ""); 
  if (!font) {
    page.drawText(sanitized, { x, y, size, color });
    return;
  }
  page.drawText(sanitized, { x, y, font, size, color });
}

function centerText(page: PDFPage, text: string, y: number, font: PDFFont | undefined, size: number, color = BLACK, pageW = W) {
  if (!text) return;
  const sanitized = String(text).replace(/[^\x00-\x7F]/g, "");
  const tw = getTextWidth(sanitized, font, size);
  if (!font) {
    page.drawText(sanitized, { x: (pageW - tw) / 2, y, size, color });
    return;
  }
  page.drawText(sanitized, { x: (pageW - tw) / 2, y, font, size, color });
}

async function fetchImageBytes(url: string): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return { bytes: await res.arrayBuffer(), mime: res.headers.get("content-type") || "image/jpeg" };
  } catch {
    return null;
  }
}

async function buildGradeCardPDF(
  student: StudentMark,
  studentMaster: Student | null,
  college: College,
  pdfDoc: PDFDocument,
  boldFont: PDFFont | undefined,
  regFont: PDFFont | undefined,
  italicFont: PDFFont | undefined,
  bannerImg: any | null,
  photoMap: Map<string, any>,
  signatureImages: {
    principal?: any | null;
    hod?: any | null;
    stamp?: any | null;
  },
  graceLookup: Map<string, { int_grace: number; ext_grace: number }>
): Promise<void> {
  const page = pdfDoc.addPage([W, H]);
  let curY = H - 40;

  // Header
  if (bannerImg) {
    const B_H = 75;
    page.drawImage(bannerImg, { x: M, y: curY - B_H, width: W - M * 2, height: B_H });
    curY -= B_H + 20;
  } else {
    centerText(page, college.name.toUpperCase(), curY, boldFont, 16, BLUE);
    curY -= 20;
    centerText(page, college.email, curY, regFont, 9, BLACK);
    curY -= 30;
  }

  centerText(page, "GRADE CARD", curY, boldFont, 14, BLACK);
  curY -= 25;

  // Student Info
  const LEFT_X = M;
  const PHOTO_W = 75;
  const PHOTO_H = 90;
  const infoSize = 9;
  const rowH = 16;
    const infoRows = [
      ["Name :", student.student_name.toUpperCase()],
      ["Enrollment No :", student.enrollment_no || student.ern || studentMaster?.enrollment_no || "N/A"],
      ["Roll Number :", student.roll_number],
      ["ABC ID :", student.abc_id || studentMaster?.abc_id || "N/A"],
      ["Univ. Exam Seat No :", student.university_exam_seat_no || studentMaster?.university_exam_seat_no || "N/A"],
      ["Gender :", (student.gender || studentMaster?.gender || "N/A").toUpperCase()],
      ["Programme / Course :", (student.department || "N/A").toUpperCase()],
      ["Semester :", (student.year + " - Semester " + (student.subjects[0]?.subject_code?.charAt(4) || "1")).toUpperCase()],
      ["Exam Month & Year :", (student.exam_name || "N/A").toUpperCase()],
    ];

  infoRows.forEach((row, i) => {
    drawText(page, row[0], LEFT_X, curY - i * rowH, boldFont, infoSize);
    drawText(page, row[1], LEFT_X + 130, curY - i * rowH, boldFont, infoSize);
  });

  const photoImg = studentMaster?.photo_url ? photoMap.get(studentMaster.photo_url) : null;
  if (photoImg) {
    page.drawImage(photoImg, { x: W - M - PHOTO_W, y: curY - 95, width: PHOTO_W, height: PHOTO_H });
  } else {
    page.drawRectangle({ x: W - M - PHOTO_W, y: curY - 95, width: PHOTO_W, height: PHOTO_H, borderColor: BLACK, borderWidth: 1 });
    const photoText = "PHOTO";
    const pTw = getTextWidth(photoText, regFont, 8);
    drawText(page, photoText, (W - M - PHOTO_W) + (PHOTO_W - pTw) / 2, curY - 55, regFont, 8);
  }
  curY -= 170;

  // Table
  const tableX = M;
  const tableW = W - M * 2;
  const colW = {
    code: 40,
    title: 222,
    int: 26,
    theo: 26,
    over: 30,
    max: 30,
    gr: 24,
    gp: 20,
    cr: 20,
    earn: 20
  };

  const TH = 20;
  page.drawRectangle({ x: tableX, y: curY - TH, width: tableW, height: TH, color: rgb(0.95, 0.95, 0.95), borderColor: BLACK, borderWidth: 1 });
  let tx = tableX + 4;
  const headers = ["Code", "Course Title", "Int", "Theo", "Over", "Max", "Gr", "GP", "Cr", "Earn"];
  const hKeys = ["code", "title", "int", "theo", "over", "max", "gr", "gp", "cr", "earn"];
  headers.forEach((h, i) => {
    drawText(page, h, tx, curY - 14, boldFont, 7);
    tx += colW[hKeys[i] as keyof typeof colW];
  });
  curY -= TH;

  const BASE_RH = 18;
  const LINE_H = 9; // height per wrapped line
  student.subjects.forEach((sub) => {
    const size = 6.5;

    const over = sub.obtained_marks || 0;
    const intNum = typeof sub.int_marks === "number" ? sub.int_marks : 0;
    const theoNum = sub.theo_marks != null ? sub.theo_marks : (sub.int_marks === undefined ? over : 0);
    const credits = sub.credits ?? 2;
    const earn = sub.earned_credits ?? (sub.is_pass ? credits : 0);

    // Grace lookup: key = studentId|subjectName
    const graceKey = `${student.id}|${sub.subject_name.trim().toLowerCase()}`;
    const graceEntry = graceLookup.get(graceKey);
    const intGrace = graceEntry?.int_grace ?? 0;
    const extGrace = graceEntry?.ext_grace ?? 0;
    const totalGrace = intGrace + extGrace;

    // Display values — "original+@grace" when grace applied (e.g. "12+@2")
    const intDisplay = sub.int_marks != null
      ? (intGrace > 0 ? `${intNum - intGrace}+@${intGrace}` : String(intNum))
      : "-";
    const theoDisplay = sub.theo_marks != null || sub.int_marks === undefined
      ? (extGrace > 0 ? `${theoNum - extGrace}+@${extGrace}` : String(theoNum))
      : "-";
    const overDisplay = totalGrace > 0 ? `${over - totalGrace}+@${totalGrace}` : String(over);

    // ABS logic: grade says ABS, or external marks = 0 (entering 0 = student is absent)
    const storedGradeUp = String(sub.grade ?? "").toUpperCase().trim();
    const isAbsByGrade = ["AB", "ABS", "ABSENT"].includes(storedGradeUp);
    const isExtZero = sub.theo_marks !== null && sub.theo_marks !== undefined && sub.theo_marks === 0;
    const isAbsent = isAbsByGrade || isExtZero;
    // Strip grace suffix symbols (* @) from stored grade — marks columns already show +@ notation
    const cleanGrade = String(sub.grade || "-").replace(/[*@]+$/, "").trim() || "-";
    const displayGrade = isAbsent ? "ABS" : (sub.is_pass === false ? "F" : cleanGrade);

    const GREEN = rgb(0.1, 0.4, 0.1);
    const sCode = (sub.subject_code || "-").slice(0, 15);

    // Wrap subject name to fit title column width
    const subjectLines = wrapText(sub.subject_name, regFont, size, colW.title - 4);
    const RH = Math.max(BASE_RH, subjectLines.length * LINE_H + 6);

    page.drawRectangle({ x: tableX, y: curY - RH, width: tableW, height: RH, borderColor: BLACK, borderWidth: 0.5 });
    let rx = tableX + 4;
    // Vertically center single-line data rows; top-align for multi-line
    const ry = curY - (subjectLines.length === 1 ? 12 : 9);

    drawText(page, sCode, rx, ry, regFont, size); rx += colW.code;

    // Draw each wrapped line of subject name
    subjectLines.forEach((line, li) => {
      drawText(page, line, rx, curY - 9 - li * LINE_H, regFont, size);
    });
    rx += colW.title;

    // Components (grace values shown in green with @ notation)
    drawText(page, intDisplay, rx + 1, ry, regFont, size, intGrace > 0 ? GREEN : BLACK); rx += colW.int;
    drawText(page, theoDisplay, rx + 1, ry, regFont, size, extGrace > 0 ? GREEN : BLACK); rx += colW.theo;
    drawText(page, overDisplay, rx + 1, ry, boldFont, size, totalGrace > 0 ? GREEN : BLACK); rx += colW.over;
    drawText(page, String(sub.max_marks || 100), rx + 2, ry, regFont, size); rx += colW.max;
    drawText(page, displayGrade, rx + 2, ry, boldFont, size); rx += colW.gr;
    drawText(page, String(sub.gp || 0), rx + 2, ry, regFont, size); rx += colW.gp;
    drawText(page, String(credits), rx + 2, ry, regFont, size); rx += colW.cr;
    drawText(page, String(earn), rx + 2, ry, regFont, size);
    curY -= RH;
  });

  // Totals Row (fixed height)
  const TOTAL_RH = 18;
  page.drawRectangle({ x: tableX, y: curY - TOTAL_RH, width: tableW, height: TOTAL_RH, color: rgb(0.9, 0.9, 0.9), borderColor: BLACK, borderWidth: 1 });
  drawText(page, "TOTAL", tableX + colW.code + 4, curY - 12, boldFont, 8);
  const totOver = student.obtained_marks;
  const totMax = student.total_marks;
  const totCredits = student.subjects.reduce((acc, s) => acc + (s.credits ?? 2), 0);
  const totEarned = student.subjects.reduce((acc, s) => acc + (s.earned_credits ?? (s.is_pass ? (s.credits ?? 2) : 0)), 0);

  const totalStartX = tableX + colW.code + colW.title + colW.int + colW.theo + 4;
  drawText(page, String(totOver), totalStartX, curY - 12, boldFont, 8);
  drawText(page, String(totMax), totalStartX + colW.over, curY - 12, boldFont, 8);
  drawText(page, String(totCredits), totalStartX + colW.over + colW.max + colW.gr + colW.gp, curY - 12, boldFont, 8);
  drawText(page, String(totEarned), totalStartX + colW.over + colW.max + colW.gr + colW.gp + colW.cr, curY - 12, boldFont, 8);
  curY -= TOTAL_RH + 30;

  // O.229: Check if student has CC subject participation (NSS/NCC/DLLE/Cultural)
  const hasCCParticipation = student.subjects.some(sub =>
    (sub.is_cc || sub.subject_code === "CC Subject" ||
     /NSS|NCC|DLLE|CULTURAL/i.test(sub.subject_name)) &&
    (sub.obtained_marks > 0 || sub.is_pass)
  );

  // Apply O.229 +0.1 SGPI bonus if CC participation detected
  const basesgpi = student.sgpi || student.cgpa || 0;
  const finalSGPI = hasCCParticipation ? Math.min(10, Math.round((basesgpi + 0.1) * 100) / 100) : basesgpi;

  // Footer Summary
  const sumSize = 9;
  const sumRowH = 18;
  const O229_GREEN = rgb(0.1, 0.5, 0.2);
  drawText(page, `Remark: ${student.result.toUpperCase()}`, M, curY, boldFont, sumSize);
  drawText(page, `Credits Earned: ${totEarned}`, M + 180, curY, boldFont, sumSize);
  curY -= sumRowH;
  drawText(page, `SGPA: ${finalSGPI.toFixed(2)}`, M + 180, curY, boldFont, sumSize);
  if (hasCCParticipation) {
    const sgpaTextW = getTextWidth(`SGPA: ${finalSGPI.toFixed(2)}`, boldFont, sumSize);
    drawText(page, "| O.229 Applied", M + 180 + sgpaTextW + 6, curY, boldFont, 7.5, O229_GREEN);
  }
  drawText(page, `Overall Result: ${student.result.toUpperCase()}`, M + 320, curY, boldFont, sumSize);
  curY -= sumRowH;
  // Place and Date on same line, left-aligned — no blank bottom gap
  drawText(page, "Place: Mumbai", M, curY, boldFont, sumSize);
  drawText(page, `Date: ${new Date().toLocaleDateString("en-IN")}`, M + 120, curY, boldFont, sumSize);
  curY -= 30;

  // ── Signature block ────────────────────────────────────────────────────────
  // Layout:
  //   Bottom-left:  College Stamp / Seal of the College
  //   Center-bottom: Principal signature + "Chairperson / Principal" label
  const SIG_W = 100;
  const SIG_H = 45;
  const STAMP_W = 75;
  const STAMP_H = 75;

  const sigTopY = curY; // top of signature block

  // College Stamp — bottom-left
  if (signatureImages.stamp) {
    page.drawImage(signatureImages.stamp, { x: M, y: sigTopY - STAMP_H, width: STAMP_W, height: STAMP_H, opacity: 0.75 });
  } else {
    // Placeholder box when stamp not uploaded
    page.drawRectangle({ x: M, y: sigTopY - STAMP_H, width: STAMP_W, height: STAMP_H, borderColor: BLACK, borderWidth: 0.5 });
  }
  drawText(page, "Seal of the College", M, sigTopY - STAMP_H - 12, boldFont, 8);

  // Chairperson / Principal Signature — center-bottom
  const centerX = (W - SIG_W) / 2;
  if (signatureImages.principal) {
    page.drawImage(signatureImages.principal, { x: centerX, y: sigTopY - SIG_H, width: SIG_W, height: SIG_H });
  } else {
    page.drawRectangle({ x: centerX, y: sigTopY - SIG_H, width: SIG_W, height: SIG_H, borderColor: BLACK, borderWidth: 0.5 });
  }
  const principalLabel = "Chairperson / Principal";
  const principalLabelW = getTextWidth(principalLabel, boldFont, 8);
  drawText(page, principalLabel, centerX + (SIG_W - principalLabelW) / 2, sigTopY - SIG_H - 12, boldFont, 8);

  // Border
  page.drawRectangle({ x: 20, y: 20, width: W - 40, height: H - 40, borderColor: BLACK, borderWidth: 1.5 });
}

export async function POST(req: NextRequest) {
  try {
    const { uid, upload_id, department, year, student_ids } = await req.json();
    if (!uid || !upload_id) return NextResponse.json({ error: "uid and upload_id required" }, { status: 400 });

    const { data: college } = await supabaseAdmin.from("colleges").select("*").eq("firebase_uid", uid).single();
    if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

    const { data: uploadRecord } = await supabaseAdmin.from("marks_uploads").select("department, year, semester, exam_name").eq("id", upload_id).single();

    let query = supabaseAdmin.from("student_marks").select("*").eq("college_id", college.id).eq("upload_id", upload_id).order("roll_number", { ascending: true });
    if (department && department !== "all") query = query.eq("department", department);
    if (year && year !== "all") query = query.eq("year", year);
    if (student_ids?.length) query = query.in("id", student_ids);

    const { data: marksData, error } = await query;
    if (error || !marksData?.length) return NextResponse.json({ error: "No marks data found" }, { status: 404 });

    const students = marksData as StudentMark[];
    const { data: masterStudents } = await supabaseAdmin.from("students").select("roll_number, name, photo_url, enrollment_no, abc_id, university_exam_seat_no, gender").eq("college_id", college.id);
    const masterMap = new Map();
    (masterStudents || []).forEach((s) => masterMap.set(s.roll_number, s));

    const pdfDoc = await PDFDocument.create();
    let boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    let regFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    let italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // Pre-calculate which photos need fetching
    const photoUrlsToFetch = new Set<string>();
    for (const student of students) {
      const master = masterMap.get(student.roll_number);
      if (master?.photo_url) photoUrlsToFetch.add(master.photo_url);
    }

    // Fetch EVERYTHING in parallel (including grace_marks for @ notation)
    const [bannerImgData, sigResults, photoResults, graceRes] = await Promise.all([
      college.banner_url ? fetchImageBytes(college.banner_url) : Promise.resolve(null),
      Promise.all([
        ["principal", college.principal_signature_url],
        ["hod", college.hod_signature_url],
        ["stamp", college.university_stamp_url]
      ].map(async ([key, url]) => {
        if (!url) return { key, img: null };
        const img = await fetchImageBytes(url as string);
        return { key, img };
      })),
      Promise.all(Array.from(photoUrlsToFetch).map(async (url) => {
        const img = await fetchImageBytes(url);
        return { url, img };
      })),
      supabaseAdmin.from("grace_marks").select("mark_id,subject_name,original_marks,grace_given").eq("college_id", college.id),
    ]);

    // Build grace lookup: mark_id|subject_name → { int_grace, ext_grace }
    type GraceLookup = { int_grace: number; ext_grace: number };
    const graceLookup = new Map<string, GraceLookup>();
    for (const g of ((graceRes as any)?.data || [])) {
      const key = `${g.mark_id}|${(g.subject_name || "").trim().toLowerCase()}`;
      graceLookup.set(key, { int_grace: g.original_marks || 0, ext_grace: g.grace_given || 0 });
    }

    // Embed Banner
    let bannerImg: any = null;
    if (bannerImgData) {
      try {
        bannerImg = bannerImgData.mime.includes("png") 
          ? await pdfDoc.embedPng(bannerImgData.bytes) 
          : await pdfDoc.embedJpg(bannerImgData.bytes);
      } catch (e) {}
    }

    // Embed Signatures
    const signatureImages: any = {};
    for (const res of sigResults) {
      if (res.img) {
        try {
          signatureImages[res.key] = res.img.mime.includes("png") 
            ? await pdfDoc.embedPng(res.img.bytes) 
            : await pdfDoc.embedJpg(res.img.bytes);
        } catch (e) {}
      }
    }

    // Embed Photos
    const photoMap = new Map();
    for (const res of photoResults) {
      if (res.img) {
        try {
          photoMap.set(res.url, res.img.mime.includes("png") 
            ? await pdfDoc.embedPng(res.img.bytes) 
            : await pdfDoc.embedJpg(res.img.bytes));
        } catch (e) {}
      }
    }

    const deptLabel = department || uploadRecord?.department || students[0]?.department || "";
    const yearLabel = year || uploadRecord?.semester || uploadRecord?.year || students[0]?.year || "";
    const examLabel = uploadRecord?.exam_name || students[0]?.exam_name || "";

    // Record history entry before returning response
    try {
      await supabaseAdmin.from("generated_documents").insert({
        college_id: college.id,
        doc_type: "grade_card",
        upload_id: upload_id,
        department: deptLabel,
        year: yearLabel,
        exam_name: examLabel,
        generated_at: new Date().toISOString(),
      });
    } catch {}

    if (students.length === 1) {
      // Re-use already embedded images for single document if possible,
      // but buildGradeCardPDF expects images from the same pdfDoc.
      // So for 1 student we can just use pdfDoc.
      await buildGradeCardPDF(students[0], masterMap.get(students[0].roll_number), college as College, pdfDoc, boldFont, regFont, italicFont, bannerImg, photoMap, signatureImages, graceLookup);
      return new NextResponse(await pdfDoc.save(), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Grade_Card_${students[0].roll_number}.pdf"` } });
    }

    for (const student of students) {
      await buildGradeCardPDF(student, masterMap.get(student.roll_number), college as College, pdfDoc, boldFont, regFont, italicFont, bannerImg, photoMap, signatureImages, graceLookup);
    }

    const zip = new JSZip();
    const folder = zip.folder("Grade_Cards")!;
    folder.file("ALL_COMBINED.pdf", await pdfDoc.save());
    for (let i = 0; i < students.length; i++) {
      const singleDoc = await PDFDocument.create();
      const [page] = await singleDoc.copyPages(pdfDoc, [i]);
      singleDoc.addPage(page);
      folder.file(`Grade_Card_${students[i].roll_number}.pdf`, await singleDoc.save());
    }
    const zipBlob = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return new NextResponse(zipBlob, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="Grade_Cards.zip"` } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

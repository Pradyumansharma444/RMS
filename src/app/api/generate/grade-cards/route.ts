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
  }
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

  const RH = 18;
  student.subjects.forEach((sub) => {
    page.drawRectangle({ x: tableX, y: curY - RH, width: tableW, height: RH, borderColor: BLACK, borderWidth: 0.5 });
    let rx = tableX + 4;
    const ry = curY - 12;
    const size = 6.5;

    const over = sub.obtained_marks || 0;
    const int = sub.int_marks ?? "-";
    const theo = sub.theo_marks ?? (sub.int_marks === undefined ? over : "-");
    const credits = sub.credits ?? 2;
    const earn = sub.earned_credits ?? (sub.is_pass ? credits : 0);

    // ABS logic: if internal = 0 or external/theo = 0, show ABS in grade column
    const isAbsent = (sub.int_marks !== undefined && sub.int_marks !== null && sub.int_marks === 0) ||
                     (sub.theo_marks !== undefined && sub.theo_marks !== null && sub.theo_marks === 0);
    const displayGrade = isAbsent ? "ABS" : (sub.grade || "-");

    const sCode = (sub.subject_code || "-").slice(0, 15);
    drawText(page, sCode, rx, ry, regFont, size); rx += colW.code;
    drawText(page, (sub.subject_name.length > 68 ? sub.subject_name.slice(0, 65) + "..." : sub.subject_name), rx, ry, regFont, size); rx += colW.title;

    // Components
    drawText(page, String(int), rx + 2, ry, regFont, size); rx += colW.int;
    drawText(page, String(theo), rx + 2, ry, regFont, size); rx += colW.theo;
    drawText(page, String(over), rx + 2, ry, boldFont, size); rx += colW.over;
    drawText(page, String(sub.max_marks || 100), rx + 2, ry, regFont, size); rx += colW.max;
    drawText(page, displayGrade, rx + 2, ry, boldFont, size); rx += colW.gr;
    drawText(page, String(sub.gp || 0), rx + 2, ry, regFont, size); rx += colW.gp;
    drawText(page, String(credits), rx + 2, ry, regFont, size); rx += colW.cr;
    drawText(page, String(earn), rx + 2, ry, regFont, size);
    curY -= RH;
  });

  // Totals Row
  page.drawRectangle({ x: tableX, y: curY - RH, width: tableW, height: RH, color: rgb(0.9, 0.9, 0.9), borderColor: BLACK, borderWidth: 1 });
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
  curY -= RH + 30;

  // Footer Summary
  const sumSize = 9;
  const sumRowH = 18;
  drawText(page, `Remark: ${student.result.toUpperCase()}`, M, curY, boldFont, sumSize);
  drawText(page, `Credits Earned: ${totEarned}`, M + 180, curY, boldFont, sumSize);
  curY -= sumRowH;
  drawText(page, "Place: Mumbai", M, curY, boldFont, sumSize);
  drawText(page, `SGPA: ${(student.sgpi || student.cgpa || 0).toFixed(2)}`, M + 180, curY, boldFont, sumSize);
  curY -= sumRowH;
  drawText(page, `Date: ${new Date().toLocaleDateString("en-IN")}`, M, curY, boldFont, sumSize);
  drawText(page, `Overall Result: ${student.result.toUpperCase()}`, M + 180, curY, boldFont, sumSize);
  curY -= 40;

  // Signatures
  const SIG_W = 100;
  const SIG_H = 40;
  const sigY = curY;

  // HOD Signature above Controller of Examinations
  if (signatureImages.hod) {
    page.drawImage(signatureImages.hod, { x: M + 140, y: sigY, width: SIG_W, height: SIG_H });
  }

  // Stamp above Checked by
  if (signatureImages.stamp) {
    page.drawImage(signatureImages.stamp, { x: M, y: sigY, width: 80, height: 80, opacity: 0.7 });
  }

  // Principal Signature above Principal
  if (signatureImages.principal) {
    page.drawImage(signatureImages.principal, { x: W - M - SIG_W, y: sigY, width: SIG_W, height: SIG_H });
  }

  drawText(page, "Checked by", M, sigY - 15, boldFont, 9);
  drawText(page, "Controller of Examinations", M + 140, sigY - 15, boldFont, 9);
  drawText(page, "Principal", W - M - 60, sigY - 15, boldFont, 9);

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

    // Fetch EVERYTHING in parallel
    const [bannerImgData, sigResults, photoResults] = await Promise.all([
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
      }))
    ]);

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
      await buildGradeCardPDF(students[0], masterMap.get(students[0].roll_number), college as College, pdfDoc, boldFont, regFont, italicFont, bannerImg, photoMap, signatureImages);
      return new NextResponse(await pdfDoc.save(), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Grade_Card_${students[0].roll_number}.pdf"` } });
    }

    for (const student of students) {
      await buildGradeCardPDF(student, masterMap.get(student.roll_number), college as College, pdfDoc, boldFont, regFont, italicFont, bannerImg, photoMap, signatureImages);
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

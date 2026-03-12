import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from "pdf-lib";

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
  roll_number: string;
  student_name: string;
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

const COL_DARK = rgb(0.1, 0.1, 0.2);
const COL_WHITE = rgb(1, 1, 1);
const COL_FAIL = rgb(0.8, 0.1, 0.1);
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

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont | undefined, size: number, color = rgb(0, 0, 0)) {
  const sanitized = String(text || "")
    .replace(/[^\x00-\x7F]/g, ""); // Remove non-ASCII
  
  if (!font) {
    page.drawText(sanitized, { x, y, size, color });
    return;
  }
  page.drawText(sanitized, { x, y, font, size, color });
}

function drawRect(page: PDFPage, x: number, y: number, width: number, height: number, color: ReturnType<typeof rgb>, border = false) {
  page.drawRectangle({ 
    x, y, width, height, color, 
    borderColor: border ? rgb(0.7, 0.7, 0.7) : undefined, 
    borderWidth: border ? 0.5 : 0 
  });
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

export async function POST(req: NextRequest) {
  try {
    const { uid, upload_id, department, year, exam_type } = await req.json();
    if (!uid || !upload_id) return NextResponse.json({ error: "uid and upload_id required" }, { status: 400 });

    const { data: college } = await supabaseAdmin.from("colleges").select("*").eq("firebase_uid", uid).single();
    if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

    const { data: upload } = await supabaseAdmin.from("marks_uploads").select("*").eq("id", upload_id).single();

    let query = supabaseAdmin
      .from("student_marks")
      .select("*")
      .eq("college_id", college.id)
      .eq("upload_id", upload_id)
      .order("roll_number", { ascending: true });

    if (department && department !== "All Departments") query = query.eq("department", department);

    const { data: marksData, error } = await query;
    if (error || !marksData?.length) return NextResponse.json({ error: "No marks data found" }, { status: 404 });

    const students = marksData as StudentMark[];
    const pdfDoc = await PDFDocument.create();
    let boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    let regFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Fetch images in parallel
      const [bannerImgData, sigResults] = await Promise.all([
        college.banner_url ? fetchImageBytes(college.banner_url) : Promise.resolve(null),
        Promise.all([
          ["principal", college.principal_signature_url],
          ["hod", college.hod_signature_url],
          ["stamp", college.university_stamp_url]
        ].map(async ([key, url]) => {
          if (!url) return { key, img: null };
          const img = await fetchImageBytes(url as string);
          return { key, img };
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

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const MARGIN = 30;

    let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let curY = PAGE_H - MARGIN;

    const drawHeader = (p: PDFPage, y: number, isFirst: boolean) => {
      if (!isFirst) return y; // Only show header on the first page as requested

      let currentY = y;
      if (bannerImg) {
        const BANNER_H = 75;
        p.drawImage(bannerImg, { x: MARGIN, y: currentY - BANNER_H, width: PAGE_W - MARGIN * 2, height: BANNER_H });
        currentY -= (BANNER_H + 15);
      } else {
        drawText(p, (college.name || "COLLEGE GADGET SHEET").toUpperCase(), MARGIN, currentY, boldFont, 14);
        currentY -= 20;
      }

      const dept = (upload?.department || department || "").toUpperCase();
      const sem = (upload?.semester || "").toUpperCase();
      const suffix = (upload?.title_suffix || "").toUpperCase();
      const titleStr = `GADGET SHEET / MARKS DISPLAY ${dept} ${sem} ${suffix}`.replace(/\s+/g, " ").trim();
      
      const session = (upload?.exam_name || "").toUpperCase();
      const hod = (upload?.hod_name || "").toUpperCase();
      const examTypeName = (exam_type || "Regular").toUpperCase();
      const subTitleStr = `${examTypeName} Examination Held in ${session} | Department: ${dept} | HOD: ${hod}`;
      
      drawText(p, titleStr, MARGIN, currentY, boldFont, 11);
      drawText(p, subTitleStr, MARGIN, currentY - 18, regFont, 9);
      return currentY - 45;
    };

    curY = drawHeader(page, curY, true);

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

    for (const s of students) {
      const blockH = 80 + (s.subjects.length * 12);
      if (curY - blockH < MARGIN) {
        page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        curY = PAGE_H - MARGIN;
        curY = drawHeader(page, curY, false);
      }

      // Student Header
      drawRect(page, MARGIN, curY - 18, PAGE_W - MARGIN * 2, 18, rgb(0.96, 0.96, 0.96));
      drawText(page, `Roll No: ${s.roll_number}`, MARGIN + 8, curY - 12, boldFont, 8);
      drawText(page, `Enrollment No: ${s.enrollment_no || s.ern || "–"}`, MARGIN + 85, curY - 12, boldFont, 8);
      drawText(page, `Univ Seat No: ${s.university_exam_seat_no || "–"}`, MARGIN + 210, curY - 12, boldFont, 8);
      drawText(page, `Gender: ${s.gender ? s.gender.charAt(0).toUpperCase() : "–"}`, MARGIN + 325, curY - 12, boldFont, 8);
      drawText(page, `Name: ${s.student_name}`, MARGIN + 380, curY - 12, boldFont, 8);
      curY -= 18;

      // Table Header
      drawRect(page, MARGIN, curY - 14, PAGE_W - MARGIN * 2, 14, COL_DARK);
      let tx = MARGIN + 4;
      const headers = ["Code", "Subject Name", "Int", "Theo", "Over", "Max", "Gr", "GP", "Cr", "Earn"];
      const hKeys = ["code", "title", "int", "theo", "over", "max", "gr", "gp", "cr", "earn"];
      headers.forEach((h, i) => {
        drawText(page, h, tx, curY - 10, boldFont, 6.5, COL_WHITE);
        tx += colW[hKeys[i] as keyof typeof colW];
      });
      curY -= 14;

      // Subjects
      for (const sub of s.subjects) {
        drawRect(page, MARGIN, curY - 12, PAGE_W - MARGIN * 2, 12, COL_WHITE, true);
        let rx = MARGIN + 4;
        const ry = curY - 9;
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

        const sCode = (sub.subject_code || "–").slice(0, 10);
        drawText(page, sCode, rx, ry, regFont, size); rx += colW.code;
        drawText(page, (sub.subject_name.length > 68 ? sub.subject_name.slice(0, 65) + "..." : sub.subject_name), rx, ry, regFont, size); rx += colW.title;

        // Components
        drawText(page, String(int), rx + 2, ry, regFont, size); rx += colW.int;
        drawText(page, String(theo), rx + 2, ry, regFont, size); rx += colW.theo;

        const markColor = sub.is_pass ? BLACK : COL_FAIL;
        drawText(page, String(over), rx + 2, ry, boldFont, size, markColor); rx += colW.over;
        drawText(page, String(sub.max_marks || 100), rx + 2, ry, regFont, size); rx += colW.max;
        drawText(page, displayGrade, rx + 2, ry, boldFont, size); rx += colW.gr;
        drawText(page, String(sub.gp || 0), rx + 2, ry, regFont, size); rx += colW.gp;
        drawText(page, String(credits), rx + 2, ry, regFont, size); rx += colW.cr;
        drawText(page, String(earn), rx + 2, ry, regFont, size);

        curY -= 12;
      }

      // Summary Footer
      const resVal = String(s.result || "PASS").replace(/\s+/g, "").split("").join("  ");
      const footerY = curY - 18;
      drawText(page, `Total: (${s.obtained_marks})`, MARGIN + 8, footerY, boldFont, 8);
      drawText(page, `Result: ${resVal}`, MARGIN + 80, footerY, boldFont, 8);
      drawText(page, "|", MARGIN + 180, footerY, regFont, 8);
      drawText(page, `EC: ${s.ec || "–"}`, MARGIN + 200, footerY, boldFont, 8);
      drawText(page, `ECG: ${s.ecg || "–"}`, MARGIN + 260, footerY, boldFont, 8);
      drawText(page, `SGPI: ${s.sgpi || "–"}`, MARGIN + 330, footerY, boldFont, 8);
      drawText(page, `CGPA: ${s.cgpa?.toFixed(2) || "–"}`, MARGIN + 410, footerY, boldFont, 8);
      
      curY -= 35; // Space between students
    }

    // Final Signatures
    if (curY < 150) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      curY = PAGE_H - MARGIN;
    }

    const SIG_W = 100;
    const SIG_H = 40;
    const sigY = curY - 50;

    if (signatureImages.hod) {
      page.drawImage(signatureImages.hod, { x: MARGIN + 140, y: sigY, width: SIG_W, height: SIG_H });
    }
    if (signatureImages.stamp) {
      page.drawImage(signatureImages.stamp, { x: MARGIN, y: sigY, width: 70, height: 70, opacity: 0.6 });
    }
    if (signatureImages.principal) {
      page.drawImage(signatureImages.principal, { x: PAGE_W - MARGIN - SIG_W, y: sigY, width: SIG_W, height: SIG_H });
    }

    drawText(page, "Checked by", MARGIN, sigY - 15, boldFont, 9);
    drawText(page, "Controller of Examinations", MARGIN + 140, sigY - 15, boldFont, 9);
    drawText(page, "Principal", PAGE_W - MARGIN - 60, sigY - 15, boldFont, 9);

    const pdfBytes = await pdfDoc.save();
    return new NextResponse(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="gadget-sheet-${Date.now()}.pdf"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

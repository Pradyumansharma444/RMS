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
  is_cc?: boolean;
}

interface StudentMark {
  id: string;
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

// Module-level image cache — persists across requests in the same serverless instance
const imageCache = new Map<string, { bytes: ArrayBuffer; mime: string } | null>();

async function fetchImageBytes(url: string): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  if (imageCache.has(url)) return imageCache.get(url)!;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) { imageCache.set(url, null); return null; }
    const result = { bytes: await res.arrayBuffer(), mime: res.headers.get("content-type") || "image/jpeg" };
    imageCache.set(url, result);
    return result;
  } catch {
    imageCache.set(url, null);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { uid, upload_id, department, year, exam_type, bust_cache } = await req.json();
    if (!uid || !upload_id) return NextResponse.json({ error: "uid and upload_id required" }, { status: 400 });

    // Fetch college + upload in parallel
    const [{ data: college }, { data: upload }] = await Promise.all([
      supabaseAdmin.from("colleges").select("*").eq("firebase_uid", uid).single(),
      supabaseAdmin.from("marks_uploads").select("*").eq("id", upload_id).single(),
    ]);
    if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

    // Return cached PDF if available and bust_cache is not requested
    if (!bust_cache && upload?.pdf_url) {
      try {
        const cached = await fetch(upload.pdf_url, { cache: "force-cache" });
        if (cached.ok) {
          const bytes = await cached.arrayBuffer();
          return new NextResponse(bytes, {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `inline; filename="gadget-sheet.pdf"`,
              "Content-Length": String(bytes.byteLength),
              "X-Cache": "HIT",
            },
          });
        }
      } catch { /* cache miss — regenerate */ }
    }

    // Build marks query
    let query = supabaseAdmin
      .from("student_marks")
      .select("id,roll_number,student_name,department,year,division,ern,enrollment_no,abc_id,university_exam_seat_no,gender,subjects,total_marks,obtained_marks,percentage,result,cgpa,ec,ecg,sgpi")
      .eq("college_id", college.id)
      .eq("upload_id", upload_id)
      .order("roll_number", { ascending: true });

    if (department && department !== "All Departments") query = query.eq("department", department);

    // Run marks fetch + image fetches + grace_marks fetch fully in parallel
    const imageKeys = ["banner", "principal", "hod", "stamp"] as const;
    const imageUrls = [
      college.banner_url,
      college.principal_signature_url,
      college.hod_signature_url,
      college.university_stamp_url,
    ];

    const [{ data: marksData, error }, graceRes, ...rawImgResults] = await Promise.all([
      query,
      supabaseAdmin.from("grace_marks").select("mark_id,subject_name,original_marks,grace_given,final_marks").eq("college_id", college.id),
      ...imageUrls.map(url => url ? fetchImageBytes(url) : Promise.resolve(null)),
    ]);

    // Build grace lookup: mark_id|subject_name → { int_grace, ext_grace, total_grace }
    // original_marks = grace on internal component, grace_given = grace on external component
    // When engine applies grace it puts everything into ext_grace (grace_given).
    // When manual apply route is used it may split across int/ext.
    // total_grace (final_marks) is the authoritative sum — use it as fallback.
    type GraceLookup = { int_grace: number; ext_grace: number; total_grace: number };
    const graceLookup = new Map<string, GraceLookup>();
    for (const g of (graceRes.data || [])) {
      const key = `${g.mark_id}|${(g.subject_name || "").trim().toLowerCase()}`;
      const intG = Number(g.original_marks) || 0;
      const extG = Number(g.grace_given) || 0;
      const totalG = Number(g.final_marks) || (intG + extG);
      graceLookup.set(key, { int_grace: intG, ext_grace: extG, total_grace: totalG });
    }

    if (error || !marksData?.length) return NextResponse.json({ error: "No marks data found" }, { status: 404 });

    // Filter out template/header rows that may have been saved to DB
    const isTemplateRow = (s: any) => {
      const name = (s.student_name ?? "").toLowerCase();
      const roll = (s.roll_number ?? "").toLowerCase();
      return (
        name.includes("full name of the students") ||
        (name.includes("surname") && name.includes("mothers name")) ||
        name.includes("name of the students") ||
        roll.includes("roll number") ||
        roll.includes("enrollment") ||
        roll.includes("external") ||
        roll === "sr no" || roll === "sr." || roll === "no."
      );
    };
    const students = (marksData as StudentMark[]).filter(s => !isTemplateRow(s));
    const pdfDoc = await PDFDocument.create();
    let boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    let regFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Embed images from parallel fetch results
    const [bannerImgData, ...sigRawArr] = rawImgResults;
    const sigResults = imageKeys.slice(1).map((key, i) => ({ key, img: sigRawArr[i] }));

      // Embed Banner + Signatures in parallel
      const [bannerImg, ...sigImgArr] = await Promise.all([
        (async () => {
          if (!bannerImgData) return null;
          try {
            return bannerImgData.mime.includes("png")
              ? await pdfDoc.embedPng(bannerImgData.bytes)
              : await pdfDoc.embedJpg(bannerImgData.bytes);
          } catch { return null; }
        })(),
        ...sigResults.map(async (r) => {
          if (!r.img) return { key: r.key, img: null };
          try {
            const img = r.img.mime.includes("png")
              ? await pdfDoc.embedPng(r.img.bytes)
              : await pdfDoc.embedJpg(r.img.bytes);
            return { key: r.key, img };
          } catch { return { key: r.key, img: null }; }
        }),
      ]);

      const signatureImages: any = {};
      for (const r of sigImgArr as { key: string; img: any }[]) {
        if (r.img) signatureImages[r.key] = r.img;
      }

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const MARGIN = 30;

    // ── Layout constants ──────────────────────────────────────────────────────
    const STUDENTS_FIRST_PAGE = 3;  // 3 students on page 1 (banner takes space)
    const STUDENTS_PER_PAGE   = 4;  // 4 students on all subsequent pages
    const HDR_H_BASE     = 18;
    const COL_HDR_H_BASE = 14;
    const FOOTER_H_BASE  = 18;
    const GAP_H_BASE     = 6;
    const SIG_RESERVE    = 90;

    // First-page usable height (after header/banner)
    const BANNER_H_EST = bannerImg ? (75 + 15 + 45) : (20 + 45);
    const firstPageUsable = PAGE_H - MARGIN * 2 - BANNER_H_EST;
    const otherPageUsable = PAGE_H - MARGIN * 2;

    // Group students: first page gets 3, remaining pages get 4
    const pages: StudentMark[][] = [];
    if (students.length > 0) {
      pages.push(students.slice(0, STUDENTS_FIRST_PAGE));
      for (let i = STUDENTS_FIRST_PAGE; i < students.length; i += STUDENTS_PER_PAGE) {
        pages.push(students.slice(i, i + STUDENTS_PER_PAGE));
      }
    }

    // For each page group, compute a shared ROW_H that makes all 4 students fit
    function computeScaledRowH(group: StudentMark[], usableH: number): {
      HDR_H: number; COL_HDR_H: number; ROW_H: number; FOOTER_H: number; GAP_H: number;
    } {
      const maxSubjCount = Math.max(...group.map(s => s.subjects.length), 1);
      const n = group.length;
      // Fixed overhead per student (not subject rows)
      const fixedPerStudent = HDR_H_BASE + COL_HDR_H_BASE + FOOTER_H_BASE + GAP_H_BASE;
      const totalFixed = fixedPerStudent * n;
      const availableForRows = usableH - totalFixed - SIG_RESERVE;
      const totalRowSlots = group.reduce((acc, s) => acc + s.subjects.length, 0);
      // Each student uses maxSubjCount row slots for consistent row heights
      const totalRowSlotsUniform = maxSubjCount * n;
      // Compute ROW_H that fills the space using uniform slot count
      const rowH = Math.max(7, Math.min(12, Math.floor(availableForRows / Math.max(totalRowSlotsUniform, 1))));
      return { HDR_H: HDR_H_BASE, COL_HDR_H: COL_HDR_H_BASE, ROW_H: rowH, FOOTER_H: FOOTER_H_BASE, GAP_H: GAP_H_BASE };
    }

    // Dummy values — overridden per-page
    const HDR_H = HDR_H_BASE;
    const COL_HDR_H = COL_HDR_H_BASE;
    const FOOTER_H = FOOTER_H_BASE;
    const GAP_H = GAP_H_BASE;

    let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let curY = PAGE_H - MARGIN;

    const drawHeader = (p: PDFPage, y: number, isFirst: boolean) => {
      if (!isFirst) return y;

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

    // Fill page white first so no black areas show, then draw header on top
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(1,1,1) });
    curY = PAGE_H - MARGIN;
    curY = drawHeader(page, curY, true);

    // Column widths (total ≈ 507pt within 535pt content area, ~28pt right padding)
    const colW = {
      code:  40,
      title: 220,
      int:   38,
      theo:  38,
      over:  38,
      max:   30,
      gr:    28,
      gp:    26,
      cr:    24,
      earn:  25,
    };

    // ── Render page by page, 4 students per page ──────────────────────────────
    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const group = pages[pageIdx];
      const isFirst = pageIdx === 0;
      const usableH = isFirst ? firstPageUsable : otherPageUsable;
      const { ROW_H: scaledROW_H } = computeScaledRowH(group, usableH);

      if (pageIdx > 0) {
        page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        // Fill page white to prevent black areas
        page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(1,1,1) });
        curY = PAGE_H - MARGIN;
        curY = drawHeader(page, curY, false);
      }

    for (const s of group) {
      // Student Header — Roll No left | Enrollment center | Name right (dynamic)
      const HDR_SIZE = 8;
      const contentW = PAGE_W - MARGIN * 2;

      drawRect(page, MARGIN, curY - HDR_H, contentW, HDR_H, rgb(0.96, 0.96, 0.96));

      // Left: Roll No
      const rollText = `Roll No: ${s.roll_number}`;
      drawText(page, rollText, MARGIN + 5, curY - 12, boldFont, HDR_SIZE);

      // Center: Enrollment No
      const enrollText = `Enrollment: ${s.enrollment_no || s.ern || "–"}`;
      const enrollW = getTextWidth(enrollText, boldFont, HDR_SIZE);
      const enrollX = MARGIN + (contentW - enrollW) / 2;
      drawText(page, enrollText, enrollX, curY - 12, boldFont, HDR_SIZE);

      // Right: Name (truncated to fit, aligned to right edge) — binary search for speed
      const maxNameW = contentW * 0.35;
      let nameStr = s.student_name;
      if (getTextWidth(`Name: ${nameStr}`, boldFont, HDR_SIZE) > maxNameW) {
        let lo = 0, hi = nameStr.length;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (getTextWidth(`Name: ${nameStr.slice(0, mid)}…`, boldFont, HDR_SIZE) <= maxNameW) lo = mid;
          else hi = mid - 1;
        }
        nameStr = nameStr.slice(0, lo);
      }
      const nameText = `Name: ${nameStr}${nameStr !== s.student_name ? "…" : ""}`;
      const nameW = getTextWidth(nameText, boldFont, HDR_SIZE);
      drawText(page, nameText, MARGIN + contentW - nameW - 5, curY - 12, boldFont, HDR_SIZE);

      curY -= HDR_H;

      // Table Header
      drawRect(page, MARGIN, curY - 14, PAGE_W - MARGIN * 2, 14, COL_DARK);
      let tx = MARGIN + 4;
      const headers = ["Code", "Subject Name", "Int", "Ext", "Over", "Max", "Gr", "GP", "Cr", "Earn"];
      const hKeys = ["code", "title", "int", "theo", "over", "max", "gr", "gp", "cr", "earn"];
      headers.forEach((h, i) => {
        drawText(page, h, tx, curY - 10, boldFont, 6.5, COL_WHITE);
        tx += colW[hKeys[i] as keyof typeof colW];
      });
      curY -= 14;

      // Subjects — track ABS/fail live during rendering
      let studentHasAbsOrFail = false;
      // Track totals for computing percentage
      let totalObtainedForFooter = 0;
      let totalMaxForFooter = 0;

      for (const sub of s.subjects) {
        let rx = MARGIN + 4;
        const size = 6.5;

        const over = sub.obtained_marks ?? 0;
        const intNum = typeof sub.int_marks === "number" ? sub.int_marks : 0;
        const pracNum = typeof sub.prac_marks === "number" ? sub.prac_marks : 0;
        const derivedExt = over - intNum - pracNum;
        const canUseDerivedExt = sub.theo_marks == null && Number.isFinite(derivedExt) && derivedExt >= 0 && (sub.int_marks != null || sub.prac_marks != null);
        const extNum = sub.theo_marks != null ? sub.theo_marks : (canUseDerivedExt ? derivedExt : (sub.prac_marks != null ? sub.prac_marks : 0));

        // ── isCC must be declared FIRST before any logic that uses it ──────────
        const isCC = sub.is_cc || sub.subject_code === "CC Subject";

        // Check if grace was applied to this subject
        const graceKey = `${s.id}|${sub.subject_name.trim().toLowerCase()}`;
        const graceEntry = graceLookup.get(graceKey);
        const intGrace   = graceEntry?.int_grace   ?? 0;
        const extGrace   = graceEntry?.ext_grace   ?? 0;
        const totalGrace = graceEntry?.total_grace ?? (intGrace + extGrace);

        // ── Grace marks display format ───────────────────────────────────────
        // Grace is already baked into DB marks. Show as "original+@grace" e.g. "7+@1".
        //
        // The engine puts all grace into ext_grace (grace_given column).
        // The apply route may split across int/ext.
        //
        // For Int column: show grace only if intGrace > 0
        // For Ext column: show grace only if extGrace > 0
        // For Overall:    always show totalGrace when > 0, regardless of which head it's on

        // Internal marks display
        const int = sub.int_marks != null
          ? (intGrace > 0 ? `${intNum - intGrace}+@${intGrace}` : String(intNum))
          : "-";

        // External marks display
        const ext = sub.theo_marks != null || canUseDerivedExt || sub.prac_marks != null
          ? (extGrace > 0 ? `${extNum - extGrace}+@${extGrace}` : String(extNum))
          : "-";

        // Overall: always show +@ when any grace was applied (even if split across heads)
        const overDisplay = totalGrace > 0 ? `${over - totalGrace}+@${totalGrace}` : String(over);

        const credits = sub.credits ?? 2;
        const earn = sub.earned_credits ?? (sub.is_pass ? credits : 0);

        // Correct max_marks: if stored max is less than the sum of components, use the sum
        const componentSum = (sub.int_marks ?? 0) + (sub.theo_marks ?? 0) + (sub.prac_marks ?? 0);
        const displayMax = (sub.max_marks && sub.max_marks >= componentSum && sub.max_marks > 0)
          ? sub.max_marks
          : (componentSum > 0 ? componentSum : (sub.max_marks || 50));

        // Accumulate for footer percentage calculation
        totalObtainedForFooter += over;
        totalMaxForFooter += displayMax;

        // ABS detection: grade says ABS/@ABS, or external marks = 0 (student absent)
        const isExtZero = sub.theo_marks !== null && sub.theo_marks !== undefined && sub.theo_marks === 0;
        const storedGradeUp = String(sub.grade ?? "").toUpperCase().trim();
        const isAbsByGrade = ["AB", "ABS", "ABSENT"].includes(storedGradeUp) || /@ABS/i.test(storedGradeUp);
        const isAbsent = isAbsByGrade || isExtZero;

        // ── PHASE 1B: Strict per-head 40% PASS/FAIL logic ───────────────────
        // For two-head subjects (int + ext): BOTH heads must independently reach 40%.
        // Use the actual subject's stored max_int / max_ext if available, otherwise
        // derive from the known 40/60 split of displayMax.
        let isForcedFail = false;

        if (!isAbsent && !isCC) {
          const hasInt = sub.int_marks != null && sub.int_marks !== undefined;
          const hasExt = sub.theo_marks != null && sub.theo_marks !== undefined;

          if (hasInt && hasExt) {
            // Two-head subject: use stored max_int / max_ext when available.
            // Fallback: standard Mumbai University 40/60 split of displayMax.
            const totalMax = displayMax || 50;
            let maxInt: number, maxExt: number;
            // @ts-ignore — max_int / max_ext may be stored on subject objects from the engine
            const storedMaxInt = (sub as any).max_int;
            // @ts-ignore
            const storedMaxExt = (sub as any).max_ext ?? (sub as any).max_theo;
            if (storedMaxInt > 0 && storedMaxExt > 0) {
              maxInt = storedMaxInt;
              maxExt = storedMaxExt;
            } else {
              // Standard 40/60 split — do NOT use student's own marks as the denominator
              maxInt = Math.round(totalMax * 0.4);
              maxExt = totalMax - maxInt;
            }
            const intPassMark = Math.ceil(maxInt * 0.4);
            const extPassMark = Math.ceil(maxExt * 0.4);
            // If either head fails independently → FAIL
            if (intNum < intPassMark || extNum < extPassMark) {
              isForcedFail = true;
            }
          } else if (!hasInt && !hasExt && !sub.prac_marks) {
            // No component breakdown — use total obtained vs 40% of max
            const passTotal = Math.ceil(displayMax * 0.4);
            if (over < passTotal) isForcedFail = true;
          } else {
            // Single-head (only int or only ext/prac)
            const passTotal = Math.ceil(displayMax * 0.4);
            if (over < passTotal) isForcedFail = true;
          }
        }

        // If is_pass is explicitly false and grace wasn't applied → still FAIL
        const gracedThisSubject = totalGrace > 0;
        if (!isAbsent && !isCC && sub.is_pass === false && !gracedThisSubject) {
          isForcedFail = true;
        }

        // Determine displayed grade:
        // - ABS: always "ABS"
        // - CC subject: show stored grade (pass by default)
        // - Forced fail: "F"
        // - Otherwise: stored grade with grace symbols stripped (they show in marks columns)
        let displayGrade: string;
        if (isAbsent) {
          displayGrade = "ABS";
        } else if (isCC) {
          // CC subject always shows grade as stored (never forced-fail)
          displayGrade = String(sub.grade || "-").replace(/[*@#★]+$/, "").trim() || "-";
        } else if (isForcedFail) {
          displayGrade = "F";
        } else {
          // Strip grace suffix symbols (* @ # ★) — grace notation is in marks columns via +@
          displayGrade = String(sub.grade || "-").replace(/[*@#★]+$/, "").trim() || "-";
          // Sanity: if stored grade is explicitly F and no grace applied, keep F
          if (displayGrade === "F" && !gracedThisSubject) isForcedFail = true;
        }

        // Track whether this student should get SGPI/CGPA:
        // ABS, forced fail, explicit fail grade, or not passed → no SGPI/CGPA
        if (isAbsent || isForcedFail || displayGrade === "F") {
          studentHasAbsOrFail = true;
        }
        const displayCode = isCC ? "CC Subj" : (sub.subject_code || "–").slice(0, 10);

        // Subject name — single line, truncated to fit column width (no wrapping)
        const maxSubjW = colW.title - 4;
        let subjDisplay = sub.subject_name;
        if (getTextWidth(subjDisplay, regFont, size) > maxSubjW) {
          let lo = 0, hi = subjDisplay.length;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (getTextWidth(subjDisplay.slice(0, mid) + "…", regFont, size) <= maxSubjW) lo = mid;
            else hi = mid - 1;
          }
          subjDisplay = subjDisplay.slice(0, lo) + "…";
        }
        drawRect(page, MARGIN, curY - scaledROW_H, PAGE_W - MARGIN * 2, scaledROW_H, COL_WHITE, true);
        const ry = curY - Math.max(4, scaledROW_H - 3);

        drawText(page, displayCode, rx, ry, regFont, size); rx += colW.code;
        drawText(page, subjDisplay, rx, ry, regFont, size);
        rx += colW.title;

        // ── PHASE 2A: Marks columns — grace shown in green ───────────────────
        const intColor = intGrace > 0 ? rgb(0.1, 0.4, 0.1) : BLACK;
        const extColor = extGrace > 0 ? rgb(0.1, 0.4, 0.1) : BLACK;
        drawText(page, int, rx + 1, ry, regFont, size, intColor); rx += colW.int;
        drawText(page, ext, rx + 1, ry, regFont, size, extColor); rx += colW.theo;

        const markColor = (displayGrade === "F" && !isAbsent) ? COL_FAIL : (totalGrace > 0 ? rgb(0.1, 0.4, 0.1) : BLACK);
        drawText(page, overDisplay, rx + 1, ry, boldFont, size, markColor); rx += colW.over;
        drawText(page, String(displayMax), rx + 1, ry, regFont, size); rx += colW.max;

        // Grade column: clean grade (no * or @ suffix) — fail in red
        const gradeColor = displayGrade === "F" ? COL_FAIL : BLACK;
        drawText(page, displayGrade, rx + 1, ry, boldFont, size, gradeColor); rx += colW.gr;

        drawText(page, isAbsent ? "0" : String(sub.gp || 0), rx + 1, ry, regFont, size); rx += colW.gp;
        drawText(page, String(credits), rx + 1, ry, regFont, size); rx += colW.cr;
        drawText(page, isAbsent ? "0" : String(earn), rx + 1, ry, regFont, size);

        curY -= scaledROW_H;
      }

      // O.229: Check if student has CC participation — add 0.1 GPA bonus to SGPI
      const hasCCParticipation = s.subjects.some(sub =>
        (sub.is_cc || sub.subject_code === "CC Subject" || /NSS|NCC|DLLE|CULTURAL/i.test(sub.subject_name)) &&
        (sub.obtained_marks > 0 || sub.is_pass)
      );

      // ── PHASE 2B: Single-line Footer ─────────────────────────────────────
      // Layout (one line):
      //   Total:(XXX)  Result: P A S S  Pct: 70.36%  EC: 22  ECG: 172  SGPI: 8.02  CGPA: 8.02
      //
      // If student FAILS: omit Pct / EC / ECG / SGPI / CGPA

      // Re-evaluate pass/fail from live per-subject data (overrides DB result field)
      const studentFullyPassed = !studentHasAbsOrFail;

      // Compute formatted result string
      const resultLabel = studentFullyPassed ? "P A S S" : "F A I L";
      const resultColor = studentFullyPassed ? BLACK : COL_FAIL;

      // Calculate percentage from actual accumulated totals
      const computedPct = totalMaxForFooter > 0
        ? ((totalObtainedForFooter / totalMaxForFooter) * 100).toFixed(2)
        : "–";

      // Footer text sits 5pt above the bottom of the footer rect
      const footerY = curY - (FOOTER_H - 5);

      // Draw footer background
      drawRect(page, MARGIN, curY - FOOTER_H, PAGE_W - MARGIN * 2, FOOTER_H, rgb(0.94, 0.94, 0.94));

      // Total
      let fx = MARGIN + 5;
      drawText(page, `Total: (${s.obtained_marks})`, fx, footerY, boldFont, 7.5);
      fx += 80;

      // Result
      drawText(page, "Result: ", fx, footerY, boldFont, 7.5);
      fx += getTextWidth("Result: ", boldFont, 7.5);
      drawText(page, resultLabel, fx, footerY, boldFont, 7.5, resultColor);
      fx += getTextWidth(resultLabel, boldFont, 7.5) + 12;

      if (studentFullyPassed) {
        // Percentage
        drawText(page, `Percentage: ${computedPct}%`, fx, footerY, boldFont, 7.5);
        fx += 90;

        // EC / ECG
        drawText(page, `EC: ${s.ec ?? "–"}`, fx, footerY, boldFont, 7.5);
        fx += 42;
        drawText(page, `ECG: ${s.ecg ?? "–"}`, fx, footerY, boldFont, 7.5);
        fx += 52;

        // SGPI / CGPA — only for fully passing students, with O.229 bonus
        let baseSGPI = (typeof s.sgpi === "number" && Number.isFinite(s.sgpi)) ? Math.max(0, Math.min(10, s.sgpi)) : null;
        let baseCGPA = (typeof s.cgpa === "number" && Number.isFinite(s.cgpa)) ? Math.max(0, Math.min(10, s.cgpa)) : null;
        if (hasCCParticipation) {
          if (baseSGPI !== null) baseSGPI = Math.min(10, baseSGPI + 0.1);
          if (baseCGPA !== null) baseCGPA = Math.min(10, baseCGPA + 0.1);
        }
        drawText(page, `SGPI: ${baseSGPI !== null ? baseSGPI.toFixed(2) : "–"}`, fx, footerY, boldFont, 7.5);
        fx += 60;
        drawText(page, `CGPA: ${baseCGPA !== null ? baseCGPA.toFixed(2) : "–"}`, fx, footerY, boldFont, 7.5);
      }

      curY -= FOOTER_H; // move past footer
      curY -= GAP_H;    // gap before next student block
    }
    } // end page group loop

    // Final Signatures — placed immediately after last student with fixed padding
    const SIG_W = 100;
    const SIG_H = 40;
    const STAMP_SIZE = 70;

    const SIG_BLOCK_H = STAMP_SIZE + 18;
    if (curY - SIG_BLOCK_H < MARGIN) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      curY = PAGE_H - MARGIN;
    }

    // Place signatures 20pt below last content, with stamp top-aligned to sigTopY
    const sigTopY = curY - 20;

    // College Stamp — left, top-aligned at sigTopY
    if (signatureImages.stamp) {
      page.drawImage(signatureImages.stamp, { x: MARGIN, y: sigTopY - STAMP_SIZE, width: STAMP_SIZE, height: STAMP_SIZE, opacity: 0.85 });
    }

    // Principal Signature — right, center-aligned vertically with stamp
    if (signatureImages.principal) {
      const sigOffsetY = sigTopY - STAMP_SIZE / 2 - SIG_H / 2;
      page.drawImage(signatureImages.principal, { x: PAGE_W - MARGIN - SIG_W, y: sigOffsetY, width: SIG_W, height: SIG_H });
    }

    // Labels — "College Stamp" left, "Principal" right — immediately below their images
    const labelY = sigTopY - STAMP_SIZE - 10;
    drawText(page, "College Stamp", MARGIN, labelY, boldFont, 9);
    drawText(page, "Principal", PAGE_W - MARGIN - getTextWidth("Principal", boldFont, 9), labelY, boldFont, 9);

    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });

    // Fire-and-forget: cache to Supabase Storage in the background so the client
    // receives the PDF immediately without waiting for the upload to complete.
    (async () => {
      try {
        const storagePath = `${college.id}/gadget_sheet_${upload_id}.pdf`;
        const { error: uploadErr } = await supabaseAdmin.storage
          .from("generated-pdfs")
          .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });
        if (!uploadErr) {
          const { data: urlData } = supabaseAdmin.storage.from("generated-pdfs").getPublicUrl(storagePath);
          if (urlData?.publicUrl) {
            await supabaseAdmin.from("marks_uploads").update({ pdf_url: urlData.publicUrl }).eq("id", upload_id);
          }
        }
      } catch { /* non-fatal */ }
    })();

    return new NextResponse(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="gadget-sheet-${Date.now()}.pdf"`,
        "Content-Length": String(pdfBytes.byteLength),
        "Cache-Control": "no-store",
        "X-Cache": "MISS",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

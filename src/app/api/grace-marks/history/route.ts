import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid");

  if (!uid) {
    return NextResponse.json({ error: "uid required" }, { status: 400 });
  }

  const { data: college } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("firebase_uid", uid)
    .single();

  if (!college) {
    return NextResponse.json({ error: "College not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("grace_marks")
    .select("id, student_id, mark_id, subject_name, original_marks, grace_given, final_marks, created_at, college_id")
    .eq("college_id", college.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ history: [] });
  }

  // ── Join via mark_id → student_marks.id ──────────────────────────────────
  const markIds = [...new Set(data.map((h: any) => h.mark_id).filter(Boolean))];
  const { data: markByIdData, error: markByIdError } = markIds.length > 0
    ? await supabaseAdmin
        .from("student_marks")
        .select("id, student_id, student_name, roll_number, department, year, result, subjects")
        .in("id", markIds)
    : { data: [], error: null };

  if (markByIdError) {
    console.error("student_marks join error:", markByIdError.message);
  }

  const markByIdMap = new Map((markByIdData || []).map((m: any) => [m.id, m]));

  // Helper: normalise result string → "PASS" | "FAIL" | original
  function normaliseResult(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const clean = raw.replace(/\s+/g, "").toUpperCase();
    if (clean === "PASS") return "PASS";
    if (clean === "FAIL") return "FAIL";
    return raw.trim() || null;
  }

  // Parse year string like "SY - Semester 2" into { yearLabel, semester }
  function parseYearSemester(raw: string | null): { yearLabel: string | null; semester: string | null } {
    if (!raw) return { yearLabel: null, semester: null };
    const m = raw.match(/^(FY|SY|TY|1|2|3)[^0-9]*(\d+)?/i);
    if (m) {
      const yl = m[1].toUpperCase();
      const yearLabel = yl === "1" ? "FY" : yl === "2" ? "SY" : yl === "3" ? "TY" : yl;
      const semester = m[2] || null;
      return { yearLabel, semester };
    }
    return { yearLabel: raw.trim(), semester: null };
  }

  // Derive ordinance type from grade suffix stored in subject
  function deriveOrdinanceType(grade: string | null | undefined, graceGiven: number): string {
    const g = String(grade ?? "").trim();
    if (g.endsWith("*")) return "O.5042-A";
    if (g.endsWith("@")) return "O.5045-A";
    if (graceGiven > 0) return "O.5042-A"; // default for manual grace
    return "O.5042-A";
  }

  const enriched = data.map((h: any) => {
    const markRecord = markByIdMap.get(h.mark_id) || null;

    const subjects: any[] = markRecord?.subjects || [];
    const matchedSubject = subjects.find(
      (s: any) =>
        (s.subject_name || "").trim().toLowerCase() ===
        (h.subject_name || "").trim().toLowerCase()
    );

    const { yearLabel, semester } = parseYearSemester(markRecord?.year || null);

    // Determine actual before-grace marks for INT and EXT:
    // original_marks = INT grace amount stored, grace_given = EXT grace amount stored
    // The current marks in subjects array are AFTER grace was applied.
    // So before_int = int_marks - original_marks (grace on internal)
    // before_ext = ext_marks (theo_marks) - grace_given (grace on external)
    const intGrace = h.original_marks ?? 0;  // grace applied to internal
    const extGrace = h.grace_given ?? 0;     // grace applied to external

    const currentInt = matchedSubject?.int_marks ?? null;
    const currentExt = matchedSubject?.theo_marks ?? null;

    const beforeInt = currentInt !== null ? Math.max(0, currentInt - intGrace) : null;
    const beforeExt = currentExt !== null ? Math.max(0, currentExt - extGrace) : null;

    const ordinanceType = deriveOrdinanceType(matchedSubject?.grade, h.final_marks ?? 0);

    return {
      ...h,
      student_name: markRecord?.student_name || null,
      roll_number: markRecord?.roll_number || null,
      department: markRecord?.department || null,
      course: markRecord?.department || null,
      year: yearLabel,
      semester: semester,
      result: normaliseResult(markRecord?.result || null),
      // Before-grace marks
      before_int: beforeInt,
      before_ext: beforeExt,
      // Grace amounts per component
      grace_int: intGrace,
      grace_ext: extGrace,
      grace_total: intGrace + extGrace,
      // Current marks (after grace)
      int_marks: currentInt,
      ext_marks: currentExt,
      // Ordinance type derived
      ordinance_type: ordinanceType,
    };
  });

  return NextResponse.json({ history: enriched }, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
  });
}

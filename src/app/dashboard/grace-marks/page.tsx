"use client";

import { useAuth } from "@/lib/auth-context";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Zap,
  Search,
  Loader2,
  AlertCircle,
  Info,
  Users,
  Filter,
  GraduationCap,
  FileText,
  Eye,
  Plus,
  History,
  LayoutGrid,
  Calendar,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Subject {
  subject_name: string;
  subject_code: string;
}

interface Upload {
  id: string;
  exam_name: string;
  department: string;
  year: string;
  file_name: string;
}

interface EligibleStudent {
  id: string; // From student_marks
  roll_number: string;
  student_name: string;
  department: string;
  year: string;
  percentage: number;
  cgpa: number;
  result: string;
  subjects: any[]; 
}

interface GraceResult {
  mark_id: string;
  roll_number: string;
  student_name: string;
  department: string;
  year: string;
  subject_name: string;
  subject_code: string;
  int_marks: number;
  ext_marks: number;
  obtained_marks: number;
  max_marks: number;
  passing_marks: number;
  grace_needed: number;
  current_result: string;
  unique_key: string; // combined mark_id and subject_name
}

const isFailedSubject = (sub: any) => {
  // Explicit is_pass boolean (most reliable)
  if (sub?.is_pass === false) return true;
  if (sub?.is_pass === true) return false;
  // Grade-based detection: F, D, AB, FAIL are all failing grades
  const grade = String(sub?.grade ?? "").trim().toUpperCase();
  if (grade === "F" || grade === "D" || grade === "AB" || grade === "FAIL" || grade === "F A I L") return true;
  // Fallback: check obtained vs passing marks
  if (sub?.max_marks && sub?.obtained_marks !== undefined) {
    const passMarks = parseFloat(sub.max_marks) * 0.4;
    if (parseFloat(sub.obtained_marks) < passMarks) return true;
  }
  return false;
};

const compareByHigherMarks = (a: GraceResult, b: GraceResult) => {
  const aCombined = (a.int_marks || 0) + (a.ext_marks || 0);
  const bCombined = (b.int_marks || 0) + (b.ext_marks || 0);
  if (bCombined !== aCombined) return bCombined - aCombined;
  if (b.int_marks !== a.int_marks) return b.int_marks - a.int_marks;
  if (b.ext_marks !== a.ext_marks) return b.ext_marks - a.ext_marks;
  if (b.obtained_marks !== a.obtained_marks) return b.obtained_marks - a.obtained_marks;
  return a.roll_number.localeCompare(b.roll_number);
};

export default function GraceMarksPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [allStudents, setAllStudents] = useState<EligibleStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [isAnalyzed, setIsAnalyzed] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  
  const [selectedUpload, setSelectedUpload] = useState("");
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  
  const [internalGraceLimit, setInternalGraceLimit] = useState("4");
  const [externalGraceLimit, setExternalGraceLimit] = useState("11");
  
  // Amounts to apply when clicking "Apply Grace to Selected" (e.g. 2 internal + 3 external)
  const [applyInternalMarks, setApplyInternalMarks] = useState("");
  const [applyExternalMarks, setApplyExternalMarks] = useState("");
  
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  
  // For individual student view
  const [selectedStudent, setSelectedStudent] = useState<EligibleStudent | null>(null);
  const [manualGrace, setManualGrace] = useState<Record<string, string>>({});
  const [graceConfirmDialog, setGraceConfirmDialog] = useState<{
    students: GraceResult[];
    applyInt: number;
    applyExt: number;
  } | null>(null);

  const [mainTab, setMainTab] = useState("management");
  const [graceHistory, setGraceHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExporting, setHistoryExporting] = useState(false);

  // Pagination
  const GRACE_PAGE_SIZE = 10;
  const [allStudentsPage, setAllStudentsPage] = useState(1);
  const [eligiblePage, setEligiblePage] = useState(1);
  const [ordinancePage, setOrdinancePage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  // Ordinance Rules state
  const [ordinanceIntThreshold, setOrdinanceIntThreshold] = useState("15");
  const [ordinanceExtThreshold, setOrdinanceExtThreshold] = useState("25");
  const [isOrdinanceAnalyzed, setIsOrdinanceAnalyzed] = useState(false);
  const [ordinanceApplyInt, setOrdinanceApplyInt] = useState("");
  const [ordinanceApplyExt, setOrdinanceApplyExt] = useState("");
  const [ordinanceConfirmOpen, setOrdinanceConfirmOpen] = useState(false);
  const [ordinanceConfirmMode, setOrdinanceConfirmMode] = useState<"selected" | "all">("all");
  const [ordinanceSelectedKeys, setOrdinanceSelectedKeys] = useState<Set<string>>(new Set());

  // New ordinance rule-based state
  const [selectedOrdinanceRule, setSelectedOrdinanceRule] = useState<"O.5042-A" | "O.5045-A" | "O.229" | "O.5044-A" | "">("");
  const [ordinanceRuleAnalyzed, setOrdinanceRuleAnalyzed] = useState(false);
  const [ordinanceRuleStudents, setOrdinanceRuleStudents] = useState<GraceResult[]>([]);
  const [ordinanceRuleLoading, setOrdinanceRuleLoading] = useState(false);
  const [ordinanceRuleSearch, setOrdinanceRuleSearch] = useState("");
  const [ordinanceRuleSelectedKeys, setOrdinanceRuleSelectedKeys] = useState<Set<string>>(new Set());
  const [ordinanceRuleExporting, setOrdinanceRuleExporting] = useState(false);
  const [ordinanceRuleApplying, setOrdinanceRuleApplying] = useState(false);
  const [ordinanceRuleApplyConfirm, setOrdinanceRuleApplyConfirm] = useState(false);
  const [graceAppliedBanner, setGraceAppliedBanner] = useState<{ graced: number; o5042: number; o5045: number } | null>(null);

  // History-based ordinance search results (students who already received grace from DB)
  const [ordinanceHistoryStudents, setOrdinanceHistoryStudents] = useState<any[]>([]);
  const [ordinanceHistoryLoading, setOrdinanceHistoryLoading] = useState(false);
  const [ordinanceHistoryAnalyzed, setOrdinanceHistoryAnalyzed] = useState(false);

  // Ordinance history table — pagination & advanced filters
  const [ordinanceHistoryPage, setOrdinanceHistoryPage] = useState(1);
  const ORDINANCE_HISTORY_PAGE_SIZE = 10;
  const [histFilterDept, setHistFilterDept] = useState("all");
  const [histFilterCourse, setHistFilterCourse] = useState("all");
  const [histFilterYear, setHistFilterYear] = useState("all");
  const [histFilterSem, setHistFilterSem] = useState("all");

  const fetchGraceHistory = async () => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/grace-marks/history?uid=${user.uid}`);
      const json = await res.json();
      setGraceHistory(json.history || []);
      setHistoryPage(1);
    } catch {
      toast.error("Failed to load grace marks history");
    } finally {
      setHistoryLoading(false);
    }
  };

  // ---- helpers for history export ----
  const getYearLabel = (year: string | null) => {
    if (!year) return "-";
    const map: Record<string, string> = { "1": "FY", "2": "SY", "3": "TY", FY: "FY", SY: "SY", TY: "TY" };
    return map[year] || year;
  };

  const parseHistoryStatus = (result: string | null) => {
    if (!result) return "-";
    const r = result.replace(/\s+/g, "").toUpperCase();
    if (r === "PASS") return "PASS";
    if (r === "FAIL") return "FAIL";
    return result.trim() || "-";
  };

  const buildHistoryExportRows = (data: any[]) => {
    const grouped: Record<string, any[]> = {};
    const order: string[] = [];
    for (const entry of data) {
      const key = entry.mark_id || entry.id;
      if (!grouped[key]) { grouped[key] = []; order.push(key); }
      grouped[key].push(entry);
    }
    const rows: any[] = [];
    for (const key of order) {
      const entries = grouped[key];
      entries.forEach((entry: any, idx: number) => {
        rows.push({
          rollNumber: entry.roll_number || "-",
          studentName: entry.student_name || "-",
          course: entry.course || entry.department || "-",
          semester: entry.semester || "-",
          year: getYearLabel(entry.year),
          subject: entry.subject_name || "-",
          intGrace: entry.original_marks ?? 0,
          extGrace: entry.grace_given ?? 0,
          status: parseHistoryStatus(entry.result),
          isFirstRow: idx === 0,
          rowCount: entries.length,
        });
      });
    }
    return rows;
  };

  const handleHistoryExcelExport = async () => {
    if (graceHistory.length === 0) return toast.error("No data to export");
    setHistoryExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      // Fetch fresh enriched data so student details are always up-to-date
      const res = await fetch(`/api/grace-marks/history?uid=${user!.uid}`);
      const json = await res.json();
      const freshEnriched: any[] = json.history || [];
      const enrichedById = new Map(freshEnriched.map((e: any) => [e.id, e]));
      // Use fresh enriched data; fall back to local state entry if id not found
      const merged = graceHistory.map((e: any) => ({ ...e, ...(enrichedById.get(e.id) ?? {}) }));
      const rows = buildHistoryExportRows(merged);
      const wb = new ExcelJS.Workbook();
      wb.creator = "Grace Marks System";
      wb.created = new Date();
      const ws = wb.addWorksheet("Grace Marks History");
      ws.columns = [
        { header: "Roll Number", key: "rollNumber", width: 18 },
        { header: "Student Name", key: "studentName", width: 30 },
        { header: "Course", key: "course", width: 35 },
        { header: "Semester", key: "semester", width: 12 },
        { header: "Year", key: "year", width: 10 },
        { header: "Subject", key: "subject", width: 40 },
        { header: "Internal Grace", key: "intGrace", width: 16 },
        { header: "External Grace", key: "extGrace", width: 16 },
        { header: "Student Status", key: "status", width: 16 },
      ];
      const headerRow = ws.getRow(1);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      });
      headerRow.height = 32;
      const mergeQueue: { startRow: number; endRow: number; cols: number[] }[] = [];
      const groupedRows: { entries: any[]; startExcelRow: number }[] = [];
      let i = 0, excelRow = 2;
      while (i < rows.length) {
        const groupSize = rows[i].rowCount;
        groupedRows.push({ entries: rows.slice(i, i + groupSize), startExcelRow: excelRow });
        i += groupSize; excelRow += groupSize;
      }
      for (const group of groupedRows) {
        const { entries, startExcelRow } = group;
        const endExcelRow = startExcelRow + entries.length - 1;
        for (let j = 0; j < entries.length; j++) {
          const r = entries[j];
          const rowData = ws.addRow({
            rollNumber: j === 0 ? r.rollNumber : "",
            studentName: j === 0 ? r.studentName : "",
            course: j === 0 ? r.course : "",
            semester: j === 0 ? r.semester : "",
            year: j === 0 ? r.year : "",
            subject: r.subject,
            intGrace: r.intGrace,
            extGrace: r.extGrace,
            status: j === 0 ? r.status : "",
          });
          rowData.height = 22;
          rowData.eachCell((cell, col) => {
            // cols 1-5 = student info (center), col 6 = subject (left), 7-8 = grace (center), 9 = status (center)
            cell.alignment = { vertical: "middle", horizontal: col === 6 ? "left" : "center", wrapText: true };
            cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
            cell.font = { size: 11, name: "Calibri", color: { argb: "FF1F2937" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: startExcelRow % 2 === 0 ? "FFF9FAFB" : "FFFFFFFF" } };
          });
          if (j === 0) {
            const sc = rowData.getCell(9);
            if (r.status === "PASS") sc.font = { bold: true, size: 11, name: "Calibri", color: { argb: "FF059669" } };
            else if (r.status === "FAIL") sc.font = { bold: true, size: 11, name: "Calibri", color: { argb: "FFDC2626" } };
          }
          rowData.getCell(7).font = { bold: true, size: 11, name: "Calibri", color: { argb: "FF4F46E5" } };
          rowData.getCell(8).font = { bold: true, size: 11, name: "Calibri", color: { argb: "FF7C3AED" } };
        }
        if (entries.length > 1) mergeQueue.push({ startRow: startExcelRow, endRow: endExcelRow, cols: [1, 2, 3, 4, 5, 9] });
      }
      for (const m of mergeQueue) {
        for (const col of m.cols) {
          ws.mergeCells(m.startRow, col, m.endRow, col);
          ws.getCell(m.startRow, col).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        }
      }
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `grace_marks_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel file downloaded");
    } catch (e) {
      console.error(e);
      toast.error("Failed to export Excel");
    } finally {
      setHistoryExporting(false);
    }
  };

  const handleHistoryCSVExport = async () => {
    if (graceHistory.length === 0) return toast.error("No data to export");
    setHistoryExporting(true);
    try {
      // Fetch fresh enriched data so student details are always up-to-date
      const res = await fetch(`/api/grace-marks/history?uid=${user!.uid}`);
      const json = await res.json();
      const freshEnriched: any[] = json.history || [];
      const enrichedById = new Map(freshEnriched.map((e: any) => [e.id, e]));
      const merged = graceHistory.map((e: any) => ({ ...e, ...(enrichedById.get(e.id) ?? {}) }));
      const rows = buildHistoryExportRows(merged);
      const headers = ["Roll Number", "Student Name", "Course", "Semester", "Year", "Subject", "Internal Grace", "External Grace", "Student Status"];
      const csvRows = [
        headers.join(","),
        ...rows.map((r: any) => [
          `"${r.rollNumber}"`, `"${r.studentName}"`, `"${r.course}"`, `"${r.semester}"`, `"${r.year}"`,
          `"${r.subject}"`, r.intGrace, r.extGrace, `"${r.status}"`,
        ].join(",")),
      ];
      const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `grace_marks_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV file downloaded");
    } catch (e) {
      console.error(e);
      toast.error("Failed to export CSV");
    } finally {
      setHistoryExporting(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchUploads();
    }
  }, [user]);

  // Multi-tab sync: listen for grace events from Gadget Sheet tab
  useEffect(() => {
    if (typeof window === "undefined") return;
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("rms_grace_sync");
      bc.onmessage = (ev) => {
        if (ev.data?.type === "grace_applied_from_gadget") {
          toast.success(`Ordinance applied from Gadget Sheet — ${ev.data.graced} student(s) updated`);
          // Refresh student data if same upload is loaded
          if (selectedUpload) fetchStudents();
        }
      };
    } catch { /* BroadcastChannel not supported */ }
    return () => { bc?.close(); };
  }, [selectedUpload]);

  useEffect(() => {
    if (!user) return;
    setIsAnalyzed(false);
    if (selectedUpload) {
      fetchStudents();
    } else {
      setAllStudents([]);
    }
  }, [user, selectedUpload, selectedYear, selectedDepartment]);

  const fetchUploads = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/marks/uploads?uid=${user.uid}`);
      const json = await res.json();
      setUploads(json.uploads || []);
    } catch { 
      toast.error("Failed to load marks database"); 
    } finally { 
      setLoading(false); 
    }
  };

  // Exclude template/header rows (column headers imported as data)
  const isTemplateRow = (s: { student_name?: string; roll_number?: string }) => {
    const name = (s.student_name ?? "").toLowerCase();
    const roll = (s.roll_number ?? "").toLowerCase();
    if (name.includes("full name of the students") || (name.includes("surname") && name.includes("mothers name"))) return true;
    if (roll.includes("roll number") && (roll.includes("introduction") || roll.includes("commu"))) return true;
    return false;
  };

  const fetchStudents = async () => {
    if (!user || !selectedUpload) return;
    setFetching(true);
    try {
      const params = new URLSearchParams({ 
        uid: user.uid,
        upload_id: selectedUpload
      });
      if (selectedYear !== "all") params.append("year", selectedYear);
      if (selectedDepartment !== "all") params.append("department", selectedDepartment);
      
      const res = await fetch(`/api/marks?${params}`);
      const json = await res.json();
      if (json.marks) {
        const filtered = (json.marks as EligibleStudent[]).filter((s: EligibleStudent) => !isTemplateRow(s));
        setAllStudents(filtered);
        setSelectedKeys(new Set());
      }
    } catch {
      toast.error("Failed to fetch student data");
    } finally {
      setFetching(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedUpload) return;
    setFetching(true);
    await fetchStudents();
    setIsAnalyzed(true);
    setFetching(false);
    toast.success("Analysis complete. Found eligible students.");
  };

  // Derived list of failed students
  const failedStudents = useMemo(() => {
    return allStudents.filter(s => s.result?.includes('FAIL') || s.result?.includes('ATKT') || s.result?.includes('F A I L'));
  }, [allStudents]);

  // Derived filtered list for grace eligibility
  const eligibleStudents = useMemo(() => {
    if (!isAnalyzed) return [];
    
    const intLimit = parseFloat(internalGraceLimit) || 0;
    const extLimit = parseFloat(externalGraceLimit) || 0;

    const filtered: GraceResult[] = [];

    allStudents.forEach((student) => {
      if (!student.subjects || !Array.isArray(student.subjects)) return;

      student.subjects.forEach((sub: any) => {
        // Skip passed subjects
        if (!isFailedSubject(sub)) return;

        const maxTotal = parseFloat(sub.max_marks || 100);
        const passingTotal = maxTotal * 0.4;

        const currentInt = parseFloat(sub.int_marks || 0);
        const currentExt = (parseFloat(sub.theo_marks || 0)) + (parseFloat(sub.prac_marks || 0));
        const currentTotal = parseFloat(sub.obtained_marks || 0);

        const totalNeeded = Math.max(0, passingTotal - currentTotal);
        // Eligible = internal <= threshold AND external <= threshold (inclusive of the threshold value)
        if (currentInt <= intLimit && currentExt <= extLimit && totalNeeded > 0) {
          filtered.push({
            mark_id: student.id,
            roll_number: student.roll_number,
            student_name: student.student_name,
            department: student.department,
            year: student.year,
            subject_name: sub.subject_name,
            subject_code: sub.subject_code,
            int_marks: currentInt,
            ext_marks: currentExt,
            obtained_marks: currentTotal,
            max_marks: maxTotal,
            passing_marks: passingTotal,
            grace_needed: totalNeeded,
            current_result: student.result,
            unique_key: `${student.id}|${sub.subject_name}`
          });
        }
      });
    });
    // Sequence: higher marks first (students closest to passing at top)
    filtered.sort(compareByHigherMarks);
    return filtered;
  }, [allStudents, internalGraceLimit, externalGraceLimit, isAnalyzed]);

  // Ordinance Rules: failing students whose int_marks < intThreshold AND ext_marks < extThreshold
  // Sorted: highest obtained marks first (best performing failing students at top)
  const ordinanceStudents = useMemo(() => {
    if (!isOrdinanceAnalyzed) return [];
    const intThresh = parseFloat(ordinanceIntThreshold) || 0;
    const extThresh = parseFloat(ordinanceExtThreshold) || 0;
    const filtered: GraceResult[] = [];

    allStudents.forEach((student) => {
      if (!student.subjects || !Array.isArray(student.subjects)) return;
      student.subjects.forEach((sub: any) => {
        if (!isFailedSubject(sub)) return;
        const maxTotal = parseFloat(sub.max_marks || 100);
        const passingTotal = maxTotal * 0.4;

        const currentInt = parseFloat(sub.int_marks || 0);
        const currentExt = (parseFloat(sub.theo_marks || 0)) + (parseFloat(sub.prac_marks || 0));
        const currentTotal = parseFloat(sub.obtained_marks || 0);

        const totalNeeded = Math.max(0, passingTotal - currentTotal);

        // Ordinance: show all failing students with int <= threshold AND ext <= threshold (inclusive)
        if (currentInt <= intThresh && currentExt <= extThresh && totalNeeded > 0) {
          filtered.push({
            mark_id: student.id,
            roll_number: student.roll_number,
            student_name: student.student_name,
            department: student.department,
            year: student.year,
            subject_name: sub.subject_name,
            subject_code: sub.subject_code,
            int_marks: currentInt,
            ext_marks: currentExt,
            obtained_marks: currentTotal,
            max_marks: maxTotal,
            passing_marks: passingTotal,
            grace_needed: totalNeeded,
            current_result: student.result,
            unique_key: `ord|${student.id}|${sub.subject_name}`
          });
        }
      });
    });

    // Sequence: higher marks first, lower marks later
    filtered.sort(compareByHigherMarks);
    return filtered;
  }, [allStudents, ordinanceIntThreshold, ordinanceExtThreshold, isOrdinanceAnalyzed]);

  // ─── Rule-based ordinance analysis ──────────────────────────────────────
  const filteredOrdinanceRuleStudents = useMemo(() => {
    const q = ordinanceRuleSearch.trim().toLowerCase();
    if (!q) return ordinanceRuleStudents;
    return ordinanceRuleStudents.filter(s =>
      s.student_name.toLowerCase().includes(q) ||
      s.roll_number.toLowerCase().includes(q)
    );
  }, [ordinanceRuleStudents, ordinanceRuleSearch]);

  const handleOrdinanceRuleAnalyze = async () => {
    if (!selectedOrdinanceRule) { toast.error("Select a rule first"); return; }
    if (!selectedUpload) { toast.error("Select a course/exam first"); return; }
    if (allStudents.length === 0) { toast.error("No student data loaded. Fetch exam data first."); return; }

    setOrdinanceRuleLoading(true);
    setOrdinanceRuleStudents([]);
    setOrdinanceRuleSelectedKeys(new Set());

    // Only show students who ACTUALLY received grace marks (or will receive them)
    // i.e., students where the grace engine would succeed
    const results: GraceResult[] = [];

    allStudents.forEach((student) => {
      if (!student.subjects || !Array.isArray(student.subjects)) return;
      const aggregateMax = student.subjects.reduce((sum: number, s: any) => sum + (parseFloat(s.max_marks) || 0), 0);
      const failingSubjects = student.subjects.filter((s: any) =>
        isFailedSubject(s) && s.grade !== "ABS" &&
        s.subject_name !== "CC Subject" && !s.is_cc && !/NSS|NCC|DLLE|CULTURAL/i.test(s.subject_code || "")
      );

      if (selectedOrdinanceRule === "O.5042-A") {
        // Passing Grace: ALL failing heads must be graceable AND total ≤ 1% aggregate
        const maxTotalGrace = Math.ceil(aggregateMax * 0.01);
        let totalNeeded = 0;
        let canGrace = true;
        failingSubjects.forEach((sub: any) => {
          const max = parseFloat(sub.max_marks) || 50;
          const pass = Math.ceil(max * 0.4);
          const deficit = Math.max(0, pass - (parseFloat(sub.obtained_marks) || 0));
          const allowed = max <= 50 ? 2 : 3;
          if (deficit === 0) return;
          if (deficit > allowed) { canGrace = false; }
          totalNeeded += deficit;
        });
        // Only include students where grace WOULD succeed
        if (!canGrace || totalNeeded === 0 || totalNeeded > maxTotalGrace) return;
        // Add one row per failing subject showing grace received
        failingSubjects.forEach((sub: any) => {
          const max = parseFloat(sub.max_marks) || 50;
          const pass = Math.ceil(max * 0.4);
          const deficit = Math.max(0, pass - (parseFloat(sub.obtained_marks) || 0));
          if (deficit === 0) return;
          results.push({
            mark_id: student.id, roll_number: student.roll_number, student_name: student.student_name,
            department: student.department, year: student.year,
            subject_name: sub.subject_name + " *",  // * symbol = O.5042-A grace
            subject_code: sub.subject_code,
            int_marks: parseFloat(sub.int_marks) || 0,
            ext_marks: (parseFloat(sub.theo_marks) || 0) + (parseFloat(sub.prac_marks) || 0),
            obtained_marks: parseFloat(sub.obtained_marks) || 0,
            max_marks: max, passing_marks: pass, grace_needed: deficit,
            current_result: student.result, unique_key: `rule|${student.id}|${sub.subject_name}`
          });
        });
      } else if (selectedOrdinanceRule === "O.5045-A") {
        // Condonation: exactly one failing head AND within condonation budget
        if (failingSubjects.length !== 1) return;
        const sub = failingSubjects[0];
        const max = parseFloat(sub.max_marks) || 50;
        const pass = Math.ceil(max * 0.4);
        const deficit = Math.max(0, pass - (parseFloat(sub.obtained_marks) || 0));
        if (deficit === 0) return;
        const condoneMax = Math.min(10, Math.ceil(aggregateMax * 0.01), Math.ceil(max * 0.1));
        if (deficit > condoneMax) return;
        results.push({
          mark_id: student.id, roll_number: student.roll_number, student_name: student.student_name,
          department: student.department, year: student.year,
          subject_name: sub.subject_name + " @",  // @ symbol = O.5045-A condonation
          subject_code: sub.subject_code,
          int_marks: parseFloat(sub.int_marks) || 0,
          ext_marks: (parseFloat(sub.theo_marks) || 0) + (parseFloat(sub.prac_marks) || 0),
          obtained_marks: parseFloat(sub.obtained_marks) || 0,
          max_marks: max, passing_marks: pass, grace_needed: deficit,
          current_result: student.result, unique_key: `rule|${student.id}|${sub.subject_name}`
        });
      } else if (selectedOrdinanceRule === "O.229") {
        // O.229: Students who have a CC subject (NSS/NCC/DLLE/Cultural) with participation
        // Show all such students — they receive 0.1 SGPI bonus regardless of result
        const ccSubject = student.subjects.find((s: any) =>
          s.is_cc || s.subject_code === "CC Subject" || /NSS|NCC|DLLE|CULTURAL/i.test(s.subject_name || "")
        );
        if (!ccSubject) return;
        const ccObtained = parseFloat(ccSubject.obtained_marks) || 0;
        if (ccObtained === 0 && !ccSubject.is_pass) return; // No participation
        // Show a row for the CC subject itself
        const ccMax = parseFloat(ccSubject.max_marks) || 50;
        const ccPass = Math.ceil(ccMax * 0.4);
        results.push({
          mark_id: student.id, roll_number: student.roll_number, student_name: student.student_name,
          department: student.department, year: student.year,
          subject_name: ccSubject.subject_name,
          subject_code: "CC Subject",
          int_marks: parseFloat(ccSubject.int_marks) || 0,
          ext_marks: (parseFloat(ccSubject.theo_marks) || 0) + (parseFloat(ccSubject.prac_marks) || 0),
          obtained_marks: ccObtained,
          max_marks: ccMax, passing_marks: ccPass, grace_needed: 0,  // 0 = SGPI bonus only
          current_result: student.result, unique_key: `rule|${student.id}|O229`
        });
      } else if (selectedOrdinanceRule === "O.5044-A") {
        // O.5044-A: Distinction Grace — student is passing and within 1–3 marks of A+ (75%) threshold
        // Apply max 3 marks to push into distinction band, within 1% aggregate cap
        const maxTotalGrace = Math.ceil(aggregateMax * 0.01);
        let graceBudgetUsed = 0;
        student.subjects.forEach((sub: any) => {
          if (!sub.is_pass) return; // Must already be passing
          const max = parseFloat(sub.max_marks) || 100;
          const obtained = parseFloat(sub.obtained_marks) || 0;
          const pct = max > 0 ? (obtained / max) * 100 : 0;
          // Check if within 3 marks of A+ distinction threshold (75%)
          const distinctionThreshold = Math.ceil(max * 0.75);
          const deficit = distinctionThreshold - obtained;
          if (deficit <= 0 || deficit > 3) return; // Not within range
          if (graceBudgetUsed + deficit > maxTotalGrace) return; // Exceeds 1% aggregate cap
          graceBudgetUsed += deficit;
          results.push({
            mark_id: student.id, roll_number: student.roll_number, student_name: student.student_name,
            department: student.department, year: student.year,
            subject_name: sub.subject_name + " ★",  // ★ symbol for O.5044-A
            subject_code: sub.subject_code,
            int_marks: parseFloat(sub.int_marks) || 0,
            ext_marks: (parseFloat(sub.theo_marks) || 0) + (parseFloat(sub.prac_marks) || 0),
            obtained_marks: obtained,
            max_marks: max, passing_marks: distinctionThreshold, grace_needed: deficit,
            current_result: student.result, unique_key: `rule|${student.id}|${sub.subject_name}|O5044A`
          });
        });
      }
    });

    results.sort(compareByHigherMarks);
    setOrdinanceRuleStudents(results);
    setOrdinanceRuleAnalyzed(true);
    setOrdinanceRuleLoading(false);
    toast.success(`${results.length} student(s) found under ${selectedOrdinanceRule}`);
  };

  // Apply grace from the Ordinance Rules tab using the engine API (dry_run: false)
  const handleOrdinanceRuleApplyGrace = async () => {
    if (!user || !selectedUpload) { toast.error("Select an exam first"); return; }
    if (ordinanceRuleStudents.length === 0) { toast.error("No eligible students to apply grace to"); return; }
    setOrdinanceRuleApplying(true);
    setOrdinanceRuleApplyConfirm(false);
    try {
      const res = await fetch("/api/grace-marks/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, upload_id: selectedUpload, dry_run: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Engine error");
      const banner = { graced: json.graced, o5042: json.o5042_count, o5045: json.o5045_count };
      setGraceAppliedBanner(banner);
      toast.success(`Grace applied — ${json.graced} student(s) updated (${json.o5042_count} O.5042-A*, ${json.o5045_count} O.5045-A@)`);
      // Re-analyze to show updated state
      setOrdinanceRuleAnalyzed(false);
      setOrdinanceRuleStudents([]);
      // Refresh student data
      if (selectedUpload) {
        const fetchRes = await fetch(`/api/marks?uid=${user.uid}&upload_id=${selectedUpload}`);
        const fetchJson = await fetchRes.json();
        if (fetchRes.ok) setAllStudents(fetchJson.students || []);
      }
      // Broadcast to Gadget Sheet tab
      try {
        const bc = new BroadcastChannel("rms_grace_sync");
        bc.postMessage({ type: "grace_applied", ...banner, upload_id: selectedUpload });
        bc.close();
      } catch {}
    } catch (err: any) {
      toast.error(err.message || "Failed to apply grace");
    } finally {
      setOrdinanceRuleApplying(false);
    }
  };

  // ─── History-based search: query grace_marks DB for already-graced students ──
  const handleOrdinanceHistorySearch = async () => {
    if (!user) return;
    if (!selectedUpload) { toast.error("Select a course/exam first"); return; }
    setOrdinanceHistoryLoading(true);
    setOrdinanceHistoryAnalyzed(false);
    setOrdinanceHistoryStudents([]);
    try {
      // Query the grace_marks table via the dedicated ordinance-search endpoint
      const params = new URLSearchParams({ uid: user.uid, upload_id: selectedUpload });
      if (selectedOrdinanceRule) params.set("rule", selectedOrdinanceRule);
      const res = await fetch(`/api/grace-marks/ordinance-search?${params}`);
      const json = await res.json();
      let results: any[] = json.data || [];
      // Apply search filter
      const q = ordinanceRuleSearch.trim().toLowerCase();
      if (q) {
        results = results.filter((h: any) =>
          (h.student_name || "").toLowerCase().includes(q) ||
          (h.roll_number || "").toLowerCase().includes(q)
        );
      }
      setOrdinanceHistoryStudents(results);
      setOrdinanceHistoryAnalyzed(true);
      setOrdinanceHistoryPage(1);
      setHistFilterDept("all");
      setHistFilterCourse("all");
      setHistFilterYear("all");
      setHistFilterSem("all");
      toast.success(`${results.length} student(s) found under ${selectedOrdinanceRule || "all rules"}`);
    } catch (err: any) {
      toast.error("Failed to query grace history");
    } finally {
      setOrdinanceHistoryLoading(false);
    }
  };

  // Export the history-based results — Gazette-style Excel (matches specimen image exactly)
  const handleOrdinanceHistoryExport = async () => {
    if (ordinanceHistoryStudents.length === 0) return toast.error("No graced students to export");
    setOrdinanceRuleExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "RMS — Grace Marks History";
      wb.created = new Date();
      const ws = wb.addWorksheet("Graced Students");

      // 10 columns: Roll No | Student Name | Subject | Before INT | Before EXT |
      // Grace Added (@) INT | Grace Added (@) EXT | Total Grace Added (@) | Ordinance Type | Final Result
      const TOTAL_COLS = 10;
      const colWidths = [13, 30, 38, 12, 12, 20, 20, 18, 16, 14];
      colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

      const FONT_DEFAULT = { name: "Calibri", size: 10, family: 2 as const };
      const FONT_BOLD = { ...FONT_DEFAULT, bold: true };
      const FONT_WHITE_BOLD = { ...FONT_BOLD, color: { argb: "FFFFFFFF" } };
      const BORDER_THIN: Partial<import("exceljs").Border> = { style: "thin" as const, color: { argb: "FFB0BEC5" } };
      const CELL_BORDER: Partial<import("exceljs").Borders> = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
      const CENTER: Partial<import("exceljs").Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };
      const LEFT: Partial<import("exceljs").Alignment> = { horizontal: "left", vertical: "middle", wrapText: true };

      // Row 1: Dark-blue title header
      ws.mergeCells(1, 1, 1, TOTAL_COLS);
      const titleCell = ws.getCell("A1");
      titleCell.value = `ORDINANCE ${selectedOrdinanceRule || "O.5042-A"} — GRACED STUDENTS HISTORY`;
      titleCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D2B55" } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(1).height = 34;

      // Row 2: Orange/amber subtitle
      ws.mergeCells(2, 1, 2, TOTAL_COLS);
      const subCell = ws.getCell("A2");
      subCell.value = "Grace marks history from database — students who received grace during Gadget Sheet generation.";
      subCell.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FFC85A00" } };
      subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8F0" } };
      subCell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
      ws.getRow(2).height = 22;

      // Row 3: Column headers — dark blue background, white bold text
      const hdrValues = [
        "Roll No", "Student Name", "Subject",
        "Before INT", "Before EXT",
        "Grace Added (@) INT", "Grace Added (@) EXT", "Total Grace Added (@)",
        "Ordinance Type", "Final Result",
      ];
      const hdrRow = ws.addRow(hdrValues);
      hdrRow.height = 28;
      hdrRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = FONT_WHITE_BOLD;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3A5C" } };
        cell.alignment = CENTER;
        cell.border = CELL_BORDER;
      });

      // Group students for vertical merging by roll_number
      const grouped: Record<string, any[]> = {};
      const order: string[] = [];
      for (const h of ordinanceHistoryStudents) {
        const key = h.roll_number || h.mark_id || h.student_name || "unknown";
        if (!grouped[key]) { grouped[key] = []; order.push(key); }
        grouped[key].push(h);
      }

      const FILL_WHITE: import("exceljs").Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
      const FILL_ALTBLUE: import("exceljs").Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F4FC" } };
      const FILL_GRACE: import("exceljs").Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3E0" } };

      const mergeQueue: { startRow: number; endRow: number; cols: number[] }[] = [];

      order.forEach((key, groupIndex) => {
        const entries = grouped[key];
        const first = entries[0];
        const count = entries.length;
        const startRowNum = ws.rowCount + 1;
        const ROW_FILL = groupIndex % 2 === 0 ? FILL_WHITE : FILL_ALTBLUE;

        for (let j = 0; j < entries.length; j++) {
          const h = entries[j];
          const graceInt   = h.grace_int ?? (h.original_marks ?? 0);
          const graceExt   = h.grace_ext ?? (h.grace_given ?? 0);
          const graceTotal = h.grace_total ?? (graceInt + graceExt);
          // before_int / before_ext = marks before grace was applied (from history API)
          const rawBeforeInt = h.before_int ?? null;
          const rawBeforeExt = h.before_ext ?? null;
          // Format as "7+@1" when grace was applied, else plain number
          const isO229 = (h.ordinance_type || "").includes("229");
          const intDisplay = isO229 ? "—"
            : rawBeforeInt !== null ? (graceInt > 0 ? `${rawBeforeInt}+@${graceInt}` : String(rawBeforeInt)) : "—";
          const extDisplay = isO229 ? "—"
            : rawBeforeExt !== null ? (graceExt > 0 ? `${rawBeforeExt}+@${graceExt}` : String(rawBeforeExt)) : "—";
          const resultRaw  = (h.result || "").replace(/\s+/g, "").toUpperCase();
          const resultDisplay = resultRaw === "PASS" ? "P A S S" : resultRaw === "FAIL" ? "FAIL" : (h.result || "–");
          const subjectClean = (h.subject_name || "-").replace(/[*@★D]$/, "").trim();

          const dataRow = ws.addRow([
            j === 0 ? (first.roll_number || "–") : "",
            j === 0 ? (first.student_name || "–") : "",
            subjectClean,
            intDisplay,
            extDisplay,
            graceInt || "—",
            graceExt || "—",
            graceTotal || "—",
            h.ordinance_type || "O.5042-A",
            j === 0 ? resultDisplay : "",
          ]);
          dataRow.height = 20;

          dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
            cell.font = FONT_DEFAULT;
            cell.border = CELL_BORDER;
            cell.alignment = colNum === 3 ? LEFT : CENTER;
            // Grace columns (6, 7, 8) — orange tint + bold red text
            if (colNum === 6 || colNum === 7 || colNum === 8) {
              cell.fill = FILL_GRACE;
              cell.font = { ...FONT_BOLD, color: { argb: "FFCC3300" } };
            } else {
              cell.fill = ROW_FILL;
            }
          });

          // Final Result cell styling (col 10)
          if (j === 0) {
            const resultCell = dataRow.getCell(10);
            if (resultRaw === "PASS") {
              resultCell.font = { ...FONT_BOLD, color: { argb: "FF1B6B3A" } };
              resultCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
            } else if (resultRaw === "FAIL") {
              resultCell.font = { ...FONT_BOLD, color: { argb: "FFCC0000" } };
              resultCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
            }
          }
          // Ordinance type column (9) — teal text
          dataRow.getCell(9).font = { ...FONT_DEFAULT, color: { argb: "FF0E7490" } };
        }

        // Merge Roll No (col 1), Student Name (col 2), Final Result (col 10) vertically per student
        if (count >= 2) {
          mergeQueue.push({ startRow: startRowNum, endRow: startRowNum + count - 1, cols: [1, 2, 10] });
        }
      });

      // Apply all merges after rows are written
      for (const m of mergeQueue) {
        for (const col of m.cols) {
          ws.mergeCells(m.startRow, col, m.endRow, col);
          const cell = ws.getCell(m.startRow, col);
          cell.alignment = CENTER;
          cell.border = CELL_BORDER;
        }
      }

      // Summary row
      const uniqueStudents = order.length;
      const totalRow = ws.addRow([]);
      ws.mergeCells(totalRow.number, 1, totalRow.number, TOTAL_COLS);
      const totCell = ws.getCell(totalRow.number, 1);
      totCell.value = `Total: ${uniqueStudents} student(s) graced under ${selectedOrdinanceRule || "O.5042-A"}`;
      totCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      totCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3A5C" } };
      totCell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
      totCell.border = CELL_BORDER;
      totalRow.height = 24;

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Graced_Students_${(selectedOrdinanceRule || "O5042A").replace(/\./g, "")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel exported — merged entry format");
    } catch {
      toast.error("Export failed");
    } finally {
      setOrdinanceRuleExporting(false);
    }
  };

  // Export the history-based results as CSV
  const handleOrdinanceHistoryCSVExport = async () => {
    if (ordinanceHistoryStudents.length === 0) return toast.error("No graced students to export");
    setOrdinanceRuleExporting(true);
    try {
      const headers = ["Roll No", "Student Name", "Subject", "Original Marks", "Grace Added", "Ordinance Type", "Final Result"];
      const rows = [
        headers.join(","),
        ...ordinanceHistoryStudents.map((h: any) => {
          const graceDisplay = h.ordinance_type === "O.229" ? "+0.1 SGPI" : (h.grace_given ? `+${h.grace_given}` : "-");
          return [
            `"${h.roll_number || "-"}"`,
            `"${h.student_name || "-"}"`,
            `"${(h.subject_name || "-").replace(/[*@★]$/, "").trim()}"`,
            h.original_marks ?? "-",
            `"${graceDisplay}"`,
            `"${h.ordinance_type || "-"}"`,
            `"${h.result || "-"}"`,
          ].join(",");
        }),
      ];
      const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Graced_Students_${(selectedOrdinanceRule || "All").replace(/\./g, "")}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported");
    } catch {
      toast.error("CSV export failed");
    } finally {
      setOrdinanceRuleExporting(false);
    }
  };

  const handleOrdinanceRuleExport = async () => {
    if (filteredOrdinanceRuleStudents.length === 0) return toast.error("No data to export");
    setOrdinanceRuleExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "RMS — Ordinance Analysis";
      wb.created = new Date();
      const ws = wb.addWorksheet(`${selectedOrdinanceRule} Analysis`);

      // ── Gazette-format column widths ────────────────────────────────────────
      ws.getColumn(1).width = 6;   // #
      ws.getColumn(2).width = 16;  // Roll No
      ws.getColumn(3).width = 32;  // Student Name
      ws.getColumn(4).width = 24;  // Department
      ws.getColumn(5).width = 10;  // Year
      ws.getColumn(6).width = 38;  // Subject
      ws.getColumn(7).width = 10;  // Internal
      ws.getColumn(8).width = 10;  // External
      ws.getColumn(9).width = 12;  // Obtained
      ws.getColumn(10).width = 12; // Pass Marks
      ws.getColumn(11).width = 12; // Grace Needed
      ws.getColumn(12).width = 18; // Grace Symbol

      const TOTAL_COLS = 12;

      // Shared styles
      const FONT_DEFAULT = { name: "Calibri", size: 10, family: 2 as const };
      const FONT_BOLD = { ...FONT_DEFAULT, bold: true };
      const FONT_WHITE_BOLD = { ...FONT_BOLD, color: { argb: "FFFFFFFF" } };
      const BORDER_THIN: Partial<import("exceljs").Border> = { style: "thin" as const, color: { argb: "FFD1D5DB" } };
      const CELL_BORDER: Partial<import("exceljs").Borders> = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
      const CENTER: Partial<import("exceljs").Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };
      const LEFT: Partial<import("exceljs").Alignment> = { horizontal: "left", vertical: "middle", wrapText: true };

      // ── Row 1: Main title (Gazette header style) ───────────────────────────
      ws.mergeCells(1, 1, 1, TOTAL_COLS);
      const titleCell = ws.getCell("A1");
      titleCell.value = `ORDINANCE ${selectedOrdinanceRule} — ELIGIBLE STUDENTS ANALYSIS`;
      titleCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(1).height = 32;

      // ── Row 2: Rule description subtitle ──────────────────────────────────
      ws.mergeCells(2, 1, 2, TOTAL_COLS);
      const subCell = ws.getCell("A2");
      subCell.value =
        selectedOrdinanceRule === "O.5042-A" ? "Passing Grace Marks — Max 2 marks (50-max) / 3 marks (100-max), Total ≤ 1% of Aggregate. Symbol: *" :
        selectedOrdinanceRule === "O.5045-A" ? "Single Head Condonation — Exactly one failing head; up to min(10 marks, 1% agg, 10% course). Symbol: @" :
        "NSS / NCC Grace — Students enrolled in NSS, NCC, DLLE or Cultural activities; Deficit ≤ 10 marks. Up to 10 marks / 0.1 GPA";
      subCell.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FFB45309" } };
      subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      subCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      ws.getRow(2).height = 22;

      // ── Row 3: Column headers ──────────────────────────────────────────────
      const hdrValues = ["#", "Roll No", "Student Name", "Department / Course", "Year", "Failing Subject", "Internal", "External", "Obtained", "Pass Marks", "Grace Needed", "Grace Symbol"];
      const hdrRow = ws.addRow(hdrValues);
      hdrRow.height = 28;
      hdrRow.eachCell((cell) => {
        cell.font = FONT_WHITE_BOLD;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB45309" } };
        cell.alignment = CENTER;
        cell.border = CELL_BORDER;
      });

      // ── Group rows by student (for merged cells on Roll/Name/Dept/Year) ───
      const groups: { student: GraceResult; rows: GraceResult[] }[] = [];
      const seen = new Map<string, number>();
      for (const s of filteredOrdinanceRuleStudents) {
        const key = s.mark_id;
        if (!seen.has(key)) {
          seen.set(key, groups.length);
          groups.push({ student: s, rows: [s] });
        } else {
          groups[seen.get(key)!].rows.push(s);
        }
      }

      const yearMap: Record<string, string> = { "1": "FY", "2": "SY", "3": "TY", FY: "FY", SY: "SY", TY: "TY" };
      const graceSymbol = selectedOrdinanceRule === "O.5042-A" ? "*" : selectedOrdinanceRule === "O.5045-A" ? "@" : "★";

      let excelRowIdx = 3; // 1-indexed; rows 1,2 = title/subtitle; row 3 = header (already at row 4 in excel due to addRow)
      // Actually ws.addRow adds to current lastRow. Header was added as row 3 (1=title,2=subtitle,3=header)
      let globalIdx = 0;

      for (const group of groups) {
        const startRow = ws.lastRow!.number + 1;
        const rowCount = group.rows.length;
        const evenBg = globalIdx % 2 === 0 ? "FFF9FAFB" : "FFFFFFFF";

        for (let k = 0; k < rowCount; k++) {
          const s = group.rows[k];
          const dataRow = ws.addRow([
            k === 0 ? globalIdx + 1 : "",
            k === 0 ? s.roll_number : "",
            k === 0 ? s.student_name : "",
            k === 0 ? s.department : "",
            k === 0 ? (yearMap[s.year] || s.year) : "",
            s.subject_name,
            s.int_marks,
            s.ext_marks,
            s.obtained_marks,
            s.passing_marks,
            s.grace_needed,
            graceSymbol,
          ]);
          dataRow.height = 20;
          dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
            cell.font = colNum === 11 ? { ...FONT_BOLD, color: { argb: "FF92400E" } } : FONT_DEFAULT;
            cell.alignment = (colNum === 3 || colNum === 6) ? LEFT : CENTER;
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colNum === 11 ? "FFFEF3C7" : colNum === 12 ? "FFD1FAE5" : evenBg } };
            cell.border = CELL_BORDER;
          });
        }

        // Merge cols 1–5 (# through Year) when student has multiple rows
        if (rowCount > 1) {
          const endRow = startRow + rowCount - 1;
          for (let col = 1; col <= 5; col++) {
            ws.mergeCells(startRow, col, endRow, col);
            const cell = ws.getCell(startRow, col);
            cell.font = FONT_BOLD;
            cell.alignment = CENTER;
            cell.border = CELL_BORDER;
          }
        }

        globalIdx++;
      }

      // ── Totals row ─────────────────────────────────────────────────────────
      const totalRow = ws.addRow(["", "", `Total: ${filteredOrdinanceRuleStudents.length} record(s) — ${groups.length} student(s)`, "", "", "", "", "", "", "", "", ""]);
      ws.mergeCells(totalRow.number, 1, totalRow.number, TOTAL_COLS);
      const totCell = ws.getCell(totalRow.number, 1);
      totCell.value = `Total: ${filteredOrdinanceRuleStudents.length} record(s) — ${groups.length} student(s) eligible under ${selectedOrdinanceRule}`;
      totCell.font = { ...FONT_BOLD, color: { argb: "FF1E3A5F" } };
      totCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F2FE" } };
      totCell.alignment = CENTER;
      totCell.border = CELL_BORDER;
      totalRow.height = 24;

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Ordinance_${selectedOrdinanceRule.replace(/\./g, "")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported with Gazette format");
    } catch (err) {
      console.error(err);
      toast.error("Export failed");
    } finally {
      setOrdinanceRuleExporting(false);
    }
  };

  // Paginated slices
  const paginatedAllStudents = useMemo(() => allStudents.slice((allStudentsPage - 1) * GRACE_PAGE_SIZE, allStudentsPage * GRACE_PAGE_SIZE), [allStudents, allStudentsPage]);
  const paginatedFailedStudents = useMemo(() => failedStudents.slice((allStudentsPage - 1) * GRACE_PAGE_SIZE, allStudentsPage * GRACE_PAGE_SIZE), [failedStudents, allStudentsPage]);
  const paginatedEligibleStudents = useMemo(() => eligibleStudents.slice((eligiblePage - 1) * GRACE_PAGE_SIZE, eligiblePage * GRACE_PAGE_SIZE), [eligibleStudents, eligiblePage]);
  const paginatedOrdinanceStudents = useMemo(() => ordinanceStudents.slice((ordinancePage - 1) * GRACE_PAGE_SIZE, ordinancePage * GRACE_PAGE_SIZE), [ordinanceStudents, ordinancePage]);
  const paginatedHistory = useMemo(() => graceHistory.slice((historyPage - 1) * GRACE_PAGE_SIZE, historyPage * GRACE_PAGE_SIZE), [graceHistory, historyPage]);

  const allStudentsTotalPages = Math.ceil((activeTab === "all" ? allStudents.length : failedStudents.length) / GRACE_PAGE_SIZE);
  const eligibleTotalPages = Math.ceil(eligibleStudents.length / GRACE_PAGE_SIZE);
  const ordinanceTotalPages = Math.ceil(ordinanceStudents.length / GRACE_PAGE_SIZE);
  const historyTotalPages = Math.ceil(graceHistory.length / GRACE_PAGE_SIZE);

  // Ordinance history table — derived filter options
  const histDepts = useMemo(() => [...new Set(ordinanceHistoryStudents.map((h: any) => h.department).filter(Boolean))].sort() as string[], [ordinanceHistoryStudents]);
  const histCourses = useMemo(() => [...new Set(ordinanceHistoryStudents.map((h: any) => h.course || h.department).filter(Boolean))].sort() as string[], [ordinanceHistoryStudents]);
  const histSemesters = useMemo(() => [...new Set(ordinanceHistoryStudents.map((h: any) => h.semester).filter(Boolean))].sort() as string[], [ordinanceHistoryStudents]);

  // Filtered & paginated ordinance history
  const filteredOrdinanceHistory = useMemo(() => {
    const q = ordinanceRuleSearch.trim().toLowerCase();
    return ordinanceHistoryStudents.filter((h: any) => {
      if (histFilterDept !== "all" && (h.department || "") !== histFilterDept) return false;
      const hCourse = h.course || h.department || "";
      if (histFilterCourse !== "all" && hCourse !== histFilterCourse) return false;
      const yearMap: Record<string, string> = { "1": "FY", "2": "SY", "3": "TY", FY: "FY", SY: "SY", TY: "TY" };
      if (histFilterYear !== "all" && (yearMap[h.year] || h.year) !== histFilterYear) return false;
      if (histFilterSem !== "all" && h.semester !== histFilterSem) return false;
      if (q && !(h.student_name || "").toLowerCase().includes(q) && !(h.roll_number || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ordinanceHistoryStudents, histFilterDept, histFilterCourse, histFilterYear, histFilterSem, ordinanceRuleSearch]);

  const ordinanceHistoryTotalPages = Math.max(1, Math.ceil(filteredOrdinanceHistory.length / ORDINANCE_HISTORY_PAGE_SIZE));
  const paginatedOrdinanceHistory = useMemo(
    () => filteredOrdinanceHistory.slice((ordinanceHistoryPage - 1) * ORDINANCE_HISTORY_PAGE_SIZE, ordinanceHistoryPage * ORDINANCE_HISTORY_PAGE_SIZE),
    [filteredOrdinanceHistory, ordinanceHistoryPage]
  );
  const hasActiveHistFilters = histFilterDept !== "all" || histFilterCourse !== "all" || histFilterYear !== "all" || histFilterSem !== "all";
  const clearHistFilters = () => { setHistFilterDept("all"); setHistFilterCourse("all"); setHistFilterYear("all"); setHistFilterSem("all"); setOrdinanceHistoryPage(1); };

  // Reset pages when data changes
  const renderPageButtons = (current: number, total: number, setCurrent: (n: number) => void) => {
    if (total <= 1) return null;
    const pages: (number | "...")[] = [];
    if (total <= 7) { for (let i = 1; i <= total; i++) pages.push(i); }
    else {
      pages.push(1);
      if (current > 3) pages.push("...");
      for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
      if (current < total - 2) pages.push("...");
      pages.push(total);
    }
    return (
      <div className="flex items-center justify-between px-6 py-4 border-t border-border/40 bg-muted/10">
        <p className="text-xs font-bold text-muted-foreground">Page {current} of {total}</p>
        <div className="flex items-center gap-1">
          <button className="h-8 w-8 rounded border border-border/60 flex items-center justify-center text-xs disabled:opacity-40" disabled={current <= 1} onClick={() => setCurrent(current - 1)}>‹</button>
          {pages.map((p, idx) =>
            p === "..." ? (
              <span key={`e${idx}`} className="h-8 w-6 flex items-center justify-center text-xs text-muted-foreground">…</span>
            ) : (
              <button key={p} className={`h-8 w-8 rounded text-xs font-black transition-colors ${current === p ? "bg-primary text-primary-foreground" : "border border-border/60 hover:bg-muted"}`} onClick={() => setCurrent(p as number)}>{p}</button>
            )
          )}
          <button className="h-8 w-8 rounded border border-border/60 flex items-center justify-center text-xs disabled:opacity-40" disabled={current >= total} onClick={() => setCurrent(current + 1)}>›</button>
        </div>
      </div>
    );
  };

  const toggleSelectAll = () => {
    const currentList = isOrdinanceAnalyzed && !isAnalyzed ? ordinanceStudents : isAnalyzed ? eligibleStudents : (activeTab === "all" ? allStudents : failedStudents);
    const keys = (isAnalyzed || isOrdinanceAnalyzed) ? currentList.map(s => (s as GraceResult).unique_key) : currentList.map(s => (s as EligibleStudent).id);
    
    if (selectedKeys.size === keys.length && keys.length > 0) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(keys));
    }
  };

  const toggleSelect = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedKeys(next);
  };

  const applyGrace = async (singleItem?: GraceResult | { mark_id: string, subject_name: string, grace_amt?: number }) => {
    if (!user) return;
    
    let itemsToApply: { mark_id: string, subject_name: string, grace_amt?: number; grace_internal?: number; grace_external?: number }[] = [];
    
    const applyInt = singleItem ? undefined : (parseFloat(applyInternalMarks) || 0);
    const applyExt = singleItem ? undefined : (parseFloat(applyExternalMarks) || 0);
    
    if (singleItem) {
      itemsToApply = [singleItem];
    } else {
      itemsToApply = eligibleStudents
        .filter(s => selectedKeys.has(s.unique_key))
        .map(s => ({ mark_id: s.mark_id, subject_name: s.subject_name, grace_internal: applyInt, grace_external: applyExt }));
    }
    
    if (itemsToApply.length === 0) {
      toast.error("Please select at least one student");
      return;
    }

    const totalGrace = (applyInt ?? 0) + (applyExt ?? 0);
    if (!singleItem && totalGrace <= 0) {
      toast.error("Enter internal and/or external grace marks to apply");
      return;
    }
    
    setApplying(true);
    let successCount = 0;
    const allErrors: string[] = [];
    
    try {
      for (const item of itemsToApply) {
        const body: Record<string, unknown> = {
          mark_ids: [item.mark_id],
          subject_name: item.subject_name,
          uid: user.uid,
          grace_amt: item.grace_amt ?? (item.grace_internal != null || item.grace_external != null ? (item.grace_internal ?? 0) + (item.grace_external ?? 0) : undefined)
        };
        if (item.grace_internal != null) body.grace_internal = item.grace_internal;
        if (item.grace_external != null) body.grace_external = item.grace_external;
        const res = await fetch("/api/grace-marks/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const json = await res.json();
        if (!res.ok) {
          allErrors.push(json.error || "Request failed");
          continue;
        }
        if (json.errors?.length) {
          (json.errors as { error?: string }[]).forEach((e: { error?: string }) => allErrors.push(e.error || "Unknown error"));
        }
        if (json.applied_count > 0) successCount += json.applied_count;
      }

      if (successCount > 0) {
        toast.success(`Applied grace marks to ${successCount} record(s).`);
        await fetchStudents();
        fetchGraceHistory();
        setSelectedKeys(new Set());
      } else {
        const msg = allErrors.length > 0 ? allErrors[0] : "Apply failed. Check console or try again.";
        toast.error(msg);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to apply grace marks");
    } finally {
      setApplying(false);
    }
  };

  // Handles bulk "Apply Grace to Selected" — shows confirmation for students who will PASS
  const handleBulkApplyClick = () => {
    if (!user) return;
    const applyInt = parseFloat(applyInternalMarks) || 0;
    const applyExt = parseFloat(applyExternalMarks) || 0;
    if (applyInt <= 0 && applyExt <= 0) {
      toast.error("Enter internal and/or external grace marks to apply");
      return;
    }
    const selected = eligibleStudents.filter(s => selectedKeys.has(s.unique_key));
    if (selected.length === 0) {
      toast.error("Please select at least one student");
      return;
    }
    // Detect students who would PASS after applying grace (total obtained + grace >= passing threshold)
    const wouldPass = selected.filter(
      s => (s.obtained_marks + applyInt + applyExt) >= s.passing_marks
    );
    if (wouldPass.length > 0) {
      setGraceConfirmDialog({ students: wouldPass, applyInt, applyExt });
    } else {
      applyGrace();
    }
  };

  // Apply grace for ordinance tab (selected or all)
  const applyOrdinanceGrace = async (mode: "selected" | "all") => {
    if (!user) return;
    const applyInt = parseFloat(ordinanceApplyInt) || 0;
    const applyExt = parseFloat(ordinanceApplyExt) || 0;
    if (applyInt <= 0 && applyExt <= 0) {
      toast.error("Enter internal and/or external grace marks to apply");
      return;
    }
    const targets = mode === "all"
      ? ordinanceStudents
      : ordinanceStudents.filter(s => ordinanceSelectedKeys.has(s.unique_key));
    if (targets.length === 0) {
      toast.error(mode === "selected" ? "Select at least one student first" : "No students found in ordinance results");
      return;
    }
    setApplying(true);
    let successCount = 0;
    const allErrors: string[] = [];
    try {
      for (const item of targets) {
        const body: Record<string, unknown> = {
          mark_ids: [item.mark_id],
          subject_name: item.subject_name,
          uid: user.uid,
          grace_amt: applyInt + applyExt,
        };
        if (applyInt > 0) body.grace_internal = applyInt;
        if (applyExt > 0) body.grace_external = applyExt;
        const res = await fetch("/api/grace-marks/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) { allErrors.push(json.error || "Request failed"); continue; }
        if (json.applied_count > 0) successCount += json.applied_count;
      }
      if (successCount > 0) {
        toast.success(`Applied ordinance grace to ${successCount} record(s).`);
        await fetchStudents();
        setIsOrdinanceAnalyzed(false);
        setOrdinanceSelectedKeys(new Set());
        fetchGraceHistory();
      } else {
        toast.error(allErrors[0] || "Apply failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to apply grace");
    } finally {
      setApplying(false);
      setOrdinanceConfirmOpen(false);
    }
  };

  const departments = [...new Set(uploads.map((u) => u.department))].filter(Boolean).sort();
  const years = [...new Set(uploads.map((u) => u.year))].filter(Boolean).sort();

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <Zap className="h-6 w-6 text-primary" />
            Grace Marks Management
          </h1>
          <p className="text-sm text-muted-foreground font-medium">
            Identify students who failed and match the grace criteria for assistance.
          </p>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={(v) => {
        setMainTab(v);
        if (v === "history") fetchGraceHistory();
      }} className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3 mb-6">
          <TabsTrigger value="management" className="font-bold flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" /> Management
          </TabsTrigger>
          <TabsTrigger value="ordinance" className="font-bold flex items-center gap-2">
            <FileText className="h-4 w-4" /> Ordinance Rules
          </TabsTrigger>
          <TabsTrigger value="history" className="font-bold flex items-center gap-2">
            <History className="h-4 w-4" /> History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="management" className="space-y-8">

      {/* Configuration Card */}
      <Card className="border-none shadow-xl bg-card/50 backdrop-blur-xl ring-1 ring-border/50 overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border/50">
          <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            Selection & Grace Criteria
          </CardTitle>
          <CardDescription className="font-medium text-xs">Select course and specify internal/external grace ranges.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-8 gap-4 items-end">
            <div className="space-y-2 col-span-1 md:col-span-2 min-w-0">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Select Course / Exam</Label>
              <Select value={selectedUpload || undefined} onValueChange={(v) => setSelectedUpload(v || "")}>
                <SelectTrigger className="h-11 font-bold bg-background/50 border-muted-foreground/20 w-full">
                  <SelectValue placeholder="Select Exam Data" />
                </SelectTrigger>
                <SelectContent>
                  {uploads.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.exam_name} {u.department ? `| ${u.department}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 col-span-1 md:col-span-2 min-w-0">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Dept Filter</Label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger className="h-11 font-bold bg-background/50 border-muted-foreground/20 w-full truncate">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 col-span-1 md:col-span-2 min-w-0">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Year Filter</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="h-11 font-bold bg-background/50 border-muted-foreground/20 w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {years.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Internal Grace</Label>
              <div className="relative group">
                <Input 
                  type="number"
                  value={internalGraceLimit}
                  onChange={(e) => setInternalGraceLimit(e.target.value)}
                  placeholder="e.g. 4" 
                  className="h-11 font-black pr-12 bg-background/50 border-muted-foreground/20 group-focus-within:border-primary/50 transition-all"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-muted-foreground/60 pointer-events-none">
                  max
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">External Grace</Label>
              <div className="relative group">
                <Input 
                  type="number"
                  value={externalGraceLimit}
                  onChange={(e) => setExternalGraceLimit(e.target.value)}
                  placeholder="e.g. 11" 
                  className="h-11 font-black pr-12 bg-background/50 border-muted-foreground/20 group-focus-within:border-primary/50 transition-all"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-muted-foreground/60 pointer-events-none">
                  max
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center pt-2">
            <Button 
              onClick={handleAnalyze}
              disabled={fetching || !selectedUpload} 
              className="h-12 w-full md:w-64 gap-2 font-black shadow-lg shadow-primary/20 active:scale-95 transition-all bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
            >
              {fetching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
              Analyze Eligibility
            </Button>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex gap-4 items-start shadow-inner">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Info className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Dynamic Grace Rules</p>
              <p className="text-xs text-primary/80 font-bold leading-relaxed">
                Showing failing students where Internal &lt;={" "}
                <span className="text-primary font-black px-1.5 py-0.5 bg-primary/10 rounded">{internalGraceLimit || 0}</span>{" "}
                AND External &lt;={" "}
                <span className="text-primary font-black px-1.5 py-0.5 bg-primary/10 rounded">{externalGraceLimit || 0}</span>.
                {" "}Students are ranked from higher marks to lower marks.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <AnimatePresence mode="wait">
        {allStudents.length > 0 ? (
          <motion.div
            key="students-table"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <Tabs value={isOrdinanceAnalyzed && !isAnalyzed ? "ordinance" : isAnalyzed ? "analyzed" : activeTab} onValueChange={(val) => {
              if (val === "analyzed") {
                setIsAnalyzed(true);
                setIsOrdinanceAnalyzed(false);
              } else if (val === "ordinance") {
                setIsOrdinanceAnalyzed(true);
                setIsAnalyzed(false);
              } else {
                setIsAnalyzed(false);
                setIsOrdinanceAnalyzed(false);
                setActiveTab(val);
                setSelectedKeys(new Set());
              }
            }} className="w-full">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <TabsList className="bg-muted/50 p-1 rounded-2xl h-12 border border-border/50 flex-wrap gap-1">
                  <TabsTrigger value="all" className="rounded-xl px-6 font-black text-xs uppercase tracking-widest data-[state=active]:bg-background data-[state=active]:shadow-lg transition-all h-10">
                    All Students ({allStudents.length})
                  </TabsTrigger>
                  <TabsTrigger value="failed" className="rounded-xl px-6 font-black text-xs uppercase tracking-widest data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive transition-all h-10">
                    Failed Students ({failedStudents.length})
                  </TabsTrigger>
                  {isAnalyzed && (
                    <TabsTrigger value="analyzed" className="rounded-xl px-6 font-black text-xs uppercase tracking-widest data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all h-10">
                      Eligible for Grace ({eligibleStudents.length})
                    </TabsTrigger>
                  )}
                  {isOrdinanceAnalyzed && (
                    <TabsTrigger value="ordinance" className="rounded-xl px-6 font-black text-xs uppercase tracking-widest data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-700 transition-all h-10">
                      Ordinance ({ordinanceStudents.length})
                    </TabsTrigger>
                  )}
                </TabsList>

                {(isAnalyzed || isOrdinanceAnalyzed) && (
                  <div className="flex items-center gap-3 flex-wrap justify-end">
                    <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-4 py-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">Apply Int</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="e.g. 2"
                        value={applyInternalMarks}
                        onChange={(e) => setApplyInternalMarks(e.target.value)}
                        className="w-16 h-9 text-center font-bold text-sm bg-background/50 border-muted-foreground/20 rounded-lg"
                      />
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-4 py-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">Apply Ext</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="e.g. 3"
                        value={applyExternalMarks}
                        onChange={(e) => setApplyExternalMarks(e.target.value)}
                        className="w-16 h-9 text-center font-bold text-sm bg-background/50 border-muted-foreground/20 rounded-lg"
                      />
                    </div>
                    <Button
                      onClick={handleBulkApplyClick}
                      disabled={applying || selectedKeys.size === 0}
                      className="h-12 gap-2 font-black px-10 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-600/20 transition-all active:scale-95 rounded-2xl border-b-4 border-emerald-800"
                    >
                      {applying ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
                      Apply Grace to Selected
                    </Button>
                  </div>
                )}
              </div>

              <div className="border border-border/50 rounded-3xl overflow-hidden shadow-2xl bg-card/30 backdrop-blur-md">
                <Table>
                  <TableHeader className="bg-muted/50 border-b border-border/50">
                    <TableRow className="hover:bg-transparent border-none">
                      <TableHead className="w-[80px] py-6 text-center">
                        <Checkbox
                          checked={(() => {
                            const len = (isOrdinanceAnalyzed && !isAnalyzed) ? ordinanceStudents.length : isAnalyzed ? eligibleStudents.length : (activeTab === "all" ? allStudents.length : failedStudents.length);
                            return len > 0 && selectedKeys.size === len;
                          })()}
                          onCheckedChange={toggleSelectAll}
                          className="w-5 h-5"
                        />
                      </TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-6 text-muted-foreground">Student Info</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-6 text-center text-muted-foreground">Roll Number</TableHead>
                      
                      {(isAnalyzed || isOrdinanceAnalyzed) ? (
                        <>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-6 text-muted-foreground">Subject</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-6 text-center text-muted-foreground">Internal</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-6 text-center text-muted-foreground">External</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-6 text-center text-muted-foreground">Total</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-6 text-center text-muted-foreground">Grace Needed</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-6 text-right pr-8 text-muted-foreground">Action</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-6 text-center text-muted-foreground">Percentage</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-6 text-center text-muted-foreground">CGPA</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-6 text-right pr-8 text-muted-foreground">Result</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(isOrdinanceAnalyzed && !isAnalyzed ? paginatedOrdinanceStudents : isAnalyzed ? paginatedEligibleStudents : (activeTab === "all" ? paginatedAllStudents : paginatedFailedStudents)).map((s: any, idx: number) => {
                      const key = (isAnalyzed || isOrdinanceAnalyzed) ? (s.unique_key ?? `grace-${idx}`) : (s.id ?? `student-${idx}`);
                      return (
                            <TableRow 
                            key={key} 
                            className={`group hover:bg-primary/5 transition-all cursor-pointer border-border/40 ${selectedKeys.has(key) ? "bg-primary/10" : ""}`}
                            onClick={() => toggleSelect(key)}
                          >
                              <TableCell className="py-5 text-center" onClick={(e) => e.stopPropagation()}>
                                <Checkbox 
                                  checked={selectedKeys.has(key)}
                                  onCheckedChange={() => toggleSelect(key)}
                                  className="w-5 h-5"
                                />
                              </TableCell>
                              <TableCell className="py-5" onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/dashboard/grace-marks/student/${(isAnalyzed || isOrdinanceAnalyzed) ? (s as GraceResult).mark_id : (s as EligibleStudent).id}`);
                              }}>
                                <div className="flex flex-col gap-1">
                                  <p className="text-sm font-black text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                                    {s.student_name}
                                    <Eye className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </p>
                                  <div className="flex gap-1.5 items-center">
                                    <Badge variant="outline" className="font-black text-[8px] h-4 uppercase tracking-tighter border-muted-foreground/30 text-muted-foreground">{s.department}</Badge>
                                    <Badge variant="outline" className="font-black text-[8px] h-4 uppercase tracking-tighter border-muted-foreground/30 text-muted-foreground">{s.year}</Badge>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="py-5 text-center font-bold text-sm text-muted-foreground tabular-nums">{s.roll_number}</TableCell>
                              
                              {(isAnalyzed || isOrdinanceAnalyzed) ? (
                                <>
                                  <TableCell className="py-5">
                                    <p className="text-xs font-bold text-foreground truncate max-w-[150px]">{s.subject_name}</p>
                                  </TableCell>
                                  <TableCell className="py-5 text-center font-bold text-sm tabular-nums">{s.int_marks}</TableCell>
                                  <TableCell className="py-5 text-center font-bold text-sm tabular-nums">{s.ext_marks}</TableCell>
                                  <TableCell className="py-5 text-center">
                                     <span className="font-black text-sm text-destructive tabular-nums bg-destructive/5 px-2 py-1 rounded-md border border-destructive/10">{s.obtained_marks}</span>
                                  </TableCell>
                                  <TableCell className="py-5 text-center">
                                    <Badge className="bg-primary text-primary-foreground font-black text-[10px] uppercase h-6 px-3 shadow-sm ring-2 ring-primary/20">
                                      +{s.grace_needed}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="py-5 text-right pr-8" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-2">
                                      <Button 
                                        size="sm" 
                                        variant="outline" 
                                        className="h-9 text-[10px] font-black uppercase tracking-widest border-emerald-500/50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all rounded-xl"
                                        onClick={() => applyGrace(s)}
                                        disabled={applying}
                                      >
                                        Apply Grace
                                      </Button>
                                      <Button 
                                        size="icon" 
                                        variant="ghost" 
                                        className="h-9 w-9 rounded-xl hover:bg-primary/10 text-primary"
                                        onClick={() => router.push(`/dashboard/grace-marks/student/${s.mark_id}`)}
                                      >
                                        <Plus className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </>
                              ) : (
                                <>
                                  <TableCell className="py-5 text-center font-black text-sm tabular-nums">{(s.percentage || 0).toFixed(1)}%</TableCell>
                                  <TableCell className="py-5 text-center font-bold text-sm text-muted-foreground tabular-nums">{(s.cgpa || 0).toFixed(2)}</TableCell>
                                  <TableCell className="py-5 text-right pr-8">
                                    <div className="flex items-center justify-end gap-3">
                                      <Badge className={`${(String(s?.result ?? '').includes('P A S S') || String(s?.result ?? '').includes('PASS')) ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-destructive/10 text-destructive border-destructive/20'} border font-black uppercase text-[10px] tracking-widest px-3 h-7 rounded-full`}>
                                        {s?.result ?? "—"}
                                      </Badge>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          router.push(`/dashboard/grace-marks/student/${s.id}`);
                                        }}
                                      >
                                        <Plus className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </>
                              )}
                            </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {/* Main table pagination */}
                  {isOrdinanceAnalyzed && !isAnalyzed
                    ? renderPageButtons(ordinancePage, ordinanceTotalPages, setOrdinancePage)
                    : isAnalyzed
                    ? renderPageButtons(eligiblePage, eligibleTotalPages, setEligiblePage)
                    : renderPageButtons(allStudentsPage, allStudentsTotalPages, setAllStudentsPage)
                  }
                </div>
              </Tabs>
            </motion.div>
          ) : selectedUpload && !fetching ? (
            <motion.div
              key="no-students"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="border-2 border-dashed border-border/40 rounded-[3rem] p-24 flex flex-col items-center justify-center gap-6 text-center bg-muted/5 shadow-inner"
            >
              <div className="p-8 bg-muted rounded-full">
                <AlertCircle className="h-12 w-12 text-muted-foreground/30" />
              </div>
              <div className="space-y-2">
                <p className="text-2xl font-black text-foreground">No Students Found</p>
                <p className="text-sm text-muted-foreground font-medium max-w-sm mx-auto">The selected criteria returned no records. Please check your department/year filters.</p>
              </div>
            </motion.div>
          ) : !selectedUpload && !loading ? (
            <motion.div
              key="await-config"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="border-2 border-dashed border-border/40 rounded-[3rem] p-24 flex flex-col items-center justify-center gap-6 text-center bg-muted/5 shadow-inner"
            >
              <div className="p-8 bg-primary/5 rounded-full ring-12 ring-primary/5">
                <GraduationCap className="h-12 w-12 text-primary/30" />
              </div>
              <div className="space-y-2">
                <p className="text-2xl font-black text-foreground">Awaiting Configuration</p>
                <p className="text-sm text-muted-foreground font-medium max-w-sm mx-auto leading-relaxed">
                  Choose a course or exam session above to begin identifying students for grace marks.
                </p>
              </div>
            </motion.div>
          ) : (
            <div key="loading" className="flex justify-center items-center py-20">
              <Loader2 className="h-12 w-12 animate-spin text-primary/20" />
            </div>
          )}
        </AnimatePresence>

        </TabsContent>

        {/* Ordinance Rules Tab — Redesigned */}
        <TabsContent value="ordinance" className="space-y-6">

          {/* Rule Selection Card */}
          <Card className="border-none shadow-xl bg-amber-500/5 ring-1 ring-amber-500/20 overflow-hidden">
            <CardHeader className="bg-amber-500/10 border-b border-amber-500/20 pb-4">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Ordinance — Rule-Based Student Analysis
              </CardTitle>
              <CardDescription className="font-medium text-xs text-amber-700/70 dark:text-amber-400/70">
                Select an ordinance rule and an exam to scan the database for eligible students.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">

              {/* Step 1: Select Course */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-amber-700/60 dark:text-amber-400/60">Step 1 — Select Course / Exam</Label>
                  <Select value={selectedUpload || undefined} onValueChange={(v) => { setSelectedUpload(v || ""); setOrdinanceRuleAnalyzed(false); }}>
                    <SelectTrigger className="h-11 font-bold bg-background/50 border-amber-500/30">
                      <SelectValue placeholder="Select Exam Data" />
                    </SelectTrigger>
                    <SelectContent>
                      {uploads.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.exam_name}{u.department ? ` | ${u.department}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-amber-700/60 dark:text-amber-400/60">Step 2 — Select Rule</Label>
                  <Select value={selectedOrdinanceRule} onValueChange={(v) => { setSelectedOrdinanceRule(v as any); setOrdinanceRuleAnalyzed(false); }}>
                    <SelectTrigger className="h-11 font-bold bg-background/50 border-amber-500/30">
                      <SelectValue placeholder="Choose Ordinance Rule" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="O.5042-A">
                        <div className="flex flex-col gap-0.5 py-0.5">
                          <span className="font-black">O. 5042-A — Passing Grace Marks</span>
                          <span className="text-[10px] text-muted-foreground">≤1% aggregate grace across failing heads</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="O.5045-A">
                        <div className="flex flex-col gap-0.5 py-0.5">
                          <span className="font-black">O. 5045-A — Single Head Condonation</span>
                          <span className="text-[10px] text-muted-foreground">Fails in exactly one head; up to 10 marks / 10% of course</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="O.229">
                        <div className="flex flex-col gap-0.5 py-0.5">
                          <span className="font-black">O. 229 — NSS / NCC Grace (10 Marks / 0.1 GPA)</span>
                          <span className="text-[10px] text-muted-foreground">Students enrolled in NSS, NCC, DLLE, or Cultural activities</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="O.5044-A">
                        <div className="flex flex-col gap-0.5 py-0.5">
                          <span className="font-black">O. 5044-A — Distinction Grace</span>
                          <span className="text-[10px] text-muted-foreground">Passing students within 3 marks of A+ (75%) threshold; max 3 marks / 1% aggregate cap</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Rule description chips */}
              {selectedOrdinanceRule && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 items-start">
                  <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
                    {selectedOrdinanceRule === "O.5042-A" && <>
                      <span className="font-black">O. 5042-A (Passing Grace)</span>: Scans students failing in one or more heads. Applies the minimum grace to pass (max 2 marks for 50-mark subjects, 3 for 100-mark), provided total grace ≤ 1% of aggregate. In the Gadget Sheet, marks are shown as <span className="font-black">OriginalMarks+@Grace</span> (e.g. <span className="font-black">12+@2</span>) — the Grade column shows the clean computed grade without any suffix.
                    </>}
                    {selectedOrdinanceRule === "O.5045-A" && <>
                      <span className="font-black">O. 5045-A (Condonation)</span>: Scans students failing in exactly ONE head. Applies condonation up to 1% of aggregate or 10% of course marks, capped at 10 marks. In the Gadget Sheet, marks are shown as <span className="font-black">OriginalMarks+@Grace</span> for transparency — the Grade column shows the clean computed grade.
                    </>}
                    {selectedOrdinanceRule === "O.229" && <>
                      <span className="font-black">O. 229 (NSS/NCC)</span>: Scans students enrolled in NSS, NCC, DLLE, or Cultural activities who fail with a deficit ≤ 10 marks. Up to 10 grace marks / 0.1 GPA improvement eligible. The CC Subject column must be flagged in the Excel file.
                    </>}
                    {selectedOrdinanceRule === "O.5044-A" && <>
                      <span className="font-black">O. 5044-A (Distinction Grace)</span>: Scans already-passing students within 1–3 marks of the A+ distinction threshold (75% of max marks). Applies up to 3 marks grace, constrained by the 1% aggregate cap. Symbol <span className="font-black">★</span> is appended to grade.
                    </>}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={handleOrdinanceHistorySearch}
                  disabled={ordinanceHistoryLoading || !selectedUpload}
                  className="h-11 px-8 gap-2 font-black bg-foreground hover:bg-foreground/90 text-background shadow-lg active:scale-95 transition-all rounded-xl"
                >
                  {ordinanceHistoryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Search Eligible Students
                </Button>

                {/* Apply Grace Engine button — triggers full engine run for selected upload */}
                {(selectedOrdinanceRule === "O.5042-A" || selectedOrdinanceRule === "O.5045-A") && ordinanceRuleAnalyzed && ordinanceRuleStudents.length > 0 && (
                  <Button
                    onClick={() => setOrdinanceRuleApplyConfirm(true)}
                    disabled={ordinanceRuleApplying || !selectedUpload}
                    variant="outline"
                    className="h-11 px-6 gap-2 font-black border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-xl"
                  >
                    {ordinanceRuleApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    Apply Grace to DB
                  </Button>
                )}

                {ordinanceHistoryAnalyzed && (
                  <span className="text-xs font-bold text-foreground">
                    {ordinanceHistoryStudents.length} student{ordinanceHistoryStudents.length !== 1 ? "s" : ""} found
                  </span>
                )}
              </div>

              {/* Grace applied success banner */}
              {graceAppliedBanner && (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-2.5 mt-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex-1">
                    Grace applied to database — {graceAppliedBanner.graced} student(s) updated
                    {graceAppliedBanner.o5042 > 0 && <span className="ml-1">({graceAppliedBanner.o5042} O.5042-A*</span>}
                    {graceAppliedBanner.o5045 > 0 && <span>{graceAppliedBanner.o5042 > 0 ? ", " : " ("}{graceAppliedBanner.o5045} O.5045-A@</span>}
                    {(graceAppliedBanner.o5042 > 0 || graceAppliedBanner.o5045 > 0) && <span>)</span>}
                    . Gadget Sheet will reflect updated marks.
                  </p>
                  <button onClick={() => setGraceAppliedBanner(null)} className="text-emerald-500 hover:text-emerald-700">
                    <Download className="h-3.5 w-3.5 opacity-0 pointer-events-none" />
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results section — shows grace history from DB */}
          {ordinanceHistoryAnalyzed && (
            <Card className="border-none shadow-sm overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border/50">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm font-black flex items-center gap-2">
                      <Users className="h-4 w-4 text-foreground" />
                      {selectedOrdinanceRule || "All Rules"} — {ordinanceHistoryStudents.length} Student{ordinanceHistoryStudents.length !== 1 ? "s" : ""} Received Grace
                    </CardTitle>
                    <CardDescription className="font-medium text-xs mt-1">
                      Grace marks history from database — students who received grace during Gadget Sheet generation.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={ordinanceRuleSearch}
                        onChange={(e) => { setOrdinanceRuleSearch(e.target.value); setOrdinanceHistoryPage(1); }}
                        placeholder="Search name or roll no…"
                        className="pl-9 h-9 text-xs w-56 font-medium"
                      />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          className="h-9 gap-1.5 font-bold text-xs bg-foreground hover:bg-foreground/90 text-background"
                          disabled={ordinanceRuleExporting || ordinanceHistoryStudents.length === 0}
                        >
                          {ordinanceRuleExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={handleOrdinanceHistoryExport} className="gap-2 cursor-pointer">
                          <FileSpreadsheet className="h-4 w-4 text-green-600" />
                          Export as XLS
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleOrdinanceHistoryCSVExport} className="gap-2 cursor-pointer">
                          <FileText className="h-4 w-4 text-blue-600" />
                          Export as CSV
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>

              {/* Advanced Filters */}
              {ordinanceHistoryStudents.length > 0 && (
                <div className="px-5 py-4 border-b border-border/40 bg-card/50">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Department &amp; Course</p>
                      <div className="flex gap-2">
                        <Select value={histFilterDept} onValueChange={(v) => { setHistFilterDept(v); setHistFilterCourse("all"); setOrdinanceHistoryPage(1); }}>
                          <SelectTrigger className="h-9 flex-1 text-xs font-semibold">
                            <SelectValue placeholder="Select Dept" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Select Dept</SelectItem>
                            {histDepts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={histFilterCourse} onValueChange={(v) => { setHistFilterCourse(v); setOrdinanceHistoryPage(1); }}>
                          <SelectTrigger className="h-9 flex-1 text-xs font-semibold">
                            <SelectValue placeholder="Select Course" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Select Course</SelectItem>
                            {histCourses.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Year &amp; Semester</p>
                      <div className="flex gap-2">
                        <Select value={histFilterYear} onValueChange={(v) => { setHistFilterYear(v); setOrdinanceHistoryPage(1); }}>
                          <SelectTrigger className="h-9 flex-1 text-xs font-semibold">
                            <SelectValue placeholder="Select Year" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Select Year</SelectItem>
                            {["FY", "SY", "TY"].map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={histFilterSem} onValueChange={(v) => { setHistFilterSem(v); setOrdinanceHistoryPage(1); }}>
                          <SelectTrigger className="h-9 flex-1 text-xs font-semibold">
                            <SelectValue placeholder="Select Semester" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Select Semester</SelectItem>
                            {(histSemesters.length > 0 ? histSemesters : ["1", "2", "3", "4", "5", "6"]).map((s) => (
                              <SelectItem key={s} value={s}>Semester {s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  {hasActiveHistFilters && (
                    <div className="flex justify-end mt-2">
                      <Button size="sm" variant="ghost" className="h-7 px-3 text-xs font-bold text-destructive hover:text-destructive gap-1" onClick={clearHistFilters}>
                        <Filter className="h-3 w-3" />
                        Clear Filters
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <CardContent className="p-0">
                {ordinanceHistoryStudents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4 text-center p-6">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                      <CheckCircle2 className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">No graced students found</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        No students have received grace marks under {selectedOrdinanceRule || "any ordinance"} yet. Apply grace first via Gadget Sheet generation.
                      </p>
                    </div>
                  </div>
                ) : filteredOrdinanceHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center p-6">
                    <p className="text-sm font-bold">No results for current filters</p>
                    <Button variant="outline" size="sm" onClick={clearHistFilters}>Clear Filters</Button>
                  </div>
                ) : (
                  <>
                    {/* Count strip */}
                    <div className="px-5 py-2 border-b border-border/40 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Showing {(ordinanceHistoryPage - 1) * ORDINANCE_HISTORY_PAGE_SIZE + 1}–{Math.min(ordinanceHistoryPage * ORDINANCE_HISTORY_PAGE_SIZE, filteredOrdinanceHistory.length)} of {filteredOrdinanceHistory.length}{hasActiveHistFilters ? " (filtered)" : ""}
                      </span>
                    </div>
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow className="hover:bg-transparent border-none text-[10px] font-black uppercase tracking-widest">
                          <TableHead className="w-[50px] py-4 text-center pl-4">#</TableHead>
                          <TableHead className="py-4 text-center text-muted-foreground">Roll No</TableHead>
                          <TableHead className="py-4 text-muted-foreground">Student Name</TableHead>
                          <TableHead className="py-4 pl-6 text-muted-foreground">Subject</TableHead>
                          <TableHead className="py-4 text-center text-muted-foreground">Int</TableHead>
                          <TableHead className="py-4 text-center text-muted-foreground">Ext</TableHead>
                          <TableHead className="py-4 text-center text-muted-foreground">Grace Added (@)</TableHead>
                          <TableHead className="py-4 text-center text-muted-foreground pr-6">Ordinance Type</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedOrdinanceHistory.map((h: any, idx: number) => {
                          const globalIdx = (ordinanceHistoryPage - 1) * ORDINANCE_HISTORY_PAGE_SIZE + idx + 1;
                          const graceAdded = h.grace_given ?? 0;
                          const otype = h.ordinance_type || "—";
                          const otypeBadgeClass =
                            otype === "O.5042-A" ? "bg-blue-500/10 text-blue-700 border-blue-500/25" :
                            otype === "O.5045-A" ? "bg-amber-500/10 text-amber-700 border-amber-500/25" :
                            otype === "O.229"   ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/25" :
                            otype === "O.5044-A" ? "bg-purple-500/10 text-purple-700 border-purple-500/25" :
                            "bg-muted text-muted-foreground border-border/40";
                          const intGrace = h.grace_int ?? (h.original_marks ?? 0);
                          const extGrace = h.grace_ext ?? (h.grace_given ?? 0);
                          const beforeInt = h.before_int;
                          const beforeExt = h.before_ext;
                          const intDisplay = otype === "O.229" ? "—"
                            : beforeInt !== null && beforeInt !== undefined
                              ? (intGrace > 0 ? `${beforeInt}+@${intGrace}` : String(beforeInt))
                              : "—";
                          const extDisplay = otype === "O.229" ? "—"
                            : beforeExt !== null && beforeExt !== undefined
                              ? (extGrace > 0 ? `${beforeExt}+@${extGrace}` : String(beforeExt))
                              : "—";
                          return (
                          <TableRow key={h.mark_id ? `${h.mark_id}-${idx}` : idx} className="group hover:bg-muted/20 transition-all border-border/40">
                            <TableCell className="py-3 text-center pl-4 text-xs font-bold text-muted-foreground">{globalIdx}</TableCell>
                            <TableCell className="py-3 text-center font-black text-xs text-muted-foreground">{h.roll_number || "—"}</TableCell>
                            <TableCell className="py-3">
                              <p className="font-bold text-sm">{h.student_name || "—"}</p>
                              {h.department && <p className="text-[10px] text-muted-foreground font-medium">{h.department}</p>}
                            </TableCell>
                            <TableCell className="py-3 pl-6">
                              <p className="text-xs font-bold truncate max-w-[180px]">{(h.subject_name || "—").replace(/[*@★D]$/, "").trim()}</p>
                              {h.ordinance_note && <p className="text-[10px] text-emerald-600 font-bold">{h.ordinance_note}</p>}
                            </TableCell>
                            <TableCell className="py-3 text-center">
                              {intDisplay !== "—" ? (
                                <span className={`font-black text-sm tabular-nums ${intGrace > 0 ? "text-emerald-600" : ""}`}>{intDisplay}</span>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="py-3 text-center">
                              {extDisplay !== "—" ? (
                                <span className={`font-black text-sm tabular-nums ${extGrace > 0 ? "text-emerald-600" : ""}`}>{extDisplay}</span>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="py-3 text-center">
                              {otype === "O.229" ? (
                                <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 border font-black text-[11px]">+0.1 SGPI</Badge>
                              ) : graceAdded > 0 ? (
                                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 border font-black text-[11px]">
                                  +{graceAdded}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3 text-center pr-6">
                              <Badge className={`border font-black text-[10px] ${otypeBadgeClass}`}>{otype}</Badge>
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>

                    {/* Pagination */}
                    {ordinanceHistoryTotalPages > 1 && (
                      <div className="flex items-center justify-between px-5 py-4 border-t border-border/40">
                        <p className="text-xs font-medium text-muted-foreground">
                          Page {ordinanceHistoryPage} of {ordinanceHistoryTotalPages}
                        </p>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon" className="h-8 w-8"
                            onClick={() => setOrdinanceHistoryPage((p) => Math.max(1, p - 1))}
                            disabled={ordinanceHistoryPage === 1}>
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          {Array.from({ length: ordinanceHistoryTotalPages }, (_, i) => i + 1)
                            .filter((p) => p === 1 || p === ordinanceHistoryTotalPages || Math.abs(p - ordinanceHistoryPage) <= 1)
                            .reduce<(number | "...")[]>((acc, p, idx2, arr) => {
                              if (idx2 > 0 && p - (arr[idx2 - 1] as number) > 1) acc.push("...");
                              acc.push(p);
                              return acc;
                            }, [])
                            .map((p, pidx) =>
                              p === "..." ? (
                                <span key={`e-${pidx}`} className="px-2 text-xs text-muted-foreground">…</span>
                              ) : (
                                <Button key={p} variant={ordinanceHistoryPage === p ? "default" : "outline"}
                                  size="icon" className="h-8 w-8 text-xs"
                                  onClick={() => setOrdinanceHistoryPage(p as number)}>
                                  {p}
                                </Button>
                              )
                            )}
                          <Button variant="outline" size="icon" className="h-8 w-8"
                            onClick={() => setOrdinanceHistoryPage((p) => Math.min(ordinanceHistoryTotalPages, p + 1))}
                            disabled={ordinanceHistoryPage === ordinanceHistoryTotalPages}>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!ordinanceHistoryAnalyzed && (
            <div className="border-2 border-dashed border-amber-500/20 rounded-3xl p-20 flex flex-col items-center justify-center gap-4 text-center bg-amber-500/5">
              <div className="p-6 bg-amber-500/10 rounded-full">
                <FileText className="h-10 w-10 text-amber-600/40" />
              </div>
              <p className="text-xl font-black text-foreground">Select Rule & Exam</p>
              <p className="text-sm text-muted-foreground font-medium max-w-sm">
                Choose an ordinance rule and an exam above, then click <span className="font-bold">Analyze</span> to see eligible students.
              </p>
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card className="border-none shadow-sm bg-card/50">
            <CardHeader className="border-b border-border/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <History className="h-4 w-4 text-primary" />
                    Grace Marks Application History
                  </CardTitle>
                  {!historyLoading && graceHistory.length > 0 && (
                    <span className="text-xs text-muted-foreground font-medium">
                      Showing {(historyPage - 1) * GRACE_PAGE_SIZE + 1}–{Math.min(historyPage * GRACE_PAGE_SIZE, graceHistory.length)} of {graceHistory.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 font-bold text-xs" onClick={fetchGraceHistory} disabled={historyLoading}>
                    {historyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    Refresh
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" className="h-8 gap-1.5 font-bold text-xs" disabled={historyExporting || graceHistory.length === 0}>
                        {historyExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={handleHistoryExcelExport} className="gap-2 cursor-pointer">
                        <FileSpreadsheet className="h-4 w-4 text-green-600" />
                        Export as Excel
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleHistoryCSVExport} className="gap-2 cursor-pointer">
                        <FileText className="h-4 w-4 text-blue-600" />
                        Export as CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {historyLoading ? (
                <div className="p-20 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm font-bold text-muted-foreground">Loading history...</p>
                </div>
              ) : graceHistory.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow className="hover:bg-transparent border-none">
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-5 pl-6 w-36">Date &amp; Time</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-5 w-28">Roll No.</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-5">Student Name</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-5 text-center w-20">Sem</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-5 text-center w-16">Year</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-5">Subject</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-5 text-center w-28">Int Grace</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-5 text-center w-28">Ext Grace</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-5 text-center pr-6 w-28">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedHistory.map((entry: any) => {
                          const status = parseHistoryStatus(entry.result);
                          return (
                            <TableRow key={entry.id} className="group hover:bg-muted/30 transition-colors border-border/40">
                              <TableCell className="py-4 pl-6">
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs font-black">{new Date(entry.created_at).toLocaleDateString("en-IN")}</span>
                                  </div>
                                  <span className="text-[10px] font-bold text-muted-foreground pl-4">
                                    {new Date(entry.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                <span className="text-xs font-bold text-muted-foreground uppercase">{entry.roll_number || "—"}</span>
                              </TableCell>
                              <TableCell className="py-4">
                                <p className="text-sm font-black text-foreground">{entry.student_name || "—"}</p>
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <span className="text-xs font-bold text-muted-foreground">{entry.semester || "—"}</span>
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <Badge variant="outline" className="font-black text-[9px] uppercase tracking-tighter border-primary/30 text-primary px-2">
                                  {getYearLabel(entry.year)}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-4">
                                <span className="text-xs font-bold">{entry.subject_name || "—"}</span>
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                {entry.original_marks > 0 ? (
                                  <Badge className="bg-blue-500/10 text-blue-600 border-none font-black text-[10px] px-2 h-6">+{entry.original_marks}</Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                {entry.grace_given > 0 ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-black text-[10px] px-2 h-6">+{entry.grace_given}</Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="py-4 text-center pr-6">
                                <Badge className={`font-black text-[10px] px-2 h-6 border-none ${
                                  status === "PASS" ? "bg-emerald-500/10 text-emerald-600"
                                  : status === "FAIL" ? "bg-red-500/10 text-red-600"
                                  : "bg-muted text-muted-foreground"
                                }`}>
                                  {status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {historyTotalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-border/40">
                      <p className="text-xs text-muted-foreground font-medium">
                        Page {historyPage} of {historyTotalPages}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline" size="icon" className="h-8 w-8"
                          onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                          disabled={historyPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        {Array.from({ length: historyTotalPages }, (_, i) => i + 1)
                          .filter((p) => p === 1 || p === historyTotalPages || Math.abs(p - historyPage) <= 1)
                          .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                            if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                            acc.push(p);
                            return acc;
                          }, [])
                          .map((p, idx) =>
                            p === "..." ? (
                              <span key={`ellipsis-${idx}`} className="px-2 text-xs text-muted-foreground">…</span>
                            ) : (
                              <Button
                                key={p}
                                variant={historyPage === p ? "default" : "outline"}
                                size="icon" className="h-8 w-8 text-xs"
                                onClick={() => setHistoryPage(p as number)}
                              >
                                {p}
                              </Button>
                            )
                          )}
                        <Button
                          variant="outline" size="icon" className="h-8 w-8"
                          onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                          disabled={historyPage === historyTotalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-24 flex flex-col items-center justify-center gap-6 text-center">
                  <div className="p-5 bg-muted rounded-full">
                    <Zap className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-black text-foreground">No history yet</p>
                    <p className="text-sm text-muted-foreground font-medium max-w-sm mx-auto">
                      Grace marks you apply will appear here with student details.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

        {/* Grace Apply Confirmation Dialog */}
        <Dialog open={!!graceConfirmDialog} onOpenChange={(open) => !open && setGraceConfirmDialog(null)}>
          <DialogContent className="max-w-md border-none shadow-2xl rounded-3xl p-0 overflow-hidden">
            <div className="p-6 bg-muted/30 border-b border-border/50">
              <DialogHeader>
                <DialogTitle className="text-lg font-black text-foreground flex items-center gap-2">
                  <Zap className="h-5 w-5 text-emerald-500" />
                  Confirm Grace Marks
                </DialogTitle>
                <DialogDescription className="text-sm font-medium text-muted-foreground mt-1">
                  Applying <span className="font-black text-foreground">+{graceConfirmDialog?.applyInt}</span> Internal and{" "}
                  <span className="font-black text-foreground">+{graceConfirmDialog?.applyExt}</span> External grace marks.
                  The following students will change to <span className="text-emerald-500 font-black">PASS</span>:
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="p-6 space-y-2 max-h-56 overflow-y-auto">
              {graceConfirmDialog?.students.map((s) => (
                <div key={s.unique_key} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border/40">
                  <div>
                    <p className="text-sm font-black text-foreground">{s.student_name}</p>
                    <p className="text-[10px] text-muted-foreground font-medium">{s.subject_name} · Roll {s.roll_number}</p>
                  </div>
                  <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-black text-[10px] uppercase">
                    Will Pass
                  </Badge>
                </div>
              ))}
            </div>
            <DialogFooter className="p-6 bg-muted/20 border-t border-border/50 flex flex-row gap-3 justify-end">
              <Button
                variant="ghost"
                className="font-black text-xs uppercase tracking-widest"
                onClick={() => setGraceConfirmDialog(null)}
              >
                Cancel
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black gap-2 rounded-xl"
                onClick={() => {
                  setGraceConfirmDialog(null);
                  applyGrace();
                }}
              >
                <Zap className="h-4 w-4" />
                Yes, Apply Grace
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Ordinance Grace Confirmation Dialog */}
        <Dialog open={ordinanceConfirmOpen} onOpenChange={(open) => !open && setOrdinanceConfirmOpen(false)}>
          <DialogContent className="max-w-lg border-none shadow-2xl rounded-3xl p-0 overflow-hidden">
            <div className="p-6 bg-amber-500/10 border-b border-amber-500/20">
              <DialogHeader>
                <DialogTitle className="text-lg font-black text-foreground flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-600" />
                  Confirm Ordinance Grace Marks
                </DialogTitle>
                <DialogDescription className="text-sm font-medium text-muted-foreground mt-1">
                  You are about to apply grace marks based on ordinance rules.
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/40 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Grace to Apply</p>
                  <p className="text-sm font-black">
                    {(parseFloat(ordinanceApplyInt) || 0) > 0 && <span className="text-blue-600">+{ordinanceApplyInt} Internal </span>}
                    {(parseFloat(ordinanceApplyExt) || 0) > 0 && <span className="text-emerald-600">+{ordinanceApplyExt} External</span>}
                  </p>
                </div>
                <div className="bg-muted/40 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Range Criteria</p>
                  <p className="text-sm font-black text-amber-700">Int &lt; {ordinanceIntThreshold} &amp; Ext &lt; {ordinanceExtThreshold}</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Applying To</p>
                  <p className="text-sm font-black">
                    {ordinanceConfirmMode === "all"
                      ? `All ${ordinanceStudents.length} students`
                      : `${ordinanceSelectedKeys.size} selected student(s)`}
                  </p>
                </div>
                <div className="bg-amber-500/10 rounded-xl p-3 space-y-1 border border-amber-500/20">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Effect</p>
                  <p className="text-sm font-black text-amber-700">Marks &amp; CGPA will be updated</p>
                </div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex gap-2 items-start">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 font-bold">This action cannot be undone automatically. Verify the grace marks and student list before confirming.</p>
              </div>
            </div>
            <DialogFooter className="p-6 bg-muted/20 border-t border-border/50 flex flex-row gap-3 justify-end">
              <Button
                variant="ghost"
                className="font-black text-xs uppercase tracking-widest"
                onClick={() => setOrdinanceConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={applying}
                className="bg-amber-600 hover:bg-amber-700 text-white font-black gap-2 rounded-xl"
                onClick={() => applyOrdinanceGrace(ordinanceConfirmMode)}
              >
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Yes, Apply Grace
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Ordinance Rule Apply Grace Confirmation */}
        <Dialog open={ordinanceRuleApplyConfirm} onOpenChange={(open) => !open && setOrdinanceRuleApplyConfirm(false)}>
          <DialogContent className="max-w-md border-none shadow-2xl rounded-3xl p-0 overflow-hidden">
            <div className="p-6 bg-emerald-500/10 border-b border-emerald-500/20">
              <DialogHeader>
                <DialogTitle className="text-lg font-black text-foreground flex items-center gap-2">
                  <Zap className="h-5 w-5 text-emerald-600" />
                  Apply Ordinance Grace Marks
                </DialogTitle>
                <DialogDescription className="text-sm font-medium text-muted-foreground mt-1">
                  The Gracing Engine (O.5042-A + O.5045-A) will scan and update all eligible students for this exam.
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/40 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Rules Applied</p>
                  <p className="text-sm font-black text-emerald-700">O.5042-A + O.5045-A</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Grace Symbols</p>
                  <p className="text-sm font-black">* (O.5042-A) &nbsp; @ (O.5045-A)</p>
                </div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex gap-2 items-start">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 font-bold">This will permanently update marks in the database. The generated Gadget Sheet will reflect marks in the format <strong>OriginalMarks+@Grace</strong> (e.g. 12+@2) and the Grade column will show the clean computed grade.</p>
              </div>
            </div>
            <DialogFooter className="p-6 bg-muted/20 border-t border-border/50 flex flex-row gap-3 justify-end">
              <Button variant="ghost" className="font-black text-xs uppercase tracking-widest" onClick={() => setOrdinanceRuleApplyConfirm(false)}>
                Cancel
              </Button>
              <Button
                disabled={ordinanceRuleApplying}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black gap-2 rounded-xl"
                onClick={handleOrdinanceRuleApplyGrace}
              >
                {ordinanceRuleApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Yes, Apply Grace
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Student Detail Dialog */}
        <Dialog open={!!selectedStudent} onOpenChange={(open) => !open && setSelectedStudent(null)}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden border-none shadow-2xl rounded-3xl">
            {selectedStudent && (
              <div className="flex flex-col">
                <div className="p-8 bg-muted/50 border-b border-border/50">
                  <DialogHeader>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                          <Users className="h-7 w-7" />
                        </div>
                        <div>
                          <DialogTitle className="text-2xl font-black text-foreground">{selectedStudent.student_name}</DialogTitle>
                          <DialogDescription className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1 flex items-center gap-3">
                            <span>Roll: {selectedStudent.roll_number}</span>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                            <span>{selectedStudent.department}</span>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                            <span>{selectedStudent.year}</span>
                          </DialogDescription>
                        </div>
                      </div>
                      <Badge className={`${(String(selectedStudent.result ?? '').includes('P A S S') || String(selectedStudent.result ?? '').includes('PASS')) ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-destructive/10 text-destructive border-destructive/20'} border font-black uppercase text-xs tracking-widest px-4 h-9 rounded-xl`}>
                        {selectedStudent.result ?? "—"}
                      </Badge>
                    </div>
                  </DialogHeader>
                </div>

                <div className="p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      Subject-wise Marks Breakdown
                    </h3>
                  </div>

                  <div className="border border-border/50 rounded-2xl overflow-hidden bg-background/50 shadow-inner">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 pl-6">Subject</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 text-center">Int</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 text-center">Ext</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 text-center">Total</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 text-center">Status</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 text-right pr-6">Manual Grace</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(Array.isArray(selectedStudent.subjects) ? selectedStudent.subjects : []).map((sub: any, subIdx: number) => {
                          const extMarks = (parseFloat(sub.theo_marks || 0)) + (parseFloat(sub.prac_marks || 0));
                          const isFailing = sub.is_pass === false || sub.grade === 'F';
                          return (
                            <TableRow key={sub.subject_code ?? sub.subject_name ?? subIdx} className="hover:bg-muted/20 transition-colors border-border/40">
                              <TableCell className="py-4 pl-6">
                                <p className="text-sm font-black text-foreground">{sub.subject_name}</p>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase">{sub.subject_code}</p>
                              </TableCell>
                              <TableCell className="py-4 text-center font-bold text-xs tabular-nums">{sub.int_marks || 0}</TableCell>
                              <TableCell className="py-4 text-center font-bold text-xs tabular-nums">{extMarks}</TableCell>
                              <TableCell className="py-4 text-center">
                                <span className={`font-black text-sm tabular-nums ${isFailing ? 'text-destructive' : 'text-emerald-600'}`}>
                                  {sub.obtained_marks || 0}
                                </span>
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <Badge className={`${!isFailing ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive'} border-none font-black text-[10px] uppercase px-2.5 h-6`}>
                                  {!isFailing ? 'PASS' : 'FAIL'}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-4 text-right pr-6">
                                <div className="flex items-center justify-end gap-2">
                                  <Input 
                                    type="number" 
                                    placeholder="Amt"
                                    className="w-16 h-8 text-xs font-bold text-center bg-muted/30 border-muted-foreground/20 rounded-lg focus:ring-primary/20 transition-all"
                                    value={manualGrace[sub.subject_name] || ""}
                                    onChange={(e) => setManualGrace(prev => ({ ...prev, [sub.subject_name]: e.target.value }))}
                                  />
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-8 text-[9px] font-black uppercase tracking-widest border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground rounded-lg px-3 transition-all active:scale-95"
                                    onClick={() => applyGrace({ 
                                      mark_id: selectedStudent.id, 
                                      subject_name: sub.subject_name,
                                      grace_amt: parseFloat(manualGrace[sub.subject_name]) || undefined
                                    })}
                                    disabled={applying}
                                  >
                                    {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                                    Apply
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="p-6 bg-muted/30 border-t border-border/50 flex justify-end">
                  <Button 
                    variant="ghost" 
                    className="font-black text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setSelectedStudent(null)}
                  >
                    Close Window
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

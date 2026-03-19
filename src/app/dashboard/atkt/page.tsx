"use client";

import { useAuth } from "@/lib/auth-context";
import { useEffect, useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, Search, Loader2, Download, Upload, History,
  Users, RefreshCw, FileSpreadsheet, X, ChevronDown, ChevronRight,
  CheckCircle2, BookOpen, FileText, Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

interface AtktStudent {
  id: string;
  roll_number: string;
  student_name: string;
  department: string;
  semester: string;
  atkt_count: number;
  result: string;
}

interface SubjectDetail {
  subject_name: string;
  subject_code?: string;
  int_marks?: number;
  theo_marks?: number;
  prac_marks?: number;
  obtained_marks: number;
  max_marks: number;
  is_pass: boolean;
  grade: string;
  credits?: number;
}

interface StudentDetail {
  id: string;
  roll_number: string;
  student_name: string;
  department: string;
  year: string;
  subjects: SubjectDetail[];
  result: string;
}

interface SubjectChange {
  name: string;
  intBefore?: number | null;
  intAfter?: number | null;
  theoBefore?: number | null;
  theoAfter?: number | null;
}

interface HistoryEntry {
  id: string;
  timestamp: string; // ISO string so it survives JSON serialisation
  type: "manual" | "bulk";
  studentName?: string;
  rollNumber?: string;
  department?: string;
  course?: string;
  year?: string;
  semester?: string;
  updatedCount?: number;
  fileName?: string;
  subjectChanges?: SubjectChange[];
}

// ---------- localStorage helpers ----------
const LS_KEY = "atkt_update_history_v2";

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(history: HistoryEntry[]) {
  try {
    // Keep latest 500 entries to avoid unbounded growth
    localStorage.setItem(LS_KEY, JSON.stringify(history.slice(0, 500)));
  } catch { /* quota exceeded — ignore */ }
}

// ---------- export helpers ----------

function getYearLabel(year: string | null | undefined) {
  if (!year) return "";
  const map: Record<string, string> = { "1": "FY", "2": "SY", "3": "TY", FY: "FY", SY: "SY", TY: "TY" };
  return map[year] || year;
}

function buildHistoryExportRows(history: HistoryEntry[]) {
  const rows: {
    type: string;
    studentName: string;
    rollNumber: string;
    course: string;
    year: string;
    semester: string;
    subjectName: string;
    intBefore: string;
    intAfter: string;
    extBefore: string;
    extAfter: string;
    bulkCount: string;
    fileName: string;
    date: string;
    time: string;
  }[] = [];

  for (const entry of history) {
    const date = format(new Date(entry.timestamp), "dd/MM/yyyy");
    const time = format(new Date(entry.timestamp), "hh:mm a");

    if (entry.type === "bulk") {
      rows.push({
        type: "Bulk",
        studentName: "",
        rollNumber: "",
        course: "",
        year: "",
        semester: "",
        subjectName: "",
        intBefore: "",
        intAfter: "",
        extBefore: "",
        extAfter: "",
        bulkCount: String(entry.updatedCount ?? ""),
        fileName: entry.fileName ?? "",
        date,
        time,
      });
    } else {
      const changes = entry.subjectChanges ?? [];
      if (changes.length > 0) {
        for (const sc of changes) {
          rows.push({
            type: "Manual",
            studentName: entry.studentName ?? "",
            rollNumber: entry.rollNumber ?? "",
            course: entry.course ?? entry.department ?? "",
            year: getYearLabel(entry.year),
            semester: entry.semester ?? "",
            subjectName: sc.name,
            intBefore: sc.intBefore != null ? String(sc.intBefore) : "",
            intAfter: sc.intAfter != null ? String(sc.intAfter) : "",
            extBefore: sc.theoBefore != null ? String(sc.theoBefore) : "",
            extAfter: sc.theoAfter != null ? String(sc.theoAfter) : "",
            bulkCount: "",
            fileName: "",
            date,
            time,
          });
        }
      } else {
        rows.push({
          type: "Manual",
          studentName: entry.studentName ?? "",
          rollNumber: entry.rollNumber ?? "",
          course: entry.course ?? entry.department ?? "",
          year: getYearLabel(entry.year),
          semester: entry.semester ?? "",
          subjectName: "",
          intBefore: "",
          intAfter: "",
          extBefore: "",
          extAfter: "",
          bulkCount: "",
          fileName: "",
          date,
          time,
        });
      }
    }
  }
  return rows;
}

async function exportHistoryToXLS(history: HistoryEntry[]) {
  const ExcelJS = (await import("exceljs")).default;

  const wb = new ExcelJS.Workbook();
  wb.creator = "ATKT System";
  wb.created = new Date();
  const ws = wb.addWorksheet("ATKT Update History");

  // Column widths matching ATKT export template style
  const colWidths = [12, 28, 16, 35, 10, 14, 50, 13, 13, 13, 13, 14, 12];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // Styles
  const HEADER_FONT: Partial<import("exceljs").Font> = { bold: true, size: 11, name: "Calibri", color: { argb: "FFFFFFFF" } };
  const DATA_FONT: Partial<import("exceljs").Font> = { size: 11, name: "Calibri" };
  const HEADER_FILL: import("exceljs").Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF59E0B" } };
  const DATA_FILL: import("exceljs").Fill = { type: "pattern", pattern: "none" };
  const THIN_BORDER: Partial<import("exceljs").Border> = { style: "thin", color: { argb: "FFD1D5DB" } };
  const CELL_BORDER: Partial<import("exceljs").Borders> = { left: THIN_BORDER, right: THIN_BORDER, top: THIN_BORDER, bottom: THIN_BORDER };
  const CENTER_ALIGN: Partial<import("exceljs").Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };
  const LEFT_ALIGN: Partial<import("exceljs").Alignment> = { horizontal: "left", vertical: "middle", wrapText: true };

  // Header row
  const headers = ["Type", "Student Name", "Roll Number", "Course", "Year", "Semester", "Subject", "Int Before", "Int After", "Ext Before", "Ext After", "Bulk Count", "File Name"];
  const headerRow = ws.addRow(headers);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = CENTER_ALIGN;
    cell.border = CELL_BORDER;
  });

  const mergeQueue: { startRow: number; endRow: number; cols: number[] }[] = [];

  for (const entry of history) {
    const date = format(new Date(entry.timestamp), "dd/MM/yyyy");
    const time = format(new Date(entry.timestamp), "hh:mm a");

    if (entry.type === "bulk") {
      const row = ws.addRow([
        "Bulk", "", "", "", "", "",
        `Bulk upload: ${entry.fileName || ""}`,
        "", "", "", "",
        String(entry.updatedCount ?? ""),
        entry.fileName ?? "",
      ]);
      row.height = 22;
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.font = { ...DATA_FONT, bold: true, color: { argb: "FF2563EB" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
        cell.border = CELL_BORDER;
        cell.alignment = colNum === 7 ? LEFT_ALIGN : CENTER_ALIGN;
      });
      // Append date/time as note in subject cell
      const subCell = row.getCell(7);
      subCell.value = `Bulk upload: ${entry.fileName || ""} — ${date} ${time}`;
    } else {
      const changes = entry.subjectChanges ?? [];
      const groupSize = changes.length > 0 ? changes.length : 1;
      const startRowNum = ws.rowCount + 1;

      if (changes.length > 0) {
        changes.forEach((sc, idx) => {
          const row = ws.addRow([
            idx === 0 ? "Manual" : "",
            idx === 0 ? (entry.studentName ?? "") : "",
            idx === 0 ? (entry.rollNumber ?? "") : "",
            idx === 0 ? (entry.course ?? entry.department ?? "") : "",
            idx === 0 ? getYearLabel(entry.year) : "",
            idx === 0 ? (entry.semester ?? "") : "",
            sc.name,
            sc.intBefore != null ? sc.intBefore : "",
            sc.intAfter != null ? sc.intAfter : "",
            sc.theoBefore != null ? sc.theoBefore : "",
            sc.theoAfter != null ? sc.theoAfter : "",
            "",
            "",
          ]);
          row.height = 22;
          row.eachCell({ includeEmpty: true }, (cell, colNum) => {
            cell.font = DATA_FONT;
            cell.fill = DATA_FILL;
            cell.border = CELL_BORDER;
            cell.alignment = colNum === 7 ? LEFT_ALIGN : CENTER_ALIGN;
          });
          // Colour arrows for int/ext changes
          row.getCell(8).font = { ...DATA_FONT, color: { argb: "FF6B7280" } };
          row.getCell(9).font = { ...DATA_FONT, bold: true, color: { argb: "FF059669" } };
          row.getCell(10).font = { ...DATA_FONT, color: { argb: "FF6B7280" } };
          row.getCell(11).font = { ...DATA_FONT, bold: true, color: { argb: "FF059669" } };
          if (idx === 0) row.getCell(1).font = { ...DATA_FONT, bold: true, color: { argb: "FFD97706" } };
        });
      } else {
        const row = ws.addRow([
          "Manual",
          entry.studentName ?? "",
          entry.rollNumber ?? "",
          entry.course ?? entry.department ?? "",
          getYearLabel(entry.year),
          entry.semester ?? "",
          "",
          "", "", "", "", "", "",
        ]);
        row.height = 22;
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          cell.font = DATA_FONT;
          cell.fill = DATA_FILL;
          cell.border = CELL_BORDER;
          cell.alignment = colNum === 7 ? LEFT_ALIGN : CENTER_ALIGN;
        });
        row.getCell(1).font = { ...DATA_FONT, bold: true, color: { argb: "FFD97706" } };
      }

      // Merge student-info cols for multi-subject entries
      if (groupSize >= 2) {
        const endRowNum = startRowNum + groupSize - 1;
        mergeQueue.push({ startRow: startRowNum, endRow: endRowNum, cols: [1, 2, 3, 4, 5, 6] });
      }
    }
  }

  // Apply merges
  for (const m of mergeQueue) {
    for (const col of m.cols) {
      ws.mergeCells(m.startRow, col, m.endRow, col);
      const cell = ws.getCell(m.startRow, col);
      cell.alignment = CENTER_ALIGN;
      cell.border = CELL_BORDER;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ATKT_Update_History_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportHistoryToCSV(history: HistoryEntry[]) {
  const rows = buildHistoryExportRows(history);
  const headers = ["Type", "Student Name", "Roll Number", "Course", "Year", "Semester", "Subject", "Int Before", "Int After", "Ext Before", "Ext After", "Bulk Count", "File Name", "Date", "Time"];

  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      [r.type, r.studentName, r.rollNumber, r.course, r.year, r.semester, r.subjectName, r.intBefore, r.intAfter, r.extBefore, r.extAfter, r.bulkCount, r.fileName, r.date, r.time]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ATKT_Update_History_${format(new Date(), "yyyyMMdd_HHmm")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- component ----------

export default function AtktPage() {
  const { user } = useAuth();

  // List state
  const [students, setStudents] = useState<AtktStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filter options — auto-detected from full dataset
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [filterSem, setFilterSem] = useState("all");
  const [depts, setDepts] = useState<string[]>([]);
  const [sems, setSems] = useState<string[]>([]);
  const filtersLoaded = useRef(false);

  // Inline expanded rows
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, StudentDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  // Save marks
  const [editMarks, setEditMarks] = useState<Record<string, { int: string; theo: string; prac: string }>>({});
  const [saving, setSaving] = useState(false);

  // Bulk upload
  const bulkRef = useRef<HTMLInputElement>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);
  const [exportingHistory, setExportingHistory] = useState(false);

  // History — persisted to localStorage
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // History filters
  const [histFilterCourse, setHistFilterCourse] = useState("all");
  const [histFilterYear, setHistFilterYear] = useState("all");
  const [histFilterSem, setHistFilterSem] = useState("all");
  const [histFilterDept, setHistFilterDept] = useState("all");

  const LIMIT = 10;

  // Load history from localStorage on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Persist history to localStorage whenever it changes
  useEffect(() => {
    if (history.length > 0) saveHistory(history);
  }, [history]);

  // ── Fetch filter options once ──────────────────
  const fetchFilterOptions = async () => {
    if (!user || filtersLoaded.current) return;
    try {
      const res = await fetch(`/api/marks/atkt?uid=${user.uid}&limit=9999&page=1`);
      const json = await res.json();
      const all: AtktStudent[] = json.students || [];
      const ds = [...new Set(all.map((s) => s.department))].filter(Boolean).sort() as string[];
      const ss = [...new Set(all.map((s) => s.semester))].filter(Boolean).sort() as string[];
      setDepts(ds);
      setSems(ss);
      filtersLoaded.current = true;
    } catch { /* ignore */ }
  };

  const fetchStudents = async (p = 1) => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ uid: user.uid, page: String(p), limit: String(LIMIT) });
      if (filterDept !== "all") params.set("department", filterDept);
      if (filterSem !== "all") params.set("year", filterSem);
      const res = await fetch(`/api/marks/atkt?${params}`);
      const json = await res.json();
      setStudents(json.students || []);
      setTotal(json.total || 0);
      setTotalPages(json.total_pages || 1);
      setPage(p);
    } catch {
      toast.error("Failed to load ATKT students");
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (studentId: string) => {
    if (!user) return;
    if (detailCache[studentId]) {
      toggleExpand(studentId, detailCache[studentId]);
      return;
    }
    setDetailLoading(studentId);
    try {
      const res = await fetch(`/api/marks/detail?uid=${user.uid}&mark_id=${studentId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const s: StudentDetail = json.student;
      setDetailCache((prev) => ({ ...prev, [studentId]: s }));
      toggleExpand(studentId, s);
    } catch (e: any) {
      toast.error(e.message || "Failed to load student detail");
    } finally {
      setDetailLoading(null);
    }
  };

  const toggleExpand = (id: string, detail: StudentDetail) => {
    if (expandedId === id) { setExpandedId(null); return; }
    const init: Record<string, { int: string; theo: string; prac: string }> = {};
    (detail.subjects || []).forEach((sub) => {
      init[sub.subject_name] = {
        int: sub.int_marks != null ? String(sub.int_marks) : "",
        theo: sub.theo_marks != null ? String(sub.theo_marks) : "",
        prac: sub.prac_marks != null ? String(sub.prac_marks) : "",
      };
    });
    setEditMarks(init);
    setExpandedId(id);
  };

  const handleRowClick = (student: AtktStudent) => {
    if (expandedId === student.id) { setExpandedId(null); return; }
    fetchDetail(student.id);
  };

  const saveMarks = async (student: AtktStudent) => {
    if (!user) return;
    const detail = detailCache[student.id];
    if (!detail) return;
    setSaving(true);
    try {
      const updatedSubjects = detail.subjects.map((sub) => {
        const e = editMarks[sub.subject_name];
        return {
          ...sub,
          int_marks: e ? (parseFloat(e.int) || 0) : (sub.int_marks ?? 0),
          theo_marks: e ? (parseFloat(e.theo) || 0) : (sub.theo_marks ?? 0),
          prac_marks: e ? (parseFloat(e.prac) || 0) : (sub.prac_marks ?? 0),
        };
      });
      const res = await fetch("/api/marks/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, mark_id: detail.id, subjects: updatedSubjects }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success("Marks updated successfully");
      setExpandedId(null);

      const subjectChanges: SubjectChange[] = detail.subjects
        .filter((sub) => {
          const e = editMarks[sub.subject_name];
          if (!e) return false;
          const intChanged = e.int !== "" && parseFloat(e.int) !== (sub.int_marks ?? 0);
          const theoChanged = e.theo !== "" && parseFloat(e.theo) !== (sub.theo_marks ?? 0);
          return intChanged || theoChanged;
        })
        .map((sub) => {
          const e = editMarks[sub.subject_name] || { int: "", theo: "" };
          return {
            name: sub.subject_name,
            intBefore: sub.int_marks ?? null,
            intAfter: e.int !== "" ? parseFloat(e.int) : null,
            theoBefore: sub.theo_marks ?? null,
            theoAfter: e.theo !== "" ? parseFloat(e.theo) : null,
          };
        });

      const newEntry: HistoryEntry = {
        id: `${Date.now()}-${student.id}`,
        timestamp: new Date().toISOString(),
        type: "manual",
        studentName: student.student_name,
        rollNumber: student.roll_number,
        department: student.department,
        course: student.department,       // department IS the course in this schema
        semester: student.semester,
        subjectChanges,
      };
      setHistory((prev) => {
        const updated = [newEntry, ...prev];
        saveHistory(updated);
        return updated;
      });

      setDetailCache((prev) => { const n = { ...prev }; delete n[student.id]; return n; });
      fetchStudents(page);
    } catch (e: any) {
      toast.error(e.message || "Failed to save marks");
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await fetch("/api/marks/atkt-template");
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Update_Marks_Template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Template download failed"); }
  };

  const handleBulkUpload = async (file: File) => {
    if (!user) return;
    setBulkUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("uid", user.uid);
      const res = await fetch("/api/marks/atkt-bulk-upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      toast.success(`Updated ${json.updated_count} student record(s)`);
      setShowBulkPanel(false);
      const newEntry: HistoryEntry = {
        id: `bulk-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: "bulk",
        updatedCount: json.updated_count,
        fileName: file.name,
      };
      setHistory((prev) => {
        const updated = [newEntry, ...prev];
        saveHistory(updated);
        return updated;
      });
      filtersLoaded.current = false;
      fetchStudents(1);
      fetchFilterOptions();
    } catch (e: any) {
      toast.error(e.message || "Bulk upload failed");
    } finally {
      setBulkUploading(false);
    }
  };

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({ uid: user.uid, limit: "9999", page: "1" });
      if (filterDept !== "all") params.set("department", filterDept);
      if (filterSem !== "all") params.set("year", filterSem);
      const res = await fetch(`/api/marks/atkt-export?${params}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ATKT_Students_${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch { toast.error("Export failed"); }
    finally { setExporting(false); }
  };

  useEffect(() => {
    if (user) { fetchFilterOptions(); fetchStudents(1); }
  }, [user]);

  useEffect(() => {
    if (user) fetchStudents(1);
  }, [filterDept, filterSem]);

  useEffect(() => {
    if (!user) return;
    const reload = () => { filtersLoaded.current = false; fetchFilterOptions(); fetchStudents(1); };
    const onFocus = () => reload();
    const onVisibility = () => { if (document.visibilityState === "visible") reload(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisibility); };
  }, [user]);

  // Client-side search filter
  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter(
      (s) => s.student_name.toLowerCase().includes(q) || s.roll_number.toLowerCase().includes(q) || s.department.toLowerCase().includes(q)
    );
  }, [students, search]);

  const currentDetail = expandedId ? detailCache[expandedId] : null;
  const atktSubjects = useMemo(() => {
    if (!currentDetail) return [];
    return currentDetail.subjects.filter((s) => s.is_pass === false || s.grade === "F" || s.grade === "D");
  }, [currentDetail]);

  // ── History filter derived options ──
  const histDepts = useMemo(
    () => [...new Set(history.filter((h) => h.type === "manual").map((h) => h.department || "").filter(Boolean))].sort() as string[],
    [history]
  );
  const histCourses = useMemo(
    () => [...new Set(history.filter((h) => h.type === "manual").map((h) => h.course || h.department || "").filter(Boolean))].sort() as string[],
    [history]
  );
  const histYears = useMemo(
    () => ["FY", "SY", "TY"] as string[],
    []
  );
  const histSems = useMemo(
    () => [...new Set(history.filter((h) => h.type === "manual").map((h) => h.semester || "").filter(Boolean))].sort() as string[],
    [history]
  );

  // ── Filtered history ──
  const filteredHistory = useMemo(() => {
    return history.filter((entry) => {
      if (histFilterDept !== "all") {
        const d = entry.department || entry.course || "";
        if (d !== histFilterDept) return false;
      }
      if (histFilterCourse !== "all") {
        const c = entry.course || entry.department || "";
        if (c !== histFilterCourse) return false;
      }
      if (histFilterYear !== "all") {
        if (getYearLabel(entry.year) !== histFilterYear) return false;
      }
      if (histFilterSem !== "all") {
        if ((entry.semester || "") !== histFilterSem) return false;
      }
      return true;
    });
  }, [history, histFilterDept, histFilterCourse, histFilterYear, histFilterSem]);

  const hasHistFilters = histFilterDept !== "all" || histFilterCourse !== "all" || histFilterYear !== "all" || histFilterSem !== "all";

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            Update ATKT Marks
          </h1>
          <p className="text-sm text-muted-foreground">Grouped by student for easier management</p>
        </div>
        <Button
          className="h-9 gap-2 font-semibold bg-amber-600 hover:bg-amber-700 text-white"
          size="sm"
          onClick={() => setShowBulkPanel((v) => !v)}
        >
          <Upload className="h-4 w-4" />
          Update Marks
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showBulkPanel ? "rotate-180" : ""}`} />
        </Button>
      </div>

      {/* Bulk Upload Panel */}
      {showBulkPanel && (
        <Card className="border-amber-500/30 bg-amber-500/5 shadow-sm">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-bold">Bulk Update via Excel</p>
              <p className="text-xs text-muted-foreground">Download the template, fill in updated marks, then upload the file.</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Button variant="outline" size="sm" className="h-9 gap-2 font-semibold" onClick={downloadTemplate}>
                <Download className="h-4 w-4" />
                Download Template
              </Button>
              <Button size="sm" className="h-9 gap-2 font-semibold" onClick={() => bulkRef.current?.click()} disabled={bulkUploading}>
                {bulkUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {bulkUploading ? "Uploading…" : "Upload File"}
              </Button>
              <input ref={bulkRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBulkUpload(f); e.target.value = ""; }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="students">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="students" className="font-bold flex items-center gap-2">
            <Users className="h-4 w-4" />
            ATKT Students
            {total > 0 && (
              <Badge className="ml-1 h-5 px-1.5 text-[10px] font-black bg-destructive text-white border-none">{total}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="font-bold flex items-center gap-2">
            <History className="h-4 w-4" />
            Update History
          </TabsTrigger>
        </TabsList>

        {/* ── ATKT Students Tab ── */}
        <TabsContent value="students" className="space-y-4 mt-4">
          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-black">Students with ATKT</CardTitle>
                  <CardDescription className="text-xs mt-1">Click a student row to view & edit their subject marks</CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, roll or dept..." className="pl-8 h-9 text-sm w-56" />
                  </div>
                  <Select value={filterSem} onValueChange={setFilterSem}>
                    <SelectTrigger className="h-9 w-40 text-xs font-bold"><SelectValue placeholder="All Semesters" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Semesters</SelectItem>
                      {sems.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterDept} onValueChange={setFilterDept}>
                    <SelectTrigger className="h-9 w-40 text-xs font-bold"><SelectValue placeholder="All Departments" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {depts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 font-bold" onClick={() => fetchStudents(1)} disabled={loading}>
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Refresh
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 font-bold border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10" onClick={handleExport} disabled={exporting}>
                    {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center items-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary/30" />
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="text-center py-20">
                  <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-bold text-muted-foreground">No ATKT students found</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow className="hover:bg-transparent border-none">
                        <TableHead className="text-xs font-black uppercase tracking-wider py-4 pl-6">Roll Number</TableHead>
                        <TableHead className="text-xs font-black uppercase tracking-wider py-4">Student Name</TableHead>
                        <TableHead className="text-xs font-black uppercase tracking-wider py-4 text-center">ATKT Count</TableHead>
                        <TableHead className="text-xs font-black uppercase tracking-wider py-4">Department</TableHead>
                        <TableHead className="text-xs font-black uppercase tracking-wider py-4">Semester</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.map((s) => (
                        <>
                          <TableRow
                            key={s.id}
                            className={`hover:bg-muted/20 transition-colors border-border/40 cursor-pointer select-none ${expandedId === s.id ? "bg-muted/30" : ""}`}
                            onClick={() => handleRowClick(s)}
                          >
                            <TableCell className="py-4 pl-6 font-bold text-sm tabular-nums">{s.roll_number}</TableCell>
                            <TableCell className="py-4">
                              <div className="flex items-center gap-2">
                                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expandedId === s.id ? "rotate-90 text-primary" : ""}`} />
                                <span className={`font-bold text-sm ${expandedId === s.id ? "text-primary" : ""}`}>{s.student_name}</span>
                                {detailLoading === s.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/50" />}
                              </div>
                            </TableCell>
                            <TableCell className="py-4 text-center">
                              <Badge className={`font-black text-[11px] px-3 h-6 rounded-full ${s.atkt_count >= 3 ? "bg-destructive/20 text-destructive border-destructive/30 border" : s.atkt_count === 2 ? "bg-orange-500/20 text-orange-600 border-orange-500/30 border" : "bg-amber-500/20 text-amber-600 border-amber-500/30 border"}`}>
                                {s.atkt_count} Subject{s.atkt_count !== 1 ? "s" : ""}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-4 text-sm text-muted-foreground font-medium">{s.department}</TableCell>
                            <TableCell className="py-4 text-sm text-muted-foreground font-medium">{s.semester}</TableCell>
                          </TableRow>

                          {expandedId === s.id && currentDetail && (
                            <TableRow key={`${s.id}-detail`} className="bg-muted/10 hover:bg-muted/10 border-none">
                              <TableCell colSpan={5} className="p-0">
                                <div className="border-t border-b border-border/30 bg-muted/5 px-6 py-4 space-y-4">
                                  <div className="flex items-center gap-3 pb-2 border-b border-border/20">
                                    <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                                      <Users className="h-4 w-4 text-amber-600" />
                                    </div>
                                    <div>
                                      <p className="font-black text-sm leading-tight">{currentDetail.student_name}</p>
                                      <p className="text-[11px] text-muted-foreground font-medium">
                                        Roll: <span className="font-black text-foreground">{currentDetail.roll_number}</span>
                                        {" · "}Course: <span className="font-black text-foreground">{currentDetail.department}</span>
                                        {" · "}Backlogs: <span className="font-black text-destructive">{atktSubjects.length}</span>
                                      </p>
                                    </div>
                                  </div>

                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-[10px] font-black uppercase tracking-wider text-muted-foreground border-b border-border/30">
                                        <th className="text-left py-2 pr-4">Subject</th>
                                        <th className="text-center py-2 px-3 w-10">Sem</th>
                                        <th className="text-center py-2 px-3 w-24">Attempt</th>
                                        <th className="text-center py-2 px-3 w-28">Internal</th>
                                        <th className="text-center py-2 px-3 w-28">External</th>
                                        <th className="text-center py-2 px-3 w-20">Total</th>
                                        <th className="text-center py-2 pl-3 w-24">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {currentDetail.subjects.map((sub) => {
                                        const isFail = sub.is_pass === false || sub.grade === "F" || sub.grade === "D";
                                        const e = editMarks[sub.subject_name] || { int: "", theo: "", prac: "" };
                                        return (
                                          <tr key={sub.subject_name} className={`border-b border-border/20 last:border-none ${isFail ? "bg-destructive/5" : ""}`}>
                                            <td className="py-2.5 pr-4">
                                              <span className={`font-semibold ${isFail ? "text-destructive" : "text-foreground"}`}>{sub.subject_name}</span>
                                            </td>
                                            <td className="py-2.5 text-center text-xs font-bold text-muted-foreground">1</td>
                                            <td className="py-2.5 text-center">
                                              <Badge variant="outline" className="text-[10px] font-bold px-2">Regular (1)</Badge>
                                            </td>
                                            <td className="py-2.5 text-center">
                                              {isFail ? (
                                                <div className="flex flex-col items-center gap-0.5">
                                                  <span className="text-[9px] text-muted-foreground font-bold">{sub.int_marks ?? "–"}/{sub.int_marks != null ? 20 : "–"}</span>
                                                  <Input type="number" min={0} max={20} className="w-16 h-7 text-center text-xs font-bold"
                                                    value={e.int} onClick={(ev) => ev.stopPropagation()}
                                                    onChange={(ev) => setEditMarks((prev) => ({ ...prev, [sub.subject_name]: { ...prev[sub.subject_name], int: ev.target.value } }))}
                                                    placeholder={String(sub.int_marks ?? "–")}
                                                  />
                                                </div>
                                              ) : (
                                                <span className="text-sm font-bold">{sub.int_marks ?? "–"}/20</span>
                                              )}
                                            </td>
                                            <td className="py-2.5 text-center">
                                              {isFail ? (
                                                <div className="flex flex-col items-center gap-0.5">
                                                  <span className="text-[9px] text-muted-foreground font-bold">{sub.theo_marks ?? sub.prac_marks ?? "–"}/{sub.max_marks != null ? sub.max_marks - (sub.int_marks != null ? 20 : 0) : "–"}</span>
                                                  <Input type="number" min={0} className="w-16 h-7 text-center text-xs font-bold"
                                                    value={e.theo} onClick={(ev) => ev.stopPropagation()}
                                                    onChange={(ev) => setEditMarks((prev) => ({ ...prev, [sub.subject_name]: { ...prev[sub.subject_name], theo: ev.target.value } }))}
                                                    placeholder={String(sub.theo_marks ?? sub.prac_marks ?? "–")}
                                                  />
                                                </div>
                                              ) : (
                                                <span className="text-sm font-bold">{sub.theo_marks ?? sub.prac_marks ?? "–"}/{sub.max_marks != null ? sub.max_marks - (sub.int_marks != null ? 20 : 0) : "–"}</span>
                                              )}
                                            </td>
                                            <td className="py-2.5 text-center">
                                              <span className={`text-sm font-black tabular-nums ${isFail ? "text-destructive" : "text-foreground"}`}>
                                                {isFail ? (() => { const ni = parseFloat(e.int) || 0; const nt = parseFloat(e.theo) || 0; const newTotal = ni + nt; return newTotal > 0 ? newTotal : sub.obtained_marks; })() : sub.obtained_marks}
                                              </span>
                                            </td>
                                            <td className="py-2.5 text-center pl-3">
                                              <Badge className={`text-[10px] font-black px-2 h-5 ${isFail ? "bg-destructive/10 text-destructive border-destructive/30 border" : "bg-emerald-500/10 text-emerald-600 border-none"}`}>
                                                {isFail ? "ATKT" : "Pass"}
                                              </Badge>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>

                                  <div className="flex justify-end gap-3 pt-2">
                                    <Button variant="ghost" size="sm" className="h-8 font-bold text-xs uppercase tracking-widest" onClick={(e) => { e.stopPropagation(); setExpandedId(null); }}>Close</Button>
                                    <Button size="sm" className="h-8 gap-2 font-black bg-amber-600 hover:bg-amber-700 text-white" onClick={(e) => { e.stopPropagation(); saveMarks(s); }} disabled={saving}>
                                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                                      Save Updated Marks
                                    </Button>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>

                  {totalPages > 1 && (
                    <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-border/40">
                      <p className="text-xs text-muted-foreground font-medium">Page {page} of {totalPages} · {total} students</p>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => fetchStudents(page - 1)}>
                          <ChevronRight className="h-4 w-4 rotate-180" />
                        </Button>
                        {(() => {
                          const pages: (number | "...")[] = [];
                          if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
                          else {
                            pages.push(1);
                            if (page > 3) pages.push("...");
                            for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
                            if (page < totalPages - 2) pages.push("...");
                            pages.push(totalPages);
                          }
                          return pages.map((p, idx) =>
                            p === "..." ? (
                              <span key={`e-${idx}`} className="h-8 w-6 flex items-center justify-center text-xs text-muted-foreground font-bold">…</span>
                            ) : (
                              <Button key={p} variant={page === p ? "default" : "outline"} className={`h-8 w-8 text-xs font-black ${page === p ? "shadow-md shadow-primary/20" : ""}`} onClick={() => fetchStudents(p as number)}>{p}</Button>
                            )
                          );
                        })()}
                        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => fetchStudents(page + 1)}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── History Tab ── */}
        <TabsContent value="history" className="mt-4 space-y-4">

          {/* History filters */}
          {history.length > 0 && (
            <Card className="border-border/40 shadow-sm bg-card/50">
              <CardContent className="p-5">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  {/* Left column: Department & Course */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Department &amp; Course</p>
                    <div className="flex gap-2">
                      <Select value={histFilterDept} onValueChange={(v) => { setHistFilterDept(v); setHistFilterCourse("all"); }}>
                        <SelectTrigger className="h-9 flex-1 text-xs font-semibold">
                          <SelectValue placeholder="Select Dept" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Select Dept</SelectItem>
                          {histDepts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={histFilterCourse} onValueChange={setHistFilterCourse}>
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

                  {/* Right column: Year & Semester */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Year &amp; Semester</p>
                    <div className="flex gap-2">
                      <Select value={histFilterYear} onValueChange={setHistFilterYear}>
                        <SelectTrigger className="h-9 flex-1 text-xs font-semibold">
                          <SelectValue placeholder="Select Year" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Select Year</SelectItem>
                          {histYears.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={histFilterSem} onValueChange={setHistFilterSem}>
                        <SelectTrigger className="h-9 flex-1 text-xs font-semibold">
                          <SelectValue placeholder="Select Semester" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Select Semester</SelectItem>
                          {(histSems.length > 0 ? histSems : ["1", "2", "3", "4", "5", "6"]).map((s) => (
                            <SelectItem key={s} value={s}>Semester {s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {hasHistFilters && (
                  <div className="flex justify-end mt-3">
                    <Button size="sm" variant="ghost" className="h-7 px-3 text-xs font-bold text-destructive hover:text-destructive gap-1.5"
                      onClick={() => { setHistFilterDept("all"); setHistFilterCourse("all"); setHistFilterYear("all"); setHistFilterSem("all"); }}>
                      <X className="h-3.5 w-3.5" />
                      Clear Filters
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-black">Update History</CardTitle>
                  <CardDescription className="text-xs mt-1">ATKT marks updates via bulk upload or manual edit — persisted across sessions</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {history.length > 0 && (
                    <Badge className="font-black text-[11px] bg-primary/10 text-primary border-primary/20 border">
                      {filteredHistory.length}{hasHistFilters ? ` / ${history.length}` : ""} update{history.length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                  {history.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 font-bold text-xs border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10" disabled={exportingHistory}>
                          {exportingHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={async () => {
                          if (filteredHistory.length === 0) return toast.error("No data to export");
                          setExportingHistory(true);
                          try { await exportHistoryToXLS(filteredHistory); toast.success("XLS downloaded"); }
                          catch { toast.error("Export failed"); }
                          finally { setExportingHistory(false); }
                        }}>
                          <FileSpreadsheet className="h-4 w-4 text-green-600" />
                          Export as XLS
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => {
                          if (filteredHistory.length === 0) return toast.error("No data to export");
                          try { exportHistoryToCSV(filteredHistory); toast.success("CSV downloaded"); }
                          catch { toast.error("Export failed"); }
                        }}>
                          <FileText className="h-4 w-4 text-blue-600" />
                          Export as CSV
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
                    <History className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-bold text-muted-foreground">
                    {hasHistFilters ? "No results for current filters" : "No updates yet"}
                  </p>
                  <p className="text-xs text-muted-foreground/70 font-medium text-center max-w-xs">
                    {hasHistFilters
                      ? "Try adjusting or clearing the filters above."
                      : "History is recorded here whenever you save marks manually or do a bulk upload."}
                  </p>
                  {hasHistFilters && (
                    <Button variant="outline" size="sm" onClick={() => { setHistFilterDept("all"); setHistFilterCourse("all"); setHistFilterYear("all"); setHistFilterSem("all"); }}>
                      Clear Filters
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {filteredHistory.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-4 px-6 py-4 hover:bg-muted/20">
                      <div className={`mt-0.5 h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0 ${entry.type === "bulk" ? "bg-blue-500/10" : "bg-amber-500/10"}`}>
                        {entry.type === "bulk" ? <FileSpreadsheet className="h-4 w-4 text-blue-500" /> : <CheckCircle2 className="h-4 w-4 text-amber-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        {entry.type === "bulk" ? (
                          <>
                            <p className="text-sm font-black leading-tight">Bulk Upload — {entry.updatedCount} student{(entry.updatedCount ?? 0) !== 1 ? "s" : ""} updated</p>
                            <p className="text-xs text-muted-foreground font-medium mt-0.5 truncate">File: {entry.fileName}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-black leading-tight">
                              {entry.studentName}
                              <span className="ml-2 text-xs font-bold text-muted-foreground">#{entry.rollNumber}</span>
                            </p>
                            <p className="text-xs text-muted-foreground font-medium mt-0.5">
                              {entry.course || entry.department}
                              {entry.semester && <span className="ml-2">· Sem {entry.semester}</span>}
                            </p>
                            {entry.subjectChanges && entry.subjectChanges.length > 0 ? (
                              <div className="flex flex-col gap-1 mt-1.5">
                                {entry.subjectChanges.map((sc) => (
                                  <div key={sc.name} className="flex flex-wrap items-center gap-1.5">
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-md">
                                      <BookOpen className="h-2.5 w-2.5" />{sc.name}
                                    </span>
                                    {sc.intAfter !== null && sc.intBefore !== sc.intAfter && (
                                      <span className="text-[10px] font-bold text-blue-600 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                        Int: {sc.intBefore ?? "–"} → {sc.intAfter}
                                      </span>
                                    )}
                                    {sc.theoAfter !== null && sc.theoBefore !== sc.theoAfter && (
                                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                        Ext: {sc.theoBefore ?? "–"} → {sc.theoAfter}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[10px] text-muted-foreground/60 font-medium mt-1">No mark changes recorded</p>
                            )}
                          </>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <Badge variant="outline" className={`text-[9px] font-black uppercase tracking-wider mb-1 ${entry.type === "bulk" ? "border-blue-500/30 text-blue-500" : "border-amber-500/30 text-amber-600"}`}>
                          {entry.type === "bulk" ? "Bulk" : "Manual"}
                        </Badge>
                        <p className="text-[10px] text-muted-foreground font-medium">
                          {format(new Date(entry.timestamp), "hh:mm a")}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 font-medium">
                          {format(new Date(entry.timestamp), "dd/MM/yyyy")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

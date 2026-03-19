"use client";

import { useAuth } from "@/lib/auth-context";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Zap,
  ArrowLeft,
  Loader2,
  History,
  FileText,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { format } from "date-fns";

interface GraceHistoryEntry {
  id: string;
  student_id: string;
  mark_id: string;
  subject_name: string;
  original_marks: number;
  grace_given: number;
  final_marks: number;
  created_at: string;
  student_name: string | null;
  roll_number: string | null;
  department: string | null;
  course: string | null;
  year: string | null;
  semester: string | null;
  result: string | null;
  // before-grace marks
  before_int: number | null;
  before_ext: number | null;
  // grace per component
  grace_int: number;
  grace_ext: number;
  grace_total: number;
  // current (after grace)
  int_marks: number | null;
  ext_marks: number | null;
  // ordinance type
  ordinance_type: string;
}

// One grouped student entry for the UI
interface GroupedStudent {
  mark_id: string;
  roll_number: string;
  student_name: string;
  department: string | null;
  year: string | null;
  semester: string | null;
  result: string | null;
  ordinance_type: string;
  total_grace: number;
  subjects: {
    subject_name: string;
    before_int: number | null;
    before_ext: number | null;
    grace_int: number;
    grace_ext: number;
    created_at: string;
  }[];
}

const ORDINANCE_OPTIONS = [
  { value: "all", label: "All Ordinances" },
  { value: "O.5042-A", label: "O.5042-A — Passing Grace" },
  { value: "O.5045-A", label: "O.5045-A — Condonation" },
  { value: "O.229",   label: "O.229 — NSS/NCC Bonus" },
];

function getYearLabel(year: string | null) {
  if (!year) return "-";
  const map: Record<string, string> = { "1": "FY", "2": "SY", "3": "TY", FY: "FY", SY: "SY", TY: "TY" };
  return map[year] || year;
}

function parseStatus(result: string | null) {
  if (!result) return null;
  const r = result.replace(/\s+/g, "").toUpperCase();
  if (r === "PASS") return "PASS";
  if (r === "FAIL") return "FAIL";
  return result.trim() || null;
}

// Format marks with +@ grace notation, e.g. "12+@2"  or just "12" if no grace
function graceDisplay(before: number | null, grace: number): string {
  if (before === null) return grace > 0 ? `+@${grace}` : "–";
  if (grace === 0) return String(before);
  return `${before}+@${grace}`;
}

// Fetch full student details for export
async function fetchEnrichedHistory(uid: string): Promise<GraceHistoryEntry[]> {
  const res = await fetch(`/api/grace-marks/history?uid=${uid}`);
  const json = await res.json();
  return json.history || [];
}

// ─── Excel Export ─────────────────────────────────────────────────────────────
async function exportToExcel(
  groupedStudents: GroupedStudent[],
  ordinanceFilter: string,
  uid: string
) {
  const ExcelJS = (await import("exceljs")).default;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Grace Marks System";
  wb.created = new Date();
  const ws = wb.addWorksheet("Grace Marks History");

  // 10 columns: Roll No | Student Name | Subject | Before INT | Before EXT |
  //             Grace Added (@) INT | Grace Added (@) EXT | Total Grace Added (@) | Ordinance Type | Final Result
  const NUM_COLS = 10;
  const colWidths = [13, 30, 38, 12, 12, 20, 20, 18, 16, 14];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const THIN_BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFB0BEC5" } };
  const CELL_BORDER: Partial<ExcelJS.Borders> = { left: THIN_BORDER, right: THIN_BORDER, top: THIN_BORDER, bottom: THIN_BORDER };
  const CENTER: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };
  const LEFT: Partial<ExcelJS.Alignment> = { horizontal: "left", vertical: "middle", wrapText: true };

  // Dynamic title based on selected ordinance
  const ordinanceLabel = ordinanceFilter === "all"
    ? "ALL ORDINANCES"
    : `ORDINANCE ${ordinanceFilter}`;
  const titleText = `${ordinanceLabel} — GRACED STUDENTS HISTORY`;

  // Row 1: Title
  const titleRow = ws.addRow([titleText, ...Array(NUM_COLS - 1).fill("")]);
  titleRow.height = 34;
  ws.mergeCells(1, 1, 1, NUM_COLS);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = titleText;
  titleCell.font = { bold: true, size: 14, name: "Calibri", color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D2B55" } };
  titleCell.alignment = { ...CENTER, wrapText: false };
  titleCell.border = CELL_BORDER;

  // Row 2: Sub-header
  const subRow = ws.addRow(["Grace marks history from database — students who received grace during Gadget Sheet generation.", ...Array(NUM_COLS - 1).fill("")]);
  subRow.height = 22;
  ws.mergeCells(2, 1, 2, NUM_COLS);
  const subCell = ws.getCell(2, 1);
  subCell.value = "Grace marks history from database — students who received grace during Gadget Sheet generation.";
  subCell.font = { italic: true, size: 10, name: "Calibri", color: { argb: "FFC85A00" } };
  subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8F0" } };
  subCell.alignment = { ...CENTER, wrapText: false };
  subCell.border = CELL_BORDER;

  // Row 3: Column headers
  const COL_HEADERS = [
    "Roll No", "Student Name", "Subject",
    "Before INT", "Before EXT",
    "Grace Added (@) INT", "Grace Added (@) EXT", "Total Grace Added (@)",
    "Ordinance Type", "Final Result",
  ];
  const colHeaderRow = ws.addRow(COL_HEADERS);
  colHeaderRow.height = 28;
  colHeaderRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, size: 10, name: "Calibri", color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3A5C" } };
    cell.alignment = CENTER;
    cell.border = CELL_BORDER;
  });

  const DATA_FONT: Partial<ExcelJS.Font> = { size: 10, name: "Calibri", color: { argb: "FF1F2937" } };
  const FILL_WHITE: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  const FILL_BLUE: ExcelJS.Fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F4FC" } };
  const FILL_GRACE: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3E0" } };

  const mergeQueue: { startRow: number; endRow: number; cols: number[] }[] = [];

  groupedStudents.forEach((student, groupIndex) => {
    const count = student.subjects.length;
    const startRowNum = ws.rowCount + 1;
    const ROW_FILL = groupIndex % 2 === 0 ? FILL_WHITE : FILL_BLUE;
    const status = parseStatus(student.result) || "–";

    student.subjects.forEach((sub, j) => {
      const dataRow = ws.addRow([
        j === 0 ? (student.roll_number || "–") : "",
        j === 0 ? (student.student_name || "–") : "",
        sub.subject_name || "–",
        sub.before_int !== null ? sub.before_int : 0,      // Before INT
        sub.before_ext !== null ? sub.before_ext : 0,       // Before EXT
        sub.grace_int,                                       // Grace (@) INT
        sub.grace_ext,                                       // Grace (@) EXT
        j === 0 ? student.total_grace : "",                  // Total Grace Added — only first row
        student.ordinance_type || "O.5042-A",
        j === 0 ? status : "",
      ]);
      dataRow.height = 20;

      dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.font = DATA_FONT;
        cell.border = CELL_BORDER;
        cell.alignment = colNum === 3 ? LEFT : CENTER;
        // Grace columns (6,7,8) get tinted fill + bold red text
        if (colNum === 6 || colNum === 7 || colNum === 8) {
          cell.fill = FILL_GRACE;
          cell.font = { ...DATA_FONT, bold: true, color: { argb: "FFCC3300" } };
        } else {
          cell.fill = ROW_FILL;
        }
      });

      // Final Result coloring (col 10)
      if (j === 0) {
        const resultCell = dataRow.getCell(10);
        if (status === "PASS") {
          resultCell.font = { ...DATA_FONT, bold: true, color: { argb: "FF1B6B3A" } };
          resultCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
          resultCell.value = "P A S S";
        } else if (status === "FAIL") {
          resultCell.font = { ...DATA_FONT, bold: true, color: { argb: "FFCC0000" } };
          resultCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
        }
      }

      // Ordinance type column (9) — teal text
      dataRow.getCell(9).font = { ...DATA_FONT, color: { argb: "FF0E7490" } };
    });

    // Merge Roll No (1), Student Name (2), Total Grace (8), Ordinance Type (9), Final Result (10)
    if (count >= 2) {
      mergeQueue.push({
        startRow: startRowNum,
        endRow: startRowNum + count - 1,
        cols: [1, 2, 8, 9, 10],
      });
    }
  });

  // Apply merges
  for (const m of mergeQueue) {
    for (const col of m.cols) {
      try {
        ws.mergeCells(m.startRow, col, m.endRow, col);
        const cell = ws.getCell(m.startRow, col);
        cell.alignment = CENTER;
        cell.border = CELL_BORDER;
      } catch { /* skip merge errors for single-row */ }
    }
  }

  // Summary row
  const totalStudents = groupedStudents.length;
  const summaryLabel = ordinanceFilter === "all"
    ? `Total: ${totalStudents} student(s) graced`
    : `Total: ${totalStudents} student(s) graced under ${ordinanceFilter}`;
  const summaryRow = ws.addRow([summaryLabel, ...Array(NUM_COLS - 1).fill("")]);
  summaryRow.height = 24;
  ws.mergeCells(ws.rowCount, 1, ws.rowCount, NUM_COLS);
  const summaryCell = ws.getCell(ws.rowCount, 1);
  summaryCell.value = summaryLabel;
  summaryCell.font = { bold: true, size: 11, name: "Calibri", color: { argb: "FFFFFFFF" } };
  summaryCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3A5C" } };
  summaryCell.alignment = { ...CENTER, wrapText: false };
  summaryCell.border = CELL_BORDER;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const suffix = ordinanceFilter === "all" ? "all_ordinances" : ordinanceFilter.replace(/\./g, "");
  a.download = `ordinance_${suffix}_graced_students_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
async function exportToCSV(groupedStudents: GroupedStudent[]) {
  const headers = ["Roll Number", "Student Name", "Course", "Semester", "Year", "Subject",
    "Before INT", "Before EXT", "Grace INT", "Grace EXT", "Total Grace", "Ordinance Type", "Student Status"];
  const csvRows = [headers.join(",")];
  for (const student of groupedStudents) {
    for (const sub of student.subjects) {
      const status = parseStatus(student.result) || "-";
      csvRows.push([
        `"${student.roll_number || "-"}"`,
        `"${student.student_name || "-"}"`,
        `"${student.department || "-"}"`,
        `"${student.semester || "-"}"`,
        `"${getYearLabel(student.year)}"`,
        `"${sub.subject_name || "-"}"`,
        sub.before_int ?? 0,
        sub.before_ext ?? 0,
        sub.grace_int,
        sub.grace_ext,
        student.total_grace,
        `"${student.ordinance_type}"`,
        `"${status}"`,
      ].join(","));
    }
  }

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `grace_marks_history_${format(new Date(), "yyyyMMdd_HHmm")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 15;

export default function GraceHistoryPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState<GraceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());

  const [filterDept, setFilterDept] = useState("all");
  const [filterOrdinance, setFilterOrdinance] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [filterSem, setFilterSem] = useState("all");

  useEffect(() => {
    if (user) fetchHistory();
  }, [user]);

  const fetchHistory = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/grace-marks/history?uid=${user.uid}`);
      const json = await res.json();
      if (json.history) {
        setHistory(json.history);
        setCurrentPage(1);
      }
    } catch {
      toast.error("Failed to load grace marks history");
    } finally {
      setLoading(false);
    }
  };

  const depts = useMemo(
    () => [...new Set(history.map((h) => h.department).filter(Boolean))].sort() as string[],
    [history]
  );
  const semesters = useMemo(
    () => [...new Set(history.map((h) => h.semester).filter(Boolean))].sort() as string[],
    [history]
  );

  // Filter flat list first
  const filteredHistory = useMemo(() => {
    return history.filter((entry) => {
      if (filterDept !== "all" && (entry.department || "") !== filterDept) return false;
      if (filterYear !== "all" && getYearLabel(entry.year) !== filterYear) return false;
      if (filterSem !== "all" && entry.semester !== filterSem) return false;
      if (filterOrdinance !== "all" && (entry.ordinance_type || "O.5042-A") !== filterOrdinance) return false;
      return true;
    });
  }, [history, filterDept, filterYear, filterSem, filterOrdinance]);

  // Group by mark_id — one entry per student
  const groupedStudents = useMemo<GroupedStudent[]>(() => {
    const map = new Map<string, GroupedStudent>();
    const order: string[] = [];

    for (const entry of filteredHistory) {
      const key = entry.mark_id || entry.id;
      if (!map.has(key)) {
        order.push(key);
        map.set(key, {
          mark_id: key,
          roll_number: entry.roll_number || "–",
          student_name: entry.student_name || "–",
          department: entry.department,
          year: entry.year,
          semester: entry.semester,
          result: entry.result,
          ordinance_type: entry.ordinance_type || "O.5042-A",
          total_grace: 0,
          subjects: [],
        });
      }
      const group = map.get(key)!;
      group.total_grace += (entry.grace_int ?? 0) + (entry.grace_ext ?? 0);
      group.subjects.push({
        subject_name: entry.subject_name,
        before_int: entry.before_int,
        before_ext: entry.before_ext,
        grace_int: entry.grace_int ?? 0,
        grace_ext: entry.grace_ext ?? 0,
        created_at: entry.created_at,
      });
    }

    return order.map((k) => map.get(k)!);
  }, [filteredHistory]);

  const hasActiveFilters = filterDept !== "all" || filterOrdinance !== "all" || filterYear !== "all" || filterSem !== "all";

  const clearFilters = () => {
    setFilterDept("all");
    setFilterOrdinance("all");
    setFilterYear("all");
    setFilterSem("all");
    setCurrentPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(groupedStudents.length / PAGE_SIZE));
  const paginated = useMemo(
    () => groupedStudents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [groupedStudents, currentPage]
  );

  useEffect(() => { setCurrentPage(1); }, [filterDept, filterOrdinance, filterYear, filterSem]);

  const toggleExpand = (markId: string) => {
    setExpandedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(markId)) next.delete(markId);
      else next.add(markId);
      return next;
    });
  };

  // Dynamic heading
  const ordinanceLabel = filterOrdinance === "all"
    ? "All Ordinances"
    : filterOrdinance;
  const uniqueStudentCount = groupedStudents.length;

  const handleExcelExport = async () => {
    if (!user) return;
    if (groupedStudents.length === 0) return toast.error("No data to export");
    setExporting(true);
    try {
      await exportToExcel(groupedStudents, filterOrdinance, user.uid);
      toast.success("Excel file downloaded");
    } catch (e) {
      console.error(e);
      toast.error("Failed to export Excel");
    } finally {
      setExporting(false);
    }
  };

  const handleCSVExport = async () => {
    if (!user) return;
    if (groupedStudents.length === 0) return toast.error("No data to export");
    setExporting(true);
    try {
      await exportToCSV(groupedStudents);
      toast.success("CSV file downloaded");
    } catch (e) {
      console.error(e);
      toast.error("Failed to export CSV");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/grace-marks">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="space-y-0.5">
            {/* Dynamic heading */}
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2 text-foreground">
              <History className="h-5 w-5 text-primary shrink-0" />
              {filterOrdinance === "all" ? (
                <span>Grace Marks History</span>
              ) : (
                <>
                  <span className="text-primary">{ordinanceLabel}</span>
                  <span className="text-muted-foreground font-medium">—</span>
                  <span>{uniqueStudentCount} Student{uniqueStudentCount !== 1 ? "s" : ""} Received Grace</span>
                </>
              )}
            </h1>
            <p className="text-xs text-muted-foreground font-medium">
              Grace marks history from database — students who received grace during Gadget Sheet generation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={fetchHistory} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={exporting || groupedStudents.length === 0} className="gap-2">
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={handleExcelExport} className="gap-2 cursor-pointer">
                <FileSpreadsheet className="h-4 w-4 text-green-600" />
                Export as XLS
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCSVExport} className="gap-2 cursor-pointer">
                <FileText className="h-4 w-4 text-blue-600" />
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats strip */}
      {!loading && history.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <Badge variant="outline" className="px-3 py-1.5 text-xs font-bold gap-1.5 border-primary/30 text-primary">
            <Zap className="h-3 w-3" />
            {uniqueStudentCount} {hasActiveFilters ? "Filtered" : "Total"} Students
          </Badge>
          <Badge variant="outline" className="px-3 py-1.5 text-xs font-bold gap-1.5 border-emerald-500/30 text-emerald-600">
            {filteredHistory.length} Subject Applications
          </Badge>
          {filterOrdinance !== "all" && (
            <Badge className="px-3 py-1.5 text-xs font-bold gap-1.5 bg-primary/10 text-primary border-none">
              {filterOrdinance}
            </Badge>
          )}
        </div>
      )}

      {/* Filters */}
      {!loading && history.length > 0 && (
        <Card className="border-border/40 shadow-sm bg-card/50">
          <CardContent className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Ordinance filter — primary filter */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Grace Rule / Ordinance</p>
                <Select value={filterOrdinance} onValueChange={setFilterOrdinance}>
                  <SelectTrigger className="h-9 text-xs font-semibold">
                    <SelectValue placeholder="All Ordinances" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDINANCE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Department filter */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Department</p>
                <Select value={filterDept} onValueChange={setFilterDept}>
                  <SelectTrigger className="h-9 text-xs font-semibold">
                    <SelectValue placeholder="Select Dept" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {depts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Year filter */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Year</p>
                <Select value={filterYear} onValueChange={setFilterYear}>
                  <SelectTrigger className="h-9 text-xs font-semibold">
                    <SelectValue placeholder="Select Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    {["FY", "SY", "TY"].map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Semester filter */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Semester</p>
                <Select value={filterSem} onValueChange={setFilterSem}>
                  <SelectTrigger className="h-9 text-xs font-semibold">
                    <SelectValue placeholder="Select Semester" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Semesters</SelectItem>
                    {(semesters.length > 0 ? semesters : ["1", "2", "3", "4", "5", "6"]).map((s) => (
                      <SelectItem key={s} value={s}>Semester {s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex justify-end mt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-3 text-xs font-bold text-destructive hover:text-destructive gap-1.5"
                  onClick={clearFilters}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear Filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="border-none shadow-sm bg-card/50">
        <CardHeader className="border-b border-border/40 flex flex-row items-center justify-between py-4">
          <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <History className="h-4 w-4" />
            {filterOrdinance === "all"
              ? "Grace Marks Application History"
              : `${filterOrdinance} — Graced Students History`}
          </CardTitle>
          {!loading && groupedStudents.length > 0 && (
            <span className="text-xs text-muted-foreground font-medium">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, groupedStudents.length)} of {groupedStudents.length}
            </span>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-20 flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-bold text-muted-foreground">Loading history...</p>
            </div>
          ) : groupedStudents.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent border-none">
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-3 pl-5 w-8">#</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-3 w-28">Roll No</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-3">Student Name</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-3">Subject(s)</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-3 text-center w-32">Internal</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-3 text-center w-32">External</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-3 text-center w-24">Total Grace</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-3 text-center w-28">Ordinance</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-3 text-center w-24 pr-5">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map((student, idx) => {
                      const globalIdx = (currentPage - 1) * PAGE_SIZE + idx + 1;
                      const status = parseStatus(student.result);
                      const isExpanded = expandedStudents.has(student.mark_id);
                      const hasMultiSubjects = student.subjects.length > 1;
                      // Subjects to show: first + rest (if expanded)
                      const visibleSubs = hasMultiSubjects && !isExpanded
                        ? [student.subjects[0]]
                        : student.subjects;

                      return (
                        <TableRow
                          key={student.mark_id}
                          className="group hover:bg-muted/20 transition-colors border-border/40 align-top"
                        >
                          {/* # */}
                          <TableCell className="py-3.5 pl-5 align-middle">
                            <span className="text-xs font-bold text-muted-foreground">{globalIdx}</span>
                          </TableCell>

                          {/* Roll No */}
                          <TableCell className="py-3.5 align-middle">
                            <span className="text-xs font-black tabular-nums">{student.roll_number}</span>
                          </TableCell>

                          {/* Student Name + dept */}
                          <TableCell className="py-3.5 align-middle">
                            <div className="flex flex-col">
                              <span className="text-xs font-black">{student.student_name}</span>
                              {student.department && (
                                <span className="text-[10px] font-medium text-muted-foreground mt-0.5">
                                  {student.department}
                                </span>
                              )}
                            </div>
                          </TableCell>

                          {/* Subjects — vertically stacked when multiple */}
                          <TableCell className="py-3.5 align-top min-w-[180px]">
                            <div className="flex flex-col gap-1">
                              {visibleSubs.map((sub, si) => (
                                <div key={si} className="flex items-start gap-1.5">
                                  <FileText className="h-3 w-3 text-primary/40 shrink-0 mt-0.5" />
                                  <span className="text-xs font-semibold leading-snug">{sub.subject_name}</span>
                                </div>
                              ))}
                              {hasMultiSubjects && (
                                <button
                                  onClick={() => toggleExpand(student.mark_id)}
                                  className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline mt-0.5 w-fit"
                                >
                                  {isExpanded ? (
                                    <><ChevronUp className="h-3 w-3" /> Show less</>
                                  ) : (
                                    <><ChevronDown className="h-3 w-3" /> +{student.subjects.length - 1} more subject{student.subjects.length - 1 > 1 ? "s" : ""}</>
                                  )}
                                </button>
                              )}
                            </div>
                          </TableCell>

                          {/* Internal marks — [before]+@[grace] per subject */}
                          <TableCell className="py-3.5 text-center align-top">
                            <div className="flex flex-col gap-1">
                              {visibleSubs.map((sub, si) => (
                                <span
                                  key={si}
                                  className={`text-xs font-black tabular-nums ${sub.grace_int > 0 ? "text-emerald-600" : "text-foreground"}`}
                                >
                                  {graceDisplay(sub.before_int, sub.grace_int)}
                                </span>
                              ))}
                              {hasMultiSubjects && !isExpanded && <span className="text-[10px] text-muted-foreground">…</span>}
                            </div>
                          </TableCell>

                          {/* External marks — [before]+@[grace] per subject */}
                          <TableCell className="py-3.5 text-center align-top">
                            <div className="flex flex-col gap-1">
                              {visibleSubs.map((sub, si) => (
                                <span
                                  key={si}
                                  className={`text-xs font-black tabular-nums ${sub.grace_ext > 0 ? "text-violet-600" : "text-foreground"}`}
                                >
                                  {graceDisplay(sub.before_ext, sub.grace_ext)}
                                </span>
                              ))}
                              {hasMultiSubjects && !isExpanded && <span className="text-[10px] text-muted-foreground">…</span>}
                            </div>
                          </TableCell>

                          {/* Total Grace */}
                          <TableCell className="py-3.5 text-center align-middle">
                            <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 font-black text-[10px] px-2 h-6">
                              +{student.total_grace}
                            </Badge>
                          </TableCell>

                          {/* Ordinance Type */}
                          <TableCell className="py-3.5 text-center align-middle">
                            <Badge className="bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-none font-bold text-[10px] px-2 h-6">
                              {student.ordinance_type}
                            </Badge>
                          </TableCell>

                          {/* Status */}
                          <TableCell className="py-3.5 text-center align-middle pr-5">
                            {status ? (
                              <Badge
                                className={`font-black text-[10px] px-2 h-6 border-none ${
                                  status === "PASS"
                                    ? "bg-emerald-500/10 text-emerald-600"
                                    : status === "FAIL"
                                    ? "bg-red-500/10 text-red-600"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {status === "PASS" ? "P A S S" : status}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">–</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-border/40">
                  <p className="text-xs text-muted-foreground font-medium">
                    Page {currentPage} of {totalPages}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
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
                            variant={currentPage === p ? "default" : "outline"}
                            size="icon"
                            className="h-8 w-8 text-xs"
                            onClick={() => setCurrentPage(p as number)}
                          >
                            {p}
                          </Button>
                        )
                      )}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
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
                <p className="text-xl font-black text-foreground">
                  {hasActiveFilters ? "No results for current filters" : "No history found"}
                </p>
                <p className="text-sm text-muted-foreground font-medium max-w-sm mx-auto">
                  {hasActiveFilters
                    ? "Try adjusting or clearing the filters above."
                    : "When you apply grace marks to students, they will appear here for record keeping."}
                </p>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" className="mt-2" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

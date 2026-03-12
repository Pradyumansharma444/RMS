"use client";

import { useAuth } from "@/lib/auth-context";
import { useEffect, useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, Search, Loader2, Download, Upload, History,
  Users, RefreshCw, FileSpreadsheet, X, ChevronDown, Eye
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

export default function AtktPage() {
  const { user } = useAuth();

  // List state
  const [students, setStudents] = useState<AtktStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [filterSem, setFilterSem] = useState("all");
  const [depts, setDepts] = useState<string[]>([]);
  const [sems, setSems] = useState<string[]>([]);

  // Detail drawer
  const [selectedStudent, setSelectedStudent] = useState<StudentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editMarks, setEditMarks] = useState<Record<string, { int: string; theo: string; prac: string }>>({});
  const [saving, setSaving] = useState(false);

  // Bulk upload
  const bulkRef = useRef<HTMLInputElement>(null);
  const [bulkUploading, setBulkUploading] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  // History tab
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const LIMIT = 10;

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

      // Derive filter options from first full load
      if (p === 1 && !filterDept && !filterSem) {
        const ds = [...new Set((json.students || []).map((s: AtktStudent) => s.department))].filter(Boolean).sort() as string[];
        const ss = [...new Set((json.students || []).map((s: AtktStudent) => s.semester))].filter(Boolean).sort() as string[];
        setDepts(ds);
        setSems(ss);
      }
    } catch {
      toast.error("Failed to load ATKT students");
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (studentId: string) => {
    if (!user) return;
    setDetailLoading(true);
    setSelectedStudent(null);
    try {
      const res = await fetch(`/api/marks/detail?uid=${user.uid}&mark_id=${studentId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const s = json.student;
      setSelectedStudent(s);
      // Pre-fill edit marks for failed subjects
      const init: Record<string, { int: string; theo: string; prac: string }> = {};
      (s.subjects || []).forEach((sub: SubjectDetail) => {
        init[sub.subject_name] = {
          int: sub.int_marks != null ? String(sub.int_marks) : "",
          theo: sub.theo_marks != null ? String(sub.theo_marks) : "",
          prac: sub.prac_marks != null ? String(sub.prac_marks) : "",
        };
      });
      setEditMarks(init);
    } catch (e: any) {
      toast.error(e.message || "Failed to load student detail");
    } finally {
      setDetailLoading(false);
    }
  };

  const saveMarks = async () => {
    if (!user || !selectedStudent) return;
    setSaving(true);
    try {
      const updatedSubjects = selectedStudent.subjects.map((sub) => {
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
        body: JSON.stringify({ uid: user.uid, mark_id: selectedStudent.id, subjects: updatedSubjects }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success("Marks updated successfully");
      setSelectedStudent(null);
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
    } catch {
      toast.error("Template download failed");
    }
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
      fetchStudents(1);
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
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (user) fetchStudents(1);
  }, [user, filterDept, filterSem]);

  // Client-side search filter
  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter(
      (s) =>
        s.student_name.toLowerCase().includes(q) ||
        s.roll_number.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q)
    );
  }, [students, search]);

  // Determine which subjects are ATKT (failed)
  const atktSubjects = useMemo(() => {
    if (!selectedStudent) return [];
    return selectedStudent.subjects.filter(
      (s) => s.is_pass === false || s.grade === "F" || s.grade === "D"
    );
  }, [selectedStudent]);

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
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-9 gap-2 font-semibold" onClick={downloadTemplate}>
            <Download className="h-4 w-4" />
            Download Template
          </Button>
          <Button
            size="sm"
            className="h-9 gap-2 font-semibold"
            onClick={() => bulkRef.current?.click()}
            disabled={bulkUploading}
          >
            {bulkUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Bulk Upload
          </Button>
          <input
            ref={bulkRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleBulkUpload(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="students">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="students" className="font-bold flex items-center gap-2">
            <Users className="h-4 w-4" />
            ATKT Students
            {total > 0 && (
              <Badge className="ml-1 h-5 px-1.5 text-[10px] font-black bg-destructive text-white border-none">
                {total}
              </Badge>
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
                  <CardDescription className="text-xs mt-1">
                    Click &apos;Edit Marks&apos; to update marks for individual students
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name, roll or subject..."
                      className="pl-8 h-9 text-sm w-64"
                    />
                  </div>
                  {/* Semester filter */}
                  <Select value={filterSem} onValueChange={setFilterSem}>
                    <SelectTrigger className="h-9 w-36 text-xs font-bold">
                      <SelectValue placeholder="All Semesters" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Semesters</SelectItem>
                      {sems.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {/* Dept filter */}
                  <Select value={filterDept} onValueChange={setFilterDept}>
                    <SelectTrigger className="h-9 w-36 text-xs font-bold">
                      <SelectValue placeholder="All Departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {depts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 font-bold"
                    onClick={() => fetchStudents(1)}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 font-bold border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                    onClick={handleExport}
                    disabled={exporting}
                  >
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
                        <TableHead className="text-xs font-black uppercase tracking-wider py-4 text-right pr-6">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.map((s) => (
                        <TableRow key={s.id} className="hover:bg-muted/20 transition-colors border-border/40">
                          <TableCell className="py-4 pl-6 font-bold text-sm tabular-nums">{s.roll_number}</TableCell>
                          <TableCell className="py-4 font-bold text-sm">{s.student_name}</TableCell>
                          <TableCell className="py-4 text-center">
                            <Badge
                              className={`font-black text-[11px] px-3 h-6 rounded-full ${
                                s.atkt_count >= 3
                                  ? "bg-destructive/20 text-destructive border-destructive/30 border"
                                  : s.atkt_count === 2
                                  ? "bg-orange-500/20 text-orange-600 border-orange-500/30 border"
                                  : "bg-amber-500/20 text-amber-600 border-amber-500/30 border"
                              }`}
                            >
                              {s.atkt_count} Subject{s.atkt_count !== 1 ? "s" : ""}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-4 text-sm text-muted-foreground">{s.department}</TableCell>
                          <TableCell className="py-4 text-right pr-6">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 font-bold text-xs border-primary/30 text-primary hover:bg-primary/10"
                              onClick={() => fetchDetail(s.id)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Edit Marks
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-border/40">
                      <p className="text-xs text-muted-foreground font-medium">
                        Page {page} of {totalPages} · {total} students
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 font-bold text-xs"
                          disabled={page <= 1}
                          onClick={() => fetchStudents(page - 1)}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 font-bold text-xs"
                          disabled={page >= totalPages}
                          onClick={() => fetchStudents(page + 1)}
                        >
                          Next
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
        <TabsContent value="history" className="mt-4">
          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-base font-black">Update History</CardTitle>
              <CardDescription className="text-xs">Recent ATKT marks updates via bulk upload or manual edit</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground font-medium text-center py-10">
                History tracking coming soon. All bulk and manual updates are saved in real-time to the database.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Student Detail Side Panel ── */}
      {(detailLoading || selectedStudent) && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !saving && setSelectedStudent(null)}
          />
          {/* Panel */}
          <div className="relative ml-auto w-full max-w-2xl bg-background border-l border-border shadow-2xl flex flex-col overflow-hidden">
            {/* Panel Header */}
            <div className="flex items-center justify-between p-6 border-b border-border/50 bg-muted/30">
              {detailLoading ? (
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="font-bold">Loading student data...</span>
                </div>
              ) : selectedStudent ? (
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-black text-lg leading-tight">{selectedStudent.student_name}</p>
                    <p className="text-xs text-muted-foreground font-medium">
                      Roll Number: <span className="font-black text-foreground">{selectedStudent.roll_number}</span>
                      {" · "}Department: <span className="font-black text-foreground">{selectedStudent.department}</span>
                      {" · "}Total Backlogs: <span className="font-black text-destructive">{atktSubjects.length}</span>
                    </p>
                  </div>
                </div>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                onClick={() => setSelectedStudent(null)}
                disabled={saving}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Panel Body */}
            {selectedStudent && (
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="hover:bg-transparent text-[11px] font-black uppercase tracking-wider">
                      <TableHead className="py-3 pl-4">Subject</TableHead>
                      <TableHead className="py-3 text-center">Sem</TableHead>
                      <TableHead className="py-3 text-center">Attempt</TableHead>
                      <TableHead className="py-3 text-center">Internal</TableHead>
                      <TableHead className="py-3 text-center">External</TableHead>
                      <TableHead className="py-3 text-center">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedStudent.subjects.map((sub) => {
                      const isFail = sub.is_pass === false || sub.grade === "F" || sub.grade === "D";
                      const e = editMarks[sub.subject_name] || { int: "", theo: "", prac: "" };
                      const extMax = (sub.max_marks || 50) - (sub.int_marks != null ? (sub.max_marks > 30 ? 20 : 0) : 0);
                      return (
                        <TableRow
                          key={sub.subject_name}
                          className={`border-border/40 ${isFail ? "bg-destructive/5" : ""}`}
                        >
                          <TableCell className="py-3 pl-4">
                            <p className={`text-sm font-bold ${isFail ? "text-destructive" : "text-foreground"}`}>
                              {sub.subject_name}
                            </p>
                          </TableCell>
                          <TableCell className="py-3 text-center text-xs font-bold text-muted-foreground">1</TableCell>
                          <TableCell className="py-3 text-center">
                            <Badge variant="outline" className="text-[10px] font-bold">Regular (1)</Badge>
                          </TableCell>
                          {/* Internal edit */}
                          <TableCell className="py-3 text-center">
                            {isFail ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-[9px] text-muted-foreground font-bold">Current: {sub.int_marks ?? "–"}/{sub.int_marks != null ? 20 : "–"}</span>
                                <Input
                                  type="number"
                                  min={0}
                                  max={20}
                                  className="w-16 h-7 text-center text-xs font-bold"
                                  value={e.int}
                                  onChange={(ev) =>
                                    setEditMarks((prev) => ({
                                      ...prev,
                                      [sub.subject_name]: { ...prev[sub.subject_name], int: ev.target.value },
                                    }))
                                  }
                                  placeholder={String(sub.int_marks ?? "–")}
                                />
                              </div>
                            ) : (
                              <span className="text-sm font-bold">
                                {sub.int_marks ?? "–"}/{sub.int_marks != null ? 20 : "–"}
                              </span>
                            )}
                          </TableCell>
                          {/* External edit */}
                          <TableCell className="py-3 text-center">
                            {isFail ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-[9px] text-muted-foreground font-bold">
                                  Current: {sub.theo_marks ?? sub.prac_marks ?? "–"}/{sub.max_marks != null ? sub.max_marks - (sub.int_marks != null ? 20 : 0) : "–"}
                                </span>
                                <Input
                                  type="number"
                                  min={0}
                                  className="w-16 h-7 text-center text-xs font-bold"
                                  value={e.theo}
                                  onChange={(ev) =>
                                    setEditMarks((prev) => ({
                                      ...prev,
                                      [sub.subject_name]: { ...prev[sub.subject_name], theo: ev.target.value },
                                    }))
                                  }
                                  placeholder={String(sub.theo_marks ?? sub.prac_marks ?? "–")}
                                />
                              </div>
                            ) : (
                              <span className="text-sm font-bold">
                                {sub.theo_marks ?? sub.prac_marks ?? "–"}/{sub.max_marks != null ? sub.max_marks - (sub.int_marks != null ? 20 : 0) : "–"}
                              </span>
                            )}
                          </TableCell>
                          {/* Total */}
                          <TableCell className="py-3 text-center">
                            <span className={`text-sm font-black tabular-nums ${isFail ? "text-destructive" : "text-foreground"}`}>
                              {isFail
                                ? (() => {
                                    const ni = parseFloat(e.int) || 0;
                                    const nt = parseFloat(e.theo) || 0;
                                    const np = parseFloat(e.prac) || 0;
                                    const newTotal = ni + nt + np;
                                    return newTotal > 0 ? newTotal : sub.obtained_marks;
                                  })()
                                : sub.obtained_marks}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Panel Footer */}
            {selectedStudent && (
              <div className="p-6 border-t border-border/50 bg-muted/20 flex justify-end gap-3">
                <Button
                  variant="ghost"
                  className="font-bold text-xs uppercase tracking-widest"
                  onClick={() => setSelectedStudent(null)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  className="gap-2 font-black bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={saveMarks}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                  Save Updated Marks
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useAuth } from "@/lib/auth-context";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { 
  GraduationCap, 
  Upload, 
  Download, 
  Users, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Plus,
  ArrowRight,
  ClipboardCheck,
  Search,
  FileText,
  CheckSquare,
  Square,
  FileArchive,
  History,
  LayoutGrid,
  Calendar,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";
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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Upload {
  id: string;
  exam_name: string;
  department: string;
  year: string;
  file_name: string;
  status: string;
  total_students: number;
  created_at: string;
}

interface StudentMark {
  id: string;
  roll_number: string;
  student_name: string;
  department: string;
  year: string;
  division?: string;
  percentage: number;
  result: string;
  cgpa: number;
}

interface GenerationHistory {
  id: string;
  department: string;
  year: string;
  exam_name?: string;
  generated_at: string;
  upload_id: string;
}

export default function GradeCardsPage() {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [marks, setMarks] = useState<StudentMark[]>([]);
  const [loading, setLoading] = useState(false);
  const [marksLoading, setMarksLoading] = useState(false);
  const [selectedUpload, setSelectedUpload] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadMode, setUploadMode] = useState(false);
  const [activeTab, setActiveTab] = useState("generation");
  const [history, setHistory] = useState<GenerationHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Metadata State
  const [allCourses, setAllCourses] = useState<{name: string, code?: string}[]>([]);
  const [allSemesters, setAllSemesters] = useState<{name: string}[]>([]);

  const [uploadDept, setUploadDept] = useState("");
  const [uploadYear, setUploadYear] = useState("");
  const [uploadExam, setUploadExam] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ inserted: number; upload_id: string; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchMetadata = async () => {
    if (!user) return;
    try {
      const [courseRes, semRes] = await Promise.all([
        fetch(`/api/metadata/courses?uid=${user.uid}`),
        fetch(`/api/metadata/semesters?uid=${user.uid}`)
      ]);
      const [courseJson, semJson] = await Promise.all([
        courseRes.json(),
        semRes.json()
      ]);
      setAllCourses(courseJson.data || []);
      setAllSemesters(semJson.data || []);
    } catch {
      console.error("Failed to fetch metadata");
    }
  };

  const fetchUploads = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/marks/uploads?uid=${user.uid}`);
      const json = await res.json();
      setUploads(json.uploads || []);
    } catch { toast.error("Failed to load marks database"); }
    finally { setLoading(false); }
  };

  const fetchMarks = async (upload_id: string) => {
    if (!user) return;
    setMarksLoading(true);
    try {
      const params = new URLSearchParams({ uid: user.uid, upload_id });
      if (filterDept !== "all") params.append("department", filterDept);
      if (filterYear !== "all") params.append("year", filterYear);
      const res = await fetch(`/api/marks?${params}`);
      const json = await res.json();
      setMarks(json.marks || []);
      setSelectedStudents(new Set());
    } catch { toast.error("Failed to stream student marks"); }
    finally { setMarksLoading(false); }
  };

  const fetchHistory = async () => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/generate/grade-cards/history?uid=${user.uid}`);
      const json = await res.json();
      setHistory(json.history || []);
    } catch { toast.error("Failed to load generation history"); }
    finally { setHistoryLoading(false); }
  };

  useEffect(() => { 
    if (user) {
      fetchUploads(); 
      fetchMetadata();
      fetchHistory();
    }
  }, [user]);

  useEffect(() => { if (selectedUpload) fetchMarks(selectedUpload); }, [selectedUpload, filterDept, filterYear]);

  const paginatedMarks = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return marks.slice(start, start + itemsPerPage);
  }, [marks, currentPage]);

  const totalPages = Math.ceil(marks.length / itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [marks]);

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedStudents.size === marks.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(marks.map((s) => s.id)));
    }
  };

  const handleMarksUpload = async (file: File) => {
    if (!user) return;
    if (!uploadDept.trim()) { toast.error("Specify department first"); return; }
    if (!uploadYear.trim()) { toast.error("Specify year first"); return; }
    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("uid", user.uid);
      fd.append("department", uploadDept.trim());
      fd.append("year", uploadYear.trim());
      fd.append("exam_name", uploadExam.trim() || "Standard Examination");
      const res = await fetch("/api/marks/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload protocol failed");
      setUploadResult({ inserted: json.inserted, upload_id: json.upload_id, errors: json.parse_errors || [] });
      toast.success(json.message);
      setSelectedUpload(json.upload_id);
      await fetchUploads();
      setUploadMode(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Synchronization failed");
    } finally { setUploading(false); }
  };

  const handleGenerate = async () => {
    if (!user || !selectedUpload) { toast.error("Select source data first"); return; }
    const studentsToGenerate = selectedStudents.size > 0
      ? Array.from(selectedStudents)
      : marks.map((m) => m.id);

    if (studentsToGenerate.length === 0) { toast.error("Selection archive is empty"); return; }

    setGenerating(true);
    setProgress(0);
    const interval = setInterval(() => setProgress((p) => Math.min(p + 3, 90)), 500);

    try {
      const res = await fetch("/api/generate/grade-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          upload_id: selectedUpload,
          department: filterDept !== "all" ? filterDept : undefined,
          year: filterYear !== "all" ? filterYear : undefined,
          student_ids: selectedStudents.size > 0 ? Array.from(selectedStudents) : undefined,
        }),
      });

      clearInterval(interval);
      setProgress(95);

      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "Generation server failure" }));
        throw new Error(j.error || "Generation engine failed");
      }

      // Get filename from Content-Disposition if available
      const disposition = res.headers.get("Content-Disposition");
      let filename = "";
      if (disposition && disposition.indexOf("filename=") !== -1) {
        const matches = /filename="([^"]+)"/.exec(disposition);
        if (matches && matches[1]) filename = matches[1];
      }

      const contentType = res.headers.get("content-type") || "";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      if (!filename) {
        if (contentType.includes("zip")) {
          const deptLabel = filterDept !== "all" ? filterDept : "ALL";
          filename = `GRADE_CARDS_${deptLabel.toUpperCase().replace(/\s+/g, "_")}_${Date.now()}.zip`;
        } else {
          filename = `GRADE_CARD_${Date.now()}.pdf`;
        }
      }

      a.download = filename;
      toast.success(filename.endsWith(".zip") ? `Package Ready: ${studentsToGenerate.length} Grade Cards compiled into ZIP!` : "Grade Card Document Ready!");

      a.click();
      URL.revokeObjectURL(url);
      setProgress(100);
      fetchHistory();
      setTimeout(() => setProgress(0), 2000);
    } catch (err: unknown) {
      clearInterval(interval);
      toast.error(err instanceof Error ? err.message : "Generation failed");
      setProgress(0);
    } finally {
      setGenerating(false);
    }
  };

  const departments = [...new Set(uploads.map((u) => u.department))].sort();
  const years = [...new Set(uploads.map((u) => u.year))].sort();

  const getResultBadge = (r: string) => {
    const res = (r || "FAIL").toUpperCase();
    if (res === "PASS") return <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-black text-[10px] uppercase">Pass</Badge>;
    if (res === "ATKT") return <Badge className="bg-amber-500/10 text-amber-600 border-none font-black text-[10px] uppercase">ATKT</Badge>;
    return <Badge className="bg-destructive/10 text-destructive border-none font-black text-[10px] uppercase">Fail</Badge>;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.12 }}>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <GraduationCap className="h-8 w-8 text-primary" />
            Grade Card Studio
          </h1>
          <p className="text-muted-foreground font-medium mt-1">
            Bulk PDF generation for individual student grade reports.
          </p>
        </motion.div>
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => setUploadMode(!uploadMode)} 
            variant={uploadMode ? "outline" : "default"}
            className="font-bold shadow-lg shadow-primary/20"
          >
            {uploadMode ? "Dismiss" : <><Plus className="h-4 w-4 mr-2" /> New Marks Upload</>}
          </Button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {uploadMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <Card className="border-none shadow-sm bg-muted/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary" />
                  Upload Source Marks
                </CardTitle>
                <CardDescription className="font-medium">
                  Provide metadata before uploading the university marksheet Excel.
                </CardDescription>
              </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Department</Label>
                      {allCourses.length > 0 ? (
                        <Select value={uploadDept} onValueChange={setUploadDept}>
                          <SelectTrigger className="font-bold bg-background border-muted-foreground/20">
                            <SelectValue placeholder="Select Dept" />
                          </SelectTrigger>
                          <SelectContent>
                            {allCourses.map((c) => (
                              <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={uploadDept} onChange={(e) => setUploadDept(e.target.value)} placeholder="e.g. IT / CS" className="font-bold bg-background" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Semester / Year</Label>
                      {allSemesters.length > 0 ? (
                        <Select value={uploadYear} onValueChange={setUploadYear}>
                          <SelectTrigger className="font-bold bg-background border-muted-foreground/20">
                            <SelectValue placeholder="Select Sem" />
                          </SelectTrigger>
                          <SelectContent>
                            {allSemesters.map((s) => (
                              <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={uploadYear} onChange={(e) => setUploadYear(e.target.value)} placeholder="e.g. FY / SY / TY" className="font-bold bg-background" />
                      )}
                    </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Exam Name</Label>
                    <Input value={uploadExam} onChange={(e) => setUploadExam(e.target.value)} placeholder="e.g. Sem III - 2026" className="font-bold bg-background" />
                  </div>
                </div>

                <div
                  className={`group relative overflow-hidden border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
                    uploading 
                      ? "border-primary/50 bg-primary/5 ring-4 ring-primary/5" 
                      : "border-muted-foreground/20 hover:border-primary/50 hover:bg-background"
                  }`}
                  onClick={() => !uploading && fileRef.current?.click()}
                >
                  <AnimatePresence mode="wait">
                    {uploading ? (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        <p className="text-sm font-bold text-primary">Ingesting Marks Data...</p>
                      </motion.div>
                    ) : (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 group-hover:rotate-3">
                          <Plus className="h-8 w-8 text-primary" />
                        </div>
                        <p className="text-sm font-bold">Import University Marks Excel</p>
                        <p className="text-xs text-muted-foreground font-semibold mt-1">.xlsx or .xls (Official Format Only)</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMarksUpload(f); e.target.value = ""; }} />

                {uploadResult && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    <div className="flex items-center gap-3 text-sm font-bold text-emerald-600 bg-emerald-500/10 p-4 rounded-xl">
                      <CheckCircle2 className="h-5 w-5" />
                      {uploadResult.inserted} Student Marks Indexed Successfully
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Tabs defaultValue="generation" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
          <TabsTrigger value="generation" className="font-bold flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" /> Generation
          </TabsTrigger>
          <TabsTrigger value="history" className="font-bold flex items-center gap-2">
            <History className="h-4 w-4" /> History
          </TabsTrigger>
        </TabsList>

          <TabsContent value="generation" className="space-y-8">
            <div className="flex flex-col gap-8">
              {/* Controls */}
              <div className="w-full">
                <Card className="border-none shadow-sm h-fit">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Filter className="h-5 w-5 text-primary" />
                      Control Panel
                    </CardTitle>
                    <CardDescription className="font-medium">Configure generation parameters.</CardDescription>
                  </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Course</Label>
                          {loading ? (
                            <div className="flex items-center gap-2 py-2">
                              <Loader2 className="h-4 w-4 animate-spin text-primary/40" />
                              <span className="text-xs font-bold text-muted-foreground">Fetching records...</span>
                            </div>
                          ) : (
                              <Select value={selectedUpload} onValueChange={setSelectedUpload}>
                                <SelectTrigger className="font-bold bg-muted/30 border-none">
                                  <SelectValue placeholder="Select Marks Record" />
                                </SelectTrigger>
                                <SelectContent>
                                  {uploads.map((u) => {
                                    // Clean up exam name to avoid redundant (Dept) or double parens
                                    let cleanExam = u.exam_name;
                                    if (u.department) {
                                      cleanExam = cleanExam.replace(`(${u.department})`, "").trim();
                                      // Also remove any trailing parens if it was like "Exam (Dept)"
                                      if (cleanExam.endsWith(`(${u.department}`)) {
                                         cleanExam = cleanExam.slice(0, -(u.department.length + 2)).trim();
                                      }
                                    }
                                    return (
                                      <SelectItem key={u.id} value={u.id} className="font-medium">
                                        {cleanExam} {u.department ? `| ${u.department}` : ""}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filter Dept</Label>
                          <Select value={filterDept} onValueChange={setFilterDept}>
                            <SelectTrigger className="font-bold bg-muted/30 border-none">
                              <SelectValue placeholder="All" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All</SelectItem>
                              {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filter Year</Label>
                          <Select value={filterYear} onValueChange={setFilterYear}>
                            <SelectTrigger className="font-bold bg-muted/30 border-none">
                              <SelectValue placeholder="All" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All</SelectItem>
                              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                    <div className="flex flex-col md:flex-row items-center gap-6 pt-2">
                      <div className="flex-1 w-full">
                        {generating && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                              <span>Processing Documents</span>
                              <span>{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-1.5" />
                          </div>
                        )}
                      </div>

                      <Button
                        onClick={handleGenerate}
                        disabled={generating || !selectedUpload || marks.length === 0}
                        className="w-full md:w-auto min-w-[240px] font-black shadow-lg shadow-primary/20 h-12"
                      >
                        {generating ? (
                          <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Generating...</>
                        ) : (
                          <>
                            {marks.length > 1 ? <FileArchive className="h-5 w-5 mr-2" /> : <FileText className="h-5 w-5 mr-2" />}
                            Build {selectedStudents.size > 0 ? selectedStudents.size : marks.length} Cards
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Student List */}
              <Card className="w-full border-none shadow-sm overflow-hidden flex flex-col">
                <CardHeader className="bg-muted/30 pb-6 border-b border-border/50">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        Eligible Students
                      </CardTitle>
                      <CardDescription className="font-medium">Select specific students or generate for everyone below.</CardDescription>
                    </div>
                    {selectedUpload && (
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3 bg-background/50 px-4 py-2 rounded-xl border border-border/40">
                          <Checkbox id="select-all" checked={marks.length > 0 && selectedStudents.size === marks.length} onCheckedChange={toggleAll} />
                          <Label htmlFor="select-all" className="text-xs font-black uppercase tracking-widest cursor-pointer whitespace-nowrap">Select All</Label>
                        </div>
                        {selectedStudents.size > 0 && (
                          <Badge className="bg-primary text-primary-foreground font-black text-[10px] uppercase h-8 px-4 flex items-center rounded-lg">{selectedStudents.size} Selected</Badge>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-auto">
                  {marksLoading ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-4">
                      <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
                      <p className="text-sm font-bold text-muted-foreground">Streaming student records...</p>
                    </div>
                  ) : selectedUpload && marks.length > 0 ? (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30 border-none text-[10px] font-black uppercase tracking-widest">
                            <TableHead className="w-[80px] pl-6 py-4 text-center">Select</TableHead>
                            <TableHead className="py-4">Student Info</TableHead>
                            <TableHead className="py-4 text-center w-[200px]">Identity</TableHead>
                            <TableHead className="py-4 text-center w-[120px]">Score</TableHead>
                            <TableHead className="py-4 text-center w-[120px]">CGPA</TableHead>
                            <TableHead className="py-4 text-right pr-6 w-[120px]">Result</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedMarks.map((s) => (
                            <TableRow 
                              key={s.id} 
                              className={`group hover:bg-muted/20 transition-colors border-border/40 cursor-pointer ${selectedStudents.has(s.id) ? "bg-primary/5" : ""}`}
                              onClick={() => toggleStudent(s.id)}
                            >
                              <TableCell className="pl-6 py-4 text-center">
                                <Checkbox checked={selectedStudents.has(s.id)} onCheckedChange={() => {}} />
                              </TableCell>
                              <TableCell className="py-4">
                                <div>
                                  <p className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">{s.student_name}</p>
                                  <p className="text-[10px] font-black uppercase tracking-tight text-muted-foreground/60">{s.roll_number}</p>
                                </div>
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <div className="flex flex-col items-center">
                                  <Badge variant="outline" className="font-black text-[9px] uppercase tracking-tighter border-muted-foreground/20">{s.department}</Badge>
                                  <span className="text-[10px] font-bold text-muted-foreground mt-0.5">{s.year}</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <p className="text-sm font-black text-foreground">{(s.percentage || 0).toFixed(1)}%</p>
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <p className="text-sm font-bold text-muted-foreground">{(s.cgpa || 0).toFixed(2)}</p>
                              </TableCell>
                              <TableCell className="py-4 text-right pr-6">
                                {getResultBadge(s.result)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      {/* Pagination */}
                      <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-6 border-t border-border/50 bg-muted/10">
                        <p className="text-xs font-bold text-muted-foreground">
                          Showing {marks.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to {Math.min(currentPage * itemsPerPage, marks.length)} of {marks.length} students
                        </p>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-8 w-8 border-border/60"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => prev - 1)}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <div className="flex items-center gap-1">
                            {(() => {
                              const pages: (number | "...")[] = [];
                              if (totalPages <= 7) {
                                for (let i = 1; i <= totalPages; i++) pages.push(i);
                              } else {
                                pages.push(1);
                                if (currentPage > 3) pages.push("...");
                                for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
                                if (currentPage < totalPages - 2) pages.push("...");
                                pages.push(totalPages);
                              }
                              return pages.map((p, idx) =>
                                p === "..." ? (
                                  <span key={`ellipsis-${idx}`} className="h-8 w-6 flex items-center justify-center text-xs text-muted-foreground font-bold select-none">…</span>
                                ) : (
                                  <Button
                                    key={p}
                                    variant={currentPage === p ? "default" : "outline"}
                                    className={`h-8 w-8 text-xs font-black border-border/60 ${currentPage === p ? "shadow-md shadow-primary/20" : ""}`}
                                    onClick={() => setCurrentPage(p as number)}
                                  >
                                    {p}
                                  </Button>
                                )
                              );
                            })()}
                          </div>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-8 w-8 border-border/60"
                            disabled={currentPage === totalPages || totalPages === 0}
                            onClick={() => setCurrentPage(prev => prev + 1)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </>

                ) : selectedUpload ? (
                  <div className="flex flex-col items-center justify-center py-32 gap-4 text-center p-6">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                      <Users className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">No students found</p>
                      <p className="text-xs font-medium text-muted-foreground mt-1 max-w-[200px]">Ensure you have uploaded marks for this department and year.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-32 gap-4 text-center p-6">
                    <div className="w-16 h-16 bg-primary/5 rounded-full flex items-center justify-center">
                      <ClipboardCheck className="h-8 w-8 text-primary/40" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">Select source data</p>
                      <p className="text-xs font-medium text-muted-foreground mt-1">Select a marks upload from the control panel to view students.</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card className="border-none shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border/50">
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Generation Archive
              </CardTitle>
              <CardDescription className="font-medium">View and track previously generated grade reports.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {historyLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
                  <p className="text-sm font-bold text-muted-foreground">Loading history...</p>
                </div>
              ) : history.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30 border-none text-[10px] font-black uppercase tracking-widest">
                      <TableHead className="pl-6 py-4">Department</TableHead>
                      <TableHead className="py-4">Semester</TableHead>
                      <TableHead className="py-4">Exam Year</TableHead>
                      <TableHead className="py-4">Generated At</TableHead>
                      <TableHead className="py-4 text-right pr-6">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((h) => (
                      <TableRow key={h.id} className="border-border/40">
                        <TableCell className="pl-6 py-4 font-bold">{h.department || "—"}</TableCell>
                        <TableCell className="py-4 font-medium text-muted-foreground">{h.year || "—"}</TableCell>
                        <TableCell className="py-4 font-medium text-muted-foreground">{h.exam_name || "—"}</TableCell>
                        <TableCell className="py-4 text-xs font-bold">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{new Date(h.generated_at).toLocaleDateString("en-IN")}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-medium pl-5">
                              {new Date(h.generated_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-right pr-6">
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-black text-[10px] uppercase">Generated</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-center p-6">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                    <History className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">No history records</p>
                    <p className="text-xs font-medium text-muted-foreground mt-1">Grade cards you generate will appear here.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

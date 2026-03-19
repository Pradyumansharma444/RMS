"use client";

import { useAuth } from "@/lib/auth-context";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  Upload,
  Download,
  History,
  Filter,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  ArrowRight,
  Calendar,
  School,
  ClipboardCheck,
  Search,
  Eye,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Info,
  FileText,
  RefreshCw,
  Recycle,
  RotateCcw,
  Trash
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { X } from "lucide-react";

interface UploadRecord {
  id: string;
  exam_name: string;
  department: string;
  year: string;
  file_name: string;
  status: string;
  total_students: number;
  created_at: string;
  semester?: string;
  hod_name?: string;
  title_suffix?: string;
}

  export default function GadgetSheetPage() {
    const { user } = useAuth();
    const [uploads, setUploads] = useState<UploadRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    
    // Metadata State
    const [allDepts, setAllDepts] = useState<{name: string, code?: string}[]>([]);
    const [allCourses, setAllCourses] = useState<{name: string, code?: string}[]>([]);
    const [allYears, setAllYears] = useState<{name: string}[]>([]);
    const [allSemesters, setAllSemesters] = useState<{name: string}[]>([]);

    // Generation Form State
    const [selectedDept, setSelectedDept] = useState("");
    const [selectedCourse, setSelectedCourse] = useState("");
    const [selectedYear, setSelectedYear] = useState("");
    const [selectedSemester, setSelectedSemester] = useState("");
    
    const [hodName, setHodName] = useState("");
    const [examSession, setExamSession] = useState("");
    const [titleSuffix, setTitleSuffix] = useState("");
    const [examType, setExamType] = useState("");
    const [applyOrdinance, setApplyOrdinance] = useState<"no" | "yes">("no");
    const [gracingStatus, setGracingStatus] = useState("");
    const [graceResult, setGraceResult] = useState<{ graced: number; o5042: number; o5045: number } | null>(null);
    const [uploading, setUploading] = useState(false);
    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; record: UploadRecord | null }>({ open: false, record: null });
    const [confirmText, setConfirmText] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    // Track per-row PDF action loading: key = `${id}-view` or `${id}-download`
    const [pdfLoading, setPdfLoading] = useState<Record<string, boolean>>({});

    // Recycle Bin
    const [binUploads, setBinUploads] = useState<UploadRecord[]>([]);
    const [fetchingBin, setFetchingBin] = useState(false);
    const [showBin, setShowBin] = useState(false);
    const [restoringId, setRestoringId] = useState<string | null>(null);
    const [hardDeleteDialog, setHardDeleteDialog] = useState<{ open: boolean; record: UploadRecord | null }>({ open: false, record: null });
    const [isHardDeleting, setIsHardDeleting] = useState(false);
    
    // Filter States
    const [filterDept, setFilterDept] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;
    
    // Derived display names
    const fullDeptName = useMemo(() => {
      let name = "";
      if (selectedDept) name += selectedDept;
      if (selectedCourse) name += (name ? ` (${selectedCourse})` : selectedCourse);
      return name;
    }, [selectedDept, selectedCourse]);

    const fullYearName = useMemo(() => {
      let name = "";
      if (selectedYear) name += selectedYear;
      if (selectedSemester) name += (name ? ` - ${selectedSemester}` : selectedSemester);
      return name;
    }, [selectedYear, selectedSemester]);
   
    const fileRef = useRef<HTMLInputElement>(null);
    
    const fetchMetadata = async () => {
      if (!user) return;
      try {
        const [deptRes, courseRes, yearRes, semRes] = await Promise.all([
          fetch(`/api/metadata/departments?uid=${user.uid}`),
          fetch(`/api/metadata/courses?uid=${user.uid}`),
          fetch(`/api/metadata/years?uid=${user.uid}`),
          fetch(`/api/metadata/semesters?uid=${user.uid}`)
        ]);
        const [deptJson, courseJson, yearJson, semJson] = await Promise.all([
          deptRes.json(),
          courseRes.json(),
          yearRes.json(),
          semRes.json()
        ]);
        setAllDepts(deptJson.data || []);
        setAllCourses(courseJson.data || []);
        setAllYears(yearJson.data || []);
        setAllSemesters(semJson.data || []);
      } catch {
        console.error("Failed to fetch metadata");
      }
    };


    const fetchUploads = async () => {
      if (!user) return;
      setFetching(true);
      try {
        const res = await fetch(`/api/marks/uploads?uid=${user.uid}`);
        const json = await res.json();
        setUploads(json.uploads || []);
      } catch {
        toast.error("Failed to load records archive");
      } finally {
        setFetching(false);
      }
    };

    const fetchBin = async () => {
      if (!user) return;
      setFetchingBin(true);
      try {
        const res = await fetch(`/api/marks/uploads?uid=${user.uid}&bin=1`);
        const json = await res.json();
        setBinUploads(json.uploads || []);
      } catch {
        toast.error("Failed to load recycle bin");
      } finally {
        setFetchingBin(false);
      }
    };

    const handleRestore = async (record: UploadRecord) => {
      setRestoringId(record.id);
      try {
        const res = await fetch(`/api/marks/uploads?id=${record.id}`, { method: "PATCH" });
        if (!res.ok) throw new Error("Restore failed");
        toast.success(`"${record.exam_name}" restored successfully`);
        await Promise.all([fetchUploads(), fetchBin()]);
      } catch {
        toast.error("Failed to restore record");
      } finally {
        setRestoringId(null);
      }
    };

    const handleHardDelete = async () => {
      if (!hardDeleteDialog.record || isHardDeleting) return;
      setIsHardDeleting(true);
      try {
        const res = await fetch(`/api/marks/uploads?id=${hardDeleteDialog.record.id}&permanent=1`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        toast.success("Record permanently erased");
        setHardDeleteDialog({ open: false, record: null });
        await fetchBin();
      } catch {
        toast.error("Failed to permanently delete record");
      } finally {
        setIsHardDeleting(false);
      }
    };
  
    useEffect(() => {
      if (user) {
        fetchUploads();
        fetchMetadata();
      }
    }, [user]);

    // Multi-tab sync: listen for grace events from Ordinance tab
    useEffect(() => {
      if (typeof window === "undefined") return;
      let bc: BroadcastChannel | null = null;
      try {
        bc = new BroadcastChannel("rms_grace_sync");
        bc.onmessage = (ev) => {
          if (ev.data?.type === "grace_applied") {
            const { graced, o5042, o5045, upload_id } = ev.data;
            setGraceResult({ graced, o5042, o5045 });
            toast.success(`Grace synced from Ordinance tab — ${graced} student(s) updated`);
            // Refresh uploads so PDF will reflect updated marks
            fetchUploads();
          }
        };
      } catch { /* BroadcastChannel not supported */ }
      return () => { bc?.close(); };
    }, []);

  const handleUploadAndGenerate = async (file: File) => {
    if (!user) return;
    if (!selectedDept) { toast.error("Select department first"); return; }
    if (!selectedYear) { toast.error("Select year first"); return; }
    if (!hodName.trim()) { toast.error("Enter HOD name"); return; }
    if (!examSession.trim()) { toast.error("Enter Exam Session (e.g. MAY 2025)"); return; }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("uid", user.uid);
      fd.append("department", fullDeptName);
      fd.append("year", fullYearName);
      fd.append("semester", selectedSemester || selectedYear);
      fd.append("exam_name", examSession.trim());
      fd.append("hod_name", hodName.trim());
      fd.append("title_suffix", titleSuffix.trim());

      const res = await fetch("/api/marks/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      
      toast.success("Data uploaded. Generating Gadget Sheet...");

      // If ordinance is enabled, run the gracing engine before PDF generation
      if (applyOrdinance === "yes") {
        setGracingStatus("Running Gracing Engine (O.5042-A / O.5045-A)…");
        try {
          const graceRes = await fetch("/api/grace-marks/engine", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uid: user?.uid, upload_id: json.upload_id, dry_run: false }),
          });
          const graceJson = await graceRes.json();
          if (graceRes.ok) {
            const g = { graced: graceJson.graced, o5042: graceJson.o5042_count, o5045: graceJson.o5045_count };
            setGraceResult(g);
            toast.success(`Ordinance applied — ${g.graced} student(s) graced (${g.o5042} O.5042-A, ${g.o5045} O.5045-A)`);
            // Broadcast to Ordinance tab
            try { new BroadcastChannel("rms_grace_sync").postMessage({ type: "grace_applied_from_gadget", ...g, upload_id: json.upload_id }); } catch {}
          } else {
            toast.error("Gracing engine error: " + (graceJson.error || "unknown"));
          }
        } catch {
          toast.error("Gracing engine failed — generating without ordinance");
        } finally {
          setGracingStatus("");
        }
      }

      // Now generate the PDF using the newly created upload (force build, no cache yet)
      await generatePDF(json.upload_id, fullDeptName, fullYearName, "download", examType.trim(), true);

      await fetchUploads();
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setUploading(false);
    }
  };

    const generatePDF = async (uploadId: string, dept: string, sem: string, mode: "download" | "view" = "download", examTypeParam: string = "", forceRegen = false) => {
      const loadKey = `${uploadId}-${mode}`;
      // Prevent duplicate concurrent requests for the same record+action
      if (pdfLoading[loadKey]) return;
      setPdfLoading(prev => ({ ...prev, [loadKey]: true }));

      const toastId = toast.loading(mode === "view" ? "Preparing preview…" : "Building PDF…");
      try {
        const ctrl = new AbortController();
        const res = await fetch("/api/generate/gadget-sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: user?.uid,
            upload_id: uploadId,
            department: dept,
            year: sem,
            exam_type: examTypeParam || examType,
            // Only bust cache when explicitly regenerating; otherwise serve from cache for speed
            bust_cache: forceRegen,
          }),
          signal: ctrl.signal,
          // Use keepalive so the request survives tab navigation
          keepalive: true,
        });
        if (!res.ok) throw new Error("Generation failed");

        // Stream the response directly into a blob for speed
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        if (mode === "view") {
          // Open a named window BEFORE the async work (within the user-gesture scope)
          // then navigate it to the blob URL after fetch completes.
          // We can't open-before-fetch in this flow, so instead use a direct iframe approach:
          // Create a hidden <a> and programmatically click it — this is allowed post-fetch in most browsers.
          const a = document.createElement("a");
          a.href = url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast.success("Gadget Sheet opened in new tab", { id: toastId });
        } else {
          const a = document.createElement("a");
          a.href = url;
          a.download = `GADGET_SHEET_${dept}_${sem}_${Date.now()}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast.success("Gadget Sheet downloaded!", { id: toastId });
        }

        // Revoke after browser has had time to use the URL
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          toast.error("Failed to build PDF document", { id: toastId });
        }
      } finally {
        setPdfLoading(prev => { const n = { ...prev }; delete n[loadKey]; return n; });
      }
    };

    const handleDelete = async () => {
      if (!user || !deleteDialog.record || isDeleting) return;

      const typedText = confirmText.trim().toUpperCase();
      const expectedText = deleteDialog.record.exam_name.trim().toUpperCase();

      if (typedText !== expectedText) {
        toast.error("Confirmation text doesn't match");
        return;
      }

      setIsDeleting(true);
      try {
        // Soft-delete — move to Recycle Bin, NOT permanent delete
        const res = await fetch(`/api/marks/uploads?id=${deleteDialog.record.id}`, { method: "DELETE" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || "Delete failed");
        }

        toast.success("Moved to Recycle Bin — restore or permanently delete from Recycle Bin tab");
        const deletedId = deleteDialog.record!.id;
        setDeleteDialog({ open: false, record: null });
        setConfirmText("");
        // Optimistically remove from main list immediately
        setUploads(prev => prev.filter(u => u.id !== deletedId));
        // Refresh both main list and bin
        fetchUploads();
        fetchBin();
      } catch (err: any) {
        toast.error(err.message || "Failed to move to recycle bin");
      } finally {
        setIsDeleting(false);
      }
    };


  const filteredUploads = useMemo(() => {
    return uploads.filter(u => {
      const matchesDept = filterDept === "all" || u.department === filterDept;
      const matchesSearch = !searchQuery || 
        u.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.hod_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.exam_name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesDept && matchesSearch;
    });
  }, [uploads, filterDept, searchQuery]);

  const paginatedUploads = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUploads.slice(start, start + itemsPerPage);
  }, [filteredUploads, currentPage]);

  const totalPages = Math.ceil(filteredUploads.length / itemsPerPage);

  const departments = [...new Set(uploads.map((u) => u.department))].sort();

  const downloadTemplate = async () => {
    try {
      const res = await fetch("/api/marks/template");
      if (!res.ok) throw new Error("Failed to download template");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Marks_Template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Template download failed");
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            Generate Gadget Sheet
          </h1>
          <p className="text-sm text-muted-foreground">
            Fill in the details below and upload the horizontal Excel marksheet to generate a professional Office Register PDF.
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-9 gap-2 font-semibold"
          onClick={downloadTemplate}
        >
          <Download className="h-4 w-4" />
          Download Template
        </Button>
      </div>

      {/* Main Generation Card */}
      <Card className="border-border/40 shadow-sm overflow-hidden">
        <CardContent className="p-6 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Department & Course</Label>
                    <div className="flex gap-2">
                      <Select value={selectedDept} onValueChange={setSelectedDept}>
                        <SelectTrigger className="w-1/2 h-10 font-medium">
                          <SelectValue placeholder="Select Dept" />
                        </SelectTrigger>
                          <SelectContent>
                            {allDepts.length > 0 ? (
                              allDepts.map((d) => (
                                <SelectItem key={d.name} value={d.name}>
                                  {d.name}
                                </SelectItem>
                              ))
                            ) : (
                              <div className="p-2 text-xs text-muted-foreground font-medium text-center italic">
                                No departments found.
                              </div>
                            )}
                          </SelectContent>
                      </Select>
                      <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                        <SelectTrigger className="w-1/2 h-10 font-medium">
                          <SelectValue placeholder="Select Course" />
                        </SelectTrigger>
                          <SelectContent>
                            {allCourses.length > 0 ? (
                              allCourses.map((c) => (
                                <SelectItem key={c.name} value={c.name}>
                                  {c.name}
                                </SelectItem>
                              ))
                            ) : (
                              <div className="p-2 text-xs text-muted-foreground font-medium text-center italic">
                                No courses found.
                              </div>
                            )}
                          </SelectContent>
                      </Select>
                    </div>
                  </div>
    
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Department HOD Name</Label>
                    <Input
                      value={hodName}
                      onChange={(e) => setHodName(e.target.value)}
                      placeholder="Enter HOD Name"
                      className="h-10 font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Result Type</Label>
                    <Select value={examType} onValueChange={setExamType}>
                      <SelectTrigger className="h-10 font-medium">
                        <SelectValue placeholder="Select Result Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Regular">Regular Result List</SelectItem>
                        <SelectItem value="ATKT">ATKT Student List</SelectItem>
                        <SelectItem value="External">External Examination</SelectItem>
                        <SelectItem value="Supplementary">Supplementary Result List</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                      Apply Ordinance
                    </Label>
                    <Select value={applyOrdinance} onValueChange={(v) => setApplyOrdinance(v as "no" | "yes")}>
                      <SelectTrigger className={`h-10 font-medium ${applyOrdinance === "yes" ? "border-amber-500/60 text-amber-700 dark:text-amber-400" : ""}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">No — Generate as-is</SelectItem>
                        <SelectItem value="yes">Yes — Auto-apply O.5042-A &amp; O.5045-A</SelectItem>
                      </SelectContent>
                    </Select>
                    {applyOrdinance === "yes" && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium leading-relaxed">
                        Passing grace (O.5042-A) and condonation (O.5045-A) will be auto-applied before generating. Grace symbols (* and @) will appear in the sheet.
                      </p>
                    )}
                  </div>
                </div>
    
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Year & Semester</Label>
                    <div className="flex gap-2">
                      <Select value={selectedYear} onValueChange={setSelectedYear}>
                        <SelectTrigger className="w-1/2 h-10 font-medium">
                          <SelectValue placeholder="Select Year" />
                        </SelectTrigger>
                          <SelectContent>
                            {allYears.length > 0 ? (
                              allYears.map((y) => (
                                <SelectItem key={y.name} value={y.name}>
                                  {y.name}
                                </SelectItem>
                              ))
                            ) : (
                              <div className="p-2 text-xs text-muted-foreground font-medium text-center italic">
                                No years found.
                              </div>
                            )}
                          </SelectContent>
                      </Select>
                      <Select value={selectedSemester} onValueChange={setSelectedSemester}>
                        <SelectTrigger className="w-1/2 h-10 font-medium">
                          <SelectValue placeholder="Select Semester" />
                        </SelectTrigger>
                          <SelectContent>
                            {allSemesters.length > 0 ? (
                              allSemesters.map((s) => (
                                <SelectItem key={s.name} value={s.name}>
                                  {s.name}
                                </SelectItem>
                              ))
                            ) : (
                              <div className="p-2 text-xs text-muted-foreground font-medium text-center italic">
                                No semesters found.
                              </div>
                            )}
                          </SelectContent>
                      </Select>
                    </div>
                  </div>


              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Exam Session</Label>
                <Input 
                  value={examSession}
                  onChange={(e) => setExamSession(e.target.value)}
                  placeholder="MAY 2025" 
                  className="h-10 font-medium"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Title Suffix (e.g. NEP 2020)</Label>
                <Input 
                  value={titleSuffix}
                  onChange={(e) => setTitleSuffix(e.target.value)}
                  placeholder="(NEP 2020)" 
                  className="h-10 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Upload Area */}
          <div 
            className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer ${
              uploading 
                ? "border-primary/50 bg-primary/5" 
                : "border-border/60 hover:border-primary/40 hover:bg-muted/30"
            }`}
            onClick={() => !uploading && fileRef.current?.click()}
          >
            <div className="p-3 bg-muted rounded-full">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-bold">Upload Marks Data</p>
              <p className="text-xs text-muted-foreground font-medium">Select the Excel file containing the marksheet data.</p>
            </div>
            <Button disabled={uploading} className="h-10 px-6 font-bold gap-2">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload & Generate Gadget Sheet
            </Button>
            {gracingStatus && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-bold flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {gracingStatus}
              </p>
            )}
            {graceResult && !gracingStatus && (
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                  Ordinance applied — {graceResult.graced} student(s) graced
                  {graceResult.o5042 > 0 && <span className="ml-1">({graceResult.o5042} O.5042-A*</span>}
                  {graceResult.o5045 > 0 && <span>{graceResult.o5042 > 0 ? ", " : " ("}{graceResult.o5045} O.5045-A@</span>}
                  {(graceResult.o5042 > 0 || graceResult.o5045 > 0) && <span>)</span>}
                </p>
                <button onClick={() => setGraceResult(null)} className="ml-auto text-amber-500 hover:text-amber-700">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <input 
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUploadAndGenerate(f);
                e.target.value = "";
              }}
            />
          </div>

          {/* Important Note */}
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 flex gap-3 items-start">
            <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400">Important Note</p>
              <p className="text-xs text-blue-600/80 dark:text-blue-400/80 font-medium leading-relaxed">
                The system uses the <span className="font-bold underline cursor-pointer">Horizontal Marksheet Template</span>. Ensure your Excel file follows the 3-row header format. You can download a sample template from the Result Management tab.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Records Section */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Access & Export Existing Records
            </h2>
            <p className="text-xs text-muted-foreground font-medium">View permanently saved Gadget Sheets from Supabase storage.</p>
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Filter by Department</Label>
              <Select value={filterDept} onValueChange={setFilterDept}>
                <SelectTrigger className="w-[180px] h-9 text-xs font-bold">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={fetchUploads} disabled={fetching} size="sm" className="h-9 gap-2 font-bold px-4">
              {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Fetch Records
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-2 font-bold px-4 text-emerald-600 border-emerald-600/20 hover:bg-emerald-500/5 hover:text-emerald-700">
              <FileSpreadsheet className="h-4 w-4" />
              Export to Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`h-9 gap-2 font-bold px-4 transition-colors ${showBin ? "bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20" : "text-amber-600 border-amber-500/20 hover:bg-amber-500/5"}`}
              onClick={() => {
                const next = !showBin;
                setShowBin(next);
                if (next && binUploads.length === 0) fetchBin();
              }}
            >
              <Recycle className="h-4 w-4" />
              Recycle Bin {binUploads.length > 0 && <span className="ml-1 bg-amber-500 text-white text-[10px] font-black rounded-full px-1.5 py-0.5">{binUploads.length}</span>}
            </Button>
          </div>
        </div>

        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <Search className="h-4 w-4 text-muted-foreground" />
          </div>
          <Input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search HOD or Department in saved records..." 
            className="pl-9 h-10 text-sm"
          />
        </div>

        <div className="border border-border/40 rounded-xl overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-bold uppercase tracking-wider py-4">Department</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider py-4">HOD Name</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider py-4">Exam Session</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider py-4 text-center">Students</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider py-4">Created</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider py-4 text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fetching ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
                      <p className="text-xs font-bold text-muted-foreground">Loading records...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedUploads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <p className="text-sm font-bold text-muted-foreground">No records found</p>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedUploads.map((u) => (
                  <TableRow key={u.id} className="group hover:bg-muted/20 transition-colors">
                    <TableCell className="font-bold text-sm py-4">{u.department}</TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-muted rounded-full flex items-center justify-center text-[10px] font-black uppercase">
                          {u.hod_name?.slice(0, 2) || "VS"}
                        </div>
                        <span className="text-xs font-bold uppercase tracking-tight">{u.hod_name || "VIJAY SIR"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <Badge variant="outline" className="font-black text-[10px] uppercase tracking-tighter border-muted-foreground/20">
                        {u.exam_name}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-4 text-center">
                      <span className="text-sm font-black">{u.total_students}</span>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold">{new Date(u.created_at).toLocaleDateString("en-IN")}</p>
                        <p className="text-[10px] text-muted-foreground font-medium">admin01@tsdc.in</p>
                      </div>
                    </TableCell>
                      <TableCell className="py-4 text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Preview gadget sheet"
                            className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            onClick={() => generatePDF(u.id, u.department, u.year, "view")}
                            disabled={!!pdfLoading[`${u.id}-view`] || !!pdfLoading[`${u.id}-download`] || !!pdfLoading[`${u.id}-regen`]}
                          >
                            {pdfLoading[`${u.id}-view`]
                              ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Download gadget sheet"
                            className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            onClick={() => generatePDF(u.id, u.department, u.year, "download")}
                            disabled={!!pdfLoading[`${u.id}-view`] || !!pdfLoading[`${u.id}-download`] || !!pdfLoading[`${u.id}-regen`]}
                          >
                            {pdfLoading[`${u.id}-download`]
                              ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              : <Download className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Regenerate gadget sheet (force rebuild)"
                            className="h-8 w-8 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                            onClick={() => generatePDF(u.id, u.department, u.year, "download", "", true)}
                            disabled={!!pdfLoading[`${u.id}-view`] || !!pdfLoading[`${u.id}-download`] || !!pdfLoading[`${u.id}-regen`]}
                          >
                            {pdfLoading[`${u.id}-regen`]
                              ? <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                              : <RefreshCw className="h-4 w-4" />}
                          </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteDialog({ open: true, record: u })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>

                        </div>
                      </TableCell>

                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-2">
          <p className="text-xs font-bold text-muted-foreground">
            Showing {filteredUploads.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to {Math.min(currentPage * itemsPerPage, filteredUploads.length)} of {filteredUploads.length} records
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
              {[...Array(totalPages)].map((_, i) => (
                <Button 
                  key={i} 
                  variant={currentPage === i + 1 ? "default" : "outline"}
                  className={`h-8 w-8 text-xs font-black border-border/60 ${currentPage === i + 1 ? "shadow-md shadow-primary/20" : ""}`}
                  onClick={() => setCurrentPage(i + 1)}
                >
                  {i + 1}
                </Button>
              ))}
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
      </div>

      {/* ── Recycle Bin ─────────────────────────────────────────────────── */}
      {showBin && (
        <div className="space-y-4 border border-amber-500/20 rounded-2xl p-6 bg-amber-500/5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-xl">
                <Recycle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-base font-bold">Recycle Bin</h2>
                <p className="text-xs text-muted-foreground font-medium">Soft-deleted records. Restore to recover or permanently delete to erase.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2 font-bold text-xs border-amber-500/20 text-amber-600 hover:bg-amber-500/10"
                onClick={fetchBin}
                disabled={fetchingBin}
              >
                {fetchingBin ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Refresh
              </Button>
            </div>
          </div>

          {fetchingBin ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm font-medium">Loading bin…</span>
            </div>
          ) : binUploads.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-amber-500/20 rounded-xl">
              <Recycle className="h-8 w-8 text-amber-500/30 mx-auto mb-2" />
              <p className="text-sm font-bold text-muted-foreground">Recycle bin is empty</p>
            </div>
          ) : (
            <div className="border border-amber-500/20 rounded-xl overflow-hidden">
              <Table>
                <TableHeader className="bg-amber-500/10">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-bold uppercase tracking-wider py-3">Department</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider py-3">Exam Session</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider py-3">Students</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider py-3">Deleted</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider py-3 text-right pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {binUploads.map((u) => (
                    <TableRow key={u.id} className="hover:bg-amber-500/5 transition-colors">
                      <TableCell className="font-bold text-sm py-3 text-muted-foreground">{u.department}</TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className="font-black text-[10px] uppercase tracking-tighter border-amber-500/30 text-amber-600">
                          {u.exam_name}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-sm font-black text-muted-foreground">{u.total_students}</TableCell>
                      <TableCell className="py-3 text-xs font-bold text-muted-foreground">
                        {(u as any).deleted_at ? new Date((u as any).deleted_at).toLocaleDateString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className="py-3 text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                            onClick={() => handleRestore(u)}
                            disabled={restoringId === u.id}
                          >
                            {restoringId === u.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <RotateCcw className="h-3.5 w-3.5" />}
                            Restore
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs font-bold text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setHardDeleteDialog({ open: true, record: u })}
                          >
                            <Trash className="h-3.5 w-3.5" />
                            Delete Forever
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Session Records */}
      <div className="pt-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Recently Fetched Records (Session)
            </h2>
            <p className="text-xs text-muted-foreground font-medium">Temporary records from current session. Use the Fetch Records button to load from database.</p>
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Filter by Department</Label>
              <Select defaultValue="all">
                <SelectTrigger className="w-[180px] h-9 text-xs font-bold">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" className="h-9 gap-2 font-bold px-4">
              <Search className="h-4 w-4" />
              Fetch from DB
            </Button>
          </div>
        </div>

        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <Search className="h-4 w-4 text-muted-foreground" />
          </div>
          <Input 
            placeholder="Search HOD or Department in fetched records..." 
            className="pl-9 h-10 text-sm"
          />
        </div>
        
        <div className="border border-border/40 rounded-xl p-12 text-center bg-muted/20 border-dashed">
          <p className="text-sm font-bold text-muted-foreground">No session records available. Click 'Fetch Records' to begin.</p>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => {
        if (!open) {
          setDeleteDialog(prev => ({ ...prev, open: false }));
          setConfirmText("");
        }
      }}>
        <DialogContent className="max-w-md bg-[#0a0a0a] border-white/10 p-0 overflow-hidden rounded-2xl shadow-2xl">
          <div className="p-8 space-y-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 shrink-0">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-destructive leading-tight tracking-tight">Move to Recycle Bin</h2>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Can be restored or permanently deleted later</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2 leading-relaxed">
                <p className="text-sm text-muted-foreground font-medium">
                  You are about to move the <span className="text-white font-bold decoration-destructive/30 underline-offset-4 underline">{deleteDialog.record?.exam_name}</span> record for <span className="text-white font-bold">{deleteDialog.record?.department}</span> to the Recycle Bin.
                </p>
                <div className="bg-muted/50 p-3 rounded-xl border border-white/5">
                  <p className="text-[11px] text-muted-foreground/80 font-medium leading-relaxed italic">
                    The record will be moved to Recycle Bin. You can restore it or permanently delete all associated data (student marks, grace marks, PDF history) from the Recycle Bin tab.
                  </p>
                </div>
                <p className="text-sm font-black text-amber-500 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Data is preserved until permanently deleted from Recycle Bin.
                </p>
              </div>
              
              <div className="space-y-3 pt-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Type the exam session <span className="text-white font-black">{deleteDialog.record?.exam_name}</span> to confirm:
                </Label>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleDelete();
                    }
                  }}
                  placeholder="Type exam session to confirm"
                  className="h-12 bg-[#141414] border-white/5 focus:border-destructive/40 focus:ring-4 focus:ring-destructive/10 text-white font-bold placeholder:text-white/20 rounded-xl transition-all"
                  autoFocus
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-8 py-6 bg-[#111111]/80 backdrop-blur-sm border-t border-white/5">
            <Button 
              variant="ghost" 
              onClick={() => {
                setDeleteDialog({ open: false, record: null });
                setConfirmText("");
              }}
              className="font-bold text-muted-foreground hover:text-white hover:bg-white/5 rounded-xl px-6"
              disabled={isDeleting}
            >
              Cancel
            </Button>
              <Button 
                variant="destructive"
                onClick={handleDelete}
                disabled={confirmText.trim().toUpperCase() !== deleteDialog.record?.exam_name.trim().toUpperCase() || isDeleting}
                className="font-black bg-[#7c1d1d] hover:bg-destructive text-white border-none px-8 h-11 gap-2 rounded-xl shadow-lg shadow-destructive/20 active:scale-95 transition-all"
              >

              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Recycle className="h-4 w-4" />}
              Move to Recycle Bin
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hard Delete (from Recycle Bin) Dialog */}
      <Dialog open={hardDeleteDialog.open} onOpenChange={(open) => {
        if (!open) setHardDeleteDialog({ open: false, record: null });
      }}>
        <DialogContent
          className="max-w-md bg-[#0a0a0a] border-white/10 p-0 overflow-hidden rounded-2xl shadow-2xl"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isHardDeleting) {
              e.preventDefault();
              handleHardDelete();
            }
          }}
        >
          <div className="p-8 space-y-5">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 shrink-0">
                <Trash className="h-6 w-6 text-destructive" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-destructive leading-tight">Erase Forever</h2>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground font-medium leading-relaxed">
              Permanently erase <span className="text-white font-bold">{hardDeleteDialog.record?.exam_name}</span> from the system? All student marks data will be gone forever.
            </p>
            <p className="text-sm font-black text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              This cannot be undone — not even from the recycle bin. Press Enter to confirm.
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 px-8 py-5 bg-[#111111]/80 border-t border-white/5">
            <Button
              variant="ghost"
              onClick={() => setHardDeleteDialog({ open: false, record: null })}
              className="font-bold text-muted-foreground hover:text-white hover:bg-white/5 rounded-xl px-6"
              disabled={isHardDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleHardDelete}
              disabled={isHardDeleting}
              className="font-black bg-[#7c1d1d] hover:bg-destructive text-white border-none px-8 h-11 gap-2 rounded-xl shadow-lg shadow-destructive/20 active:scale-95 transition-all"
            >
              {isHardDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash className="h-4 w-4" />}
              Erase Permanently
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

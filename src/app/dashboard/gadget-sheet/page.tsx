"use client";

import { useAuth } from "@/lib/auth-context";
import { useEffect, useState, useRef, useMemo } from "react";
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
  FileText
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
    const [uploading, setUploading] = useState(false);
    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; record: UploadRecord | null }>({ open: false, record: null });
    const [confirmText, setConfirmText] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    
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
  
    useEffect(() => { 
      if (user) {
        fetchUploads(); 
        fetchMetadata();
      }
    }, [user]);

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

      // Now generate the PDF using the newly created upload
      await generatePDF(json.upload_id, fullDeptName, fullYearName, "download", examType.trim());
      
      await fetchUploads();
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setUploading(false);
    }
  };

    const generatePDF = async (uploadId: string, dept: string, sem: string, mode: "download" | "view" = "download", examTypeParam: string = "") => {
      try {
        const res = await fetch("/api/generate/gadget-sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: user?.uid,
            upload_id: uploadId,
            department: dept,
            year: sem,
            exam_type: examTypeParam || examType,
          }),
        });
        if (!res.ok) throw new Error("Generation failed");
        
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        
        if (mode === "view") {
          window.open(url, "_blank");
        } else {
          const a = document.createElement("a");
          a.href = url;
          a.download = `GADGET_SHEET_${dept}_${sem}_${Date.now()}.pdf`;
          a.click();
        }
        
        setTimeout(() => URL.revokeObjectURL(url), 100);
        toast.success(mode === "view" ? "Opening Gadget Sheet..." : "Gadget Sheet downloaded successfully");
      } catch (err: any) {
        toast.error("Failed to build PDF document");
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
        const res = await fetch(`/api/marks/uploads?id=${deleteDialog.record.id}`, { method: "DELETE" });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Delete failed");
        }
        
        toast.success("Exam record purged successfully");
        setDeleteDialog({ open: false, record: null });
        setConfirmText("");
        await fetchUploads();
      } catch (err: any) {
        console.error("Delete error:", err);
        toast.error(err.message || "Failed to delete record");
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
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Examination Name (e.g. ATKT / External)</Label>
                    <Input
                      value={examType}
                      onChange={(e) => setExamType(e.target.value)}
                      placeholder="Regular / ATKT / External"
                      className="h-10 font-medium"
                    />
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
                            className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                            onClick={() => generatePDF(u.id, u.department, u.year, "view")}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                            onClick={() => generatePDF(u.id, u.department, u.year, "download")}
                          >
                            <Download className="h-4 w-4" />
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
                <h2 className="text-xl font-bold text-destructive leading-tight tracking-tight">Permanent Record Deletion</h2>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Exam History Purge</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2 leading-relaxed">
                <p className="text-sm text-muted-foreground font-medium">
                  You are about to permanently delete the <span className="text-white font-bold decoration-destructive/30 underline-offset-4 underline">{deleteDialog.record?.exam_name}</span> record for <span className="text-white font-bold">{deleteDialog.record?.department}</span>:
                </p>
                <div className="bg-muted/50 p-3 rounded-xl border border-white/5">
                  <p className="text-[11px] text-muted-foreground/80 font-medium leading-relaxed italic">
                    All student marks, result calculations, and PDF generation history associated with this upload will be permanently removed.
                  </p>
                </div>
                <p className="text-sm font-black text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  This action cannot be undone.
                </p>
              </div>
              
              <div className="space-y-3 pt-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Type the exam session <span className="text-white font-black">{deleteDialog.record?.exam_name}</span> to confirm:
                </Label>
                <Input 
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
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

              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete Permanently
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

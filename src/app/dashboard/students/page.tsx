"use client";

import { useAuth } from "@/lib/auth-context";
import { useEffect, useState, useRef, useMemo } from "react";
import { toast } from "sonner";
import { 
  Users, 
  Upload, 
  FileSpreadsheet, 
  Search, 
  Filter, 
  UserPlus, 
  MoreHorizontal,
  Camera,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { X, Trash2 } from "lucide-react";

interface Student {
  id: string;
  roll_number: string;
  enrollment_no?: string;
  abc_id?: string;
  university_exam_seat_no?: string;
  gender?: string;
  name: string;
  department: string;
  year: string;
  division?: string;
  photo_url?: string;
  created_at: string;
}

export default function StudentsPage() {
  const { user, college } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ inserted: number; errors: string[] } | null>(null);
  const [filterDept, setFilterDept] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [search, setSearch] = useState("");
  const [photoUploading, setPhotoUploading] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; student: Student | null }>({ open: false, student: null });
  const [confirmRoll, setConfirmRoll] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  
    // Metadata State
    const [allDepts, setAllDepts] = useState<{name: string}[]>([]);
    const [allYears, setAllYears] = useState<{name: string}[]>([]);

    const fetchMetadata = async () => {
      if (!user) return;
      try {
        const [deptRes, yearRes] = await Promise.all([
          fetch(`/api/metadata/departments?uid=${user.uid}`),
          fetch(`/api/metadata/years?uid=${user.uid}`)
        ]);
        const [deptJson, yearJson] = await Promise.all([
          deptRes.json(),
          yearRes.json()
        ]);
        setAllDepts(deptJson.data || []);
        setAllYears(yearJson.data || []);
      } catch {
        console.error("Failed to fetch metadata");
      }
    };

    const departments = allDepts.length > 0 ? allDepts.map(d => d.name) : [];
    const years = allYears.length > 0 ? allYears.map(y => y.name) : [];
  
    const filtered = students.filter((s) => {
      if (filterDept !== "all" && s.department !== filterDept) return false;
      if (filterYear !== "all" && s.year !== filterYear) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.roll_number.toLowerCase().includes(q)
        );
      }
      return true;
    });

    const paginatedStudents = useMemo(() => {
      const start = (currentPage - 1) * itemsPerPage;
      return filtered.slice(start, start + itemsPerPage);
    }, [filtered, currentPage]);

    const totalPages = Math.ceil(filtered.length / itemsPerPage);

    useEffect(() => {
      setCurrentPage(1);
      setSelectedStudents(new Set());
    }, [filterDept, filterYear, search]);

    const toggleStudent = (id: string) => {
      setSelectedStudents((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    };

    const toggleAll = () => {
      if (selectedStudents.size === filtered.length) {
        setSelectedStudents(new Set());
      } else {
        setSelectedStudents(new Set(filtered.map((s) => s.id)));
      }
    };
  
    const fetchStudents = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({ uid: user.uid });
        const res = await fetch(`/api/students?${params}`);
        const json = await res.json();
        setStudents(json.students || []);
      } catch {
        toast.error("Failed to load students");
      } finally {
        setLoading(false);
      }
    };
  
    useEffect(() => { 
      if (user) {
        fetchStudents(); 
        fetchMetadata();
      }
    }, [user]);

  const handleFileUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("uid", user.uid);
      const res = await fetch("/api/students/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      setUploadResult({ inserted: json.inserted, errors: json.parse_errors || [] });
      toast.success(json.message || `${json.inserted} students uploaded`);
      await fetchStudents();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoUpload = async (studentId: string, rollNumber: string, file: File) => {
    if (!user || !college) return;
    setPhotoUploading(studentId);
    try {
      const ext = file.name.split(".").pop();
      const path = `${college.id}/students/${rollNumber}.${ext}`;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bucket", "student-photos");
      fd.append("path", path);
      const res = await fetch("/api/upload/image", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");

      // Update student photo
      await fetch("/api/students/photo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, student_id: studentId, photo_url: json.url }),
      });
      toast.success("Photo uploaded");
      await fetchStudents();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setPhotoUploading(null);
    }
  };

  const deleteStudent = async () => {
    if (!user || !deleteDialog.student || isDeleting) return;
    if (confirmRoll !== deleteDialog.student.roll_number) {
      toast.error("Roll number doesn't match");
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/students?uid=${user.uid}&id=${deleteDialog.student.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");

      toast.success("Student records purged successfully");
      setDeleteDialog({ open: false, student: null });
      setConfirmRoll("");
      await fetchStudents();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete student");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            Student Master
          </h1>
          <p className="text-muted-foreground font-medium mt-1">
            Manage your student records and photos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="px-4 py-1.5 text-sm font-bold bg-primary/10 text-primary border-none">
            {students.length} Total Students
          </Badge>
          <Button onClick={() => fileRef.current?.click()} className="font-bold shadow-lg shadow-primary/20">
            <UserPlus className="h-4 w-4 mr-2" />
            Import Excel
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        {/* Upload Card */}
        <Card className="border-none shadow-sm h-fit">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Batch Upload
            </CardTitle>
            <CardDescription className="font-medium">
              Import students from Excel. 
              Required columns: Roll Number, Name, Department, Year.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={`group relative overflow-hidden border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                uploading 
                  ? "border-primary/50 bg-primary/5 ring-4 ring-primary/5" 
                  : "border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/50"
              }`}
              onClick={() => !uploading && fileRef.current?.click()}
            >
              <AnimatePresence mode="wait">
                {uploading ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-3 py-4"
                  >
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm font-bold text-primary animate-pulse">Processing Database...</p>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-3 transition-transform">
                      <FileSpreadsheet className="h-8 w-8 text-primary" />
                    </div>
                    <p className="text-sm font-bold">Click to upload Excel</p>
                    <p className="text-xs text-muted-foreground font-semibold mt-1">.xlsx or .xls (Max 10MB)</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
                e.target.value = "";
              }}
            />

            {uploadResult && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-3 text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-4 rounded-xl">
                  <CheckCircle2 className="h-5 w-5" />
                  {uploadResult.inserted} Students Synchronized
                </div>
                {uploadResult.errors.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400 mb-2">
                      <AlertCircle className="h-4 w-4" />
                      {uploadResult.errors.length} Formatting Errors
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                      {uploadResult.errors.map((e, i) => (
                        <p key={i} className="text-[10px] text-amber-600/80 font-medium leading-tight">Row {i+1}: {e}</p>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </CardContent>
        </Card>

        {/* Control Panel */}
        <div className="w-full">
          <Card className="border-none shadow-sm h-fit">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5 text-primary" />
                Control Panel
              </CardTitle>
              <CardDescription className="font-medium">Filter and search your student database.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors group-focus-within:text-primary">Search Students</Label>
                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                    <Input 
                      placeholder="Search by name or roll..." 
                      className="pl-9 h-10 bg-muted/30 border-none font-medium"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filter Dept</Label>
                  <Select value={filterDept} onValueChange={setFilterDept}>
                    <SelectTrigger className="font-bold bg-muted/30 border-none h-10">
                      <SelectValue placeholder="All Depts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Depts</SelectItem>
                      {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filter Year</Label>
                  <Select value={filterYear} onValueChange={setFilterYear}>
                    <SelectTrigger className="font-bold bg-muted/30 border-none h-10">
                      <SelectValue placeholder="All Years" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Years</SelectItem>
                      {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* List Card */}
        <Card className="border-none shadow-sm overflow-hidden flex flex-col">
          <CardHeader className="bg-muted/30 pb-6 border-b border-border/50">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Eligible Students
                </CardTitle>
                <CardDescription className="font-medium">Manage student profiles and academic records.</CardDescription>
              </div>
              {students.length > 0 && (
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3 bg-background/50 px-4 py-2 rounded-xl border border-border/40">
                    <Checkbox 
                      id="select-all" 
                      checked={filtered.length > 0 && selectedStudents.size === filtered.length} 
                      onCheckedChange={toggleAll} 
                    />
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
              {loading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
                  <p className="text-sm font-bold text-muted-foreground">Streaming data...</p>
                </div>
              ) : filtered.length > 0 ? (
                <div className="relative overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30 border-none text-[10px] font-black uppercase tracking-widest">
                        <TableHead className="w-[80px] pl-6 py-4 text-center">Select</TableHead>
                        <TableHead className="w-[80px] font-bold text-xs uppercase tracking-wider py-4 text-center">Avatar</TableHead>
                        <TableHead className="font-bold text-xs uppercase tracking-wider py-4">Student Info</TableHead>
                        <TableHead className="font-bold text-xs uppercase tracking-wider py-4 text-center w-[200px]">Department</TableHead>
                        <TableHead className="font-bold text-xs uppercase tracking-wider py-4 text-center w-[150px]">Year / Div</TableHead>
                        <TableHead className="w-[60px] pr-6 py-4"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedStudents.map((s) => (
                        <TableRow 
                          key={s.id} 
                          className={`group hover:bg-muted/20 transition-colors border-border/40 cursor-pointer ${selectedStudents.has(s.id) ? "bg-primary/5" : ""}`}
                          onClick={() => toggleStudent(s.id)}
                        >
                          <TableCell className="pl-6 py-4 text-center">
                            <Checkbox checked={selectedStudents.has(s.id)} onCheckedChange={() => {}} />
                          </TableCell>
                          <TableCell className="py-4 text-center">
                            <div className="flex justify-center">
                              <label className="relative block group/avatar cursor-pointer" onClick={(e) => e.stopPropagation()}>
                                <Avatar className="h-10 w-10 border-2 border-background shadow-sm group-hover/avatar:ring-2 group-hover/avatar:ring-primary transition-all">
                                  <AvatarImage src={s.photo_url} className="object-cover" />
                                  <AvatarFallback className="bg-primary/5 text-primary font-black text-xs">
                                    {s.name.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                  <Camera className="h-4 w-4 text-white" />
                                </div>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={photoUploading === s.id}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handlePhotoUpload(s.id, s.roll_number, f);
                                    e.target.value = "";
                                  }}
                                />
                                {photoUploading === s.id && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-full">
                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                  </div>
                                )}
                              </label>
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <div>
                              <p className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">{s.name}</p>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                                <p className="text-xs font-mono text-muted-foreground tracking-tight font-semibold uppercase">Roll: {s.roll_number}</p>
                                {s.enrollment_no && <p className="text-[10px] font-mono text-primary/70 tracking-tight font-bold uppercase">ENR: {s.enrollment_no}</p>}
                                {s.abc_id && <p className="text-[10px] font-mono text-emerald-600/70 tracking-tight font-bold uppercase">ABC: {s.abc_id}</p>}
                                {s.gender && <p className="text-[10px] font-mono text-amber-600/70 tracking-tight font-bold uppercase">G: {s.gender}</p>}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="py-4 text-center">
                            <Badge variant="outline" className="font-bold border-muted-foreground/20 text-[10px] uppercase tracking-wider">
                              {s.department}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-sm font-bold text-foreground">{s.year}</span>
                              {s.division && (
                                <>
                                  <span className="text-muted-foreground/30">•</span>
                                  <Badge className="bg-muted text-muted-foreground border-none font-black text-[10px]">
                                    DIV {s.division}
                                  </Badge>
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="pr-6 py-4 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                  <DropdownMenuItem className="font-bold text-xs" onClick={(e) => {
                                    e.stopPropagation();
                                    // Add edit logic here if needed
                                    toast.info("Profile editing coming soon");
                                  }}>
                                    Edit Profile
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    className="font-bold text-xs text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteDialog({ open: true, student: s });
                                    }}
                                  >
                                    Remove Student
                                  </DropdownMenuItem>

                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-6 border-t border-border/50 bg-muted/10">
                    <p className="text-xs font-bold text-muted-foreground">
                      Showing {filtered.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to {Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length} students
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
                        {/* Show a limited number of pages if many */}
                        {totalPages <= 7 ? (
                          [...Array(totalPages)].map((_, i) => (
                            <Button 
                              key={i} 
                              variant={currentPage === i + 1 ? "default" : "outline"}
                              className={`h-8 w-8 text-xs font-black border-border/60 ${currentPage === i + 1 ? "shadow-md shadow-primary/20" : ""}`}
                              onClick={() => setCurrentPage(i + 1)}
                            >
                              {i + 1}
                            </Button>
                          ))
                        ) : (
                          <>
                            <Button 
                              variant={currentPage === 1 ? "default" : "outline"}
                              className="h-8 w-8 text-xs font-black"
                              onClick={() => setCurrentPage(1)}
                            >
                              1
                            </Button>
                            {currentPage > 3 && <span className="text-muted-foreground mx-1 text-xs">...</span>}
                            {currentPage > 2 && currentPage < totalPages && (
                              <Button variant="default" className="h-8 w-8 text-xs font-black shadow-md shadow-primary/20">
                                {currentPage}
                              </Button>
                            )}
                            {currentPage < totalPages - 2 && <span className="text-muted-foreground mx-1 text-xs">...</span>}
                            <Button 
                              variant={currentPage === totalPages ? "default" : "outline"}
                              className="h-8 w-8 text-xs font-black"
                              onClick={() => setCurrentPage(totalPages)}
                            >
                              {totalPages}
                            </Button>
                          </>
                        )}
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
              ) : (
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                    <Search className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-foreground">No students found</p>
                    <p className="text-xs font-medium text-muted-foreground mt-1">Try adjusting your search or filters.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setSearch(""); setFilterDept("all"); setFilterYear("all"); }} className="font-bold rounded-full">
                    Reset Explorer
                  </Button>
                </div>
              )}
            </CardContent>
        </Card>
      </div>

      <Dialog open={deleteDialog.open} onOpenChange={(open) => {
        if (!open) {
          setDeleteDialog(prev => ({ ...prev, open: false }));
          setConfirmRoll("");
        }
      }}>
        <DialogContent className="max-w-md bg-[#0a0a0a] border-white/10 p-0 overflow-hidden rounded-2xl shadow-2xl">
          <div className="p-8 space-y-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 shrink-0">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-destructive leading-tight tracking-tight">Permanent Student Deletion</h2>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Global Purge Protocol</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2 leading-relaxed">
                <p className="text-sm text-muted-foreground font-medium">
                  You are about to permanently delete <span className="text-white font-bold decoration-destructive/30 underline-offset-4 underline">{deleteDialog.student?.name}</span> and all associated system records:
                </p>
                <div className="bg-muted/50 p-3 rounded-xl border border-white/5">
                  <p className="text-[11px] text-muted-foreground/80 font-medium leading-relaxed italic">
                    Results, fees, ATKT applications, exam forms, hall tickets, notifications, uploaded files — everything will be removed from the decentralized cluster.
                  </p>
                </div>
                <p className="text-sm font-black text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  This action cannot be undone.
                </p>
              </div>
              
              <div className="space-y-3 pt-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Type the roll number <span className="text-white font-black">{deleteDialog.student?.roll_number}</span> to confirm:
                </Label>
                <Input 
                  value={confirmRoll}
                  onChange={(e) => setConfirmRoll(e.target.value)}
                  placeholder="Type roll number to confirm"
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
                setDeleteDialog({ open: false, student: null });
                setConfirmRoll("");
              }}
              className="font-bold text-muted-foreground hover:text-white hover:bg-white/5 rounded-xl px-6"
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={deleteStudent}
              disabled={confirmRoll !== deleteDialog.student?.roll_number || isDeleting}
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

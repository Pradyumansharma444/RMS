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
  CheckCircle2
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
  const grade = String(sub?.grade ?? "").trim().toUpperCase();
  if (sub?.is_pass === false) return true;
  if (grade === "F" || grade === "FAIL" || grade === "F A I L") return true;
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

  // Ordinance Rules state
  const [ordinanceIntThreshold, setOrdinanceIntThreshold] = useState("15");
  const [ordinanceExtThreshold, setOrdinanceExtThreshold] = useState("25");
  const [isOrdinanceAnalyzed, setIsOrdinanceAnalyzed] = useState(false);
  const [ordinanceApplyInt, setOrdinanceApplyInt] = useState("");
  const [ordinanceApplyExt, setOrdinanceApplyExt] = useState("");
  const [ordinanceConfirmOpen, setOrdinanceConfirmOpen] = useState(false);
  const [ordinanceConfirmMode, setOrdinanceConfirmMode] = useState<"selected" | "all">("all");
  const [ordinanceSelectedKeys, setOrdinanceSelectedKeys] = useState<Set<string>>(new Set());

  const fetchGraceHistory = async () => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/grace-marks/history?uid=${user.uid}`);
      const json = await res.json();
      setGraceHistory(json.history || []);
    } catch {
      toast.error("Failed to load grace marks history");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchUploads();
    }
  }, [user]);

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
        // Eligible = current internal below threshold AND current external below threshold
        if (currentInt < intLimit && currentExt < extLimit && totalNeeded > 0) {
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
    // Sequence: higher marks first, lower marks later
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

        // Ordinance: show all failing students with int < threshold AND ext < threshold
        if (currentInt < intThresh && currentExt < extThresh && totalNeeded > 0) {
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
                Showing failing students where Internal &lt;{" "}
                <span className="text-primary font-black px-1.5 py-0.5 bg-primary/10 rounded">{internalGraceLimit || 0}</span>{" "}
                AND External &lt;{" "}
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
                    {(isOrdinanceAnalyzed && !isAnalyzed ? ordinanceStudents : isAnalyzed ? eligibleStudents : (activeTab === "all" ? allStudents : failedStudents)).map((s: any, idx: number) => {
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

        {/* Ordinance Rules Tab */}
        <TabsContent value="ordinance" className="space-y-6">
          {/* Config Card */}
          <Card className="border-none shadow-xl bg-amber-500/5 ring-1 ring-amber-500/20 overflow-hidden">
            <CardHeader className="bg-amber-500/10 border-b border-amber-500/20">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Ordinance Rules — Marks Threshold Analysis
              </CardTitle>
              <CardDescription className="font-medium text-xs text-amber-700/70 dark:text-amber-400/70">
                Enter max marks thresholds. Shows all failing students with Internal &lt; X and External &lt; Y, ranked by highest marks.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              {/* Course Selector */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-amber-700/60 dark:text-amber-400/60">Select Course / Exam</Label>
                <Select value={selectedUpload || undefined} onValueChange={(v) => { setSelectedUpload(v || ""); setIsOrdinanceAnalyzed(false); }}>
                  <SelectTrigger className="h-11 font-bold bg-background/50 border-amber-500/30 w-full max-w-sm">
                    <SelectValue placeholder="Select Exam Data" />
                  </SelectTrigger>
                  <SelectContent>
                    {uploads.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.exam_name} {u.department ? `| ${u.department}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Threshold inputs */}
              <div className="flex flex-col md:flex-row items-end gap-4">
                <div className="space-y-2 flex-1">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-amber-700/60 dark:text-amber-400/60">Internal Marks &lt; (max)</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={ordinanceIntThreshold}
                      onChange={(e) => { setOrdinanceIntThreshold(e.target.value); setIsOrdinanceAnalyzed(false); }}
                      placeholder="e.g. 15"
                      className="h-11 font-black pr-16 bg-background/50 border-amber-500/30 focus:border-amber-500/60 transition-all"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-amber-600/60 pointer-events-none">internal</div>
                  </div>
                </div>
                <div className="space-y-2 flex-1">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-amber-700/60 dark:text-amber-400/60">External Marks &lt; (max)</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={ordinanceExtThreshold}
                      onChange={(e) => { setOrdinanceExtThreshold(e.target.value); setIsOrdinanceAnalyzed(false); }}
                      placeholder="e.g. 25"
                      className="h-11 font-black pr-16 bg-background/50 border-amber-500/30 focus:border-amber-500/60 transition-all"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-amber-600/60 pointer-events-none">external</div>
                  </div>
                </div>
                <Button
                  onClick={() => {
                    if (!selectedUpload) { toast.error("Select a course/exam first"); return; }
                    if (allStudents.length === 0) { toast.error("No student data loaded. Please wait or select a valid exam."); return; }
                    setIsOrdinanceAnalyzed(true);
                    setOrdinanceSelectedKeys(new Set());
                    toast.success(`Found ${ordinanceStudents.length} eligible records.`);
                  }}
                  disabled={fetching || !selectedUpload}
                  className="h-11 px-8 gap-2 font-black bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/20 active:scale-95 transition-all rounded-xl"
                >
                  {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Analyze Ordinance
                </Button>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 items-start">
                <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400 font-bold leading-relaxed">
                  Showing failing students where Internal &lt;{" "}
                  <span className="font-black px-1.5 py-0.5 bg-amber-500/20 rounded">{ordinanceIntThreshold || "—"}</span>{" "}
                  AND External &lt;{" "}
                  <span className="font-black px-1.5 py-0.5 bg-amber-500/20 rounded">{ordinanceExtThreshold || "—"}</span>.
                  {" "}Students ranked from highest obtained marks to lowest.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Grace Application Card — shown after analysis */}
          {isOrdinanceAnalyzed && (
            <Card className="border-none shadow-xl ring-1 ring-emerald-500/20 overflow-hidden">
              <CardHeader className="bg-emerald-500/5 border-b border-emerald-500/20">
                <CardTitle className="text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Apply Grace Marks — {ordinanceStudents.length} Students Eligible
                </CardTitle>
                <CardDescription className="font-medium text-xs text-emerald-700/70 dark:text-emerald-400/70">
                  Enter grace marks to boost student scores and CGPA. Apply to selected students or all at once.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row items-end gap-4">
                  <div className="space-y-2 flex-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Add to Internal Marks</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        placeholder="e.g. 2"
                        value={ordinanceApplyInt}
                        onChange={(e) => setOrdinanceApplyInt(e.target.value)}
                        className="h-11 font-black pr-12 bg-background border-emerald-500/30 focus:border-emerald-500/60 transition-all"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-emerald-600/60 pointer-events-none">int</div>
                    </div>
                  </div>
                  <div className="space-y-2 flex-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Add to External Marks</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        placeholder="e.g. 3"
                        value={ordinanceApplyExt}
                        onChange={(e) => setOrdinanceApplyExt(e.target.value)}
                        className="h-11 font-black pr-12 bg-background border-emerald-500/30 focus:border-emerald-500/60 transition-all"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-emerald-600/60 pointer-events-none">ext</div>
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      if ((parseFloat(ordinanceApplyInt) || 0) <= 0 && (parseFloat(ordinanceApplyExt) || 0) <= 0) { toast.error("Enter grace marks to apply"); return; }
                      if (ordinanceSelectedKeys.size === 0) { toast.error("No students selected. Use 'Apply to All' or select students below."); return; }
                      setOrdinanceConfirmMode("selected");
                      setOrdinanceConfirmOpen(true);
                    }}
                    disabled={applying || ordinanceSelectedKeys.size === 0}
                    variant="outline"
                    className="h-11 gap-2 font-black px-6 border-emerald-500/50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-all rounded-xl"
                  >
                    <Zap className="h-4 w-4" />
                    Apply to Selected ({ordinanceSelectedKeys.size})
                  </Button>
                  <Button
                    onClick={() => {
                      if ((parseFloat(ordinanceApplyInt) || 0) <= 0 && (parseFloat(ordinanceApplyExt) || 0) <= 0) { toast.error("Enter grace marks to apply"); return; }
                      setOrdinanceConfirmMode("all");
                      setOrdinanceConfirmOpen(true);
                    }}
                    disabled={applying || ordinanceStudents.length === 0}
                    className="h-11 gap-2 font-black px-6 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 transition-all rounded-xl"
                  >
                    {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    Apply to All ({ordinanceStudents.length})
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ordinance Results Table */}
          {isOrdinanceAnalyzed && (
            <Card className="border-none shadow-sm overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border/50">
                <CardTitle className="text-sm font-black flex items-center gap-2">
                  <Users className="h-4 w-4 text-amber-600" />
                  Eligible Students — {ordinanceStudents.length} found
                </CardTitle>
                <CardDescription className="font-medium text-xs">
                  Internal &lt; {ordinanceIntThreshold} AND External &lt; {ordinanceExtThreshold}. Highest marks shown first.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {ordinanceStudents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4 text-center p-6">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500/60" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">No students match the ordinance criteria</p>
                      <p className="text-xs text-muted-foreground mt-1">Try increasing the threshold values.</p>
                    </div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow className="hover:bg-transparent border-none text-[10px] font-black uppercase tracking-widest">
                        <TableHead className="w-[60px] py-4 text-center pl-4">
                          <Checkbox
                            checked={ordinanceSelectedKeys.size === ordinanceStudents.length && ordinanceStudents.length > 0}
                            onCheckedChange={() => {
                              if (ordinanceSelectedKeys.size === ordinanceStudents.length) {
                                setOrdinanceSelectedKeys(new Set());
                              } else {
                                setOrdinanceSelectedKeys(new Set(ordinanceStudents.map(s => s.unique_key)));
                              }
                            }}
                            className="w-4 h-4"
                          />
                        </TableHead>
                        <TableHead className="py-4 text-muted-foreground">Student</TableHead>
                        <TableHead className="py-4 text-center text-muted-foreground">Roll No</TableHead>
                        <TableHead className="py-4 text-muted-foreground">Subject</TableHead>
                        <TableHead className="py-4 text-center text-muted-foreground">Internal</TableHead>
                        <TableHead className="py-4 text-center text-muted-foreground">External</TableHead>
                        <TableHead className="py-4 text-center text-muted-foreground">Total</TableHead>
                        <TableHead className="py-4 text-center text-muted-foreground pr-6">Grace Needed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordinanceStudents.map((s) => (
                        <TableRow
                          key={s.unique_key}
                          className={`group hover:bg-amber-500/5 transition-all cursor-pointer border-border/40 ${ordinanceSelectedKeys.has(s.unique_key) ? "bg-amber-500/10" : ""}`}
                          onClick={() => {
                            const next = new Set(ordinanceSelectedKeys);
                            next.has(s.unique_key) ? next.delete(s.unique_key) : next.add(s.unique_key);
                            setOrdinanceSelectedKeys(next);
                          }}
                        >
                          <TableCell className="py-4 text-center pl-4" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={ordinanceSelectedKeys.has(s.unique_key)}
                              onCheckedChange={() => {
                                const next = new Set(ordinanceSelectedKeys);
                                next.has(s.unique_key) ? next.delete(s.unique_key) : next.add(s.unique_key);
                                setOrdinanceSelectedKeys(next);
                              }}
                              className="w-4 h-4"
                            />
                          </TableCell>
                          <TableCell className="py-4">
                            <p className="font-bold text-sm group-hover:text-amber-700 transition-colors">{s.student_name}</p>
                            <div className="flex gap-1 mt-0.5">
                              <Badge variant="outline" className="font-black text-[8px] h-4 uppercase tracking-tighter border-muted-foreground/30 text-muted-foreground">{s.department}</Badge>
                              <Badge variant="outline" className="font-black text-[8px] h-4 uppercase tracking-tighter border-muted-foreground/30 text-muted-foreground">{s.year}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="py-4 text-center font-bold text-sm text-muted-foreground">{s.roll_number}</TableCell>
                          <TableCell className="py-4">
                            <p className="text-xs font-bold truncate max-w-[150px]">{s.subject_name}</p>
                          </TableCell>
                          <TableCell className="py-4 text-center">
                            <span className="font-black text-sm tabular-nums text-amber-700">{s.int_marks}</span>
                          </TableCell>
                          <TableCell className="py-4 text-center">
                            <span className="font-black text-sm tabular-nums text-amber-700">{s.ext_marks}</span>
                          </TableCell>
                          <TableCell className="py-4 text-center">
                            <span className="font-black text-sm tabular-nums text-destructive bg-destructive/5 px-2 py-1 rounded-md border border-destructive/10">{s.obtained_marks}</span>
                          </TableCell>
                          <TableCell className="py-4 text-center pr-6">
                            <Badge className="bg-amber-500/10 text-amber-700 border-amber-500/20 border font-black text-[10px]">+{s.grace_needed}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {!isOrdinanceAnalyzed && !selectedUpload && (
            <div className="border-2 border-dashed border-amber-500/20 rounded-3xl p-20 flex flex-col items-center justify-center gap-4 text-center bg-amber-500/5">
              <div className="p-6 bg-amber-500/10 rounded-full">
                <FileText className="h-10 w-10 text-amber-600/40" />
              </div>
              <p className="text-xl font-black text-foreground">Select a Course</p>
              <p className="text-sm text-muted-foreground font-medium max-w-sm">Choose an exam/upload above and set the marks thresholds, then click Analyze Ordinance.</p>
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card className="border-none shadow-sm bg-card/50">
            <CardHeader className="border-b border-border/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  Grace Marks Application History
                </CardTitle>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 font-bold text-xs" onClick={fetchGraceHistory} disabled={historyLoading}>
                  {historyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {historyLoading ? (
                <div className="p-20 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm font-bold text-muted-foreground">Loading history...</p>
                </div>
              ) : graceHistory.length > 0 ? (
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent border-none">
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-5 pl-6">Date & Time</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-5">Student</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-5">Roll No</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-5">Department</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-5">Subject</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-5 text-center">Int Grace</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest py-5 text-center pr-6">Ext Grace</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {graceHistory.map((entry: any) => (
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
                          <p className="text-sm font-black text-foreground">{entry.student_name || "—"}</p>
                        </TableCell>
                        <TableCell className="py-4">
                          <span className="text-xs font-bold text-muted-foreground uppercase">{entry.roll_number || "—"}</span>
                        </TableCell>
                        <TableCell className="py-4">
                          <Badge variant="outline" className="font-black text-[9px] uppercase tracking-tighter border-muted-foreground/20">
                            {entry.department || "—"}
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
                        <TableCell className="py-4 text-center pr-6">
                          {entry.grace_given > 0 ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-black text-[10px] px-2 h-6">+{entry.grace_given}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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

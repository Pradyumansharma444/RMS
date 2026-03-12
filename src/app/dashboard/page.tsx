"use client";

import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Users,
  FileUp,
  GraduationCap,
  FileSpreadsheet,
  ArrowRight,
  AlertCircle,
  Settings,
  LayoutDashboard,
  CheckCircle2,
  Zap,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Calendar
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface Stats {
  students: number;
  uploads: number;
  atktCount: number;
}

interface ATKTStudent {
  id: string;
  roll_number: string;
  student_name: string;
  department: string;
  semester: string;
  total_marks: number;
  obtained_marks: number;
  percentage: number;
  result: string;
  cgpa: number;
  atkt_count: number;
}

interface Upload {
  id: string;
  exam_name: string;
  department: string;
  year: string;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export default function DashboardHome() {
  const { college, user } = useAuth();
  const [stats, setStats] = useState<Stats>({ students: 0, uploads: 0, atktCount: 0 });
  const [statsLoading, setStatsLoading] = useState(false);

  // ATKT tab state
  const [atktStudents, setAtktStudents] = useState<ATKTStudent[]>([]);
  const [atktTotal, setAtktTotal] = useState(0);
  const [atktTotalPages, setAtktTotalPages] = useState(1);
  const [atktLoading, setAtktLoading] = useState(false);
  const [atktPage, setAtktPage] = useState(1);
  const [atktDept, setAtktDept] = useState("all");
  const [atktYear, setAtktYear] = useState("all");
  const [atktUpload, setAtktUpload] = useState("all");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<ATKTStudent | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const atktLimit = 10;

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setStatsLoading(true);
      try {
        const [s, u, atkt] = await Promise.all([
          fetch(`/api/students?uid=${user.uid}`).then((r) => r.json()),
          fetch(`/api/marks/uploads?uid=${user.uid}`).then((r) => r.json()),
          fetch(`/api/marks/atkt?uid=${user.uid}&limit=1`).then((r) => r.json()),
        ]);
        setStats({
          students: s.students?.length ?? 0,
          uploads: u.uploads?.length ?? 0,
          atktCount: atkt.total ?? 0,
        });
        setUploads(u.uploads || []);
      } catch {
        /* ignore */
      } finally {
        setStatsLoading(false);
      }
    };
    load();
  }, [user]);

  const fetchAtktStudents = async (page = 1) => {
    if (!user) return;
    setAtktLoading(true);
    try {
      const params = new URLSearchParams({
        uid: user.uid,
        page: String(page),
        limit: String(atktLimit),
      });
      if (atktDept !== "all") params.set("department", atktDept);
      if (atktYear !== "all") params.set("year", atktYear);
      if (atktUpload !== "all") params.set("upload_id", atktUpload);

      const res = await fetch(`/api/marks/atkt?${params}`);
      const json = await res.json();
      setAtktStudents(json.students || []);
      setAtktTotal(json.total ?? 0);
      setAtktTotalPages(json.total_pages ?? 1);
      setAtktPage(page);
    } catch {
      /* ignore */
    } finally {
      setAtktLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "atkt" && user) {
      fetchAtktStudents(1);
    }
  }, [activeTab, user, atktDept, atktYear, atktUpload]);

  const departments = [...new Set(uploads.map((u) => u.department))].filter(Boolean).sort();
  const years = [...new Set(uploads.map((u) => u.year))].filter(Boolean).sort();

  const statCards = [
    {
      label: "Total Students",
      value: statsLoading ? "…" : stats.students.toLocaleString(),
      icon: Users,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-100/50 dark:bg-blue-900/20",
      href: "/dashboard/students",
    },
    {
      label: "Marks Uploads",
      value: statsLoading ? "…" : stats.uploads.toLocaleString(),
      icon: FileUp,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-100/50 dark:bg-emerald-900/20",
      href: "/dashboard/grade-cards",
    },
    {
      label: "Grade Cards",
      value: "Ready",
      icon: GraduationCap,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-100/50 dark:bg-purple-900/20",
      href: "/dashboard/grade-cards",
    },
    {
      label: "Gadget Sheets",
      value: "Ready",
      icon: FileSpreadsheet,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-100/50 dark:bg-amber-900/20",
      href: "/dashboard/gadget-sheet",
    },
    {
      label: "ATKT / Fail Students",
      value: statsLoading ? "…" : stats.atktCount.toLocaleString(),
      icon: AlertTriangle,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-100/50 dark:bg-red-900/20",
      onClick: () => setActiveTab("atkt"),
    },
  ];

  const modules = [
    {
      title: "Gadget Sheet",
      description: "Department-wise marks report with all divisions combined.",
      href: "/dashboard/gadget-sheet",
      icon: FileSpreadsheet,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-100/50 dark:bg-blue-900/20",
    },
    {
      title: "Grade Cards",
      description: "Bulk PDF grade cards with photo, signatures and stamp.",
      href: "/dashboard/grade-cards",
      icon: GraduationCap,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-100/50 dark:bg-emerald-900/20",
    },
    {
      title: "Student Master",
      description: "Manage student records and upload photos in bulk.",
      href: "/dashboard/students",
      icon: Users,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-100/50 dark:bg-purple-900/20",
    },
    {
      title: "Grace Marks",
      description: "Apply grace marks to failing students based on range.",
      href: "/dashboard/grace-marks",
      icon: Zap,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-100/50 dark:bg-amber-900/20",
    },
    {
      title: "Settings",
      description: "Configure college branding, signatures, and stamps.",
      href: "/dashboard/settings",
      icon: Settings,
      color: "text-slate-600 dark:text-slate-400",
      bg: "bg-slate-100/50 dark:bg-slate-900/20",
    },
  ];

  const workflow = [
    { title: "Student Master", desc: "Upload Excel & Photos", icon: Users, step: 1 },
    { title: "Marks Data", desc: "Upload University Excel", icon: FileUp, step: 2 },
    { title: "Grace Marks", desc: "Assist failing students", icon: Zap, step: 3 },
    { title: "Gadget Sheet", desc: "Generate Department PDF", icon: FileSpreadsheet, step: 4 },
    { title: "Grade Cards", desc: "Bulk Download ZIP", icon: GraduationCap, step: 5 },
  ];

  const needsSetup = !college?.banner_url || !college?.principal_signature_url;

  const getResultBadge = (result: string) => {
    const r = (result || "").toUpperCase();
    if (r.includes("ATKT")) return <Badge className="bg-amber-500/10 text-amber-700 border-amber-500/20 border font-black text-[10px] uppercase">ATKT</Badge>;
    if (r.includes("PASS") || r.includes("P A S S")) return <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-black text-[10px] uppercase">Pass</Badge>;
    return <Badge className="bg-red-500/10 text-red-600 border-none font-black text-[10px] uppercase">Fail</Badge>;
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8 pb-12"
    >
      {/* Welcome Hero */}
      <motion.div variants={item} className="relative overflow-hidden rounded-3xl bg-primary px-8 py-10 text-primary-foreground shadow-2xl shadow-primary/20">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className="bg-white/20 text-white border-none hover:bg-white/30 backdrop-blur-md">
                System Active
              </Badge>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Welcome back{college?.name ? `, ${college.name.split(' ')[0]}` : ""}
            </h1>
            <p className="text-primary-foreground/80 max-w-xl text-lg font-medium leading-relaxed">
              Automated Result Management System. Everything you need to manage student results and generate official documents.
            </p>
          </div>
          <div className="hidden lg:flex items-center justify-center w-24 h-24 bg-white/10 rounded-3xl backdrop-blur-xl border border-white/20">
            <LayoutDashboard className="h-12 w-12 text-white" />
          </div>
        </div>
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-72 h-72 bg-black/10 rounded-full blur-3xl" />
      </motion.div>

      {/* Setup Alert */}
      {needsSetup && (
        <motion.div variants={item}>
          <Link href="/dashboard/settings" className="block group">
            <div className="flex items-center gap-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4 transition-all hover:shadow-lg hover:shadow-amber-500/5 hover:-translate-y-0.5">
              <div className="flex-shrink-0 w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">Action Required: Complete College Profile</h3>
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mt-0.5">
                  Some required fields like banner and signatures are missing. Please complete them to enable grade card generation.
                </p>
              </div>
              <Button variant="ghost" size="sm" className="hidden sm:flex items-center gap-2 text-amber-700 dark:text-amber-400 hover:bg-amber-200/50 dark:hover:bg-amber-900/50">
                Go to Settings
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </Link>
        </motion.div>
      )}

      {/* Quick Stats */}
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          const cardContent = (
            <Card className={`border-none shadow-sm hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 overflow-hidden group-hover:-translate-y-1 ${stat.label === "ATKT / Fail Students" ? "ring-1 ring-red-200 dark:ring-red-900/30" : ""}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                    <h3 className="text-2xl md:text-3xl font-black mt-2 tracking-tight">{stat.value}</h3>
                  </div>
                  <div className={`p-3 rounded-2xl ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );

          if ("onClick" in stat && stat.onClick) {
            return (
              <button key={stat.label} className="group text-left" onClick={stat.onClick}>
                {cardContent}
              </button>
            );
          }
          return (
            <Link key={stat.label} href={(stat as any).href} className="group">
              {cardContent}
            </Link>
          );
        })}
      </motion.div>

      {/* Main Tabs: Overview + ATKT Students */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-sm grid-cols-2 mb-6">
          <TabsTrigger value="overview" className="font-bold flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="atkt" className="font-bold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> ATKT Students
            {stats.atktCount > 0 && (
              <Badge className="bg-red-500/10 text-red-600 border-none font-black text-[9px] h-5 px-1.5 ml-1">
                {stats.atktCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Core Modules
                </h2>
              </div>
              <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {modules.map((m) => {
                  const Icon = m.icon;
                  return (
                    <Link key={m.title} href={m.href} className="group">
                      <Card className="h-full border-none shadow-sm hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group-hover:-translate-y-1">
                        <CardHeader className="p-6">
                          <div className={`w-12 h-12 rounded-2xl ${m.bg} ${m.color} flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3`}>
                            <Icon className="h-6 w-6" />
                          </div>
                          <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">{m.title}</CardTitle>
                          <CardDescription className="text-sm font-medium leading-relaxed mt-2 line-clamp-2">
                            {m.description}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    </Link>
                  );
                })}
              </motion.div>
            </div>

            <motion.div variants={item} className="space-y-6">
              <h2 className="text-xl font-bold tracking-tight">System Workflow</h2>
              <Card className="border-none shadow-sm overflow-hidden">
                <CardHeader className="bg-muted/50 pb-4">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Standard Process</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {workflow.map((w) => {
                      const Icon = w.icon;
                      return (
                        <div key={w.step} className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                            {w.step}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold">{w.title}</h4>
                            <p className="text-xs text-muted-foreground font-medium">{w.desc}</p>
                          </div>
                          <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground/30" />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 text-white">
                <CardContent className="p-6">
                  <h3 className="font-bold mb-1">Need help?</h3>
                  <p className="text-xs text-slate-300 mb-4 font-medium leading-relaxed">Check out our documentation for data formatting guides.</p>
                  <Link href="/dashboard/docs">
                    <Button size="sm" variant="secondary" className="w-full font-bold">
                      View Documentation
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </TabsContent>

        {/* ATKT Students Tab */}
        <TabsContent value="atkt" className="space-y-6">
          {/* Detail panel */}
          {selectedStudent ? (
            <Card className="border-none shadow-sm overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                      Student Details
                    </CardTitle>
                    <CardDescription className="font-medium">ATKT / Fail record for selected student.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setSelectedStudent(null)} className="font-bold gap-2">
                    <ChevronLeft className="h-4 w-4" /> Back to List
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Roll Number", value: selectedStudent.roll_number },
                    { label: "Student Name", value: selectedStudent.student_name },
                    { label: "Semester / Year", value: selectedStudent.semester },
                    { label: "Department", value: selectedStudent.department },
                  ].map((f) => (
                    <div key={f.label} className="space-y-1 p-4 rounded-xl bg-muted/40">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{f.label}</p>
                      <p className="text-sm font-bold">{f.value || "—"}</p>
                    </div>
                  ))}
                  {[
                    { label: "Number of ATKT", value: String(selectedStudent.atkt_count) },
                    { label: "Status", value: selectedStudent.result, badge: true },
                    { label: "Total Marks", value: String(selectedStudent.total_marks ?? "—") },
                    { label: "Obtained Marks", value: String(selectedStudent.obtained_marks ?? "—") },
                  ].map((f) => (
                    <div key={f.label} className="space-y-1 p-4 rounded-xl bg-muted/40">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{f.label}</p>
                      {f.badge ? (
                        <div className="mt-1">{getResultBadge(f.value)}</div>
                      ) : (
                        <p className="text-sm font-bold">{f.value}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Filters */}
              <Card className="border-none shadow-sm">
                <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
                  <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Filter className="h-4 w-4 text-primary" />
                    Filter ATKT Students
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Department</Label>
                      <Select value={atktDept} onValueChange={(v) => { setAtktDept(v); setAtktPage(1); }}>
                        <SelectTrigger className="font-bold bg-background border-muted-foreground/20">
                          <SelectValue placeholder="All Departments" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Departments</SelectItem>
                          {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Year / Semester</Label>
                      <Select value={atktYear} onValueChange={(v) => { setAtktYear(v); setAtktPage(1); }}>
                        <SelectTrigger className="font-bold bg-background border-muted-foreground/20">
                          <SelectValue placeholder="All Years" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Years</SelectItem>
                          {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Exam / Upload</Label>
                      <Select value={atktUpload} onValueChange={(v) => { setAtktUpload(v); setAtktPage(1); }}>
                        <SelectTrigger className="font-bold bg-background border-muted-foreground/20">
                          <SelectValue placeholder="All Uploads" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Uploads</SelectItem>
                          {uploads.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.exam_name} {u.department ? `| ${u.department}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ATKT Students Table */}
              <Card className="border-none shadow-sm overflow-hidden">
                <CardHeader className="bg-muted/30 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                        ATKT / Fail Students
                      </CardTitle>
                      <CardDescription className="font-medium">
                        {atktLoading ? "Loading..." : `${atktTotal} student(s) with ATKT or Fail status`}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {atktLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                      <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
                      <p className="text-sm font-bold text-muted-foreground">Loading students...</p>
                    </div>
                  ) : atktStudents.length > 0 ? (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30 border-none text-[10px] font-black uppercase tracking-widest">
                            <TableHead className="pl-6 py-4">Student Info</TableHead>
                            <TableHead className="py-4 text-center">Roll No.</TableHead>
                            <TableHead className="py-4 text-center">Semester</TableHead>
                            <TableHead className="py-4 text-center">No. of ATKT</TableHead>
                            <TableHead className="py-4 text-center">Status</TableHead>
                            <TableHead className="py-4 text-center">Total Marks</TableHead>
                            <TableHead className="py-4 text-center pr-6">Obtained</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {atktStudents.map((s) => (
                            <TableRow
                              key={s.id}
                              className="group hover:bg-red-500/5 transition-colors border-border/40 cursor-pointer"
                              onClick={() => setSelectedStudent(s)}
                            >
                              <TableCell className="pl-6 py-4">
                                <div>
                                  <p className="font-bold text-sm text-foreground group-hover:text-red-600 transition-colors">{s.student_name}</p>
                                  <p className="text-[10px] font-black uppercase tracking-tight text-muted-foreground/60">{s.department}</p>
                                </div>
                              </TableCell>
                              <TableCell className="py-4 text-center font-bold text-sm text-muted-foreground">{s.roll_number}</TableCell>
                              <TableCell className="py-4 text-center">
                                <Badge variant="outline" className="font-black text-[9px] uppercase tracking-tighter border-muted-foreground/20">{s.semester}</Badge>
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <Badge className="bg-amber-500/10 text-amber-700 border-none font-black text-[10px]">
                                  {s.atkt_count} subj
                                </Badge>
                              </TableCell>
                              <TableCell className="py-4 text-center">{getResultBadge(s.result)}</TableCell>
                              <TableCell className="py-4 text-center font-bold text-sm">{s.total_marks ?? "—"}</TableCell>
                              <TableCell className="py-4 text-center pr-6 font-black text-sm text-red-600">{s.obtained_marks ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      {/* Pagination */}
                      <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-6 border-t border-border/50 bg-muted/10">
                        <p className="text-xs font-bold text-muted-foreground">
                          Showing {atktTotal > 0 ? (atktPage - 1) * atktLimit + 1 : 0} to {Math.min(atktPage * atktLimit, atktTotal)} of {atktTotal} students
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 font-bold text-xs border-border/60"
                            disabled={atktPage === 1}
                            onClick={() => fetchAtktStudents(atktPage - 1)}
                          >
                            <ChevronLeft className="h-4 w-4" /> Prev
                          </Button>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: atktTotalPages }, (_, i) => i + 1).slice(
                              Math.max(0, atktPage - 3),
                              Math.min(atktTotalPages, atktPage + 2)
                            ).map((p) => (
                              <Button
                                key={p}
                                variant={atktPage === p ? "default" : "outline"}
                                size="sm"
                                className={`h-8 w-8 text-xs font-black border-border/60 ${atktPage === p ? "shadow-md shadow-primary/20" : ""}`}
                                onClick={() => fetchAtktStudents(p)}
                              >
                                {p}
                              </Button>
                            ))}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 font-bold text-xs border-border/60"
                            disabled={atktPage === atktTotalPages || atktTotalPages === 0}
                            onClick={() => fetchAtktStudents(atktPage + 1)}
                          >
                            Next <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center p-6">
                      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500/60" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">No ATKT students found</p>
                        <p className="text-xs font-medium text-muted-foreground mt-1">All students in the selected filters have passed.</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

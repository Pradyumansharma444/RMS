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
  Recycle,
  RotateCcw,
  Trash,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface Stats {
  students: number;
  uploads: number;
  atktCount: number;
}

interface BinRecord {
  id: string;
  exam_name: string;
  department: string;
  total_students: number;
  deleted_at: string;
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

  // Recycle Bin state
  const [binRecords, setBinRecords] = useState<BinRecord[]>([]);
  const [binLoading, setBinLoading] = useState(false);
  const [showBin, setShowBin] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [hardDeleteDialog, setHardDeleteDialog] = useState<{ open: boolean; record: BinRecord | null }>({ open: false, record: null });
  const [isHardDeleting, setIsHardDeleting] = useState(false);

  const fetchBin = async () => {
    if (!user) return;
    setBinLoading(true);
    try {
      const res = await fetch(`/api/marks/uploads?uid=${user.uid}&bin=1`);
      const json = await res.json();
      setBinRecords(json.uploads || []);
    } catch {
      toast.error("Failed to load recycle bin");
    } finally {
      setBinLoading(false);
    }
  };

  const handleRestore = async (record: BinRecord) => {
    setRestoringId(record.id);
    try {
      const res = await fetch(`/api/marks/uploads?id=${record.id}`, { method: "PATCH" });
      if (!res.ok) throw new Error("Restore failed");
      toast.success(`"${record.exam_name}" restored`);
      setBinRecords(prev => prev.filter(r => r.id !== record.id));
      setStats(prev => ({ ...prev, uploads: prev.uploads + 1 }));
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
      setBinRecords(prev => prev.filter(r => r.id !== hardDeleteDialog.record!.id));
    } catch {
      toast.error("Failed to permanently delete record");
    } finally {
      setIsHardDeleting(false);
    }
  };

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
      } catch {
        /* ignore */
      } finally {
        setStatsLoading(false);
      }
    };
    load();

    // Re-fetch stats whenever the user navigates back to this page
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") load();
    });
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [user]);

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
      href: "/dashboard/atkt",
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

          return (
            <Link key={stat.label} href={(stat as any).href} className="group">
              {cardContent}
            </Link>
          );
        })}
      </motion.div>

      {/* Overview */}
      <div>
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
        </div>

      {/* ── Recycle Bin ──────────────────────────────────────────── */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Recycle className="h-5 w-5 text-amber-500" />
              Recycle Bin
            </h2>
            {binRecords.length > 0 && (
              <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 font-black text-xs">
                {binRecords.length} item{binRecords.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {showBin && (
              <Button
                variant="outline"
                size="sm"
                onClick={fetchBin}
                disabled={binLoading}
                className="h-8 gap-2 text-xs font-bold border-amber-500/20 text-amber-600 hover:bg-amber-500/10"
              >
                {binLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Refresh
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className={`h-8 gap-2 text-xs font-bold transition-colors ${showBin ? "bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20" : "text-amber-600 border-amber-500/20 hover:bg-amber-500/5"}`}
              onClick={() => {
                const next = !showBin;
                setShowBin(next);
                if (next && binRecords.length === 0) fetchBin();
              }}
            >
              <Recycle className="h-3.5 w-3.5" />
              {showBin ? "Hide Bin" : "Open Recycle Bin"}
              {!showBin && binRecords.length > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-[10px] font-black rounded-full px-1.5 py-0.5">{binRecords.length}</span>
              )}
            </Button>
          </div>
        </div>

        {showBin && (
          <Card className="border-amber-500/20 shadow-sm bg-amber-500/5">
            <CardContent className="p-0">
              {binLoading ? (
                <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                  <span className="text-sm font-medium">Loading bin…</span>
                </div>
              ) : binRecords.length === 0 ? (
                <div className="text-center py-10">
                  <Recycle className="h-8 w-8 text-amber-500/30 mx-auto mb-2" />
                  <p className="text-sm font-bold text-muted-foreground">Recycle bin is empty</p>
                  <p className="text-xs text-muted-foreground/60 font-medium mt-1">Deleted gadget sheet records will appear here.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-amber-500/10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-bold uppercase tracking-wider py-3 pl-6">Department</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider py-3">Exam Session</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider py-3">Students</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider py-3">Deleted On</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider py-3 text-right pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {binRecords.map((u) => (
                      <TableRow key={u.id} className="hover:bg-amber-500/5 transition-colors">
                        <TableCell className="font-bold text-sm py-3 pl-6 text-muted-foreground">{u.department}</TableCell>
                        <TableCell className="py-3">
                          <Badge variant="outline" className="font-black text-[10px] uppercase tracking-tighter border-amber-500/30 text-amber-600">
                            {u.exam_name}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 text-sm font-black text-muted-foreground">{u.total_students}</TableCell>
                        <TableCell className="py-3 text-xs font-bold text-muted-foreground">
                          {u.deleted_at ? new Date(u.deleted_at).toLocaleDateString("en-IN") : "—"}
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
              )}
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Hard Delete Dialog */}
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
              This cannot be undone. Press Enter to confirm.
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
    </motion.div>
  );
}

"use client";

import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Zap, ArrowLeft, Save, Loader2, BookOpen, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface Subject {
  subject_name: string;
  subject_code: string;
  int_marks: string | number;
  theo_marks: string | number;
  prac_marks: string | number;
  obtained_marks: string | number;
  max_marks: string | number;
  is_pass: boolean;
  grade: string;
  gp: string | number;
}

interface StudentMarks {
  id: string;
  roll_number: string;
  student_name: string;
  department: string;
  year: string;
  division: string;
  percentage: number;
  result: string;
  cgpa: number;
  subjects: Subject[];
}

export default function StudentMarksEditPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const [student, setStudent] = useState<StudentMarks | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [applyingGrace, setApplyingGrace] = useState<string | null>(null);
  const [editedSubjects, setEditedSubjects] = useState<Subject[]>([]);
  const [graceDialog, setGraceDialog] = useState<{ subjectName: string } | null>(null);
  const [dialogIntGrace, setDialogIntGrace] = useState("");
  const [dialogExtGrace, setDialogExtGrace] = useState("");

  useEffect(() => {
    if (user && params.id) {
      fetchStudentMarks();
    }
  }, [user, params.id]);

  const fetchStudentMarks = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/marks/detail?uid=${user?.uid}&mark_id=${params.id}`);
      const json = await res.json();
      if (json.student) {
        setStudent(json.student);
        setEditedSubjects(json.student.subjects || []);
      } else {
        toast.error("Student not found");
        router.push("/dashboard/grace-marks");
      }
    } catch {
      toast.error("Failed to fetch student details");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkChange = (index: number, field: keyof Subject, value: string) => {
    const updated = [...editedSubjects];
    updated[index] = { ...updated[index], [field]: value };
    if (['int_marks', 'theo_marks', 'prac_marks'].includes(field as string)) {
      const int = parseFloat(updated[index].int_marks as string) || 0;
      const theo = parseFloat(updated[index].theo_marks as string) || 0;
      const prac = parseFloat(updated[index].prac_marks as string) || 0;
      updated[index].obtained_marks = int + theo + prac;
      const max = parseFloat(updated[index].max_marks as string) || 100;
      updated[index].is_pass = (updated[index].obtained_marks as number) >= (max * 0.4);
    }
    setEditedSubjects(updated);
  };

  const handleUpdate = async () => {
    if (!user || !student) return;
    setUpdating(true);
    try {
      const res = await fetch("/api/marks/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, mark_id: student.id, subjects: editedSubjects }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Marks updated successfully");
        setStudent(json.student);
        setEditedSubjects(json.student.subjects);
      } else {
        toast.error(json.error || "Failed to update marks");
      }
    } catch {
      toast.error("An error occurred while updating marks");
    } finally {
      setUpdating(false);
    }
  };

  const handleApplyGrace = async () => {
    if (!user || !student || !graceDialog) return;
    const intGrace = parseFloat(dialogIntGrace) || 0;
    const extGrace = parseFloat(dialogExtGrace) || 0;
    if (intGrace <= 0 && extGrace <= 0) {
      toast.error("Enter at least internal or external grace marks");
      return;
    }
    setApplyingGrace(graceDialog.subjectName);
    try {
      const body: Record<string, unknown> = {
        mark_ids: [student.id],
        subject_name: graceDialog.subjectName,
        uid: user.uid,
        grace_amt: intGrace + extGrace,
      };
      if (intGrace > 0) body.grace_internal = intGrace;
      if (extGrace > 0) body.grace_external = extGrace;

      const res = await fetch("/api/grace-marks/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || "Failed to apply grace marks");
        return;
      }
      if (json.applied_count > 0) {
        toast.success(`Grace marks applied for ${graceDialog.subjectName}`);
        setGraceDialog(null);
        setDialogIntGrace("");
        setDialogExtGrace("");
        await fetchStudentMarks();
      } else {
        const errMsg = json.errors?.[0]?.error || "No records were updated. Check subject name.";
        toast.error(errMsg);
      }
    } catch {
      toast.error("An error occurred while applying grace marks");
    } finally {
      setApplyingGrace(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Loading Student Profile...</p>
      </div>
    );
  }

  if (!student) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl h-10 w-10 border-muted-foreground/20 hover:bg-muted/50 transition-all shrink-0"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-black tracking-tight text-foreground flex items-center gap-2">
              Student Marks Editor
              <Badge variant="outline" className="h-5 font-black uppercase tracking-widest text-[9px] bg-primary/5 border-primary/20 text-primary">
                Edit Mode
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Modify subject-wise marks · results recalculate automatically
            </p>
          </div>
        </div>
        <Button
          onClick={handleUpdate}
          disabled={updating}
          className="h-11 px-8 gap-2 font-black shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition-all"
        >
          {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save All Marks
        </Button>
      </div>

      {/* Student Info Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-none shadow-md bg-card/50 backdrop-blur-xl ring-1 ring-border/50">
          <CardContent className="p-4 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Student</p>
            <p className="text-sm font-black text-foreground leading-tight truncate">{student.student_name}</p>
            <p className="text-[11px] font-medium text-muted-foreground">Roll: {student.roll_number}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-md bg-card/50 backdrop-blur-xl ring-1 ring-border/50">
          <CardContent className="p-4 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Course / Year</p>
            <p className="text-sm font-black text-foreground leading-tight truncate">{student.department}</p>
            <p className="text-[11px] font-medium text-muted-foreground">{student.year}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-md bg-card/50 backdrop-blur-xl ring-1 ring-border/50">
          <CardContent className="p-4 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Percentage / CGPA</p>
            <p className="text-sm font-black text-foreground tabular-nums">{student.percentage?.toFixed(2)}%</p>
            <p className="text-[11px] font-medium text-muted-foreground">CGPA: {student.cgpa?.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-md ring-1 ring-border/50">
          <CardContent className="p-4 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Result</p>
            <Badge className={`${(student.result?.includes('P A S S') || student.result?.includes('PASS')) ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-destructive/10 text-destructive border-destructive/20'} border font-black uppercase text-[10px] tracking-widest px-3 h-6 rounded-lg`}>
              {student.result}
            </Badge>
            <p className="text-[11px] font-medium text-muted-foreground">Overall status</p>
          </CardContent>
        </Card>
      </div>

      {/* Marks Table */}
      <Card className="border-none shadow-xl bg-card/50 backdrop-blur-xl ring-1 ring-border/50 overflow-hidden rounded-3xl">
        <div className="px-6 py-4 border-b border-border/50 bg-muted/30 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Subject-wise Marks</span>
        </div>
        <Table>
          <TableHeader className="bg-muted/20">
            <TableRow className="hover:bg-transparent border-border/40">
              <TableHead className="py-4 pl-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Subject</TableHead>
              <TableHead className="py-4 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">Internal</TableHead>
              <TableHead className="py-4 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">External</TableHead>
              <TableHead className="py-4 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">Practical</TableHead>
              <TableHead className="py-4 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total</TableHead>
              <TableHead className="py-4 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">Max</TableHead>
              <TableHead className="py-4 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</TableHead>
              <TableHead className="py-4 text-right pr-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Grace</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {editedSubjects.map((sub, idx) => (
              <TableRow key={`${sub.subject_code}-${idx}`} className="hover:bg-muted/20 transition-all border-border/40 group">
                <TableCell className="py-4 pl-6">
                  <p className="text-sm font-black text-foreground group-hover:text-primary transition-colors leading-tight">{sub.subject_name}</p>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">{sub.subject_code}</p>
                </TableCell>
                <TableCell className="py-4">
                  <Input
                    type="number"
                    value={sub.int_marks}
                    onChange={(e) => handleMarkChange(idx, 'int_marks', e.target.value)}
                    className="w-16 mx-auto h-9 text-center font-black text-sm bg-background border-muted-foreground/20 rounded-lg focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </TableCell>
                <TableCell className="py-4">
                  <Input
                    type="number"
                    value={sub.theo_marks}
                    onChange={(e) => handleMarkChange(idx, 'theo_marks', e.target.value)}
                    className="w-16 mx-auto h-9 text-center font-black text-sm bg-background border-muted-foreground/20 rounded-lg focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </TableCell>
                <TableCell className="py-4">
                  <Input
                    type="number"
                    value={sub.prac_marks}
                    onChange={(e) => handleMarkChange(idx, 'prac_marks', e.target.value)}
                    className="w-16 mx-auto h-9 text-center font-black text-sm bg-background border-muted-foreground/20 rounded-lg focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </TableCell>
                <TableCell className="py-4 text-center">
                  <span className={`inline-flex items-center justify-center h-9 w-12 mx-auto rounded-lg font-black text-sm tabular-nums border ${sub.is_pass ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600' : 'border-destructive/20 bg-destructive/5 text-destructive'}`}>
                    {sub.obtained_marks}
                  </span>
                </TableCell>
                <TableCell className="py-4 text-center font-black text-sm text-muted-foreground tabular-nums">
                  {sub.max_marks}
                </TableCell>
                <TableCell className="py-4 text-center">
                  <Badge className={`${sub.is_pass ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-destructive/10 text-destructive border-destructive/20'} border font-black uppercase text-[9px] tracking-widest px-2.5 h-6 rounded-full`}>
                    {sub.is_pass ? 'PASS' : 'FAIL'}
                  </Badge>
                </TableCell>
                <TableCell className="py-4 text-right pr-6">
                  {!sub.is_pass ? (
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 font-black text-[10px] uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4"
                      onClick={() => {
                        setGraceDialog({ subjectName: sub.subject_name });
                        setDialogIntGrace("");
                        setDialogExtGrace("");
                      }}
                      disabled={applyingGrace !== null}
                    >
                      {applyingGrace === sub.subject_name
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Zap className="h-3 w-3" />
                      }
                      Grace
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground/40 font-bold">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Grace Marks Dialog */}
      <Dialog open={!!graceDialog} onOpenChange={(open) => { if (!open) setGraceDialog(null); }}>
        <DialogContent className="max-w-sm border-none shadow-2xl rounded-3xl p-0 overflow-hidden">
          <div className="p-6 bg-muted/30 border-b border-border/50">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-500" />
                Apply Grace Marks
              </DialogTitle>
              <DialogDescription className="text-xs font-medium text-muted-foreground mt-1 leading-relaxed">
                <span className="font-black text-foreground">{graceDialog?.subjectName}</span>
                <br />Enter grace marks to add to internal and/or external components.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Internal Grace Marks</Label>
              <Input
                type="number"
                min={0}
                placeholder="e.g. 2"
                value={dialogIntGrace}
                onChange={(e) => setDialogIntGrace(e.target.value)}
                className="h-11 font-black text-sm bg-background border-muted-foreground/20 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">External Grace Marks</Label>
              <Input
                type="number"
                min={0}
                placeholder="e.g. 3"
                value={dialogExtGrace}
                onChange={(e) => setDialogExtGrace(e.target.value)}
                className="h-11 font-black text-sm bg-background border-muted-foreground/20 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            {(parseFloat(dialogIntGrace) > 0 || parseFloat(dialogExtGrace) > 0) && (
              <p className="text-[11px] text-muted-foreground font-medium bg-muted/30 rounded-xl px-3 py-2">
                Adding <span className="font-black text-foreground">+{parseFloat(dialogIntGrace) || 0}</span> internal
                {" "}and <span className="font-black text-foreground">+{parseFloat(dialogExtGrace) || 0}</span> external.
                Gadget sheet &amp; grade card will update automatically.
              </p>
            )}
          </div>
          <DialogFooter className="p-6 pt-0 flex flex-row gap-3 justify-end">
            <Button
              variant="ghost"
              className="font-black text-xs uppercase tracking-widest"
              onClick={() => setGraceDialog(null)}
              disabled={applyingGrace !== null}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black gap-2 rounded-xl h-11 px-6"
              onClick={handleApplyGrace}
              disabled={applyingGrace !== null}
            >
              {applyingGrace ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Apply Grace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <div className="bg-muted/20 border border-border/40 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl">
            <Info className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs font-black text-foreground">Changes not saved yet</p>
            <p className="text-[11px] text-muted-foreground font-medium">Verify marks then click Save. Changes are permanent.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="h-10 px-6 font-black text-xs rounded-xl border-muted-foreground/20"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={updating}
            className="h-10 px-8 font-black text-xs rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20"
          >
            {updating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Save All Changes
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { 
  Zap, 
  ArrowLeft,
  Loader2,
  Calendar,
  History,
  FileText,
  User,
  GraduationCap
} from "lucide-react";
import { motion } from "framer-motion";
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
  students: {
    name: string;
    roll_number: string;
    department: string;
    year: string;
  } | null;
}

export default function GraceHistoryPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState<GraceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchHistory();
    }
  }, [user]);

  const fetchHistory = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/grace-marks/history?uid=${user.uid}`);
      const json = await res.json();
      if (json.history) {
        setHistory(json.history);
      }
    } catch {
      toast.error("Failed to load grace marks history");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/grace-marks">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <History className="h-6 w-6 text-primary" />
            Grace Marks History
          </h1>
          <p className="text-sm text-muted-foreground font-medium">
            Review all grace marks applications across your college.
          </p>
        </div>
      </div>

      <Card className="border-none shadow-sm bg-card/50">
        <CardHeader className="border-b border-border/40">
          <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            Recent Applications
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-20 flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-bold text-muted-foreground">Loading history...</p>
            </div>
          ) : history.length > 0 ? (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="text-[10px] font-black uppercase tracking-widest py-5 pl-8">Applied On</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest py-5">Student</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest py-5">Subject</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest py-5 text-center">Original</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest py-5 text-center">Grace</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest py-5 text-right pr-8">Final Marks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((entry) => (
                  <TableRow key={entry.id} className="group hover:bg-muted/30 transition-colors border-border/40">
                    <TableCell className="py-5 pl-8">
                      <div className="flex flex-col">
                        <span className="text-xs font-black">{format(new Date(entry.created_at), "dd MMM yyyy")}</span>
                        <span className="text-[10px] font-bold text-muted-foreground">{format(new Date(entry.created_at), "hh:mm a")}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-5">
                      <div>
                        <p className="text-sm font-black text-foreground">{entry.students?.name || "Unknown Student"}</p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">{entry.students?.roll_number || "No Roll"}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-5">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-primary/50" />
                        <span className="text-xs font-bold">{entry.subject_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-5 text-center font-bold text-sm text-muted-foreground">{entry.original_marks}</TableCell>
                    <TableCell className="py-5 text-center">
                      <Badge className="bg-primary/10 text-primary border-none font-black text-[10px] px-2 h-6">
                        +{entry.grace_given}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-5 text-right pr-8">
                      <span className="text-sm font-black text-emerald-600">{entry.final_marks}</span>
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
                <p className="text-xl font-black text-foreground">No history found</p>
                <p className="text-sm text-muted-foreground font-medium max-w-sm mx-auto">
                  When you apply grace marks to students, they will appear here for record keeping.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

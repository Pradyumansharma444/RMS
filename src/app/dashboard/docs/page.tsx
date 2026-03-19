"use client";

import { motion } from "framer-motion";
import { 
  GraduationCap, 
  Users, 
  FileSpreadsheet, 
  Settings, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft,
  BookOpen,
  HelpCircle,
  FileText,
  LayoutDashboard
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export default function DocumentationPage() {
  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="max-w-4xl mx-auto space-y-12 pb-20"
    >
      {/* Header */}
      <motion.div variants={item} className="space-y-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-2xl">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground">Documentation</h1>
            <p className="text-muted-foreground font-medium">How to use the Result Management System (RMS)</p>
          </div>
        </div>
      </motion.div>

      {/* Quick Start Workflow */}
      <motion.div variants={item} className="space-y-6">
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          Standard Workflow
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { step: 1, title: "Configure", icon: Settings, desc: "Set up college logo & signatures" },
            { step: 2, title: "Import", icon: Users, desc: "Upload student database & photos" },
            { step: 3, title: "Upload", icon: Upload, desc: "Import university marks Excel" },
            { step: 4, title: "Generate", icon: GraduationCap, desc: "Build PDFs & Gadget Sheets" },
          ].map((w) => (
            <Card key={w.step} className="border-none shadow-sm bg-muted/30">
              <CardContent className="p-4 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
                  {w.step}
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-sm">{w.title}</h3>
                  <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">{w.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>

      <Separator />

      {/* Detailed Sections */}
      <div className="space-y-12">
        {/* Settings Section */}
        <motion.div variants={item} className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            1. Initial Configuration
          </h2>
          <Card className="border-none shadow-sm overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <p className="text-sm font-medium leading-relaxed text-muted-foreground">
                Before generating any documents, you must configure your college identity in <Link href="/dashboard/settings" className="text-primary hover:underline font-bold">Settings</Link>.
              </p>
              <ul className="space-y-3">
                <li className="flex gap-3 text-sm font-medium">
                  <Badge variant="secondary" className="h-5 w-5 rounded-full p-0 flex items-center justify-center shrink-0">1</Badge>
                  <span>Upload **College Banner**: Used at the top of Grade Cards and Gadget Sheets.</span>
                </li>
                <li className="flex gap-3 text-sm font-medium">
                  <Badge variant="secondary" className="h-5 w-5 rounded-full p-0 flex items-center justify-center shrink-0">2</Badge>
                  <span>Upload **Signatures**: Principal and Controller of Examination signatures for automated signing.</span>
                </li>
                <li className="flex gap-3 text-sm font-medium">
                  <Badge variant="secondary" className="h-5 w-5 rounded-full p-0 flex items-center justify-center shrink-0">3</Badge>
                  <span>Upload **College Stamp**: Transparent PNG recommended for official look.</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </motion.div>

        {/* Student Master Section */}
        <motion.div variants={item} className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            2. Student Database
          </h2>
          <Card className="border-none shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/30 pb-4">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Importing Students</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-bold">Excel Format Requirements:</p>
                <div className="bg-muted/50 p-4 rounded-xl border border-border/50">
                  <code className="text-xs font-mono text-primary flex flex-wrap gap-x-4 gap-y-2">
                    [Roll Number] [Student Name] [Department] [Year] [Division]
                  </code>
                </div>
                <p className="text-xs text-muted-foreground font-medium">Note: Division is optional. Department and Year names must be consistent.</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-bold">Uploading Photos:</p>
                <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                  You can upload photos individually by clicking the student avatar in the list. Bulk photo upload feature matches photos based on **Roll Number**.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Marks Database Section */}
        <motion.div variants={item} className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            3. Marks Database
          </h2>
          <Card className="border-none shadow-sm overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                The system accepts the **Official University Horizontal Marksheet** format.
              </p>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 items-start">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-amber-700">Important Checklist</p>
                  <ul className="text-xs text-amber-700/80 font-medium list-disc list-inside space-y-1">
                    <li>Excel must have exactly 3 header rows.</li>
                    <li>Column names must match university standards (Course Code, Internal, External, Total, Grade).</li>
                    <li>Ensure student names in marksheet match names in Student Master for accurate linking.</li>
                  </ul>
                </div>
              </div>
              <p className="text-xs text-muted-foreground font-bold">
                TIP: Download the template from the <Link href="/dashboard/gadget-sheet" className="text-primary hover:underline">Gadget Sheet</Link> page if you need to manually prepare data.
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Output Generation Section */}
        <motion.div variants={item} className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            4. Document Generation
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-none shadow-sm h-full">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-blue-500" />
                  Gadget Sheets
                </CardTitle>
                <CardDescription className="text-xs font-medium">Consolidated Office Registers</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground font-medium leading-relaxed">
                Generates a multi-page PDF with all student results in a horizontal layout. Includes HOD and Principal signatures automatically.
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm h-full">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-emerald-500" />
                  Grade Cards
                </CardTitle>
                <CardDescription className="text-xs font-medium">Individual Result Cards</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground font-medium leading-relaxed">
                Generates individual vertical grade cards with student photo. You can download specific students or bulk download a **ZIP archive** of all students.
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {/* Support Section */}
        <motion.div variants={item} className="pt-8">
          <Card className="border-none shadow-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white">
            <CardContent className="p-8 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="space-y-2 text-center md:text-left">
                <h3 className="text-2xl font-black">Still need help?</h3>
                <p className="text-slate-300 font-medium">Our technical team is available for data migration and custom template design.</p>
              </div>
                <div className="flex gap-3 shrink-0">
                  <Button variant="secondary" className="font-bold" asChild>
                    <a href="mailto:pradyumansharma104@gmail.com">Contact Support</a>
                  </Button>
                  <Button variant="outline" className="font-bold border-white/20 hover:bg-white/10 text-white" asChild>
                    <a href="https://rextech-webtechnologie.vercel.app/" target="_blank" rel="noopener noreferrer">Join Community</a>
                  </Button>
                </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

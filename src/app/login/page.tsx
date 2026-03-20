"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Mail,
  Lock,
  ArrowRight,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Eye,
  EyeOff
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ModeToggle } from "@/components/ModeToggle";

export default function LoginPage() {
  const { signIn, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    router.replace("/dashboard");
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Authentication failed: Missing credentials");
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email, password);
      toast.success("Identity verified successfully");
      router.replace("/dashboard");
    } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        const code = (err as { code?: string })?.code ?? "";
        console.error("[Firebase login error] code:", code, "message:", raw);
        if (
          code === "auth/invalid-credential" ||
          code === "auth/user-not-found" ||
          code === "auth/wrong-password" ||
          code === "auth/invalid-email" ||
          raw.includes("invalid-credential") ||
          raw.includes("user-not-found") ||
          raw.includes("wrong-password")
        ) {
          toast.error("Access Denied: Invalid email or password");
        } else if (code === "auth/operation-not-allowed") {
          toast.error("System Configuration Error: Email/password authentication is disabled.");
        } else if (code === "auth/too-many-requests") {
          toast.error("Security Lock: Too many failed attempts. Try again later.");
        } else {
          toast.error(`Authentication Protocol Error: ${raw}`);
        }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-6 selection:bg-primary/10">
      {/* Background patterns */}
      <div className="absolute inset-0 bg-grid-slate-900/[0.04] bg-[bottom_1px_center] dark:bg-grid-slate-400/[0.05] pointer-events-none" />
      <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-[400px] h-[400px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      
      <div className="absolute top-6 right-6">
        <ModeToggle />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Branding */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center mb-4">
              <img src="/Logo.png?v=1" alt="RMS Logo" className="h-20 w-auto object-contain" />
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-foreground mb-1">Result Management System</h1>
            <p className="text-muted-foreground font-semibold text-sm">Official College Administration Portal</p>
          </div>

        {/* Login Card */}
        <Card className="border-none shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] dark:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] bg-card/60 dark:bg-card/80 backdrop-blur-2xl ring-1 ring-border/50 overflow-hidden">
          <CardHeader className="space-y-1 pb-6 pt-8 px-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <Badge variant="outline" className="font-black text-[9px] uppercase tracking-widest bg-primary/5 border-primary/20 text-primary px-2 py-0.5">Secure Access</Badge>
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">College Admin Login</CardTitle>
            <CardDescription className="font-semibold text-muted-foreground text-sm">
              Authorize to manage student records and grade cards.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-10">
            <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 transition-colors group-focus-within:text-primary ml-1">Administrative Email</Label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-all group-focus-within:text-primary group-focus-within:scale-110" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter Email"
                      className="h-11 pl-11 bg-muted/30 border-none font-bold placeholder:font-medium focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:bg-background"
                      required
                    />
                  </div>
                </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between ml-1">
                  <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 transition-colors group-focus-within:text-primary">Security Password</Label>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-all group-focus-within:text-primary group-focus-within:scale-110" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="h-11 pl-11 pr-11 bg-muted/30 border-none font-bold placeholder:font-medium focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:bg-background"
                    required
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); setShowPassword(!showPassword); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 font-black shadow-xl shadow-primary/20 transition-all active:scale-[0.98] bg-primary hover:bg-primary/90 text-primary-foreground group overflow-hidden relative"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite] pointer-events-none" />
              {submitting ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span>Authorize Access</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              )}
            </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-10 text-center space-y-4">
          <div className="flex items-center justify-center gap-2.5 text-muted-foreground/30 font-black text-[10px] uppercase tracking-[0.3em]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            End-to-End Encrypted Session
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-[10px] font-black text-muted-foreground/40 tracking-widest">
              © {new Date().getFullYear()} RESULT MANAGEMENT SYSTEM
            </p>
            <div className="flex items-center gap-2 text-[9px] font-bold text-muted-foreground/30 tracking-tight uppercase">
              <span>Designed & Developed by Rextechswebtechnologies</span>
              <span className="w-1 h-1 bg-border/50 rounded-full" />
              <span>Licensed Enterprise Edition</span>
            </div>
            <div className="h-px w-6 bg-border/50 my-1" />
            <p className="text-[9px] font-bold text-muted-foreground/20 tracking-tighter">
              VERSION 2.0.4 — RMS CORE INFRASTRUCTURE
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

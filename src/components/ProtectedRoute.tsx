"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="h-20 w-20 rounded-2xl bg-white flex items-center justify-center shadow-xl border border-border/50 overflow-hidden p-3 animate-pulse">
              <img src="/Logo.png?v=1" alt="RMS" className="h-full w-full object-contain" />
            </div>
            <div className="absolute -inset-4 rounded-full border-2 border-primary/10 animate-[ping_3s_infinite]" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <h2 className="text-lg font-black tracking-tighter text-foreground">RMS</h2>
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
              <div className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
              <div className="h-1 w-1 rounded-full bg-primary animate-bounce" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;
  return <>{children}</>;
}

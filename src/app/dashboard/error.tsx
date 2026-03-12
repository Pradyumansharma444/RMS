"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard client error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="rounded-2xl bg-destructive/10 p-6 ring-2 ring-destructive/20">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          A client-side error occurred. You can try again or return to the dashboard.
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={reset} variant="default">
          Try again
        </Button>
        <Button onClick={() => window.location.assign("/dashboard")} variant="outline">
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8 text-center">
      <div className="rounded-2xl bg-destructive/10 p-6 ring-2 ring-destructive/20">
        <AlertCircle className="mx-auto h-14 w-14 text-destructive" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">Application error</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          A client-side exception has occurred. Check the browser console for details. You can try again or go home.
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={reset} variant="default">
          Try again
        </Button>
        <Button onClick={() => window.location.assign("/")} variant="outline">
          Go home
        </Button>
      </div>
    </div>
  );
}

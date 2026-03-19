"use client";

import { useEffect, useState } from "react";
import { XCircle } from "lucide-react";

export function MobileRestriction({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      // 1. Check screen width (even in desktop mode, phones usually have smaller logical widths than desktops)
      const width = window.innerWidth;
      
      // 2. Check User Agent for common mobile identifiers
      const ua = navigator.userAgent.toLowerCase();
      const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
      
      // 3. Check for touch support (most phones have it, most desktops don't - but some laptops do)
      const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

      // Logic: If it's a small screen OR a mobile UA, block it.
      // 1024px is a common threshold for tablets/desktops.
      // If a phone is in "Desktop mode", it might report 980px or similar, so we use 1024 as a safe buffer.
      const mobileStatus = width < 1024 || isMobileUA;
      
      setIsMobile(mobileStatus);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (isMobile === null) return null; // Prevent flash of content

    if (isMobile) {
      return (
        <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white/5 border border-white/10 p-12 rounded-3xl backdrop-blur-xl max-w-md w-full flex flex-col items-center shadow-2xl">
            <div className="mb-6">
              <XCircle className="w-16 h-16 text-red-500" />
            </div>
            
            <h1 className="text-2xl font-bold text-white uppercase tracking-wider">
              You are unauthorized person
            </h1>
          </div>
        </div>
      );
    }

  return <>{children}</>;
}

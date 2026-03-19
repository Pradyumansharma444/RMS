"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { GraduationCap } from "lucide-react";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace("/dashboard");
      } else {
        router.replace("/login");
      }
    }
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center gap-6"
      >
        <div className="relative">
          <div className="h-24 w-24 rounded-3xl bg-white flex items-center justify-center shadow-2xl shadow-primary/10 overflow-hidden p-3 group relative z-10">
            <motion.img 
              src="/Logo.png?v=1" 
              alt="RMS" 
              className="h-full w-full object-contain"
              animate={{ 
                scale: [1, 1.05, 1],
                filter: ["brightness(1)", "brightness(1.1)", "brightness(1)"]
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          <div className="absolute -inset-6 rounded-full border-2 border-primary/10 animate-[ping_3s_infinite]" />
          <div className="absolute -inset-3 rounded-full border-2 border-primary/5 animate-[ping_2.5s_infinite_reverse]" />
        </div>
        
        <div className="flex flex-col items-center gap-1">
          <h2 className="text-xl font-black tracking-tighter text-foreground">RMS</h2>
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
            <div className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
            <div className="h-1 w-1 rounded-full bg-primary animate-bounce" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

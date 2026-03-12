"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { 
  LayoutDashboard, 
  FileSpreadsheet, 
  GraduationCap, 
  Users, 
  Settings, 
  LogOut,
  Menu,
  School,
  BookOpen,
  Zap
} from "lucide-react";
import { ModeToggle } from "./ModeToggle";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/gadget-sheet", label: "Gadget Sheet", icon: FileSpreadsheet },
  { href: "/dashboard/grade-cards", label: "Grade Cards", icon: GraduationCap },
  { href: "/dashboard/grace-marks", label: "Grace Marks", icon: Zap },
  { href: "/dashboard/students", label: "Student Master", icon: Users },
  { href: "/dashboard/courses", label: "Courses & Depts", icon: BookOpen },
  { href: "/dashboard/settings", label: "College Settings", icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { college, signOut, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  const isActive = (item: { href: string; exact?: boolean }) => {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border/50">
          <div className="flex items-center gap-3">
            <img 
              src="/Logo.png?v=1" 
              alt="RMS Logo" 
              className="h-9 w-auto object-contain" 
            />
            <div className="font-bold text-sidebar-foreground text-[15px] tracking-tighter leading-tight">
              Result Management System
            </div>
          </div>
        </div>

        {/* College info */}
        {college && (
          <div className="mx-4 mt-6 p-4 bg-sidebar-accent rounded-xl border border-sidebar-border/50 shadow-sm">
            <div className="text-sm font-semibold text-sidebar-accent-foreground truncate">{college.name}</div>
            <div className="text-[11px] text-sidebar-accent-foreground/60 truncate mt-0.5">{user?.email}</div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto font-geist-sans">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                  active
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <Icon className={`h-4 w-4 transition-colors ${active ? "text-primary-foreground" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

          {/* Help & Support */}
          <div className="px-3 pb-2 space-y-1">
            <Link
              href="/dashboard/docs"
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                isActive({ href: "/dashboard/docs" })
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              }`}
            >
              <BookOpen className={`h-4 w-4 transition-colors ${isActive({ href: "/dashboard/docs" }) ? "text-primary-foreground" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground"}`} />
              Help & Docs
            </Link>
          </div>

          {/* Sign out */}
          <div className="p-4 border-t border-sidebar-border/50">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors duration-200"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-background/80 backdrop-blur-md border-b border-border px-4 md:px-6 h-16 flex items-center justify-between gap-4 flex-shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              {NAV_ITEMS.find((n) => isActive(n))?.label || "Dashboard"}
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium text-muted-foreground hidden lg:block border-r pr-4 border-border mr-1">
              {college?.name}
            </div>
            <ModeToggle />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

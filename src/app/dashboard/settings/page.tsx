"use client";

import { useAuth } from "@/lib/auth-context";
import { useState } from "react";
import { toast } from "sonner";
import { 
  Settings, 
  School, 
  Mail, 
  Upload, 
  Image as ImageIcon, 
  Check, 
  Loader2, 
  ExternalLink,
  Signature,
  Stamp
} from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type ImageField = "banner_url" | "logo_url" | "principal_signature_url" | "hod_signature_url" | "university_stamp_url";

const IMAGE_FIELDS: { key: ImageField; label: string; desc: string; icon: any }[] = [
  { key: "banner_url", label: "College Banner", desc: "For Grade Cards & Gadget Sheets (1200×200px)", icon: ImageIcon },
  { key: "logo_url", label: "College Logo", desc: "Official emblem (200×200px recommended)", icon: School },
  { key: "principal_signature_url", label: "Principal Signature", desc: "Required for Grade Cards (Transparent PNG)", icon: Signature },
  { key: "hod_signature_url", label: "HOD Signature", desc: "Required for Grade Cards (Transparent PNG)", icon: Signature },
  { key: "university_stamp_url", label: "University Stamp", desc: "Official university seal (Transparent PNG)", icon: Stamp },
];

export default function CollegeSettingsPage() {
  const { college, user, refreshCollege } = useAuth();
  const [name, setName] = useState(college?.name || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<ImageField | null>(null);

  const handleSaveName = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/college/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, name: name.trim() }),
      });
      if (!res.ok) throw new Error("Failed to save");
      await refreshCollege();
      toast.success("College profile synchronized");
    } catch {
      toast.error("Failed to update college identity");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (field: ImageField, file: File) => {
    if (!user || !college) return;
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) { toast.error("Asset exceeds 10MB limit"); return; }

    setUploading(field);
    try {
      const ext = file.name.split(".").pop();
      const path = `${college.id}/${field}.${ext}`;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bucket", "college-assets");
      fd.append("path", path);

      const res = await fetch("/api/upload/image", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Network error during upload");

      // Update college record
      await fetch("/api/college/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, [field]: json.url }),
      });
      await refreshCollege();
      toast.success(`${field.replace('_', ' ')} updated successfully`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Asset synchronization failed");
    } finally {
      setUploading(null);
    }
  };

  if (!college) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-bold text-muted-foreground animate-pulse">Loading identity configuration...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Settings className="h-8 w-8 text-primary" />
          College Configuration
        </h1>
        <p className="text-muted-foreground font-medium mt-1">
          Define your college identity and branding assets for official documents.
        </p>
      </motion.div>

      <div className="flex flex-col gap-8">
        {/* Identity Card */}
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <School className="h-5 w-5 text-primary" />
              Identity
            </CardTitle>
            <CardDescription className="font-medium">
              Core college identification details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="college-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">College Name</Label>
                <Input
                  id="college-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. St. Xavier's Institute"
                  className="font-bold bg-muted/30 border-none focus-visible:ring-primary h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Admin Account</Label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="admin-email"
                    type="email"
                    value={college.email ?? ""}
                    disabled
                    className="pl-9 font-bold bg-muted/10 border-none text-muted-foreground cursor-not-allowed opacity-60 h-11"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSaveName}
                disabled={saving || !name.trim() || name === college.name}
                className="font-bold shadow-lg shadow-primary/20 min-w-[160px] h-11"
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Syncing...</>
                ) : (
                  <><Check className="h-4 w-4 mr-2" /> Update Profile</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Branding Assets Card */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              Branding Assets
            </CardTitle>
            <CardDescription className="font-medium">
              Official signatures and logos for document generation.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {IMAGE_FIELDS.map((field) => {
                const currentUrl = college[field.key];
                const isUploading = uploading === field.key;
                const Icon = field.icon;
                return (
                  <div key={field.key} className="flex flex-col sm:flex-row sm:items-center gap-6 p-6 group hover:bg-muted/30 transition-colors">
                    {/* Preview */}
                    <div className="relative flex-shrink-0">
                      {currentUrl ? (
                        <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-background shadow-lg ring-1 ring-border group-hover:ring-primary/50 transition-all bg-white">
                          <img
                            src={currentUrl}
                            alt={field.label}
                            className="w-full h-full object-contain p-2"
                          />
                          {isUploading && (
                            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                              <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-24 h-24 rounded-2xl bg-muted/50 border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center text-muted-foreground gap-2 transition-all group-hover:bg-primary/5 group-hover:border-primary/20">
                          <Icon className="h-8 w-8 opacity-40" />
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Missing</span>
                        </div>
                      )}
                    </div>

                    {/* Info + upload */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">{field.label}</h4>
                        {currentUrl && <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-black text-[9px] uppercase tracking-tighter">Verified</Badge>}
                      </div>
                      <p className="text-xs font-medium text-muted-foreground mt-1 mb-4 leading-relaxed max-w-md">
                        {field.desc}
                      </p>
                      
                      <div className="flex items-center gap-3">
                        <label className={`relative inline-flex items-center gap-2 px-4 h-9 rounded-full text-xs font-bold cursor-pointer transition-all shadow-sm ${
                          isUploading
                            ? "bg-muted text-muted-foreground cursor-not-allowed"
                            : "bg-primary text-primary-foreground hover:shadow-lg hover:shadow-primary/20"
                        }`}>
                          {isUploading ? (
                            <><Loader2 className="h-3 w-3 animate-spin" /> Processing...</>
                          ) : (
                            <><Upload className="h-3.5 w-3.5" /> {currentUrl ? "Replace Asset" : "Import Asset"}</>
                          )}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            disabled={isUploading}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleImageUpload(field.key, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        
                        {currentUrl && (
                          <Button asChild variant="ghost" size="sm" className="h-9 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all">
                            <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span className="text-xs font-bold">View Source</span>
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

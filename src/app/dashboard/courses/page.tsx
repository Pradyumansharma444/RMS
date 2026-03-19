"use client";

import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { 
  BookOpen, 
  Plus, 
  Trash2, 
  Loader2,
  Library,
  Layers,
  Calendar,
  Upload
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface MetadataItem {
  id: string;
  name: string;
  code?: string;
  department_id?: string;
  course_id?: string;
  year_id?: string;
}

export default function CoursesManagementPage() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState<MetadataItem[]>([]);
  const [courses, setCourses] = useState<MetadataItem[]>([]);
  const [years, setYears] = useState<MetadataItem[]>([]);
  const [semesters, setSemesters] = useState<MetadataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [bulkText, setBulkText] = useState("");
  const [isBulk, setIsBulk] = useState(false);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [deptRes, courseRes, semRes, yearRes] = await Promise.all([
        fetch(`/api/metadata/departments?uid=${user.uid}`),
        fetch(`/api/metadata/courses?uid=${user.uid}`),
        fetch(`/api/metadata/semesters?uid=${user.uid}`),
        fetch(`/api/metadata/years?uid=${user.uid}`)
      ]);
      
      const [deptJson, courseJson, semJson, yearJson] = await Promise.all([
        deptRes.json(),
        courseRes.json(),
        semRes.json(),
        yearRes.json()
      ]);

      setDepartments(deptJson.data || []);
      setCourses(courseJson.data || []);
      setSemesters(semJson.data || []);
      setYears(yearJson.data || []);
    } catch {
      toast.error("Failed to load metadata");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const handleAdd = async (type: string) => {
    if (isBulk) {
      if (!bulkText.trim()) {
        toast.error("Please enter some names");
        return;
      }
      const names = bulkText.split('\n').map(n => n.trim()).filter(n => n);
      if (names.length === 0) return;

      setSaving(true);
      try {
        const items = names.map(name => ({
          name,
          department_id: type === 'courses' ? selectedDeptId : undefined,
          course_id: type === 'semesters' ? selectedCourseId : undefined
        }));

        const res = await fetch(`/api/metadata/${type}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: user?.uid,
            items
          })
        });

        if (!res.ok) throw new Error("Failed to add items");
        
        toast.success(`${names.length} items added successfully`);
        setBulkText("");
        setIsBulk(false);
        fetchData();
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setSaving(false);
      }
    } else {
      if (!newName.trim()) {
        toast.error("Name is required");
        return;
      }

      setSaving(true);
      try {
        const res = await fetch(`/api/metadata/${type}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: user?.uid,
            name: newName.trim(),
            code: newCode.trim() || undefined,
            department_id: type === 'courses' ? selectedDeptId : undefined,
            course_id: type === 'semesters' ? selectedCourseId : undefined
          })
        });

        if (!res.ok) throw new Error("Failed to add item");
        
        toast.success(`Item added successfully`);
        setNewName("");
        setNewCode("");
        fetchData();
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleDelete = async (type: string, id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;

    try {
      const res = await fetch(`/api/metadata/${type}?id=${id}&uid=${user?.uid}`, {
        method: "DELETE"
      });

      if (!res.ok) throw new Error("Failed to delete item");
      
      toast.success(`Item deleted`);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const getParentName = (type: string, item: MetadataItem) => {
    if (type === 'courses') {
      return departments.find(d => d.id === item.department_id)?.name || "—";
    }
    if (type === 'semesters') {
      return courses.find(c => c.id === item.course_id)?.name || "—";
    }
    return null;
  };

  const types = [
    { id: 'years', label: 'Years', icon: Calendar },
    { id: 'departments', label: 'Departments', icon: Library },
    { id: 'courses', label: 'Courses', icon: BookOpen },
    { id: 'semesters', label: 'Semesters', icon: Layers },
  ];

  const bulkNamesCount = bulkText.split('\n').map(n => n.trim()).filter(n => n).length;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            Courses & Departments
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your college's departments, courses, and semesters for automated reporting.
          </p>
        </div>
      </div>

      <Tabs defaultValue="years" className="space-y-6">
        <TabsList className="grid grid-cols-4 w-full h-11 p-1 bg-muted/50">
          {types.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="gap-2 font-bold data-[state=active]:shadow-sm">
              <t.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.label.split(' ')[0]}</span>
              <span className="sm:hidden">{t.label.split(' ')[0]}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {types.map((t) => {
          const type = t.id;
          const Icon = t.icon;
          const items = type === 'years' ? years : 
                        type === 'departments' ? departments : 
                        type === 'courses' ? courses : semesters;
          
          return (
            <TabsContent key={type} value={type} className="space-y-6 outline-none">
              <Card className="border-border/40">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-lg flex items-center gap-2 capitalize">
                      <Icon className="h-5 w-5 text-primary" />
                      Add New {t.label}
                    </CardTitle>
                    <CardDescription>
                      {isBulk ? "Paste names separated by new lines." : `Enter the details of the ${type.slice(0, -1)} you want to add.`}
                    </CardDescription>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="font-bold gap-2"
                    onClick={() => setIsBulk(!isBulk)}
                  >
                    <Upload className="h-4 w-4" />
                    {isBulk ? "Single Add" : "Bulk Upload"}
                  </Button>
                </CardHeader>
                <CardContent>
                  {isBulk ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {type === 'semesters' && (
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-muted-foreground">Select Course</Label>
                            <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Course" />
                              </SelectTrigger>
                              <SelectContent>
                                {courses.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Names (One per line)</Label>
                        <Textarea 
                          placeholder={type === 'years' ? "FY\nSY\nTY" : type === 'departments' ? "BTech\nBSc\nBCom" : "IT\nCS\nElectronics"}
                          rows={5}
                          value={bulkText}
                          onChange={(e) => setBulkText(e.target.value)}
                        />
                      </div>
                      <Button 
                        onClick={() => handleAdd(type)} 
                        disabled={saving}
                        className="w-full gap-2 font-bold"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Add {bulkNamesCount > 0 ? bulkNamesCount : ""} Items
                      </Button>
                    </div>
                  ) : (
                      <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex-1 space-y-2">
                            <Label className="text-xs font-bold uppercase text-muted-foreground">Name</Label>
                            <Input 
                              placeholder={`e.g. ${type === 'semesters' ? "Semester 1" : type === 'years' ? "FY" : type === 'departments' ? "BTech" : "Information Technology"}`}
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                            />
                          </div>
                          {type === 'semesters' && (
                            <div className="space-y-2">
                              <Label className="text-xs font-bold uppercase text-muted-foreground">Course</Label>
                              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select Course" />
                                </SelectTrigger>
                                <SelectContent>
                                  {courses.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                        <div className="flex justify-end">
                        <Button 
                          onClick={() => handleAdd(type)} 
                          disabled={saving}
                          className="gap-2 font-bold px-6"
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          Add {type.slice(0, -1)}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/40">
                <CardContent className="p-0">
                  <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider py-4">Name</TableHead>
                          {type === 'semesters' && (
                            <TableHead className="font-bold uppercase text-[10px] tracking-wider py-4">Parent Course</TableHead>
                          )}
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider py-4 text-right pr-6">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          <TableRow>
                            <TableCell colSpan={5} className="h-32 text-center">
                              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary/40" />
                            </TableCell>
                          </TableRow>
                        ) : items.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="h-32 text-center text-sm font-medium text-muted-foreground">
                              No {type} added yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          items.map((item) => (
                            <TableRow key={item.id} className="group transition-colors hover:bg-muted/20">
                              <TableCell className="font-bold py-4">{item.name}</TableCell>
                              {type === 'semesters' && (
                                <TableCell className="py-4 text-xs font-medium text-muted-foreground">
                                  {getParentName(type, item)}
                                </TableCell>
                              )}
                              <TableCell className="py-4 text-right pr-6">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(type, item.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

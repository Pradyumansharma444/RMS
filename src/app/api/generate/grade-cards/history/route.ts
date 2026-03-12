import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid");
    
    if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

    const { data: college } = await supabaseAdmin.from("colleges").select("id").eq("firebase_uid", uid).single();
    if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

    const { data: history, error } = await supabaseAdmin
      .from("generated_documents")
      .select("*")
      .eq("college_id", college.id)
      .eq("doc_type", "grade_card")
      .order("generated_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ history: history || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

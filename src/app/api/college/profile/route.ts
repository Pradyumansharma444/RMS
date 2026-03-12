import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("colleges")
    .select("*")
    .eq("firebase_uid", uid)
    .single();

  if (error || !data) return NextResponse.json({ college: null });
  return NextResponse.json({ college: data });
}

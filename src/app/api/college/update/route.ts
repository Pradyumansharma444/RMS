import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { uid, name, banner_url, logo_url, principal_signature_url, hod_signature_url, university_stamp_url } = body;

  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (banner_url !== undefined) updates.banner_url = banner_url;
  if (logo_url !== undefined) updates.logo_url = logo_url;
  if (principal_signature_url !== undefined) updates.principal_signature_url = principal_signature_url;
  if (hod_signature_url !== undefined) updates.hod_signature_url = hod_signature_url;
  if (university_stamp_url !== undefined) updates.university_stamp_url = university_stamp_url;

  const { data, error } = await supabaseAdmin
    .from("colleges")
    .update(updates)
    .eq("firebase_uid", uid)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ college: data });
}

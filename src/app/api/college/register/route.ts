import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { uid, email } = await req.json();
  if (!uid || !email) return NextResponse.json({ error: "uid and email required" }, { status: 400 });

  // Upsert college record - creates on first login
  const { data, error } = await supabaseAdmin
    .from("colleges")
    .upsert(
      { firebase_uid: uid, email, name: email.split("@")[0] },
      { onConflict: "firebase_uid", ignoreDuplicates: true }
    )
    .select()
    .single();

  if (error) {
    // If it already exists, just return success
    if (error.code === "23505" || error.message?.includes("duplicate")) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ college: data });
}

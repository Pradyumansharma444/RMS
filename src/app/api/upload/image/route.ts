import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const bucket = formData.get("bucket") as string;
  const path = formData.get("path") as string;

  if (!file || !bucket || !path) {
    return NextResponse.json({ error: "file, bucket, path required" }, { status: 400 });
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  const allowedImages = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedImages.includes(file.type)) {
    return NextResponse.json({ error: "Only image files allowed (JPEG, PNG, WEBP)" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: urlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl });
}

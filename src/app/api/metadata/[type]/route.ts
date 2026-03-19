import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const uid = req.nextUrl.searchParams.get("uid");

  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Get college_id first
    const { data: college } = await supabaseAdmin
      .from("colleges")
      .select("id")
      .eq("firebase_uid", uid)
      .single();

    if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

    const { data, error } = await supabaseAdmin
      .from(type)
      .select("*")
      .eq("college_id", college.id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

  export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ type: string }> }
  ) {
    const { type } = await params;
    const body = await req.json();
    const { uid, items } = body;
  
    if (!uid) return NextResponse.json({ error: "Missing UID" }, { status: 400 });
  
    try {
      const { data: college } = await supabaseAdmin
        .from("colleges")
        .select("id")
        .eq("firebase_uid", uid)
        .single();
  
      if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });
  
      if (items && Array.isArray(items)) {
        // Filter out properties that aren't valid for the table and remove undefined/null values
        const preparedItems = items.map((item: any) => {
          const { uid: _, ...rest } = item;
          const cleaned: any = { college_id: college.id };
          
          // Only add fields that exist and are relevant
          if (rest.name) cleaned.name = rest.name;
          if (rest.code) cleaned.code = rest.code;
          if (rest.department_id) cleaned.department_id = rest.department_id;
          if (rest.course_id) cleaned.course_id = rest.course_id;
          
          return cleaned;
        });

        const { data, error } = await supabaseAdmin
          .from(type)
          .insert(preparedItems)
          .select();
        
        if (error) throw error;
        return NextResponse.json({ data });
      } else {
        const { name, uid: _, ...rest } = body;
        if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
        
        // Only include fields that actually exist in the table
        const validFields: Record<string, any> = { name, college_id: college.id };
        if (rest.code) validFields.code = rest.code;
        if (rest.department_id) validFields.department_id = rest.department_id;
        if (rest.course_id) validFields.course_id = rest.course_id;

        const { data, error } = await supabaseAdmin
          .from(type)
          .insert([validFields])
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ data });
      }
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const id = req.nextUrl.searchParams.get("id");
  const uid = req.nextUrl.searchParams.get("uid");

  if (!id || !uid) return NextResponse.json({ error: "Missing parameters" }, { status: 400 });

  try {
    // Verify college ownership
    const { data: college } = await supabaseAdmin
      .from("colleges")
      .select("id")
      .eq("firebase_uid", uid)
      .single();

    if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

    const { error } = await supabaseAdmin
      .from(type)
      .delete()
      .eq("id", id)
      .eq("college_id", college.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(_req: NextRequest) {
  const filePath = path.join(process.cwd(), "public", "Update_Marks_Template.xlsx");

  try {
    const fileBuffer = fs.readFileSync(filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=Update_Marks_Template.xlsx",
      },
    });
  } catch {
    return NextResponse.json({ error: "Template file not found" }, { status: 404 });
  }
}

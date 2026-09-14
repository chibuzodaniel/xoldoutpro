import { NextResponse } from "next/server";
import { getActiveBillboards } from "@/lib/commerce/billboards";

// Public, no auth — feeds components/discover/BillboardRail.tsx.
export async function GET() {
  const billboards = await getActiveBillboards();
  return NextResponse.json({ billboards });
}

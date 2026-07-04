import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  const payload = await request.text();
  const signature = request.headers.get("x-captain-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // ponytail: verify signature against PAYMENT_WEBHOOK_SECRET before trusting payload
  void payload;

  return NextResponse.json({ received: true });
}

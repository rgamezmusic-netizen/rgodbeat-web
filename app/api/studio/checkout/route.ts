import { NextRequest, NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { getCurrentUser } from "@/lib/auth/server";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    let email = user?.email || "";
    let name = user?.user_metadata?.full_name || "Artista RGODBEAT";

    // Allow passing email in body if not in cookie session
    try {
      const body = await req.json();
      if (body.email) email = body.email;
      if (body.name) name = body.name;
    } catch {}

    if (!email) {
      return NextResponse.json(
        { error: "Debes iniciar sesión con tu cuenta para activar el Pase de Estudio." },
        { status: 401 }
      );
    }

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe no está configurado en el servidor." },
        { status: 503 }
      );
    }

    const stripe = getStripe();
    const origin = req.nextUrl.origin || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Pase RGODBEAT Studio (30 Días Acceso Total)",
              description: "Acceso ilimitado por 30 días al DAW móvil RGODBEAT Studio: grabación multipista vocal, Auto-Tune en tiempo real, efectos y exportación en WAV 24-bit.",
              images: [`${origin}/images/studio-pass.png`],
            },
            unit_amount: 1000, // $10.00 USD
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: email,
      client_reference_id: email,
      metadata: {
        type: "studio_pass",
        days: "30",
        customerEmail: email,
        customerName: name,
        purchasedAt: new Date().toISOString(),
      },
      success_url: `${origin}/studio?pass_activated=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/studio`,
    });

    return NextResponse.json({ url: session.url, sessionId: session.id }, { status: 200 });
  } catch (err: any) {
    console.error("[Studio Checkout API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Error al generar sesión de checkout para el pase de estudio." },
      { status: 500 }
    );
  }
}

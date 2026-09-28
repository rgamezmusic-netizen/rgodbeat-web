import { NextRequest, NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { getCurrentUser } from "@/lib/auth/server";

export async function POST(req: NextRequest) {
  try {
    const { serviceId } = await req.json();
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json({ error: "Debes iniciar sesión para comprar." }, { status: 401 });
    }
    
    const customerEmail = user.email;
    const customerName = user.user_metadata?.full_name || user.email?.split('@')[0];

    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
    }

    const stripe = getStripe();
    const origin = req.nextUrl.origin || "http://localhost:3000";

    let price = 0;
    let name = "";
    let type = "";

    if (serviceId === "studio_pro") {
      price = 10;
      name = "RGODBEAT Studio Pro (30 Días) - 50% OFF";
      type = "studio_pass";
    } else if (serviceId === "the_park") {
      price = 199;
      name = "The Park - 50% OFF";
      type = "the_park";
    } else {
      return NextResponse.json({ error: "Invalid service ID" }, { status: 400 });
    }

    const sessionParams: any = {
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name,
            },
            unit_amount: price * 100,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: customerEmail || undefined,
      metadata: {
        type,
        customerEmail: customerEmail || "",
        customerName: customerName || "",
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/beats`,
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("[Checkout Service API Error]:", err);
    return NextResponse.json(
      { error: err.message || "An error occurred while creating checkout session." },
      { status: 400 }
    );
  }
}

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getVerifiedPrimaryEmail } from "@/lib/auth-helpers";
import { isMemberEntitled } from "@/lib/membership";
import { getAppUrl, getStripe } from "@/lib/stripe";
import { getSql } from "@/lib/db";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", getAppUrl()), 303);
  }

  const email = await getVerifiedPrimaryEmail();
  if (!email) {
    return NextResponse.redirect(new URL("/account?portal=no_email", getAppUrl()), 303);
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      {
        error:
          "STRIPE_SECRET_KEY is not configured. Paste it in Netlify env (same Stripe as landing).",
      },
      { status: 503 },
    );
  }

  // Prefer customer id from entitlement / memberships row
  let customerId = (await isMemberEntitled(email)).stripeCustomerId;

  if (!customerId) {
    const sql = getSql();
    if (sql) {
      try {
        const rows = (await sql`
          SELECT stripe_customer_id
          FROM memberships
          WHERE lower(email) = ${email.trim().toLowerCase()}
          ORDER BY last_event_at DESC NULLS LAST
          LIMIT 1
        `) as Array<{ stripe_customer_id: string }>;
        customerId = rows[0]?.stripe_customer_id;
      } catch {
        // soft fail below
      }
    }
  }

  if (!customerId) {
    return NextResponse.redirect(
      new URL("/account?portal=no_customer", getAppUrl()),
      303,
    );
  }

  const returnUrl = new URL("/account", getAppUrl()).toString();
  const configuration = process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim();

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
    ...(configuration ? { configuration } : {}),
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Stripe did not return a portal URL" },
      { status: 502 },
    );
  }

  return NextResponse.redirect(session.url, 303);
}

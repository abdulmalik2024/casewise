import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple self-serve pricing for NY attorneys: 5 free questions with no sign-up, a 7-day free trial with no credit card, Starter at $49/month, and Professional at $99.99/month or $999.99/year.",
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}

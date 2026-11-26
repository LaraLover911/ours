import type { Metadata } from "next";
import { WishlistPage } from "@/components/couple/wishlist-page";

export const metadata: Metadata = { title: "Wunschliste" };

export default function Page() {
  return <WishlistPage />;
}

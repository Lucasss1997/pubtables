"use client";

import { useSearchParams } from "next/navigation";
import SecurePinInput from "../../components/SecurePinInput";

export default function AdminPage() {
  const sp = useSearchParams();
  const slug = (sp.get("slug") || "theriser").toLowerCase();
  const s = encodeURIComponent(slug);

  return (
    <SecurePinInput
      slug={slug}
      redirectTo={`/p/${s}/host/tiles`} // → go to shim
    />
  );
}

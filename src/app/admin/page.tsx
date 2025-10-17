"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import SecurePinInput from "../../components/SecurePinInput";

function AdminContent() {
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

export default function AdminPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    }>
      <AdminContent />
    </Suspense>
  );
}
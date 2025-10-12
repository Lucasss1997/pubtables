import { Suspense } from "react";
import HostDashboard from "./HostDashboard";

export default function HostPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { date?: string };
}) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading…</div>}>
      <HostDashboard slug={params.slug} date={searchParams.date} />
    </Suspense>
  );
}

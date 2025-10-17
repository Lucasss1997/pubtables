// app/p/[slug]/host/page.tsx
'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function HostPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  useEffect(() => {
    if (!slug) return;
    // send users straight to the tables view
    router.replace(`/p/${encodeURIComponent(slug)}/host/tiles`);
  }, [router, slug]);

  return null;
}

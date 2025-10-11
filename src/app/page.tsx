"use client";
import { useEffect, useState } from "react";

type Health = { ok?: boolean; error?: string } | null;
type DbPing = { db_time?: string; error?: string } | null;

export default function Home() {
  const [health, setHealth] = useState<Health>(null);
  const [db, setDb] = useState<DbPing>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j: Health) => setHealth(j))
      .catch((err) => setHealth({ error: String(err) }));

    fetch("/api/pingdb")
      .then((r) => r.json())
      .then((j: DbPing) => setDb(j))
      .catch((err) => setDb({ error: String(err) }));
  }, []);

  return (
    <main className="min-h-screen p-8 space-y-6 font-sans">
      <h1 className="text-3xl font-bold">Pub Tables Admin (Free Stack)</h1>

      <section className="p-4 rounded-xl border">
        <h2 className="text-xl font-semibold mb-2">API Health</h2>
        <pre className="bg-black/5 p-3 rounded">{JSON.stringify(health, null, 2)}</pre>
      </section>

      <section className="p-4 rounded-xl border">
        <h2 className="text-xl font-semibold mb-2">Database Ping</h2>
        <pre className="bg-black/5 p-3 rounded">{JSON.stringify(db, null, 2)}</pre>
      </section>
    </main>
  );
}

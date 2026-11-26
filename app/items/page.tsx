"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Item = { id: string; name: string; quantity: number };

async function fetchInventory(signal?: AbortSignal): Promise<Item[]> {
  const response = await fetch("/api/inventory", { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "수량을 불러오지 못했어요.");
  if (!Array.isArray(data.items)) throw new Error("수량 응답을 확인하지 못했어요.");
  return data.items;
}

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchInventory().then(setItems).catch((cause) => setError(cause.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetchInventory(controller.signal)
      .then((rows) => { if (!controller.signal.aborted) setItems(rows); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    window.addEventListener("focus", load);
    return () => { controller.abort(); window.removeEventListener("focus", load); };
  }, [load]);
  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">물품 관리</h1>
          <p className="mt-2">{items.length}종 · 전체 {total}개</p>
          <p className="mt-1 text-sm text-muted">반납 완료를 누르면 해당 물품 수량이 1개 늘어요.</p>
        </div>
        <Link href="/returns" className="rounded-lg bg-brand px-4 py-3 font-semibold text-white">사진으로 반납</Link>
      </div>
      <button onClick={load} disabled={loading} className="my-5 rounded-lg border border-field px-4 py-2 disabled:opacity-50">{loading ? "불러오는 중…" : "수량 새로고침"}</button>
      {error && <p role="alert" className="mb-4 rounded-lg bg-warn/10 p-4 text-warn">{error}</p>}
      {!error && <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface" aria-label="물품 재고" aria-busy={loading}>
        {items.map((item) => <li key={item.id} className="flex items-center justify-between p-5">
          <span className="text-lg font-semibold">{item.name}</span>
          <span className="text-2xl font-bold tabular-nums">{item.quantity}<span className="ml-1 text-sm font-normal">개</span></span>
        </li>)}
      </ul>}
    </div>
  );
}

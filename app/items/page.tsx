"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Item = { id: string; name: string; quantity: number | null };
type Inventory = { items: Item[]; notice: string };

async function fetchInventory(signal?: AbortSignal): Promise<Inventory> {
  const options = { cache: "no-store" as const, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) };
  try {
    const response = await fetch("/api/inventory", options);
    const data = await response.json();
    if (response.ok && Array.isArray(data.items)) return { items: data.items, notice: "" };
  } catch {
    if (signal?.aborted) throw new Error("목록 조회를 중단했어요.");
  }
  // The registered catalog remains visible even before stock tables are configured.
  const response = await fetch("/api/model/labels", options);
  const data = await response.json();
  if (!response.ok || !Array.isArray(data.labels)) throw new Error("등록된 라벨을 불러오지 못했어요. 다시 시도해 주세요.");
  return {
    items: data.labels.map((label: { id: string; name: string }) => ({ id: label.id, name: label.name, quantity: null })),
    notice: "등록된 라벨의 물품을 표시하고 있어요. 재고 연결을 확인하기 전에는 수량 조회와 반납 저장을 사용할 수 없어요.",
  };
}

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchInventory().then((data) => { setItems(data.items); setNotice(data.notice); }).catch((cause) => setError(cause.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetchInventory(controller.signal)
      .then((data) => { if (!controller.signal.aborted) { setItems(data.items); setNotice(data.notice); } })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    window.addEventListener("focus", load);
    return () => { controller.abort(); window.removeEventListener("focus", load); };
  }, [load]);
  const total = items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  const stockReady = !notice && !error && !loading;
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">물품 관리</h1>
          <p className="mt-2">{loading ? "목록 불러오는 중…" : error ? "목록 조회 실패" : `${items.length}종 · ${stockReady ? `전체 ${total}개` : "수량 미확인"}`}</p>
          <p className="mt-1 text-sm text-muted">등록된 라벨에 해당하는 물품만 표시해요.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled className="cursor-not-allowed rounded-lg border border-field px-4 py-3 font-semibold text-muted opacity-60">새 물품 추가 (준비 중)</button>
          <Link href="/returns" className="rounded-lg bg-brand px-4 py-3 font-semibold text-white">사진으로 반납</Link>
        </div>
      </div>
      <button onClick={load} disabled={loading} className="my-5 rounded-lg border border-field px-4 py-2 disabled:opacity-50">{loading ? "불러오는 중…" : "수량 새로고침"}</button>
      {error && <p role="alert" className="mb-4 rounded-lg bg-warn/10 p-4 text-warn">{error}</p>}
      {!error && notice && <p role="status" className="mb-4 rounded-lg bg-paper p-4 text-sm text-muted">{notice}</p>}
      {!error && <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface" aria-label="물품 재고" aria-busy={loading}>
        {items.map((item) => <li key={item.id} className="flex items-center justify-between p-5">
          <span className="text-lg font-semibold">{item.name}</span>
          {item.quantity === null ? <span className="text-sm text-muted">수량 미확인</span> : <span className="text-2xl font-bold tabular-nums">{item.quantity}<span className="ml-1 text-sm font-normal">개</span></span>}
        </li>)}
      </ul>}
    </div>
  );
}

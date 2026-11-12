"use client";

import { useState } from "react";

type Item = {
  id: number;
  name: string;
  quantity: number;
};

// 임시 데이터 — 백엔드가 붙으면 API 응답으로 바꾼다.
const INITIAL_ITEMS: Item[] = [
  { id: 1, name: "빔프로젝터", quantity: 2 },
  { id: 2, name: "멀티탭", quantity: 5 },
  { id: 3, name: "HDMI 케이블", quantity: 0 },
];

// 입력값 검사: 문제가 있으면 안내 문구를, 없으면 null을 돌려준다.
function validate(name: string, quantity: string): string | null {
  if (name.trim() === "") return "물품 이름을 입력하세요.";
  const n = Number(quantity);
  if (quantity.trim() === "" || !Number.isInteger(n) || n < 0) {
    return "수량은 0 이상의 정수로 입력하세요.";
  }
  return null;
}

// 목록의 머리줄과 각 줄이 같은 칸 너비를 쓴다: 물품 | 수량 | 수정 버튼
const rowGrid = "grid grid-cols-[minmax(0,1fr)_5rem_3.75rem] items-center gap-x-3";

const inputClass =
  "rounded-lg border border-field bg-surface px-3 py-2.5 placeholder:text-muted/70 focus:border-brand focus:outline-2 focus:outline-brand/30";
const primaryButtonClass =
  "rounded-lg bg-brand px-4 py-2.5 font-semibold whitespace-nowrap text-white hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const quietButtonClass =
  "rounded-lg border border-field bg-surface px-3 py-2 text-sm font-semibold whitespace-nowrap hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>(INITIAL_ITEMS);

  // 등록 폼
  const [newName, setNewName] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // 수정 중인 행 (없으면 null)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const outOfStockCount = items.filter((item) => item.quantity === 0).length;

  function handleAdd(e: React.SyntheticEvent) {
    e.preventDefault();
    const error = validate(newName, newQuantity);
    if (error) {
      setAddError(error);
      return;
    }
    const nextId = items.length === 0 ? 1 : Math.max(...items.map((i) => i.id)) + 1;
    setItems([...items, { id: nextId, name: newName.trim(), quantity: Number(newQuantity) }]);
    setNewName("");
    setNewQuantity("");
    setAddError(null);
  }

  function startEdit(item: Item) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditQuantity(String(item.quantity));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  function handleSave(e: React.SyntheticEvent) {
    e.preventDefault();
    const error = validate(editName, editQuantity);
    if (error) {
      setEditError(error);
      return;
    }
    setItems(
      items.map((item) =>
        item.id === editingId
          ? { ...item, name: editName.trim(), quantity: Number(editQuantity) }
          : item,
      ),
    );
    setEditingId(null);
    setEditError(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">물품 관리</h1>
      <p className="mt-1.5">
        물품 <strong className="font-bold">{items.length}</strong>종, 전체{" "}
        <strong className="font-bold">{totalQuantity}</strong>개{" "}
        {outOfStockCount > 0 && (
          <span className="ml-2 font-semibold text-warn">재고 없음 {outOfStockCount}종</span>
        )}
      </p>

      {/* PC: 목록(왼쪽) + 등록(오른쪽) / 폰: 위아래로 쌓인다 */}
      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="물품 목록">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-field bg-surface px-5 py-12 text-center">
              <p className="font-semibold">등록된 물품이 없습니다.</p>
              <p className="mt-1 text-sm text-muted">물품 등록에서 첫 물품을 추가하세요.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {/* 머리줄: 숫자가 무엇인지 알려 준다 */}
              <div
                aria-hidden="true"
                className={`${rowGrid} border-b border-line bg-paper px-4 py-2.5 text-sm font-semibold text-muted`}
              >
                <span>물품</span>
                <span className="text-right">수량</span>
                <span />
              </div>

              <ul className="divide-y divide-line">
                {items.map((item) => {
                  const isOut = item.quantity === 0;

                  if (item.id === editingId) {
                    return (
                      <li key={item.id} className="bg-paper/70 px-4 py-3.5">
                        <form onSubmit={handleSave} className="flex flex-wrap items-center gap-2">
                          <input
                            aria-label="이름"
                            className={`${inputClass} min-w-40 flex-1`}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            autoFocus
                          />
                          <input
                            aria-label="수량"
                            className={`${inputClass} w-24 text-right tabular-nums`}
                            type="number"
                            min={0}
                            step={1}
                            value={editQuantity}
                            onChange={(e) => setEditQuantity(e.target.value)}
                          />
                          <button type="submit" className={primaryButtonClass}>
                            저장
                          </button>
                          <button type="button" onClick={cancelEdit} className={quietButtonClass}>
                            취소
                          </button>
                        </form>
                        {editError && (
                          <p role="alert" className="mt-2 text-sm font-semibold text-warn">
                            {editError}
                          </p>
                        )}
                      </li>
                    );
                  }

                  return (
                    <li key={item.id} className={`${rowGrid} px-4 py-3.5 hover:bg-paper/40`}>
                      {/* 이름을 먼저, 수량은 단위와 함께 오른쪽에 */}
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 text-lg font-semibold break-keep break-words">
                          {item.name}
                        </span>
                        {isOut && (
                          <span className="rounded-full bg-warn/10 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-warn">
                            재고 없음
                          </span>
                        )}
                      </span>
                      <span
                        className={`text-right whitespace-nowrap tabular-nums ${isOut ? "text-warn" : ""}`}
                      >
                        <span className="text-2xl font-extrabold">{item.quantity}</span>
                        <span className={`ml-0.5 text-sm ${isOut ? "" : "text-muted"}`}>개</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        aria-label={`${item.name} 수정`}
                        className={`${quietButtonClass} justify-self-end`}
                      >
                        수정
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <section
          aria-labelledby="add-title"
          className="rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-6"
        >
          <h2 id="add-title" className="text-lg font-bold">
            물품 등록
          </h2>
          <form onSubmit={handleAdd} className="mt-4 grid gap-3">
            <label>
              <span className="mb-1 block text-sm font-semibold">이름</span>
              <input
                className={`${inputClass} w-full`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="예: 삼각대"
              />
            </label>
            <label>
              <span className="mb-1 block text-sm font-semibold">수량</span>
              <input
                className={`${inputClass} w-full tabular-nums`}
                type="number"
                min={0}
                step={1}
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                placeholder="0"
              />
            </label>
            {addError && (
              <p role="alert" className="text-sm font-semibold text-warn">
                {addError}
              </p>
            )}
            <button type="submit" className={`${primaryButtonClass} mt-1`}>
              물품 등록
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

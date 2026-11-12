// 반납 확인 화면 — 아직 틀만 있다. 다음 이슈에서 채운다.
export default function ReturnsPage() {
  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">반납 확인</h1>
      <div className="mt-6 rounded-xl border border-dashed border-field bg-surface px-5 py-12 text-center">
        <p className="font-semibold">아직 확인할 반납이 없습니다.</p>
        <p className="mt-1 text-sm text-muted">물품이 반납되면 여기에서 확인합니다.</p>
      </div>
    </div>
  );
}

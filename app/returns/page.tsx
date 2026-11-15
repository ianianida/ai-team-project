import type { Metadata } from "next";
import ReturnCapture from "./return-capture";

export const metadata: Metadata = { title: "사진으로 반납 확인 | 물품 대장" };

export default function ReturnsPage() {
  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">
        사진으로 반납 확인
      </h1>
      <p className="mt-2 text-muted">
        반납할 물품을 한 개씩 촬영하면 등록된 물품 이름을 찾아드려요.
      </p>
      <ReturnCapture />
    </div>
  );
}

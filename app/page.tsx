import { redirect } from "next/navigation";

// 첫 화면은 물품 관리로 바로 보낸다. 반납 확인은 메뉴로 이동한다.
export default function HomePage() {
  redirect("/items");
}

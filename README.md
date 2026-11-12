# AI 개발과 실전 팀 프로젝트

공용 물품을 등록하고 수량을 수정하는 Next.js 프론트엔드입니다. 백엔드와 AI 기능은 아직 연결되지 않았습니다.

## 로컬에서 실행하기

Node.js 22와 npm을 사용합니다. `.nvmrc`와 `package.json`에 Node.js 버전을 지정했습니다.

```bash
npm ci
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다.

배포용 빌드를 실행하려면 다음 명령을 사용합니다.

```bash
npm run build
npm run start
```

코드 검사는 `npm run lint`로 실행합니다.

## 화면

| 주소 | 동작 |
| --- | --- |
| `/` | `/items`로 이동 |
| `/items` | 임시 물품 목록, 물품 등록·수정, 재고 없음 표시 |
| `/returns` | 반납 데이터 연결 전 기본 화면 |

물품은 브라우저 메모리에만 저장되며, 새로고침하면 초기 목록으로 돌아갑니다.

## Vercel에서 실행하기

1. Vercel에서 **Add New → Project → Import Git Repository**를 선택합니다.
2. `ianianida/ai-team-project` 저장소를 가져옵니다.
3. **Root Directory**는 저장소 최상위(`.`), **Framework Preset**은 **Next.js**로 둡니다.
4. **Deploy**를 누릅니다. 현재 코드에는 별도로 설정할 환경 변수가 없습니다.

`vercel.json`에 설치 명령 `npm ci`, 빌드 명령 `npm run build`를 지정했습니다. Node.js는 `22.x`를 사용하고, **Output Directory**는 Next.js 기본값으로 둡니다.

자세한 내용은 [Vercel 배포 안내](./VERCEL_DEPLOYMENT.md)를 참고하세요.

## 협업과 환경 변수

- `main`은 함께 사용하는 기본 브랜치입니다. 각자 작업할 때는 별도 브랜치를 만든 후 Pull Request로 합칩니다.
- GitHub 저장소의 코드를 Vercel 프로젝트에 연결하여 배포합니다.
- API 키나 비밀번호는 코드와 Git에 올리지 않습니다. 각자 `.env.local` 파일을 사용하고, 배포 환경에 필요한 값은 Vercel의 환경 변수에 설정합니다.
- `NEXT_PUBLIC_` 접두사가 붙은 환경 변수는 브라우저에 노출됩니다. 비밀 키를 사용하는 코드는 서버에서 실행해야 합니다.

# AI 개발과 실전 팀 프로젝트

공용 물품을 등록하고 수량을 수정하는 Next.js 프로젝트입니다. Supabase 연결 확인 API가 있으며, 물품 데이터 저장과 AI 기능은 아직 연결되지 않았습니다.

## 물품 인식 모델 서버

별도의 Python 서버에서 YOLOv8 Open Images V7 모델과 Supabase 물품 라벨을 연결합니다. 웹 서버에는 `/api/model/health`, `/api/model/labels`, `/api/model/predict`를 추가했습니다. 서버 실행은 [모델 서버 안내](model-server/README.md), 무료 고정 HTTPS 및 Vercel 연결은 [HTTPS 설정](HTTPS_SETUP.md), 기준 라벨 여섯 개는 [DB 준비 안내](supabase/README.md)를 참고하세요. 반납 화면의 사진 업로드 UI는 아직 연결되지 않았습니다.

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
| `/api/health` | Supabase 데이터베이스 연결 확인 API |

물품은 브라우저 메모리에만 저장되며, 새로고침하면 초기 목록으로 돌아갑니다.

## Vercel에서 실행하기

1. Vercel에서 **Add New → Project → Import Git Repository**를 선택합니다.
2. `ianianida/ai-team-project` 저장소를 가져옵니다.
3. **Root Directory**는 저장소 최상위(`.`), **Framework Preset**은 **Next.js**로 둡니다.
4. 서버 환경 변수 `SUPABASE_URL`과 `SUPABASE_PUBLISHABLE_KEY`를 설정한 뒤 **Deploy**를 누릅니다.

`vercel.json`에 설치 명령 `npm ci`, 빌드 명령 `npm run build`를 지정했습니다. Node.js는 `22.x`를 사용하고, **Output Directory**는 Next.js 기본값으로 둡니다.

자세한 내용은 [Vercel 배포 안내](./VERCEL_DEPLOYMENT.md)를 참고하세요.

## Supabase 연결 확인

Vercel 운영 환경에는 서버용 `SUPABASE_URL`과 `SUPABASE_PUBLISHABLE_KEY`가 설정되어 있습니다. 환경 변수 변경은 새 배포부터 적용됩니다. 로컬에서 확인하려면 프로젝트 루트의 `.env.local`에 해당 프로젝트의 URL과 publishable 키를 설정합니다.

```dotenv
SUPABASE_URL=프로젝트_URL
SUPABASE_PUBLISHABLE_KEY=공개용_키
```

`GET /api/health`는 Supabase의 읽기 전용 데이터베이스 함수를 호출합니다. 정상 응답은 `{"status":"ok","database":"connected"}`입니다. 함수 정의는 [Supabase 설정 SQL](./supabase/setup-health-check.sql)에 있습니다. 이 API는 연결 상태만 확인하며 물품을 저장하지 않습니다.

## 협업과 환경 변수

- `main`은 함께 사용하는 기본 브랜치입니다. 각자 작업할 때는 별도 브랜치를 만든 후 Pull Request로 합칩니다.
- GitHub 저장소의 코드를 Vercel 프로젝트에 연결하여 배포합니다.
- API 키나 비밀번호는 코드와 Git에 올리지 않습니다. 각자 `.env.local` 파일을 사용하고, 배포 환경에 필요한 값은 Vercel의 환경 변수에 설정합니다.
- `NEXT_PUBLIC_` 접두사가 붙은 환경 변수는 브라우저에 노출됩니다. 비밀 키를 사용하는 코드는 서버에서 실행해야 합니다.

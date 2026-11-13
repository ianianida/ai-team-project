# 모델 서버 HTTPS 연결

## 무료 고정 주소

ngrok 무료 계정에 배정되는 개발용 도메인 1개를 사용한다. [Domains 화면](https://dashboard.ngrok.com/domains)에 있는 주소를 `NGROK_DOMAIN`으로 지정하고 `--url`로 실행한다. 같은 계정과 도메인을 지정하면 재시작해도 주소가 유지된다. 이번 Mac에서는 주소 옵션 없이 실행했을 때 임의 주소가 나와서, 고정 도메인을 명시하도록 구성했다. 주소 이름을 직접 고르거나 개인 도메인을 연결하는 것은 유료 기능이다.

Mac이 깨어 있고 모델 서버·ngrok이 실행 중이어야 접속할 수 있다. 고정 주소는 모델을 클라우드에 배포하는 기능이 아니다. 무료 한도는 월 HTTP 요청 20,000건, 외부 전송 1GB이며 [최신 조건](https://ngrok.com/docs/pricing-limits/free-plan-limits)을 확인한다.

## Mac에서 실행

1. `brew install ngrok`으로 설치하고 [ngrok 대시보드](https://dashboard.ngrok.com/get-started/your-authtoken)의 연결 명령을 터미널에서 한 번 실행한다. 토큰은 Git이나 채팅에 올리지 않는다.
2. `model-server/.env`에 기존 Supabase 설정, `MODEL_SERVER_API_KEY`, `NGROK_DOMAIN`을 설정한다. `NGROK_DOMAIN`은 `https://` 없이 도메인 이름만 입력한다. 키는 `python3 -c 'import secrets; print(secrets.token_urlsafe(32))'`로 생성할 수 있다.
3. 첫 번째 터미널에서 `bash model-server/start.sh`를 실행한다.
4. 두 번째 터미널에서 `bash model-server/start-tunnel.sh`를 실행한다. `.venv`가 다른 위치라면 두 명령 모두 `MODEL_SERVER_PYTHON=/절대/경로/bin/python`을 지정한다.
5. 표시된 HTTPS 주소를 Vercel 환경 변수에 등록한다.

## Vercel 환경 변수와 배포

| 이름 | 값 |
| --- | --- |
| `MODEL_SERVER_URL` | ngrok에 표시된 HTTPS 기본 주소. `/predict` 등 경로를 붙이지 않는다. |
| `MODEL_SERVER_API_KEY` | Python 서버와 동일한 공유 키. Secret으로 저장한다. |

두 변수 모두 서버 전용이다. `NEXT_PUBLIC_` 접두사를 붙이지 않는다. 환경 변수를 저장한 뒤 이 코드가 포함된 브랜치를 새로 배포한다. 기존 배포에는 변경이 자동 반영되지 않는다.

현재 배포된 앱은 Next.js이며 다음 Route Handler를 통해 호출한다. Python 모델 서버의 Supabase secret key는 Mac에만 둔다.

| 요청 | 역할 |
| --- | --- |
| `GET /api/model/health` | HTTPS를 통해 모델 로딩 상태와 DB 연결 상태 확인 |
| `GET /api/model/labels` | DB의 실제 라벨 ID와 모델 지원 여부 확인 |
| `POST /api/model/predict` | multipart `file` 사진으로 추론 요청 |

사진은 JPEG·PNG·WebP, 최대 4MB다. Vercel의 요청 본문 제한(4.5MB)에 multipart 여유를 남긴다. 모델에 직접 업로드할 때의 제한 10MB와 다르다. 휴대폰 HEIC 사진은 JPEG 등으로 변환한다.

브라우저에서는 같은 사이트의 API만 호출한다.

```javascript
const form = new FormData();
form.append("file", selectedFile);
const response = await fetch("/api/model/predict", { method: "POST", body: form });
const result = await response.json();
if (!response.ok) throw new Error(result.message || "물품 인식 실패");
```

이 API는 탐지 결과를 반환한다. 반납 확정이나 재고 변경은 수행하지 않는다. 아직 로그인 권한 확인을 붙이지 않은 데모 API이므로 공개 사이트에서 호출할 수 있다. 모델 서버의 공유 키는 브라우저에 노출되지 않는다.

## 통신 확인

```bash
curl --fail https://배포주소/api/model/health
curl --fail https://배포주소/api/model/labels
curl --fail -F 'file=@/사진/절대경로.jpg' https://배포주소/api/model/predict
```

`health`에서 모델 `loaded: true`, DB `connected: true`를 확인한다. `/labels`에 라벨 6개와 `model_supported: true`가 나오고, `/predict`가 JSON으로 응답해야 한다. 인식 결과가 비어 있어도 통신 오류와는 구별한다.

모델 서버를 ngrok 주소로 직접 호출할 경우 `/labels`, `/predict`에는 `X-API-Key`가 필요하며, 키가 없는 요청은 401이어야 한다. `/health`는 상태 확인용 공개 경로다. ngrok 요청 검사는 사진·헤더가 로컬 검사기에 남지 않도록 실행 스크립트에서 비활성화한다.

```bash
node --experimental-strip-types --test tests/model-proxy.test.mjs
npm run lint
npm run build
```

실제 배포 완료 여부는 배포 주소에서 별도로 확인한다. 로컬 테스트 성공만으로 Vercel 연결이 완료됐다고 간주하지 않는다.

# AI 개발과 실전 팀 프로젝트

React와 Vite로 만든 팀 프로젝트입니다. 현재 프론트엔드는 초기 화면이며, 별도의 Python 모델 서버가 사진 인식과 Supabase 물품 라벨 연결을 제공합니다. Supabase 연결 정보는 추후 설정합니다.

## 물품 인식 모델 서버

YOLOv8 Open Images V7 사전학습 모델을 사용합니다. 실행 방법, 환경변수, API 사용법은 [모델 서버 안내](model-server/README.md)를 참고하세요. 새 Supabase 프로젝트용 테이블과 초기 라벨 SQL은 [라벨 초기화 SQL](supabase/setup-labels.sql)에 있습니다. 이 SQL은 아직 원격 DB에 적용하지 않았습니다.

## 로컬에서 실행하기

Node.js 22.12 이상을 권장합니다.

```bash
npm ci
npm run dev
```

터미널에 표시되는 주소를 브라우저에서 열면 됩니다. 배포용 빌드는 `npm run build`, 코드 검사는 `npm run lint`로 실행합니다.

## 협업과 배포

- `main`은 함께 사용하는 기본 브랜치입니다. 각자 작업할 때는 별도 브랜치를 만든 후 Pull Request로 합칩니다.
- GitHub 저장소의 코드를 Vercel 프로젝트에 연결하여 배포합니다.
- API 키나 비밀번호는 코드와 Git에 올리지 않습니다. 각자 `.env` 파일을 사용하고, 배포 환경에 필요한 값은 Vercel의 환경 변수에 설정합니다.
- Vite의 `VITE_` 접두사가 붙은 환경 변수는 브라우저에 노출되므로 비밀 키를 넣으면 안 됩니다. 비밀 키를 사용하는 코드는 서버에서 실행해야 합니다.

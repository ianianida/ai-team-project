# Vercel 배포 안내

이 폴더는 Vercel의 Next.js 프로젝트로 배포할 수 있는 소스다. HTML로 별도 변환할 필요 없이 Vercel이 의존성을 설치하고 빌드한다.

## 배포 설정

| 항목 | 값 |
| --- | --- |
| Framework Preset | Next.js |
| Node.js | 22.x (`package.json`에 지정) |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Next.js 기본값, 수동 지정하지 않음 |
| Environment Variables | 현재 코드에서 필요한 값 없음 |

`vercel.json`에는 프레임워크, 설치 명령, 빌드 명령이 지정되어 있다. `.vercelignore`는 로컬 빌드 결과, 설치된 패키지, Git 기록과 환경 파일을 배포 업로드에서 제외한다.

## 방법 1: GitHub 저장소 연결

1. 압축 파일을 받았다면 먼저 압축을 푼다.
2. `package.json`, `package-lock.json`, `app`, `public`, `next.config.ts`, `vercel.json` 등 이 프로젝트의 소스를 GitHub 저장소에 올린다.
3. Vercel에서 **Add New → Project**로 해당 저장소를 가져온다.
4. **Root Directory**는 `package.json`과 `vercel.json`이 있는 폴더로 선택한다. 저장소 루트에 올렸다면 기본값을 사용한다.
5. 프레임워크가 **Next.js**인지 확인하고 **Deploy**를 누른다.

## 방법 2: 터미널에서 배포

Node.js 22가 설치된 상태에서, 압축을 풀고 `package.json`이 있는 폴더로 이동한 뒤 실행한다.

```bash
npm ci
npm run build
npx vercel
```

Vercel에 로그인하고 계정 또는 팀을 선택한 뒤 새 프로젝트를 만든다. 처음에는 미리보기 배포가 생성된다. 확인 후 실제 운영 주소에 배포하려면 다음 명령을 사용한다.

```bash
npx vercel --prod
```

Vercel에는 소스 폴더를 전달한다. 로컬의 `.next`만 올리거나 `vercel deploy --prebuilt`로 전달하는 패키지가 아니다.

## 현재 앱의 동작 범위

- `/`는 `/items`로 이동한다.
- `/items`에서 임시 물품 목록을 확인하고 등록·수정할 수 있다.
- 물품은 브라우저 메모리에만 저장된다. 새로고침하면 초기 목록으로 돌아간다. Vercel 배포 후에도 같은 방식으로 동작한다.
- `/returns`는 아직 반납 데이터나 AI 모델과 연결되지 않은 화면이다.
- Pretendard 글꼴은 jsDelivr에서 불러온다. 불러오지 못하면 시스템 글꼴을 사용한다.

## 참고한 공식 문서

- [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [vercel.json 설정](https://vercel.com/docs/project-configuration/vercel-json)
- [지원하는 Node.js 버전](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)

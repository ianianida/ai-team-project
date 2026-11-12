# 공용 물품 모델 서버

YOLOv8 Open Images V7 사전학습 모델로 사진에서 라벨·탐지 점수·박스를 반환합니다. Supabase의 물품 라벨이 연결되어 있으면 해당 행의 ID와 표준 이름을 함께 반환합니다. 반환 결과는 관리자 확인용이며 대여·반납 내역이나 재고를 변경하지 않습니다.

## 실행

저장소 루트에서 Python 가상환경을 준비합니다. Mac과 Linux에서 사용할 수 있습니다.

~~~bash
python3 -m venv model-server/.venv
model-server/.venv/bin/python -m pip install -r model-server/requirements.txt
cp model-server/.env.example model-server/.env
bash model-server/start.sh
~~~

처음 실행하면 공식 Ultralytics 배포처에서 yolov8n-oiv7.pt를 내려받아 models 폴더에 저장하고 워밍업합니다. 다음 실행부터 저장된 파일을 사용합니다. 기본 주소는 http://127.0.0.1:8001 이며 파일 업로드 설명·실행 화면은 http://127.0.0.1:8001/docs 입니다. MODEL_DEVICE=auto는 사용 가능한 CUDA → Apple MPS → CPU 순서로 선택합니다. CPU를 쓰려면 .env에서 MODEL_DEVICE=cpu로 설정합니다.

~~~bash
curl http://127.0.0.1:8001/health
curl -F 'file=@/absolute/path/photo.jpg' http://127.0.0.1:8001/predict
curl 'http://127.0.0.1:8001/model/classes?q=calculator'
~~~

별도 Python 환경을 재사용할 때는 MODEL_SERVER_PYTHON에 해당 Python의 절대 경로를 지정하여 start.sh를 실행합니다. 서버는 모델을 한 번만 로드하며 모델 요청은 순서대로 처리합니다.

## Supabase 연결

Supabase는 사용자가 나중에 제공할 예정이므로 연결 정보나 실제 DB 행을 코드에 넣지 않았습니다.

1. 새 프로젝트를 만든 뒤 supabase/setup-labels.sql을 SQL Editor에서 실행합니다. 파일에는 제안 테이블과 계산기·가위·마우스 초기 항목이 있으며 실제 대여 품목에 맞게 검토합니다.
2. model-server/.env에 SUPABASE_URL과 SUPABASE_KEY를 입력합니다. 기본 SQL은 비공개 서버 조회용이므로 서버 전용 secret key 또는 기존 service_role key를 사용합니다. 이 키를 React 코드나 VITE_ 환경변수에 넣지 않습니다.
3. 모델 서버를 다시 실행한 뒤 /labels를 호출해 실제 행과 모델 지원 여부를 확인합니다.

| DB 컬럼 | 의미 | 예시 |
|---|---|---|
| id | Supabase 물품 종류 ID | UUID |
| name | 화면에 보여줄 표준 이름 | 계산기 |
| model_label | YOLO의 출력 라벨 | Calculator |
| is_active | 현재 사용 중인 라벨 | true |

모델 라벨은 Calculator, Scissors, Computer mouse가 포함되어 있습니다. 모델 클래스 ID를 DB ID로 사용하지 않습니다. 예를 들어 class_id=80은 모델 내부 계산기 번호이며, catalog_label.id가 실제 DB의 물품 종류 ID입니다.

이미 테이블이 있다면 SQL을 실행하지 않고 .env의 SUPABASE_LABEL_TABLE 및 각 COLUMN 설정을 실제 구조에 맞춥니다. 활성 여부 컬럼이 없으면 SUPABASE_LABEL_ACTIVE_COLUMN 값을 비워 둡니다. model_label 컬럼에 같은 이름이 두 번 연결되어 있으면 ambiguous로 반환하고 한 행을 임의로 고르지 않습니다.

라벨은 기본 60초간 캐시합니다. DB 수정 후 즉시 반영하려면 POST /labels/reload를 호출합니다. TTL이 지난 DB 조회가 실패하면 오래된 데이터로 임의 연결하지 않고 503을 반환합니다.

## 응답

~~~json
{
  "status": "review_required",
  "requires_confirmation": true,
  "catalog": {"status": "connected", "connected": true, "label_count": 3},
  "predictions": [{
    "class_id": 80,
    "model_label": "Calculator",
    "score": 0.87,
    "box": [20, 30, 400, 500],
    "match_status": "matched",
    "catalog_label": {"id": "DB의 실제 UUID", "name": "계산기", "model_label": "Calculator"},
    "candidates": []
  }]
}
~~~

위 JSON은 형식 설명용 예시입니다. DB 미설정 상태에서는 status=catalog_not_configured, catalog.connected=false, catalog_label=null로 실제 모델 라벨만 반환합니다. DB에 매핑이 없으면 unmapped이며, 모델이 물체를 찾지 못하면 predictions는 빈 배열입니다. 탐지 점수는 정답 확률이나 반납 확정 여부가 아닙니다.

박스는 업로드 사진의 EXIF 방향을 적용한 이미지 기준 x1, y1, x2, y2 픽셀 좌표입니다. image.width와 image.height를 기준으로 화면 크기에 맞게 변환합니다. JPEG·PNG·WebP만 받으며 파일은 최대 10MB, 이미지 크기는 최대 2,500만 픽셀입니다.

## React 및 Node.js 연결

로컬 React에서는 FormData의 file 필드로 이미지를 전송합니다. 기본 CORS는 localhost:5173만 허용합니다.

~~~javascript
const form = new FormData()
form.append('file', selectedFile)
const response = await fetch('http://127.0.0.1:8001/predict', {
  method: 'POST',
  body: form,
})
if (!response.ok) throw new Error('물품 인식 요청 실패')
const result = await response.json()
~~~

외부 배포 시에는 React → Node.js API → 모델 서버로 연결하고 MODEL_SERVER_API_KEY를 설정하여 Node.js에서 X-API-Key 헤더로 전달합니다. 서버 비밀 키를 브라우저에 넣지 않습니다. 현재 실행 주소는 로컬 주소이므로 Vercel의 서버에서 이 Mac의 localhost를 호출할 수 없습니다. 공개 모델 서버 배포 및 프론트 연결은 별도 작업입니다.

## 검증 및 범위

~~~bash
model-server/.venv/bin/python -m pip install -r model-server/requirements-dev.txt
model-server/.venv/bin/python -m pytest model-server/tests -q
~~~

계약 테스트는 모의 DB와 모의 추론을 사용하여 실제 DB ID 연결, 미등록 라벨, 중복 매핑, DB 오류, 이미지 검증, 캐시 새로고침을 확인합니다. 실제 모델의 추론 확인은 별도로 수행하며 실제 물품 정확도를 뜻하지 않습니다. Supabase 실연결 검증은 사용자가 프로젝트 정보를 제공한 뒤 진행합니다.

모델은 물품 종류를 탐지하며 외형이 같은 두 물품의 개별 자산 식별을 보장하지 않습니다. 가중치는 Git에 올리지 않고 실행 시 내려받습니다. 사용 모델 및 Ultralytics 패키지의 AGPL-3.0 조건은 https://www.ultralytics.com/license 를 참고합니다.

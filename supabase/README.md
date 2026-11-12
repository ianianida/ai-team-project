# 물품 라벨과 Supabase 마이그레이션

현재 실행 중인 YOLOv8 Open Images V7 모델의 라벨 목록에서 아래 여섯 종류를 확인했습니다. 물품 종류 다섯 개에 마우스를 하나 추가한 구성입니다. 실제 물품 사진의 인식 정확도를 평가한 결과는 아닙니다.

| 표준 이름 | 모델 출력 라벨 | 모델 내부 클래스 ID |
|---|---|---:|
| 계산기 | Calculator | 80 |
| 가위 | Scissors | 438 |
| 스테이플러 | Stapler | 490 |
| 자 | Ruler | 429 |
| 우산 | Umbrella | 562 |
| 마우스 | Computer mouse | 129 |

기계가 읽을 수 있는 목록은 [item-labels.json](item-labels.json)에 있습니다. 이 파일의 model_class_id는 모델 내부 번호이며, Supabase에서 생성하는 UUID와 다릅니다. 동물 라벨 Mouse(343)는 사용하지 않습니다.

## 준비된 마이그레이션

1. [테이블 생성 및 조회 권한](migrations/20261112044052_create_item_labels.sql): item_labels 테이블, UUID, 모델 라벨 중복 방지, RLS, 서버 조회 권한.
2. [초기 라벨 6개 등록](migrations/20261112044114_seed_rental_item_labels.sql): 기준 라벨을 등록합니다. 반복 실행해도 기존 UUID·표준 이름·활성 상태를 덮어쓰지 않습니다.

기준 라벨은 두 번째 마이그레이션에 포함되어 있으므로 별도 seed.sql이나 --include-seed는 필요하지 않습니다. 기존 단일 setup-labels.sql 대신 이 두 파일을 사용합니다. 아직 원격 Supabase에는 적용하지 않았습니다.

## 새 Supabase 프로젝트가 준비되면

저장소 루트에서 실행합니다. CLI 버전은 3.1.0으로 고정했습니다. 이 버전은 로컬 DB가 기본 대상이므로 실제 원격 적용에는 --remote를 명시합니다.

~~~bash
npx --yes supabase@3.1.0 login
npx --yes supabase@3.1.0 link --project-ref YOUR_PROJECT_REF
npx --yes supabase@3.1.0 db push --remote --dry-run
npx --yes supabase@3.1.0 db push --remote
npx --yes supabase@3.1.0 migration list --remote
~~~

이 단계는 새 프로젝트를 대상으로 합니다. 기존 테이블이나 데이터가 있는 프로젝트에서는 현재 스키마와 마이그레이션 이력을 먼저 확인합니다. 이전 setup-labels.sql을 이미 실행했다면 첫 마이그레이션을 그대로 적용하지 않고 이력을 맞춘 뒤 진행합니다.

CLI를 사용하지 않는 경우에는 새 프로젝트의 SQL Editor에서 첫 번째 파일, 두 번째 파일 순서로 실행할 수 있습니다. 이 경우 CLI 마이그레이션 이력은 자동 등록되지 않으므로 나중에 CLI를 도입할 때 적용 이력을 먼저 정리합니다.

## 모델 서버 연결

model-server/.env에 프로젝트 URL과 서버 전용 키를 입력하고 서버를 재시작합니다. 기본 테이블·컬럼 설정은 이 마이그레이션과 일치합니다.

~~~dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_KEY=YOUR_SERVER_SECRET_KEY
SUPABASE_LABEL_TABLE=item_labels
SUPABASE_LABEL_ID_COLUMN=id
SUPABASE_LABEL_NAME_COLUMN=name
SUPABASE_LABEL_MODEL_COLUMN=model_label
SUPABASE_LABEL_ACTIVE_COLUMN=is_active
~~~

마이그레이션은 service_role에 SELECT만 허용합니다. 서버 전용 secret key 또는 기존 service_role key를 Python 서버에만 저장합니다. anon/publishable key로 직접 조회하도록 공개하지 않았습니다.

~~~bash
curl http://127.0.0.1:8001/labels
~~~

연결 후에는 여섯 행과 각각의 model_supported=true를 확인합니다. 이후 DB의 표준 이름을 바꾸면 모델 재학습 없이 서버의 캐시 갱신으로 반영할 수 있습니다.

모델 클래스 목록과 기준 라벨을 다시 대조하려면 실행 중인 서버를 대상으로 아래 명령을 사용합니다. 이 검사는 추론 정확도 평가나 DB 연결 검사가 아닙니다.

~~~bash
model-server/.venv/bin/python model-server/check_labels.py
~~~

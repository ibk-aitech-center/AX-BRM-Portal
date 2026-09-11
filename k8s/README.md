# AX-BRM k8s 배포 매니페스트

이미지는 **1개**(`ai-brm:<ver>` = nginx 80 + Node API 3000, `/app/start.sh` 가 둘 다 기동)이고 파드도 하나다. 파일 번호 순서가 적용 순서다. `kubectl apply -f k8s/` 한 번으로 전부 올라간다(kubectl 이 파일명 순으로 적용).

| 파일 | 리소스 | 배포 전 채울 것 |
|---|---|---|
| `10-secret.yaml` | Secret `ai-brm-secret` | `DATABASE_URL` 의 비밀번호·PG 주소, `SSO_JWT_SIGN`(32자 이상), (선택) `HR_DB_PASSWORD` |
| `11-configmap.yaml` | ConfigMap `ai-brm-config` | `APP_URL`, (선택) `HR_DB_*` · `ALARM_*` |
| `20-pvc.yaml` | PVC `ai-brm-data` 20Gi | (선택) `storageClassName` |
| `21-deployment.yaml` | Deployment `ai-brm` ×1 (컨테이너 포트 80) | `<registry>` |
| `22-service.yaml` | Service `ai-brm`:80 | — |
| `30-ingress.yaml` | Ingress `ai-brm` | `<host>`, ingressClassName · TLS |

```sh
# 1) 자리표시자 채우기 — <registry> <host> 는 일괄 치환, 비밀값은 10-secret.yaml 을 직접 편집
sed -i 's#<registry>#registry.example.local/aibrm#g; s#<host>#aibrm.example.local#g' k8s/*.yaml
vi k8s/10-secret.yaml

# 2) 적용 (네임스페이스는 -n 으로)
kubectl apply -n <ns> -f k8s/

# 3) 확인
kubectl -n <ns> rollout status deploy/ai-brm
kubectl -n <ns> logs deploy/ai-brm | grep -E '\[db\] pg ready|\[server\]'
curl -sk https://<host>/api/health   # {"ok":true,"db":{"kind":"pg","ok":true},"uploads":{"ok":true},...}
```

## 플랫폼 자체 배포 템플릿으로 띄울 때
사내 플랫폼이 Deployment 를 직접 만들어 주는 경우(이 매니페스트를 안 쓰는 경우) 필요한 값은 이것뿐이다.
- 이미지 `ai-brm:<ver>`, 컨테이너 포트 **80**, 기동 명령은 비워 두거나 `/app/start.sh`(둘 다 같은 스크립트)
- env: `10-secret.yaml` · `11-configmap.yaml` 의 항목(필수 `DATABASE_URL`, `SSO_JWT_SIGN`). `NODE_ENV=production` `PORT=3000` `UPLOAD_DIR=/app/data/uploads` 는 이미지에 기본값이 있다
- 볼륨: PVC → `/app/data` (첨부 파일. 없으면 재배포 때 첨부가 사라진다)
- 프로브: startup/readiness `GET /api/health`(포트 80), liveness TCP 80. replicas 1(PVC 가 RWO)

## 재배포
`sh build.sh <새 버전>`(또는 `docker build --network none -t ai-brm:<ver> .`) → 레지스트리 push → 이미지 태그만 갱신
```sh
kubectl -n <ns> set image deploy/ai-brm app=<registry>/ai-brm:<ver>
```
PVC · Secret · ConfigMap 은 그대로 둔다. DB 스키마 변경은 API 기동 시 자동 반영(추가형만, 데이터 삭제 없음).

## 주의
- `/api/` 분기는 컨테이너 안 nginx 가 `127.0.0.1:3000` 으로 넘긴다 — 별도 API Service 가 없다.
- node 나 nginx 중 하나가 죽으면 `start.sh` 가 컨테이너를 내린다(k8s 가 재시작). liveness 는 TCP 만 보므로 DB 가 잠깐 죽어도 파드가 재시작 루프에 빠지지 않고 readiness 만 내려간다. DB 가 돌아오면 자동 복귀.
- 첨부 업로드 한도: 서버 `UPLOAD_MAX_MB`(20)+8 = 28MB 요청 → 컨테이너 nginx `client_max_body_size 32m` → Ingress `proxy-body-size 32m`. 셋 중 하나만 줄이면 큰 첨부가 막힌다.
- 파드는 PVC(RWO) 때문에 replicas 1 · Recreate.

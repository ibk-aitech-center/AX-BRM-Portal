#!/bin/sh
# 내부망 반입 묶음 만들기 (개발망, 레포 루트에서):  sh scripts/make-dist.sh
#   결과: ai-brm-dist/ui.tar.gz · app.tar.gz · dist.zip(+Dockerfile · start.sh · nginx.conf · build.sh · create-db.sql · init-db.sql · k8s/) · CHECKSUMS.md5
#   app.tar.gz 는 가이드의 app.jar 대응 — 빈 폴더에서 npm ci --omit=dev 를 돌려 운영 node_modules 까지 넣는다
#   (내부망은 npm 이 없으므로 Dockerfile 이 ADD 로 이 tar 를 그대로 푼다). 이미지는 1개(ai-brm:<ver>, nginx + node) — 플랫폼이 dist.zip 루트의 Dockerfile 로 빌드한다.
#   ai-brm-base.tar 는 base 이미지가 바뀔 때만 다시 만든다: docker build -f docker/Dockerfile.base -t ai-brm-base:1.0 . && docker save ai-brm-base:1.0 > ai-brm-dist/ai-brm-base.tar
set -eu
cd "$(dirname "$0")/.."
OUT=ai-brm-dist
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "[1/4] 화면 빌드 (vue-tsc + vite, production)"
# .env 의 NODE_ENV=development(로컬 개발용)가 vite build 에 스며들면 Vue 개발 런타임·import.meta.env.DEV=true 가 운영 번들에 들어간다
# (2026-09-08 운영에 로그아웃 버튼이 보인 원인). 셸 환경변수가 .env 보다 우선하므로 여기서 production 으로 못박는다.
NODE_ENV=production npm run build --silent
( cd dist && tar czf "../$OUT/ui.tar.gz" . )

echo "[2/4] app.tar.gz (운영 node_modules 포함)"
mkdir -p "$WORK/app"
cp package.json package-lock.json "$WORK/app/"
( cd "$WORK/app" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --silent )
cp -r server shared "$WORK/app/"
( cd "$WORK/app" && tar czf "$OLDPWD/$OUT/app.tar.gz" package.json package-lock.json node_modules server shared )

echo "[3/4] dist.zip"
cp docker/Dockerfile docker/start.sh docker/nginx.conf docker/build.sh "$OUT/"   # dist.zip 루트 = docker build 컨텍스트
rm -rf "$OUT/k8s" && cp -r k8s "$OUT/k8s"   # 시스템 담당자용 매니페스트 (README 포함)
rm -f "$OUT/dist.zip"
# zip 이 없는 환경(Windows Git Bash)은 python zipfile 로 대체
if command -v zip >/dev/null 2>&1; then
  ( cd "$OUT" && zip -qr dist.zip Dockerfile start.sh nginx.conf build.sh ui.tar.gz app.tar.gz create-db.sql init-db.sql k8s )
else
  ( cd "$OUT" && python -m zipfile -c dist.zip Dockerfile start.sh nginx.conf build.sh ui.tar.gz app.tar.gz create-db.sql init-db.sql k8s )
fi

echo "[4/4] CHECKSUMS.md5"
( cd "$OUT" && md5sum ai-brm-base.tar dist.zip Dockerfile start.sh nginx.conf build.sh ui.tar.gz app.tar.gz create-db.sql init-db.sql k8s/* > CHECKSUMS.md5 )
ls -la "$OUT"

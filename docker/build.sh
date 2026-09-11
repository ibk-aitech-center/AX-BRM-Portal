#!/bin/sh
# AX-BRM 내부망 이미지 빌드 — dist.zip 을 푼 폴더에서 실행 (npm · 인터넷 불필요). 이미지 1개: ai-brm:<ver>
#   사전: docker load < ai-brm-base.tar   (ai-brm-base:1.0 이 있어야 함)
#   실행: sh build.sh 1.2   → ai-brm:1.2      (플랫폼이 Dockerfile 로 직접 빌드해도 결과는 같다: docker build --network none -t ai-brm:1.2 .)
set -eu
VER="${1:?사용법: sh build.sh <버전>   예) sh build.sh 1.2}"
cd "$(dirname "$0")"
for f in Dockerfile start.sh nginx.conf app.tar.gz ui.tar.gz; do
  [ -f "$f" ] || { echo "$f 가 이 폴더에 없습니다 (dist.zip 을 먼저 푸세요)"; exit 1; }
done
docker image inspect ai-brm-base:1.0 >/dev/null 2>&1 || { echo "ai-brm-base:1.0 이 없습니다 — 먼저: docker load < ai-brm-base.tar"; exit 1; }

docker build --network none -t "ai-brm:$VER" .

echo
echo "완료: ai-brm:$VER"
docker images --format '  {{.Repository}}:{{.Tag}}  {{.Size}}' | grep "ai-brm:$VER"

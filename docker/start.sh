#!/bin/sh
# ai-brm 컨테이너 기동 — nginx(80, 정적 화면 + /api/ 프록시) 와 Node API(3000) 를 한 컨테이너에서 같이 띄운다.
# Dockerfile 의 CMD 와 플랫폼 배포 템플릿(컨테이너 args 로 /app/start.sh) 둘 다 이 파일을 부른다.
# 둘 중 하나라도 죽으면 컨테이너를 내려서 k8s 가 재시작하게 한다 (반쯤 살아서 502 만 내는 상태 방지).
cd /app

node server/index.js &
NODE_PID=$!
nginx -g 'daemon off;' &
NGINX_PID=$!

stop() { kill -TERM "$NODE_PID" "$NGINX_PID" 2>/dev/null; wait "$NODE_PID" "$NGINX_PID" 2>/dev/null; }
trap 'stop; exit 0' TERM INT

# busybox sh 에는 wait -n 이 없어서 2초마다 생존만 확인한다
while kill -0 "$NODE_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 2
done
echo "[start.sh] node 또는 nginx 가 종료됨 — 컨테이너를 내립니다 (k8s 가 재시작)" >&2
stop
exit 1

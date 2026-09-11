# ai-brm — 단일 이미지 (nginx 80 + Node API 3000 을 한 컨테이너에서, /app/start.sh 가 둘 다 기동)  base: ai-brm-base:1.0 = node:22-alpine + nginx
#
# 빌드 컨텍스트 = dist.zip 을 푼 폴더 (이 Dockerfile · start.sh · nginx.conf · ui.tar.gz · app.tar.gz 가 같은 층에 있다).
#   내부망:  unzip dist.zip -d ai-brm && cd ai-brm && docker build --network none -t ai-brm:<ver> .   (= sh build.sh <ver>)
#   개발망:  scripts/make-dist.sh 가 위 배치를 만든다.
# npm 을 한 번도 부르지 않는다 — app.tar.gz 안에 운영 node_modules 가 들어 있고 ADD 가 tar.gz 를 그대로 푼다. 인터넷·npm 미러 불필요.
#
# 기동: CMD 와 플랫폼 배포 템플릿(args /app/start.sh) 모두 같은 스크립트를 부른다 → nginx(포그라운드 감시) + node.
#   nginx 가 /api/ 를 같은 컨테이너의 127.0.0.1:3000 으로 넘기므로 외부에 여는 포트는 80 하나다.
# 운영 DB 는 PostgreSQL — DATABASE_URL 을 env 로 주입(비어 있으면 서버가 기동 거부: SQLite 로 조용히 떨어져 데이터가 사라지는 사고 방지).
# 첨부·임시 파일은 /app/data 아래 — 이 경로에 PVC 를 붙이지 않으면 재배포 때 첨부가 사라진다.
# SSO_JWT_SIGN(32자 이상) 등 나머지 환경변수는 k8s/10-secret.yaml · 11-configmap.yaml 참고.

FROM ai-brm-base:1.0
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/app/data/uploads \
    SQLITE_PATH=/app/data/ai-brm.sqlite

# app.tar.gz = package.json · package-lock.json · node_modules · server · shared   /   ui.tar.gz = 빌드된 화면(index.html · assets)
ADD app.tar.gz /app/
ADD ui.tar.gz /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/nginx.conf
COPY start.sh /app/start.sh

# start.sh 는 Windows 에서 만들어졌을 수 있어 CR 을 걷어낸다. popup.html(SSO 목업)은 빌드에서 이미 빠지지만 혹시 남아도 지운다.
RUN sed -i 's/\r$//' /app/start.sh && chmod +x /app/start.sh \
  && mkdir -p /app/data/uploads \
  && rm -f /usr/share/nginx/html/popup.html
VOLUME ["/app/data"]

EXPOSE 80
CMD ["/app/start.sh"]

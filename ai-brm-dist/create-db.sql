-- AX-BRM PostgreSQL 계정·DB 생성 (init-db.sql 보다 먼저, postgres 슈퍼유저로 1회 실행)
-- 실행: psql -U postgres -f create-db.sql
-- 가이드 규칙: DB 명 = 계정 명 = 프로젝트 명(aibrm). 비밀번호는 DB 담당자가 정해 아래 <비밀번호> 를 바꾼 뒤 실행하고,
-- 같은 값을 API 컨테이너의 DATABASE_URL(postgres://aibrm:<비밀번호>@<host>:5432/aibrm) 에 넣는다.

CREATE ROLE aibrm LOGIN PASSWORD '<비밀번호>';
CREATE DATABASE aibrm OWNER aibrm ENCODING 'UTF8' TEMPLATE template0;

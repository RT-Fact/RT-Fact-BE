# RT-Fact 백엔드

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<p align="center">효율적이고 확장 가능한 서버 사이드 애플리케이션을 구축하기 위한 <a href="http://nodejs.org" target="_blank">Node.js</a> 프레임워크 기반 프로젝트입니다.</p>

## 프로젝트 설명

RT-Fact 백엔드 API 서버입니다. NestJS 프레임워크를 기반으로 구축되었습니다.

## 기술 스택

- **프레임워크**: NestJS
- **데이터베이스**: PostgreSQL + Prisma ORM
- **캐시**: Redis (ioredis)
- **패키지 매니저**: pnpm

## 프로젝트 설정

```bash
# 패키지 설치
pnpm install

# Prisma 클라이언트 생성
pnpm prisma generate
```

## 환경 변수 설정

`.env.example` 파일을 `.env` 파일로 변경하고 다음 변수를 설정하세요:

```env
# POSTGRES Container
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}

# Prisma Connection
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}?schema=public"

# REDIS
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_URL="redis://:${REDIS_PASSWORD}@localhost:6379"

# JWT
JWT_SECRET="실제 JWT secret Key"
JWT_REFRESH_SECRET="실제 JWT Refresh secret Key"

# OAuth
GOOGLE_CLIENT_ID="실제 google client ID"
GOOGLE_CLIENT_SECRET="실제 google client secret"

# MCP SERVER
MCP_SERVER_URL="실제 MCP server URL"
```

## PostgreSQL Container 실행 및 Prisma Migration 실행

### 반드시 Docker를 실행한 후에 아래의 명령어를 실행하세요.

PostgreSQL Container 실행

```
docker compose up -d
```

Prisma Migration 실행

```
## 개발 단계
pnpm prisma migrate dev --name init

## 배포 단계
pnpm prisma migrate deploy
```

Prisma Migration 확인

```
pnpm prisma studio
```

## 프로젝트 실행

```bash
# 개발 모드
pnpm start:dev

# 프로덕션 모드
pnpm start:prod

# 빌드
pnpm build
```

## 테스트

```bash
# 단위 테스트
pnpm test

# E2E 테스트
pnpm test:e2e

# 테스트 커버리지
pnpm test:cov
```

## 코드 품질

```bash
# 린트
pnpm lint

# 포맷팅
pnpm format
```

## 프로젝트 구조

```
src/
├── common/          # 공통 모듈 (필터, 가드, 인터셉터 등)
├── prisma/          # Prisma 서비스 및 모듈
├── redis/           # Redis 서비스 및 모듈
├── app.module.ts    # 루트 모듈
└── main.ts          # 엔트리 포인트
```

## 라이선스

MIT License

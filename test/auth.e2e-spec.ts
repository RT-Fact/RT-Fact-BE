import type { Server } from "http";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Test, type TestingModule } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request, { type Response } from "supertest";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/auth.service";
import { CODE_EXPIRES_MS, REFRESH_TOKEN_TTL_MS } from "../src/auth/constants";
import type { RequestWithGoogleUser } from "../src/auth/types/auth.types";
import { PrismaService } from "../src/prisma/prisma.service";
import { RedisService } from "../src/redis/redis.service";

describe("AuthController (e2e)", () => {
  let app: INestApplication;
  let authService: AuthService;
  let prismaService: PrismaService;
  let redisService: RedisService;
  let moduleFixture: TestingModule;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(AuthGuard("google"))
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<RequestWithGoogleUser>();
          req.user = {
            email: "google-flow-user@example.com",
            name: "Google Flow User",
            provider: "google",
            providerId: "google-flow-id",
          };
          return true;
        },
      } as CanActivate)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);
    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    redisService = moduleFixture.get<RedisService>(RedisService);

    // 테스트 시작 전 기존 데이터 삭제
    await prismaService.user.deleteMany({
      where: {
        email: {
          in: [
            "test@example.com",
            "test-exchange@example.com",
            "google-flow-user@example.com",
            "test-logout@example.com",
          ],
        },
      },
    });
  });

  afterAll(async () => {
    // 테스트용 데이터 삭제
    await prismaService.user.deleteMany({
      where: {
        email: {
          in: ["test@example.com", "test-exchange@example.com", "google-flow-user@example.com"],
        },
      },
    });

    // Redis 연결 종료
    const client = redisService.getClient();
    if (client && typeof client.quit === "function") {
      await client.quit();
    }

    await prismaService.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    // 각 테스트 실행 전 데이터 정리
    await prismaService.user.deleteMany({
      where: {
        email: {
          in: [
            "test@example.com",
            "test-exchange@example.com",
            "google-flow-user@example.com",
            "test-logout@example.com",
          ],
        },
      },
    });
  });

  describe("Full OAuth Flow: Callback -> Code -> Token", () => {
    it("전체 인증 흐름을 처리해야 합니다: 로그인 콜백 -> 코드로 리다이렉트 -> 토큰 교환 -> 토큰 발급", async () => {
      // 1. GET /auth/google/callback 요청 (Mock Guard가 user 주입)
      const callbackResponse: Response = await request(app.getHttpServer() as Server)
        .get("/auth/google/callback")
        .expect(302); // Redirect

      // 2. Redirect URL에서 code 추출
      const redirectLocation = callbackResponse.header.location;
      expect(redirectLocation).toBeDefined();
      expect(redirectLocation).toContain("?code=");

      const urlObj = new URL(redirectLocation);
      const code = urlObj.searchParams.get("code");
      expect(code).toBeTruthy();

      // 3. 추출한 코드로 교환 요청 (POST /auth/token)
      const exchangeResponse: Response = await request(app.getHttpServer() as Server)
        .post("/auth/token")
        .send({ code })
        .expect(201);

      // 4. 토큰 검증
      expect(exchangeResponse.body).toHaveProperty("accessToken");
    });
  });

  describe("/auth/token (POST) - Manual Code", () => {
    it("수동으로 생성된 코드를 토큰으로 교환해야 합니다", async () => {
      // 1. 테스트 유저 생성
      const user = await prismaService.user.create({
        data: {
          email: "test-exchange@example.com",
          name: "Exchange User",
          provider: "google",
          providerId: "exchange-provider-id",
        },
      });

      // 2. 임시 코드 생성 (RedisService 사용)
      const code = "valid-test-code";
      await redisService.set(code, user.id, CODE_EXPIRES_MS);

      // 3. 교환 요청
      const response: Response = await request(app.getHttpServer() as Server)
        .post("/auth/token")
        .send({ code })
        .expect(201);

      expect(response.body).toHaveProperty("accessToken");

      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(Array.isArray(cookies)).toBe(true);
      expect(
        (cookies as unknown as string[]).some((c: string) => c.startsWith("refreshToken=")),
      ).toBe(true);
    });

    it("유효하지 않은 코드로 요청 시 실패해야 합니다", async () => {
      await request(app.getHttpServer() as Server)
        .post("/auth/token")
        .send({ code: "invalid-code" })
        .expect(401);
    });
  });

  describe("/auth/refresh (POST)", () => {
    it("유효한 리프레시 토큰(쿠키)으로 새 토큰을 반환해야 합니다", async () => {
      // 1. 테스트 유저 생성
      const user = await prismaService.user.create({
        data: {
          email: "test@example.com",
          name: "Test User",
          provider: "google",
          providerId: "test-provider-id",
        },
      });

      // 2. 유효한 Refresh Token 생성 및 Redis 저장
      const tokens = authService.generateUserTokens(user.id, user.email);
      const refreshToken = tokens.refreshToken;
      await redisService.set(`rt:${user.id}`, refreshToken, REFRESH_TOKEN_TTL_MS);

      // 3. 갱신 요청 (Cookie 사용)
      const response: Response = await request(app.getHttpServer() as Server)
        .post("/auth/refresh")
        .set("Cookie", [`refreshToken=${refreshToken}`])
        .expect(201);

      expect(response.body).toHaveProperty("accessToken");

      // 4. 새로운 Refresh Token이 쿠키로 설정되었는지 확인
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(Array.isArray(cookies)).toBe(true);
      const newRefreshTokenCookie = (cookies as unknown as string[]).find((c: string) =>
        c.startsWith("refreshToken="),
      );
      expect(newRefreshTokenCookie).toBeDefined();

      if (!newRefreshTokenCookie) {
        throw new Error("Refresh Token cookie not found");
      }

      const newRefreshToken = newRefreshTokenCookie.split(";")[0].split("=")[1];
      expect(newRefreshToken).not.toBe(refreshToken);

      // Redis에 새로운 Refresh Token이 저장되었는지 확인 (Rotation 검증)
      const cachedNewToken = await redisService.get(`rt:${user.id}`);
      expect(cachedNewToken).toBe(newRefreshToken);
    });

    it("Redis에 리프레시 토큰이 없으면 401을 반환해야 합니다 (안전한 로그아웃/만료)", async () => {
      const user = await prismaService.user.create({
        data: {
          email: "test@example.com",
          name: "Test User",
          provider: "google",
          providerId: "test-provider-id",
        },
      });

      const tokens = authService.generateUserTokens(user.id, user.email);
      const refreshToken = tokens.refreshToken;

      await request(app.getHttpServer() as Server)
        .post("/auth/refresh")
        .set("Cookie", [`refreshToken=${refreshToken}`])
        .expect(401);
    });

    it("리프레시 토큰이 일치하지 않으면 401을 반환해야 합니다 (재사용 시도)", async () => {
      const user = await prismaService.user.create({
        data: {
          email: "test@example.com",
          name: "Test User",
          provider: "google",
          providerId: "test-provider-id",
        },
      });

      const tokensA = authService.generateUserTokens(user.id, user.email);
      await redisService.set(`rt:${user.id}`, tokensA.refreshToken, REFRESH_TOKEN_TTL_MS);

      const tokensB = authService.generateUserTokens(user.id, user.email);

      await request(app.getHttpServer() as Server)
        .post("/auth/refresh")
        .set("Cookie", [`refreshToken=${tokensB.refreshToken}`])
        .expect(401);
    });

    it("유효하지 않은 리프레시 토큰 서명이면 401을 반환해야 합니다", async () => {
      await request(app.getHttpServer() as Server)
        .post("/auth/refresh")
        .set("Cookie", ["refreshToken=invalid-token"])
        .expect(401);
    });
  });

  describe("/auth/logout (POST)", () => {
    it("성공적으로 로그아웃해야 합니다: 쿠키 삭제 및 Redis에서 리프레시 토큰 제거", async () => {
      // 1. 테스트 유저 생성
      const user = await prismaService.user.create({
        data: {
          email: "test-logout@example.com",
          name: "Logout User",
          provider: "google",
          providerId: "logout-provider-id",
        },
      });

      // 2. 토큰 생성 및 Redis 저장
      const tokens = authService.generateUserTokens(user.id, user.email);
      await redisService.set(`rt:${user.id}`, tokens.refreshToken, REFRESH_TOKEN_TTL_MS);

      // 3. 로그아웃 요청 (Access Token 필요)
      const response: Response = await request(app.getHttpServer() as Server)
        .post("/auth/logout")
        .set("Authorization", `Bearer ${tokens.accessToken}`)
        .expect(201); // Created

      // 4. 응답 확인
      expect(response.body).toEqual({ message: "로그아웃 되었습니다." });

      // 5. 쿠키 확인 (삭제되었는지)
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(Array.isArray(cookies)).toBe(true);
      // Max-Age=0 또는 Expires=과거시간 인지 확인. 보통 clearCookie는 Max-Age=0; 또는 Expires=Thu, 01 Jan 1970 00:00:00 GMT; 이런 식임.
      // 여기서는 refreshToken=; ... Max-Age=0 인지 정도 확인
      const refreshTokenCookie = (cookies as unknown as string[]).find((c: string) =>
        c.startsWith("refreshToken="),
      );
      expect(refreshTokenCookie).toBeDefined();
      // 단순히 refreshToken=; 만 확인할 수도 있고, Max-Age=0 등 구체적으로 볼 수도 있음
      // express의 res.clearCookie는 기본적으로 만료 시간을 과거로 설정함.

      // 6. Redis 확인 (삭제되었는지)
      const cachedToken = await redisService.get(`rt:${user.id}`);
      expect(cachedToken).toBeNull();
    });

    it("액세스 토큰 없이 요청 시 검증에 실패해야 합니다", async () => {
      await request(app.getHttpServer() as Server)
        .post("/auth/logout")
        .expect(401);
    });
  });
});

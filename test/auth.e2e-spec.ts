import type { Server } from "http";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Test, type TestingModule } from "@nestjs/testing";
import request, { type Response } from "supertest";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/auth.service";
import { REFRESH_TOKEN_TTL_MS } from "../src/auth/constants";
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
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);
    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    redisService = moduleFixture.get<RedisService>(RedisService);

    // 테스트 시작 전 기존 데이터 삭제
    await prismaService.user.deleteMany({
      where: {
        email: {
          in: ["test@example.com", "test-exchange@example.com", "google-flow-user@example.com"],
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
          in: ["test@example.com", "test-exchange@example.com", "google-flow-user@example.com"],
        },
      },
    });
  });

  describe("Full OAuth Flow: Callback -> Code -> Token", () => {
    it("should handle full flow: login callback -> redirect with code -> exchange -> tokens", async () => {
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
    it("should exchange manually created code for tokens", async () => {
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
      await redisService.set(code, user.id, 60000);

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

    it("should fail with invalid code", async () => {
      await request(app.getHttpServer() as Server)
        .post("/auth/token")
        .send({ code: "invalid-code" })
        .expect(401);
    });
  });

  describe("/auth/refresh (POST)", () => {
    it("should return new tokens with valid refresh token (Cookie)", async () => {
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

    it("should return 401 if refresh token is not in Redis (Safe Logout/Expiration)", async () => {
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

    it("should return 401 if refresh token mismatches (Reuse Attempt)", async () => {
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

    it("should return 401 with invalid refresh token signature", async () => {
      await request(app.getHttpServer() as Server)
        .post("/auth/refresh")
        .set("Cookie", ["refreshToken=invalid-token"])
        .expect(401);
    });
  });
});

import type { Server } from "http";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Cache } from "cache-manager";
import request, { type Response } from "supertest";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/auth.service";
import type { RequestWithUser } from "../src/auth/types/auth.types";
import { PrismaService } from "../src/prisma/prisma.service";

describe("AuthController (e2e)", () => {
  let app: INestApplication;
  let authService: AuthService;
  let prismaService: PrismaService;

  let moduleFixture: TestingModule;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(AuthGuard("google"))
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<RequestWithUser>();
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const cacheManager: any = app.get(CACHE_MANAGER);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (cacheManager.store && typeof cacheManager.store.client?.quit === "function") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await cacheManager.store.client.quit();
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

      const cookies = exchangeResponse.get("Set-Cookie");
      expect(cookies).toBeDefined();

      const refreshTokenCookie = cookies?.find((c: string) => c.startsWith("refreshToken="));
      expect(refreshTokenCookie).toBeDefined();
      expect(refreshTokenCookie).toContain("HttpOnly");

      // 5. DB에 유저가 생성되었는지 확인
      const user = await prismaService.user.findFirst({
        where: { email: "google-flow-user@example.com" },
      });
      expect(user).toBeDefined();
      expect(user?.providerId).toBe("google-flow-id");
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

      // 2. 임시 코드 생성
      const cacheManager = moduleFixture.get<Cache>("CACHE_MANAGER");
      const code = "valid-test-code";
      await cacheManager.set(code, user.id, 60000);

      // 3. 교환 요청
      const response: Response = await request(app.getHttpServer() as Server)
        .post("/auth/token")
        .send({ code })
        .expect(201);

      expect(response.body).toHaveProperty("accessToken");
    });

    it("should fail with invalid code", async () => {
      await request(app.getHttpServer() as Server)
        .post("/auth/token")
        .send({ code: "invalid-code" })
        .expect(401);
    });
  });

  describe("/auth/refresh (POST)", () => {
    it("should return new tokens with valid refresh token", async () => {
      // 1. 테스트 유저 생성
      const user = await prismaService.user.create({
        data: {
          email: "test@example.com",
          name: "Test User",
          provider: "google",
          providerId: "test-provider-id",
        },
      });

      // 2. 유효한 Refresh Token 생성
      const tokens = authService.generateUserTokens(user.id, user.email);
      const refreshToken = tokens.refreshToken;

      // 3. 갱신 요청
      const response: Response = await request(app.getHttpServer() as Server)
        .post("/auth/refresh")
        .send({ refreshToken })
        .expect(201);

      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("refreshToken");

      expect((response.body as Record<string, string>).refreshToken).not.toBe(refreshToken);
    });

    it("should return 401 with invalid refresh token", async () => {
      await request(app.getHttpServer() as Server)
        .post("/auth/refresh")
        .send({ refreshToken: "invalid-token" })
        .expect(401);
    });
  });
});

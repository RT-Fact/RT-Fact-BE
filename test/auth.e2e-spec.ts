import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/auth.service";
import { PrismaService } from "../src/prisma/prisma.service";

describe("AuthController (e2e)", () => {
  let app: INestApplication;
  let authService: AuthService;
  let prismaService: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);
    prismaService = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    // 테스트용 데이터 삭제
    await prismaService.user.deleteMany({
      where: { email: "test@example.com" },
    });
    await app.close();
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
      const tokens = authService.generateTokens(user.id, user.email);
      const refreshToken = tokens.refreshToken;

      // iat(발급시간) 변경을 위해 1초 대기 (JWT는 초 단위 기록)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 3. 갱신 요청
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const response = await request(app.getHttpServer())
        .post("/auth/refresh")
        .send({ refreshToken })
        .expect(201); // NestJS 기본 POST 응답 코드는 201

      // 4. 검증
      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("refreshToken");
      // 새로운 토큰은 이전 토큰과 달라야 함
      expect((response.body as Record<string, string>).refreshToken).not.toBe(refreshToken);
    });

    it("should return 401 with invalid refresh token", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await request(app.getHttpServer())
        .post("/auth/refresh")
        .send({ refreshToken: "invalid-token" })
        .expect(401);
    });
  });
});

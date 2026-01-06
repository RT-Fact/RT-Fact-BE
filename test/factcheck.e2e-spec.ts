import type { Server } from "http";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import request, { type Response } from "supertest";
import { AppModule } from "../src/app.module";
import { GuestRepository } from "../src/auth/repositories/guest.repository";
import { McpService } from "../src/mcp/mcp.service";
import type { McpResponse } from "../src/mcp/types/mcp.types";
import { PrismaService } from "../src/prisma/prisma.service";

describe("FactCheck (e2e)", () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let configService: ConfigService;
  let guestRepository: GuestRepository;
  let prismaService: PrismaService;

  const mockMcpResponse: McpResponse = {
    title: "E2E 테스트 제목",
    originalText: "원본 텍스트",
    sentences: [
      {
        type: "claim",
        text: "검증 가능한 문장입니다.",
        startIndex: 0,
        endIndex: 20,
        verdict: "TRUE",
        sources: [{ title: "출처", url: "https://example.com" }],
      },
      {
        type: "opinion",
        text: "이것은 의견입니다.",
        startIndex: 21,
        endIndex: 35,
        reason: "주관적 표현",
      },
    ],
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(McpService)
      .useValue({
        analyze: jest.fn().mockResolvedValue(mockMcpResponse),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    configService = moduleFixture.get<ConfigService>(ConfigService);
    guestRepository = moduleFixture.get<GuestRepository>(GuestRepository);
    prismaService = moduleFixture.get<PrismaService>(PrismaService);

    // 테스트 유저 생성 (중복 방지를 위해 upsert 사용)
    await prismaService.user.upsert({
      where: { email: "fc-user@example.com" },
      update: {},
      create: {
        id: "fc-user-id",
        email: "fc-user@example.com",
        name: "FactCheck User",
        provider: "google",
        providerId: "fc-google-123",
      },
    });
  });

  afterAll(async () => {
    // 테스트 데이터 삭제 (FactCheck 삭제 후 User 삭제)
    await prismaService.factCheck.deleteMany({
      where: { userId: "fc-user-id" },
    });
    await prismaService.user.deleteMany({
      where: { email: "fc-user@example.com" },
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

  const generateUserToken = () => {
    return jwtService.sign(
      { id: "fc-user-id", email: "fc-user@example.com", jti: "test-jti" },
      { secret: configService.get<string>("JWT_SECRET"), expiresIn: "1h" },
    );
  };

  const generateGuestToken = () => {
    return jwtService.sign(
      { ip: "test-ip-hash", isGuest: true, jti: "guest-jti" },
      { secret: configService.get<string>("JWT_SECRET"), expiresIn: "1h" },
    );
  };

  describe("POST /factcheck", () => {
    describe("Authentication", () => {
      it("인증 없이 요청하면 401 Unauthorized를 반환해야 한다", async () => {
        const response: Response = await request(app.getHttpServer() as Server)
          .post("/factcheck")
          .send({ text: "테스트 텍스트" });

        expect(response.status).toBe(401);
      });
    });

    describe("Validation", () => {
      it("빈 텍스트로 요청하면 400 Bad Request를 반환해야 한다", async () => {
        const token = generateUserToken();

        const response: Response = await request(app.getHttpServer() as Server)
          .post("/factcheck")
          .set("Authorization", `Bearer ${token}`)
          .send({ text: "" });

        expect(response.status).toBe(400);
      });

      it("text 필드 없이 요청하면 400 Bad Request를 반환해야 한다", async () => {
        const token = generateUserToken();

        const response: Response = await request(app.getHttpServer() as Server)
          .post("/factcheck")
          .set("Authorization", `Bearer ${token}`)
          .send({});

        expect(response.status).toBe(400);
      });
    });

    describe("Guest User", () => {
      it("게스트 한도 초과 시 403 Forbidden을 반환해야 한다", async () => {
        const token = generateGuestToken();

        // 게스트 한도를 0으로 설정
        jest.spyOn(guestRepository, "getGuestInfo").mockResolvedValue({
          remainingUses: 0,
          createdAt: Date.now(),
        });

        const response: Response = await request(app.getHttpServer() as Server)
          .post("/factcheck")
          .set("Authorization", `Bearer ${token}`)
          .send({ text: "테스트 텍스트" });

        expect(response.status).toBe(403);
        expect((response.body as { message: string }).message).toBe("GUEST_LIMIT_EXCEEDED");
      });
    });

    describe("Success Response", () => {
      it("로그인 사용자의 정상 요청은 201 Created를 반환해야 한다", async () => {
        const token = generateUserToken();

        // (삭제됨: beforeAll에서 이미 생성함)

        const response: Response = await request(app.getHttpServer() as Server)
          .post("/factcheck")
          .set("Authorization", `Bearer ${token}`)
          .send({ text: "테스트 텍스트" });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("id");
        expect(response.body).toHaveProperty("title");
        expect(response.body).toHaveProperty("sentences");
        expect(response.body).toHaveProperty("summary");
        expect(response.body).toHaveProperty("createdAt");
      });

      it("응답에 position이 올바르게 할당되어야 한다", async () => {
        const token = generateUserToken();

        const response: Response = await request(app.getHttpServer() as Server)
          .post("/factcheck")
          .set("Authorization", `Bearer ${token}`)
          .send({ text: "테스트 텍스트" });

        expect(response.status).toBe(201);
        const body = response.body as { sentences: Array<{ position: number }> };
        body.sentences.forEach((sentence, index) => {
          expect(sentence.position).toBe(index);
        });
      });

      it("응답에 startIndex, endIndex가 포함되지 않아야 한다", async () => {
        const token = generateUserToken();

        const response: Response = await request(app.getHttpServer() as Server)
          .post("/factcheck")
          .set("Authorization", `Bearer ${token}`)
          .send({ text: "테스트 텍스트" });

        expect(response.status).toBe(201);
        const body = response.body as { sentences: Array<Record<string, unknown>> };
        body.sentences.forEach((sentence) => {
          expect(sentence).not.toHaveProperty("startIndex");
          expect(sentence).not.toHaveProperty("endIndex");
        });
      });
    });
  });
});

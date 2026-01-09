import type { Server } from "http";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import { ClaimStatus } from "@prisma/client";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import { AppModule } from "../src/app.module";
import { McpService } from "../src/mcp/mcp.service";
import { PrismaService } from "../src/prisma/prisma.service";

describe("FactCheck Claim Status (e2e)", () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let configService: ConfigService;
  let prismaService: PrismaService;

  const TEST_USER_EMAIL = "fc-status-user@example.com";
  const TEST_USER_ID = "fc-status-user-id";

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(McpService)
      .useValue({ analyze: jest.fn() }) // Mock unused service
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    configService = moduleFixture.get<ConfigService>(ConfigService);
    prismaService = moduleFixture.get<PrismaService>(PrismaService);

    // 테스트 유저 생성
    await prismaService.user.upsert({
      where: { email: TEST_USER_EMAIL },
      update: {},
      create: {
        id: TEST_USER_ID,
        email: TEST_USER_EMAIL,
        name: "FactCheck Status User",
        provider: "google",
        providerId: "fc-status-google-123",
      },
    });
  });

  afterEach(async () => {
    // 각 테스트 후 생성된 FactCheck 데이터 정리
    await prismaService.factCheck.deleteMany({ where: { userId: TEST_USER_ID } });
  });

  afterAll(async () => {
    // Clean up
    await prismaService.factCheck.deleteMany({ where: { userId: TEST_USER_ID } });
    await prismaService.user.deleteMany({ where: { email: TEST_USER_EMAIL } });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const cacheManager: any = app.get(CACHE_MANAGER);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (cacheManager.store?.client?.quit) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await cacheManager.store.client.quit();
    }

    await prismaService.$disconnect();
    await app.close();
  });

  const generateUserToken = () => {
    return jwtService.sign(
      { id: TEST_USER_ID, email: TEST_USER_EMAIL },
      { secret: configService.get<string>("JWT_SECRET") },
    );
  };

  const generateGuestToken = () => {
    return jwtService.sign(
      { ip: "test-status-ip", isGuest: true },
      { secret: configService.get<string>("JWT_SECRET") },
    );
  };

  const createTestFactCheck = async () => {
    const factCheckId = uuidv4();
    const claimId = uuidv4();

    await prismaService.factCheck.create({
      data: {
        id: factCheckId,
        userId: TEST_USER_ID,
        title: "Test Title",
        originalText: "Test Text",
        sentences: {
          create: [
            {
              id: claimId,
              type: "CLAIM",
              text: "Test Claim",
              position: 0,
              status: "PENDING",
            },
          ],
        },
      },
    });

    return { factCheckId, claimId };
  };

  describe("PATCH /factcheck/:id/claims/:claimId/apply", () => {
    let factCheckId: string;
    let claimId: string;

    beforeEach(async () => {
      const testData = await createTestFactCheck();
      factCheckId = testData.factCheckId;
      claimId = testData.claimId;
    });

    it("🔴 로그인 사용자: Claim을 승인(Apply)하면 상태가 APPLIED로 변경되어야 한다", async () => {
      // Act
      const response = await request(app.getHttpServer() as Server)
        .patch(`/factcheck/${factCheckId}/claims/${claimId}/apply`)
        .set("Authorization", `Bearer ${generateUserToken()}`)
        .expect(200);

      // Assert Response
      expect((response.body as { status: string }).status).toBe("applied");

      // Assert DB
      const updated = await prismaService.sentence.findUnique({ where: { id: claimId } });
      expect(updated?.status).toBe(ClaimStatus.APPLIED);
    });

    it("🔴 게스트 사용자: 승인 요청 시 성공 응답을 받지만 DB는 변경되지 않아야 한다 (No-op)", async () => {
      // Act
      const response = await request(app.getHttpServer() as Server)
        .patch(`/factcheck/${factCheckId}/claims/${claimId}/apply`)
        .set("Authorization", `Bearer ${generateGuestToken()}`)
        .expect(200);

      // Assert Response
      expect((response.body as { status: string }).status).toBe("applied");

      // Assert DB (Should remain PENDING)
      const notUpdated = await prismaService.sentence.findUnique({ where: { id: claimId } });
      expect(notUpdated?.status).toBe(ClaimStatus.PENDING);
    });
  });

  describe("PATCH /factcheck/:id/claims/:claimId/ignore", () => {
    let factCheckId: string;
    let claimId: string;

    beforeEach(async () => {
      const testData = await createTestFactCheck();
      factCheckId = testData.factCheckId;
      claimId = testData.claimId;
    });

    it("🔴 로그인 사용자: Claim을 무시(Ignore)하면 상태가 IGNORED로 변경되어야 한다", async () => {
      const response = await request(app.getHttpServer() as Server)
        .patch(`/factcheck/${factCheckId}/claims/${claimId}/ignore`)
        .set("Authorization", `Bearer ${generateUserToken()}`)
        .expect(200);

      expect((response.body as { status: string }).status).toBe("ignored");

      const updated = await prismaService.sentence.findUnique({ where: { id: claimId } });
      expect(updated?.status).toBe(ClaimStatus.IGNORED);
    });
  });
});

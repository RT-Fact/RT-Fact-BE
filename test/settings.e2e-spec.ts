import type * as http from "http";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import { PrismaService } from "../src/prisma/prisma.service";
import { AppModule } from "./../src/app.module";

interface SettingsResponse {
  whitelist: string[];
  blacklist: string[];
}

interface ErrorResponse {
  code?: string;
  message?: string | string[];
}

describe("SettingsController (e2e)", () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let jwtService: JwtService;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // 테스트용 유저 생성
    const email = `test-settings-${Date.now()}@example.com`;
    const user = await prismaService.user.create({
      data: {
        email,
        name: "Test Settings User",
        provider: "google",
        providerId: `google-id-${Date.now()}`,
      },
    });

    userId = user.id;

    // 토큰 생성 (AuthService의 로직을 흉내내거나 직접 생성)
    // 여기서는 JwtService를 이용해 직접 생성
    accessToken = jwtService.sign(
      { id: user.id, email: user.email },
      { secret: process.env.JWT_SECRET },
    );
  });

  afterAll(async () => {
    // 테스트 데이터 정리
    await prismaService.domainFilter.deleteMany({ where: { userId } });
    await prismaService.user.delete({ where: { id: userId } });
    await app.close();
  });

  describe("GET /settings", () => {
    it("should return empty lists initially", () => {
      return request(app.getHttpServer() as http.Server)
        .get("/settings")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as SettingsResponse;
          expect(body).toEqual({
            whitelist: [],
            blacklist: [],
          });
        });
    });
  });

  describe("POST /settings/whitelist", () => {
    const domain = "good-site.com";

    it("should add a domain to whitelist", () => {
      return request(app.getHttpServer() as http.Server)
        .post("/settings/whitelist")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ domain })
        .expect(201)
        .expect((res) => {
          const body = res.body as SettingsResponse;
          expect(body.whitelist).toContain(domain);
        });
    });

    it("should fail with DUPLICATE_DOMAIN if domain already exists", () => {
      return request(app.getHttpServer() as http.Server)
        .post("/settings/whitelist")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ domain })
        .expect(400)
        .expect((res) => {
          const body = res.body as ErrorResponse;
          expect(body.code).toBe("DUPLICATE_DOMAIN");
        });
    });

    it("should fail with INVALID_DOMAIN if domain format is wrong", () => {
      return request(app.getHttpServer() as http.Server)
        .post("/settings/whitelist")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ domain: "invalid-domain-without-tld" })
        .expect(400)
        .expect((res) => {
          // class-validator의 에러 메시지 형식 확인 필요
          // 보통 { message: [...] } 형태로 옴
          const body = res.body as ErrorResponse;
          expect(body.message).toEqual(expect.arrayContaining(["INVALID_DOMAIN"]));
        });
    });
  });

  describe("DELETE /settings/whitelist/:domain", () => {
    const domain = "good-site.com";

    it("should remove a domain from whitelist", () => {
      return request(app.getHttpServer() as http.Server)
        .delete(`/settings/whitelist/${domain}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as SettingsResponse;
          expect(body.whitelist).not.toContain(domain);
        });
    });

    it("should fail if unauthenticated", () => {
      return request(app.getHttpServer() as http.Server)
        .delete(`/settings/whitelist/${domain}`)
        .expect(401);
    });
  });
});

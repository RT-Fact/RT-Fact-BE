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

    accessToken = jwtService.sign(
      { id: user.id, email: user.email },
      { secret: process.env.JWT_SECRET },
    );
  });

  afterAll(async () => {
    await prismaService.domainFilter.deleteMany({ where: { userId } });
    await prismaService.user.delete({ where: { id: userId } });
    await app.close();
  });

  describe("GET /settings", () => {
    it("초기에는 빈 목록을 반환해야 한다", () => {
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

    it("화이트리스트에 도메인을 추가해야 한다", () => {
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

    it("이미 존재하는 도메인이면 DUPLICATE_DOMAIN 오류가 발생해야 한다", () => {
      return request(app.getHttpServer() as http.Server)
        .post("/settings/whitelist")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ domain })
        .expect(409)
        .expect((res) => {
          const body = res.body as ErrorResponse;
          expect(body.code).toBe("DUPLICATE_DOMAIN");
        });
    });

    it("도메인 형식이 잘못되면 INVALID_DOMAIN 오류가 발생해야 한다", () => {
      return request(app.getHttpServer() as http.Server)
        .post("/settings/whitelist")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ domain: "invalid-domain-without-tld" })
        .expect(400)
        .expect((res) => {
          const body = res.body as ErrorResponse;
          expect(typeof body.message).toBe("string");
          expect(body.message).toBe("INVALID_DOMAIN");
        });
    });
  });

  describe("DELETE /settings/whitelist/:domain", () => {
    const domain = "good-site.com";

    it("화이트리스트에서 도메인을 제거해야 한다", () => {
      return request(app.getHttpServer() as http.Server)
        .delete(`/settings/whitelist/${domain}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as SettingsResponse;
          expect(body.whitelist).not.toContain(domain);
        });
    });

    it("인증되지 않은 경우 실패해야 한다", () => {
      return request(app.getHttpServer() as http.Server)
        .delete(`/settings/whitelist/${domain}`)
        .expect(401);
    });
  });

  describe("POST /settings/blacklist", () => {
    const domain = "bad-site.com";

    it("블랙리스트에 도메인을 추가해야 한다", () => {
      return request(app.getHttpServer() as http.Server)
        .post("/settings/blacklist")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ domain })
        .expect(201)
        .expect((res) => {
          const body = res.body as SettingsResponse;
          expect(body.blacklist).toContain(domain);
        });
    });

    it("이미 존재하는 도메인이면 DUPLICATE_DOMAIN 오류가 발생해야 한다", () => {
      return request(app.getHttpServer() as http.Server)
        .post("/settings/blacklist")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ domain })
        .expect(409)
        .expect((res) => {
          const body = res.body as ErrorResponse;
          expect(body.code).toBe("DUPLICATE_DOMAIN");
        });
    });
  });

  describe("Conflict Check (Whitelist vs Blacklist)", () => {
    const whiteDomain = "safe.com";
    const blackDomain = "danger.com";

    beforeAll(async () => {
      await request(app.getHttpServer() as http.Server)
        .post("/settings/whitelist")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ domain: whiteDomain });

      await request(app.getHttpServer() as http.Server)
        .post("/settings/blacklist")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ domain: blackDomain });
    });

    it("화이트리스트에 있는 도메인을 블랙리스트에 추가하면 실패해야 한다", () => {
      return request(app.getHttpServer() as http.Server)
        .post("/settings/blacklist")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ domain: whiteDomain })
        .expect(409)
        .expect((res) => {
          const body = res.body as ErrorResponse;
          expect(body.code).toBe("DOMAIN_CONFLICT");
        });
    });

    it("블랙리스트에 있는 도메인을 화이트리스트에 추가하면 실패해야 한다", () => {
      return request(app.getHttpServer() as http.Server)
        .post("/settings/whitelist")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ domain: blackDomain })
        .expect(409)
        .expect((res) => {
          const body = res.body as ErrorResponse;
          expect(body.code).toBe("DOMAIN_CONFLICT");
        });
    });
  });

  describe("DELETE /settings/blacklist/:domain", () => {
    const domain = "bad-site.com";

    it("블랙리스트에서 도메인을 제거해야 한다", () => {
      return request(app.getHttpServer() as http.Server)
        .delete(`/settings/blacklist/${domain}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as SettingsResponse;
          expect(body.blacklist).not.toContain(domain);
        });
    });
  });
});

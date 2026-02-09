import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { AuthService } from "./auth.service";
import { REFRESH_TOKEN_TTL_MS } from "./constants";
import { GuestRepository } from "./repositories/guest.repository";
import type { GoogleProfile, UserJwtPayload } from "./types/auth.types";

describe("AuthService", () => {
  let service: AuthService;

  // Mock 객체들
  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      switch (key) {
        case "JWT_SECRET":
          return "test-secret";
        case "JWT_REFRESH_SECRET":
          return "test-refresh-secret";
        default:
          return null;
      }
    }),
  };

  const mockGuestRepository = {
    getGuestInfo: jest.fn(),
    setGuestInfo: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: GuestRepository, useValue: mockGuestRepository },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("validateOAuthLogin", () => {
    const profile: GoogleProfile = {
      email: "test@example.com",
      name: "Test User",
      provider: "google",
      providerId: "123",
    };

    it("upsert를 사용하여 사용자(생성 또는 업데이트)를 반환해야 합니다", async () => {
      // given
      mockPrismaService.user.upsert.mockResolvedValue(profile);

      // when
      const result = await service.validateOAuthLogin(profile);

      // then
      expect(result).toEqual(profile);
      expect(mockPrismaService.user.upsert).toHaveBeenCalledWith({
        where: { email: profile.email },
        update: {
          name: profile.name,
          provider: profile.provider,
          providerId: profile.providerId,
        },
        create: profile,
      });
    });
  });

  describe("generateUserTokens", () => {
    it("액세스 토큰과 리프레시 토큰을 반환해야 합니다", () => {
      // given
      mockJwtService.sign.mockReturnValue("mock-token");

      // when
      const result = service.generateUserTokens("user-id", "test@example.com");

      // then
      expect(result).toEqual({
        accessToken: "mock-token",
        refreshToken: "mock-token",
      });
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2);
    });
  });

  describe("generateGuestToken", () => {
    it("액세스 토큰을 반환해야 합니다", () => {
      // given
      mockJwtService.sign.mockReturnValue("mock-guest-token");

      // when
      const result = service.generateGuestToken("127.0.0.1");

      // then
      expect(result).toBe("mock-guest-token");
    });
  });

  describe("refreshTokens", () => {
    const refreshToken = "valid-refresh-token";
    const payload: UserJwtPayload = { id: "user-id", email: "test@example.com", jti: "uuid" };

    it("리프레시 토큰이 유효하고 Redis와 일치하면 새 토큰을 반환해야 합니다", async () => {
      // given
      mockJwtService.verify.mockReturnValue(payload);
      mockRedisService.get.mockResolvedValue(refreshToken); // Redis와 일치
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: "user-id",
        email: "test@example.com",
      });
      mockJwtService.sign.mockReturnValue("new-mock-token");

      // when
      const result = await service.refreshTokens(refreshToken);

      // then
      expect(result).toEqual({
        accessToken: "new-mock-token",
        refreshToken: "new-mock-token",
      });
      expect(mockRedisService.get).toHaveBeenCalledWith(`rt:${payload.id}`);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `rt:${payload.id}`,
        "new-mock-token",
        REFRESH_TOKEN_TTL_MS,
      );
    });

    it("토큰이 Redis에 없으면 UnauthorizedException을 던져야 합니다", async () => {
      // given
      mockJwtService.verify.mockReturnValue(payload);
      mockRedisService.get.mockResolvedValue(null); // Redis에 없음 (만료/삭제됨)

      // when & then
      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it("토큰이 일치하지 않으면(재사용 시도) UnauthorizedException을 던져야 합니다", async () => {
      // given
      mockJwtService.verify.mockReturnValue(payload);
      mockRedisService.get.mockResolvedValue("different-token"); // Redis 값과 다름

      // when & then
      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it("검증에 실패하면 UnauthorizedException을 던져야 합니다", async () => {
      // given
      mockJwtService.verify.mockImplementation(() => {
        throw new Error();
      });

      // when & then
      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it("사용자를 찾을 수 없으면 UnauthorizedException을 던져야 합니다", async () => {
      // given
      mockJwtService.verify.mockReturnValue(payload);
      mockRedisService.get.mockResolvedValue(refreshToken);
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      // when & then
      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });
});

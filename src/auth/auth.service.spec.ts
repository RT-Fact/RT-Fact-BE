import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";

import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import { GoogleProfile, JwtPayload } from "./types/auth.types";

describe("AuthService", () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;

  // Mock 객체들
  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("validateOAuthLogin", () => {
    const profile: GoogleProfile = {
      email: "test@example.com",
      name: "Test User",
      provider: "google",
      providerId: "123",
    };

    it("should return existing user if found", async () => {
      // given
      mockPrismaService.user.findFirst.mockResolvedValue(profile);

      // when
      const result = await service.validateOAuthLogin(profile);

      // then
      expect(result).toEqual(profile);
      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: { provider: "google", providerId: "123" },
      });
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });

    it("should create and return new user if not found", async () => {
      // given
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(profile);

      // when
      const result = await service.validateOAuthLogin(profile);

      // then
      expect(result).toEqual(profile);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: profile,
      });
    });
  });

  describe("generateTokens", () => {
    it("should return access and refresh tokens", () => {
      // given
      mockJwtService.sign.mockReturnValue("mock-token");

      // when
      const result = service.generateTokens("user-id", "test@example.com");

      // then
      expect(result).toEqual({
        accessToken: "mock-token",
        refreshToken: "mock-token",
      });
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2);
    });
  });

  describe("refreshTokens", () => {
    const refreshToken = "valid-refresh-token";
    const payload: JwtPayload = { id: "user-id", email: "test@example.com" };

    it("should return new tokens if refresh token is valid", async () => {
      // given
      mockJwtService.verify.mockReturnValue(payload);
      mockPrismaService.user.findUnique.mockResolvedValue({ id: "user-id", email: "test@example.com" });
      mockJwtService.sign.mockReturnValue("new-mock-token");

      // when
      const result = await service.refreshTokens(refreshToken);

      // then
      expect(result).toEqual({
        accessToken: "new-mock-token",
        refreshToken: "new-mock-token",
      });
    });

    it("should throw UnauthorizedException if verify fails", async () => {
      // given
      mockJwtService.verify.mockImplementation(() => {
        throw new Error();
      });

      // when & then
      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException if user not found", async () => {
      // given
      mockJwtService.verify.mockReturnValue(payload);
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      // when & then
      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import { ERROR_CODES } from "../common/constants/error-codes";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GUEST_CONFIG, REFRESH_TOKEN_TTL_MS } from "./constants";
import { GuestRepository } from "./repositories/guest.repository";
import type {
  AuthenticatedUser,
  GoogleProfile,
  GuestInfo,
  GuestUser,
  LogoutResponse,
  RedirectResponse,
  RequestWithUser,
  TokenResponse,
} from "./types/auth.types";

jest.mock("uuid", () => ({
  v4: () => "mock-uuid",
}));

const createUser = (overrides?: Partial<{ id: string; email: string; name: string }>) => ({
  id: "user-123",
  email: "test@example.com",
  name: "테스트 사용자",
  ...overrides,
});

const createGuestInfo = (overrides?: Partial<GuestInfo>): GuestInfo => ({
  remainingUses: GUEST_CONFIG.INITIAL_USES,
  createdAt: 1700000000000,
  ...overrides,
});

const createTokenResponse = (): TokenResponse => ({
  cookie: jest.fn(),
  json: jest.fn(),
});

const createRequestWithCookies = (refreshToken?: string): RequestWithUser =>
  ({
    cookies: refreshToken !== undefined ? { refreshToken } : {},
  }) as unknown as RequestWithUser;

const createRequestWithUser = (user: AuthenticatedUser | GuestUser): RequestWithUser =>
  ({ user }) as unknown as RequestWithUser;

describe("Auth Integration (Controller + Service)", () => {
  let controller: AuthController;

  const mockPrismaService = {
    user: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      const config: Record<string, string> = {
        FRONTEND_URL: "http://localhost:5173",
        JWT_SECRET: "test-jwt-secret",
        JWT_REFRESH_SECRET: "test-jwt-refresh-secret",
      };
      const value = config[key];
      if (value === undefined) {
        throw new Error(`설정 키를 찾을 수 없습니다: ${key}`);
      }

      return value;
    }),
  };

  const mockGuestRepository = {
    getGuestInfo: jest.fn(),
    setGuestInfo: jest.fn(),
  };

  const mockRedisService = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: GuestRepository, useValue: mockGuestRepository },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("googleAuthCallback", () => {
    const mockGoogleProfile: GoogleProfile = {
      email: "test@example.com",
      name: "테스트 사용자",
      provider: "google",
      providerId: "google-123",
    };

    it("OAuth 로그인 성공 시 인증 코드와 함께 프론트엔드로 리다이렉트해야 한다", async () => {
      const mockRes: RedirectResponse = { redirect: jest.fn() };
      mockPrismaService.user.upsert.mockResolvedValue(createUser());
      mockRedisService.set.mockResolvedValue(undefined);

      await controller.googleAuthCallback(mockGoogleProfile, mockRes);

      expect(mockPrismaService.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: mockGoogleProfile.email },
        }),
      );
      expect(mockRedisService.set).toHaveBeenCalledWith("mock-uuid", "user-123", 60000);
      expect(mockRes.redirect).toHaveBeenCalledWith(
        "http://localhost:5173/auth/callback?code=mock-uuid",
      );
    });

    it("OAuth 로그인 실패 시 에러 페이지로 리다이렉트해야 한다", async () => {
      const mockRes: RedirectResponse = { redirect: jest.fn() };
      mockPrismaService.user.upsert.mockRejectedValue(new Error("DB error"));

      await controller.googleAuthCallback(mockGoogleProfile, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        "http://localhost:5173/login?error=oauth_failed",
      );
    });
  });

  describe("exchangeToken", () => {
    it("유효한 코드로 요청하면 액세스 토큰을 반환하고 리프레시 토큰을 쿠키에 설정해야 한다", async () => {
      const user = createUser();
      const tokenResponse = createTokenResponse();
      mockRedisService.get.mockResolvedValue(user.id);
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockJwtService.sign
        .mockReturnValueOnce("generated-access-token")
        .mockReturnValueOnce("generated-refresh-token");

      await controller.exchangeToken("valid-code", tokenResponse);

      expect(mockRedisService.get).toHaveBeenCalledWith("valid-code");
      expect(mockRedisService.del).toHaveBeenCalledWith("valid-code");
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { id: user.id } });
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `rt:${user.id}`,
        "generated-refresh-token",
        REFRESH_TOKEN_TTL_MS,
      );
      expect(tokenResponse.cookie).toHaveBeenCalledWith(
        "refreshToken",
        "generated-refresh-token",
        expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: REFRESH_TOKEN_TTL_MS,
        }),
      );
      expect(tokenResponse.json).toHaveBeenCalledWith({
        accessToken: "generated-access-token",
      });
    });

    it("Redis에 코드가 없으면 INVALID_AUTH_CODE UnauthorizedException을 던져야 한다", async () => {
      const tokenResponse = createTokenResponse();
      mockRedisService.get.mockResolvedValue(null);

      await expect(controller.exchangeToken("invalid-code", tokenResponse)).rejects.toThrow(
        new UnauthorizedException(ERROR_CODES.INVALID_AUTH_CODE),
      );
    });

    it("코드에 대응하는 사용자가 없으면 USER_NOT_FOUND UnauthorizedException을 던져야 한다", async () => {
      const tokenResponse = createTokenResponse();
      mockRedisService.get.mockResolvedValue("nonexistent-user-id");
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(controller.exchangeToken("valid-code", tokenResponse)).rejects.toThrow(
        new UnauthorizedException(ERROR_CODES.USER_NOT_FOUND),
      );
    });
  });

  describe("refresh", () => {
    it("유효한 리프레시 토큰이면 새 토큰 쌍을 발급해야 한다", async () => {
      const user = createUser();
      const tokenResponse = createTokenResponse();
      const req = createRequestWithCookies("valid-refresh-token");
      mockJwtService.verify.mockReturnValue({
        id: user.id,
        email: user.email,
        jti: "jti-123",
      });
      mockRedisService.get.mockResolvedValue("valid-refresh-token");
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockJwtService.sign
        .mockReturnValueOnce("new-access-token")
        .mockReturnValueOnce("new-refresh-token");

      await controller.refresh(req, tokenResponse);

      expect(mockJwtService.verify).toHaveBeenCalledWith("valid-refresh-token", {
        secret: "test-jwt-refresh-secret",
      });
      expect(mockRedisService.get).toHaveBeenCalledWith(`rt:${user.id}`);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `rt:${user.id}`,
        "new-refresh-token",
        REFRESH_TOKEN_TTL_MS,
      );
      expect(tokenResponse.cookie).toHaveBeenCalledWith(
        "refreshToken",
        "new-refresh-token",
        expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: REFRESH_TOKEN_TTL_MS,
        }),
      );
      expect(tokenResponse.json).toHaveBeenCalledWith({ accessToken: "new-access-token" });
    });

    it("쿠키에 리프레시 토큰이 없으면 INVALID_REFRESH_TOKEN UnauthorizedException을 던져야 한다", async () => {
      const tokenResponse = createTokenResponse();
      const req = createRequestWithCookies();

      await expect(controller.refresh(req, tokenResponse)).rejects.toThrow(
        new UnauthorizedException(ERROR_CODES.INVALID_REFRESH_TOKEN),
      );
    });

    it("JWT 검증에 실패하면 INVALID_REFRESH_TOKEN UnauthorizedException을 던져야 한다", async () => {
      const tokenResponse = createTokenResponse();
      const req = createRequestWithCookies("expired-token");
      mockJwtService.verify.mockImplementation(() => {
        throw new Error("jwt expired");
      });

      await expect(controller.refresh(req, tokenResponse)).rejects.toThrow(
        new UnauthorizedException(ERROR_CODES.INVALID_REFRESH_TOKEN),
      );
    });

    it("Redis에 저장된 토큰과 불일치하면 INVALID_REFRESH_TOKEN UnauthorizedException을 던져야 한다", async () => {
      const tokenResponse = createTokenResponse();
      const req = createRequestWithCookies("stolen-token");
      mockJwtService.verify.mockReturnValue({
        id: "user-123",
        email: "test@example.com",
        jti: "jti-123",
      });
      mockRedisService.get.mockResolvedValue("different-stored-token");

      await expect(controller.refresh(req, tokenResponse)).rejects.toThrow(
        new UnauthorizedException(ERROR_CODES.INVALID_REFRESH_TOKEN),
      );
    });

    it("토큰은 유효하지만 사용자가 삭제되었으면 INVALID_REFRESH_TOKEN UnauthorizedException을 던져야 한다", async () => {
      const tokenResponse = createTokenResponse();
      const req = createRequestWithCookies("valid-refresh-token");
      mockJwtService.verify.mockReturnValue({
        id: "deleted-user",
        email: "deleted@example.com",
        jti: "jti-123",
      });
      mockRedisService.get.mockResolvedValue("valid-refresh-token");
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(controller.refresh(req, tokenResponse)).rejects.toThrow(
        new UnauthorizedException(ERROR_CODES.INVALID_REFRESH_TOKEN),
      );
    });
  });

  describe("guest", () => {
    it("첫 방문 게스트는 새 게스트 정보를 생성하고 토큰을 발급해야 한다", async () => {
      mockGuestRepository.getGuestInfo.mockResolvedValue(null);
      mockGuestRepository.setGuestInfo.mockResolvedValue(undefined);
      mockJwtService.sign.mockReturnValue("guest-access-token");

      const result = await controller.guest(undefined, "192.168.1.1");

      expect(mockGuestRepository.getGuestInfo).toHaveBeenCalledWith("192.168.1.1");
      expect(mockGuestRepository.setGuestInfo).toHaveBeenCalledTimes(1);
      const setGuestArg = mockGuestRepository.setGuestInfo.mock.calls[0] as [
        string,
        { remainingUses: number; createdAt: number },
      ];
      expect(setGuestArg[0]).toBe("192.168.1.1");
      expect(setGuestArg[1].remainingUses).toBe(GUEST_CONFIG.INITIAL_USES);
      expect(typeof setGuestArg[1].createdAt).toBe("number");
      expect(result).toEqual({
        accessToken: "guest-access-token",
        remainingUses: GUEST_CONFIG.INITIAL_USES,
        isGuest: true,
      });
    });

    it("재방문 게스트는 기존 정보를 반환하고 새로 생성하지 않아야 한다", async () => {
      const existingGuest = createGuestInfo({ remainingUses: 1 });
      mockGuestRepository.getGuestInfo.mockResolvedValue(existingGuest);
      mockJwtService.sign.mockReturnValue("guest-access-token");

      const result = await controller.guest(undefined, "192.168.1.1");

      expect(mockGuestRepository.setGuestInfo).not.toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: "guest-access-token",
        remainingUses: 1,
        isGuest: true,
      });
    });

    it("X-Forwarded-For 헤더가 있으면 첫 번째 IP를 사용해야 한다", async () => {
      mockGuestRepository.getGuestInfo.mockResolvedValue(createGuestInfo());
      mockJwtService.sign.mockReturnValue("guest-token");

      await controller.guest("10.0.0.1, 10.0.0.2, 10.0.0.3", "192.168.1.1");

      expect(mockGuestRepository.getGuestInfo).toHaveBeenCalledWith("10.0.0.1");
    });

    it("X-Forwarded-For가 없으면 requestIp를 사용해야 한다", async () => {
      mockGuestRepository.getGuestInfo.mockResolvedValue(createGuestInfo());
      mockJwtService.sign.mockReturnValue("guest-token");

      await controller.guest(undefined, "127.0.0.1");

      expect(mockGuestRepository.getGuestInfo).toHaveBeenCalledWith("127.0.0.1");
    });
  });

  describe("logout", () => {
    it("쿠키를 삭제하고 Redis에서 리프레시 토큰을 제거해야 한다", async () => {
      const req = createRequestWithUser({
        userId: "user-123",
        email: "test@example.com",
        isGuest: false as const,
      });
      const logoutResponse: LogoutResponse = {
        clearCookie: jest.fn(),
        json: jest.fn(),
      };

      await controller.logout(req, logoutResponse);

      expect(logoutResponse.clearCookie).toHaveBeenCalledWith("refreshToken", {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
      });
      expect(mockRedisService.del).toHaveBeenCalledWith("rt:user-123");
      expect(logoutResponse.json).toHaveBeenCalledWith({ message: "로그아웃 되었습니다." });
    });
  });

  describe("me", () => {
    it("게스트 사용자면 게스트 정보를 반환해야 한다", async () => {
      const req = createRequestWithUser({ isGuest: true as const, ip: "192.168.1.1" });
      mockGuestRepository.getGuestInfo.mockResolvedValue(createGuestInfo({ remainingUses: 2 }));

      const result = await controller.me(req);

      expect(mockGuestRepository.getGuestInfo).toHaveBeenCalledWith("192.168.1.1");
      expect(result).toEqual({
        isGuest: true,
        remainingUses: 2,
      });
    });

    it("게스트 첫 방문이면 새 게스트 정보를 생성하여 반환해야 한다", async () => {
      const req = createRequestWithUser({ isGuest: true as const, ip: "10.0.0.1" });
      mockGuestRepository.getGuestInfo.mockResolvedValue(null);

      const result = await controller.me(req);

      expect(mockGuestRepository.setGuestInfo).toHaveBeenCalledWith(
        "10.0.0.1",
        expect.objectContaining({
          remainingUses: GUEST_CONFIG.INITIAL_USES,
        }),
      );
      expect(result).toEqual({
        isGuest: true,
        remainingUses: GUEST_CONFIG.INITIAL_USES,
      });
    });

    it("인증된 사용자면 사용자 정보를 반환해야 한다", async () => {
      const req = createRequestWithUser({
        isGuest: false as const,
        userId: "user-123",
        email: "test@example.com",
      });

      const result = await controller.me(req);

      expect(result).toEqual({
        isGuest: false,
        userId: "user-123",
        email: "test@example.com",
      });
    });
  });
});

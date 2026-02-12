import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { ERROR_CODES } from "../../common/constants/error-codes";
import type { GuestJwtPayload, UserJwtPayload } from "../types/auth.types";
import { JwtStrategy } from "./jwt.strategy";

describe("JwtStrategy", () => {
  let strategy: JwtStrategy;

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue("test-jwt-secret"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtStrategy, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("JWT_SECRET을 ConfigService에서 가져와야 한다", () => {
    expect(mockConfigService.getOrThrow).toHaveBeenCalledWith("JWT_SECRET");
  });

  describe("validate", () => {
    it("사용자 토큰이면 userId, email, isGuest: false를 반환해야 한다", () => {
      const payload: UserJwtPayload = { id: "user-123", email: "test@example.com", jti: "jti-1" };

      const result = strategy.validate(payload);

      expect(result).toEqual({
        userId: "user-123",
        email: "test@example.com",
        isGuest: false,
      });
    });

    it("게스트 토큰이면 ip, isGuest: true를 반환해야 한다", () => {
      const payload: GuestJwtPayload = { ip: "127.0.0.1", isGuest: true, jti: "jti-2" };

      const result = strategy.validate(payload);

      expect(result).toEqual({
        ip: "127.0.0.1",
        isGuest: true,
      });
    });

    it("사용자 토큰에 id가 없으면 UnauthorizedException을 던져야 한다", () => {
      const payload: UserJwtPayload = { id: "", email: "test@example.com", jti: "jti-3" };

      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });

    it("사용자 토큰에 email이 없으면 UnauthorizedException을 던져야 한다", () => {
      const payload: UserJwtPayload = { id: "user-123", email: "", jti: "jti-4" };

      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });

    it("필드 누락 시 TOKEN_INVALID 에러 코드를 포함해야 한다", () => {
      const payload: UserJwtPayload = { id: "", email: "", jti: "jti-5" };

      expect(() => strategy.validate(payload)).toThrow(
        new UnauthorizedException(ERROR_CODES.TOKEN_INVALID),
      );
    });
  });
});

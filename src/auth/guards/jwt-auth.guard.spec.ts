import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test, type TestingModule } from "@nestjs/testing";
import { ERROR_CODES } from "../../common/constants/error-codes";
import { IS_PUBLIC_KEY } from "../../common/decorators/public.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";

describe("JwtAuthGuard", () => {
  let guard: JwtAuthGuard;

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  const createMockContext = (): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtAuthGuard, { provide: Reflector, useValue: mockReflector }],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("canActivate", () => {
    it("@Public 데코레이터가 있으면 true를 반환해야 한다", () => {
      mockReflector.getAllAndOverride.mockReturnValue(true);
      const context = createMockContext();

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });

    it("@Public 데코레이터가 없으면 super.canActivate를 호출해야 한다", () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      const context = createMockContext();
      const superResult = Promise.resolve(true);
      const superCanActivate = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), "canActivate")
        .mockReturnValue(superResult);

      const result = guard.canActivate(context);

      expect(result).toBe(superResult);
      superCanActivate.mockRestore();
    });
  });

  describe("handleRequest", () => {
    it("유효한 사용자가 있으면 사용자를 반환해야 한다", () => {
      const mockUser = { id: "user-1", email: "test@test.com" };

      const result = guard.handleRequest(null, mockUser, null);

      expect(result).toBe(mockUser);
    });

    it("err가 존재하면 해당 에러를 던져야 한다", () => {
      const error = new Error("some error");

      expect(() => guard.handleRequest(error, null, null)).toThrow(error);
    });

    it("err와 user가 동시에 존재하면 err를 던져야 한다", () => {
      const error = new Error("some error");
      const mockUser = { id: "user-1", email: "test@test.com" };

      expect(() => guard.handleRequest(error, mockUser, null)).toThrow(error);
    });

    it("사용자가 없고 TokenExpiredError이면 TOKEN_EXPIRED 에러를 던져야 한다", () => {
      const tokenExpiredError = new Error("jwt expired");
      tokenExpiredError.name = "TokenExpiredError";

      expect(() => guard.handleRequest(null, null, tokenExpiredError)).toThrow(
        new UnauthorizedException(ERROR_CODES.TOKEN_EXPIRED),
      );
    });

    it("사용자가 없고 토큰이 유효하지 않으면 TOKEN_INVALID 에러를 던져야 한다", () => {
      const jsonWebTokenError = new Error("invalid token");
      jsonWebTokenError.name = "JsonWebTokenError";

      expect(() => guard.handleRequest(null, null, jsonWebTokenError)).toThrow(
        new UnauthorizedException(ERROR_CODES.TOKEN_INVALID),
      );
    });

    it("info가 Error 인스턴스가 아니면 TOKEN_INVALID 에러를 던져야 한다", () => {
      expect(() => guard.handleRequest(null, null, "No auth token")).toThrow(
        new UnauthorizedException(ERROR_CODES.TOKEN_INVALID),
      );
    });

    it("사용자가 없고 info가 없으면 TOKEN_INVALID 에러를 던져야 한다", () => {
      expect(() => guard.handleRequest(null, null, null)).toThrow(
        new UnauthorizedException(ERROR_CODES.TOKEN_INVALID),
      );
    });
  });
});

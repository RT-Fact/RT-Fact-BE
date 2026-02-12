import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { SharedSecretGuard } from "./shared-secret.guard";

describe("SharedSecretGuard", () => {
  let guard: SharedSecretGuard;

  const mockConfigService = {
    get: jest.fn(),
  };

  const createMockContext = (headers: Record<string, unknown> = {}): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SharedSecretGuard, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    guard = module.get<SharedSecretGuard>(SharedSecretGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("INTERNAL_API_SECRET이 미설정이면 false를 반환해야 한다", () => {
    mockConfigService.get.mockReturnValue(undefined);
    const context = createMockContext({ "x-internal-secret": "some-value" });

    const result = guard.canActivate(context);

    expect(result).toBe(false);
  });

  it("INTERNAL_API_SECRET이 빈 문자열이면 false를 반환해야 한다", () => {
    mockConfigService.get.mockReturnValue("");
    const context = createMockContext({ "x-internal-secret": "some-value" });

    const result = guard.canActivate(context);

    expect(result).toBe(false);
  });

  it("헤더가 없으면 UnauthorizedException을 던져야 한다", () => {
    mockConfigService.get.mockReturnValue("valid-secret");
    const context = createMockContext({});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("헤더 값이 불일치하면 UnauthorizedException을 던져야 한다", () => {
    mockConfigService.get.mockReturnValue("valid-secret");
    const context = createMockContext({ "x-internal-secret": "wrong-secret" });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("헤더 값이 일치하면 true를 반환해야 한다", () => {
    mockConfigService.get.mockReturnValue("valid-secret");
    const context = createMockContext({ "x-internal-secret": "valid-secret" });

    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it("헤더 타입이 문자열이 아니면 UnauthorizedException을 던져야 한다", () => {
    mockConfigService.get.mockReturnValue("valid-secret");
    const context = createMockContext({ "x-internal-secret": ["array-value"] });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});

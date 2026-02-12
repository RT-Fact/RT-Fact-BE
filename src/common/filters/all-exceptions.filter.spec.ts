import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
  type ArgumentsHost,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { AllExceptionsFilter } from "./all-exceptions.filter";

type JsonBody = Record<string, unknown>;

type MockJsonFn = (_body: JsonBody) => void;

const createMockHost = (): {
  host: ArgumentsHost;
  mockStatus: jest.Mock;
  mockJson: jest.MockWithArgs<MockJsonFn>;
} => {
  const jsonNoop: MockJsonFn = () => {};
  const mockJson = jest.fn(jsonNoop);
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
  const host: ArgumentsHost = {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: jest.fn().mockReturnValue({ status: mockStatus }),
      getRequest: jest.fn().mockReturnValue({ method: "GET", url: "/test" }),
    }),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
    getArgs: jest.fn(),
    getArgByIndex: jest.fn(),
    getType: jest.fn(),
  };

  return { host, mockStatus, mockJson };
};

describe("AllExceptionsFilter", () => {
  let filter: AllExceptionsFilter;
  let devFilter: AllExceptionsFilter;
  let host: ArgumentsHost;
  let mockStatus: jest.Mock;
  let mockJson: jest.MockWithArgs<MockJsonFn>;

  const mockConfigService = {
    get: jest.fn().mockReturnValue("production"),
  };

  const mockDevConfigService = {
    get: jest.fn().mockReturnValue("development"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AllExceptionsFilter, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    filter = module.get<AllExceptionsFilter>(AllExceptionsFilter);

    const devModule: TestingModule = await Test.createTestingModule({
      providers: [AllExceptionsFilter, { provide: ConfigService, useValue: mockDevConfigService }],
    }).compile();

    devFilter = devModule.get<AllExceptionsFilter>(AllExceptionsFilter);

    ({ host, mockStatus, mockJson } = createMockHost());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("catch", () => {
    it("HttpException 문자열 응답에서 ERROR_MESSAGES를 조회해야 한다", () => {
      const exception = new HttpException("EMPTY_TEXT", HttpStatus.BAD_REQUEST);

      filter.catch(exception, host);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "EMPTY_TEXT",
          message: "텍스트가 비어있습니다.",
        }),
      );
    });

    it("ValidationError를 올바르게 처리해야 한다", () => {
      const exception = new BadRequestException({
        message: ["이메일 형식이 올바르지 않습니다."],
        error: "Bad Request",
      });

      filter.catch(exception, host);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "VALIDATION_ERROR",
          message: "이메일 형식이 올바르지 않습니다.",
        }),
      );
    });

    it("ValidationError 배열의 첫 메시지를 사용해야 한다", () => {
      const exception = new BadRequestException({
        message: ["첫 번째 에러", "두 번째 에러"],
        error: "Bad Request",
      });

      filter.catch(exception, host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "첫 번째 에러",
        }),
      );
    });

    it("HttpException 객체 응답에서 ERROR_MESSAGES에 있는 message를 매핑해야 한다", () => {
      const exception = new NotFoundException("FACTCHECK_NOT_FOUND");

      filter.catch(exception, host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "FACTCHECK_NOT_FOUND",
          message: "팩트체크 결과를 찾을 수 없습니다.",
        }),
      );
    });

    it("5xx 에러를 '서버 오류가 발생했습니다.'로 마스킹해야 한다", () => {
      const exception = new Error("DB connection failed");

      filter.catch(exception, host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "INTERNAL_SERVER_ERROR",
          message: "서버 오류가 발생했습니다.",
        }),
      );
    });

    it("5xx 에러의 statusCode를 500으로 통일해야 한다", () => {
      const exception = new HttpException("서버 에러", HttpStatus.BAD_GATEWAY);

      filter.catch(exception, host);

      expect(mockStatus).toHaveBeenCalledWith(500);
    });

    it("dev 환경 4xx에서 stack trace를 포함해야 한다", () => {
      const { host: capturingHost, mockJson: capturingJson } = createMockHost();
      const exception = new BadRequestException("EMPTY_TEXT");

      devFilter.catch(exception, capturingHost);

      expect(capturingJson.mock.calls[0][0]).toHaveProperty("stack");
    });

    it("production 환경에서 stack trace를 포함하지 않아야 한다", () => {
      const { host: capturingHost, mockJson: capturingJson } = createMockHost();
      const exception = new BadRequestException("EMPTY_TEXT");

      filter.catch(exception, capturingHost);

      expect(capturingJson.mock.calls[0][0]).not.toHaveProperty("stack");
    });

    it("ERROR_MESSAGES에 없는 문자열 응답은 원본을 그대로 사용해야 한다", () => {
      const exception = new HttpException("unknown", 418);

      filter.catch(exception, host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 418,
          code: "unknown",
          message: "unknown",
        }),
      );
    });

    it("일반 Error(비-HttpException)를 500으로 처리해야 한다", () => {
      const exception = new TypeError("Cannot read properties of undefined");

      filter.catch(exception, host);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          code: "INTERNAL_SERVER_ERROR",
          message: "서버 오류가 발생했습니다.",
        }),
      );
    });
  });
});

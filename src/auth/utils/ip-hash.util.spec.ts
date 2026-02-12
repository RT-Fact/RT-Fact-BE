import { hashIp } from "./ip-hash.util";

describe("hashIp", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, IP_SECRET_KEY: "test-secret-key" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("동일 IP에 대해 동일 해시를 반환해야 한다", () => {
    const hash1 = hashIp("192.168.1.1");
    const hash2 = hashIp("192.168.1.1");

    expect(hash1).toBe(hash2);
  });

  it("다른 IP에 대해 다른 해시를 반환해야 한다", () => {
    const hash1 = hashIp("192.168.1.1");
    const hash2 = hashIp("10.0.0.1");

    expect(hash1).not.toBe(hash2);
  });

  it("HMAC-SHA256 hex 형식(64자)을 반환해야 한다", () => {
    const hash = hashIp("192.168.1.1");

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("IP_SECRET_KEY가 미설정이면 에러를 던져야 한다", () => {
    delete process.env.IP_SECRET_KEY;

    expect(() => hashIp("192.168.1.1")).toThrow(
      "IP_SECRET_KEY is not defined in environment variables",
    );
  });

  it("다른 시크릿 키로 다른 해시를 생성해야 한다", () => {
    const hash1 = hashIp("192.168.1.1");

    process.env.IP_SECRET_KEY = "different-secret-key";
    const hash2 = hashIp("192.168.1.1");

    expect(hash1).not.toBe(hash2);
  });
});

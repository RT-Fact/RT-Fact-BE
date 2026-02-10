import { Test, type TestingModule } from "@nestjs/testing";
import { ClaimStatus, SentenceType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { createClaimResponse, createOpinionResponse } from "../testing/factories";
import { FactCheckRepository } from "./factcheck.repository";

describe("FactCheckRepository", () => {
  let repository: FactCheckRepository;

  const mockPrisma = {
    factCheck: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    sentence: {
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FactCheckRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repository = module.get<FactCheckRepository>(FactCheckRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("saveFactCheck", () => {
    const userId = "user-123";
    const factCheckId = "fc-123";
    const title = "테스트 제목";
    const originalText = "원본 텍스트";

    it("claim은 SentenceType.CLAIM, ClaimStatus.PENDING으로 저장해야 한다", async () => {
      const claim = createClaimResponse();
      mockPrisma.factCheck.create.mockResolvedValue(undefined);

      await repository.saveFactCheck(userId, factCheckId, title, originalText, [claim]);

      expect(mockPrisma.factCheck.create).toHaveBeenCalledWith({
        data: {
          id: factCheckId,
          userId,
          title,
          originalText,
          checkedCount: 1,
          sentences: {
            create: [
              {
                id: claim.id,
                type: SentenceType.CLAIM,
                text: claim.text,
                position: claim.position,
                verdict: claim.verdict,
                suggestion: claim.suggestion,
                sources: claim.sources,
                status: ClaimStatus.PENDING,
              },
            ],
          },
        },
      });
    });

    it("opinion은 SentenceType.OPINION으로 저장해야 한다", async () => {
      const opinion = createOpinionResponse();
      mockPrisma.factCheck.create.mockResolvedValue(undefined);

      await repository.saveFactCheck(userId, factCheckId, title, originalText, [opinion]);

      expect(mockPrisma.factCheck.create).toHaveBeenCalledWith({
        data: {
          id: factCheckId,
          userId,
          title,
          originalText,
          checkedCount: 0,
          sentences: {
            create: [
              {
                id: opinion.id,
                type: SentenceType.OPINION,
                text: opinion.text,
                position: opinion.position,
                reason: opinion.reason,
              },
            ],
          },
        },
      });
    });

    it("checkedCount를 claim 수로 계산해야 한다", async () => {
      const claim1 = createClaimResponse({ id: "c1", position: 0 });
      const opinion1 = createOpinionResponse({ id: "o1", position: 1 });
      const claim2 = createClaimResponse({
        id: "c2",
        position: 2,
        verdict: "FALSE",
        suggestion: "수정",
      });
      mockPrisma.factCheck.create.mockResolvedValue(undefined);

      await repository.saveFactCheck(userId, factCheckId, title, originalText, [
        claim1,
        opinion1,
        claim2,
      ]);

      expect(mockPrisma.factCheck.create).toHaveBeenCalledWith({
        data: {
          id: factCheckId,
          userId,
          title,
          originalText,
          checkedCount: 2,
          sentences: {
            create: [
              {
                id: claim1.id,
                type: SentenceType.CLAIM,
                text: claim1.text,
                position: claim1.position,
                verdict: claim1.verdict,
                suggestion: claim1.suggestion,
                sources: claim1.sources,
                status: ClaimStatus.PENDING,
              },
              {
                id: opinion1.id,
                type: SentenceType.OPINION,
                text: opinion1.text,
                position: opinion1.position,
                reason: opinion1.reason,
              },
              {
                id: claim2.id,
                type: SentenceType.CLAIM,
                text: claim2.text,
                position: claim2.position,
                verdict: claim2.verdict,
                suggestion: claim2.suggestion,
                sources: claim2.sources,
                status: ClaimStatus.PENDING,
              },
            ],
          },
        },
      });
    });

    it("sources를 Prisma JSON 값으로 전달해야 한다", async () => {
      const sources = [
        { title: "출처1", url: "https://a.com" },
        { title: "출처2", url: "https://b.com" },
      ];
      const claim = createClaimResponse({ sources });
      mockPrisma.factCheck.create.mockResolvedValue(undefined);

      await repository.saveFactCheck(userId, factCheckId, title, originalText, [claim]);

      expect(mockPrisma.factCheck.create).toHaveBeenCalledWith({
        data: {
          id: factCheckId,
          userId,
          title,
          originalText,
          checkedCount: 1,
          sentences: {
            create: [
              {
                id: claim.id,
                type: SentenceType.CLAIM,
                text: claim.text,
                position: claim.position,
                verdict: claim.verdict,
                suggestion: claim.suggestion,
                sources: claim.sources,
                status: ClaimStatus.PENDING,
              },
            ],
          },
        },
      });
    });
  });

  describe("findByUserId", () => {
    const userId = "user-123";

    it("올바른 skip과 take로 페이지네이션해야 한다", async () => {
      mockPrisma.factCheck.findMany.mockResolvedValue([]);
      mockPrisma.factCheck.count.mockResolvedValue(0);

      await repository.findByUserId(userId, 3, 10);

      expect(mockPrisma.factCheck.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it("createdAt desc로 정렬해야 한다", async () => {
      mockPrisma.factCheck.findMany.mockResolvedValue([]);
      mockPrisma.factCheck.count.mockResolvedValue(0);

      await repository.findByUserId(userId, 1, 10);

      expect(mockPrisma.factCheck.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: "desc" } }),
      );
    });

    it("userId로 필터링해야 한다", async () => {
      mockPrisma.factCheck.findMany.mockResolvedValue([]);
      mockPrisma.factCheck.count.mockResolvedValue(0);

      await repository.findByUserId(userId, 1, 10);

      expect(mockPrisma.factCheck.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId } }),
      );
      expect(mockPrisma.factCheck.count).toHaveBeenCalledWith({ where: { userId } });
    });

    it("필요한 필드만 select해야 한다", async () => {
      mockPrisma.factCheck.findMany.mockResolvedValue([]);
      mockPrisma.factCheck.count.mockResolvedValue(0);

      await repository.findByUserId(userId, 1, 10);

      expect(mockPrisma.factCheck.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            title: true,
            originalText: true,
            checkedCount: true,
            createdAt: true,
          },
        }),
      );
    });

    it("items와 total을 반환해야 한다", async () => {
      const mockItems = [
        {
          id: "fc-1",
          title: "제목",
          originalText: "텍스트",
          checkedCount: 2,
          createdAt: new Date(),
        },
      ];
      mockPrisma.factCheck.findMany.mockResolvedValue(mockItems);
      mockPrisma.factCheck.count.mockResolvedValue(5);

      const result = await repository.findByUserId(userId, 1, 10);

      expect(result).toEqual({ items: mockItems, total: 5 });
    });
  });

  describe("findById", () => {
    const userId = "user-123";
    const factCheckId = "fc-123";

    it("userId와 factCheckId로 조회해야 한다", async () => {
      mockPrisma.factCheck.findFirst.mockResolvedValue(null);

      await repository.findById(userId, factCheckId);

      expect(mockPrisma.factCheck.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: factCheckId, userId },
        }),
      );
    });

    it("sentences를 position 순으로 include해야 한다", async () => {
      mockPrisma.factCheck.findFirst.mockResolvedValue(null);

      await repository.findById(userId, factCheckId);

      expect(mockPrisma.factCheck.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            sentences: { orderBy: { position: "asc" } },
          },
        }),
      );
    });

    it("결과가 없으면 null을 반환해야 한다", async () => {
      mockPrisma.factCheck.findFirst.mockResolvedValue(null);

      const result = await repository.findById(userId, factCheckId);

      expect(result).toBeNull();
    });
  });

  describe("deleteById", () => {
    const userId = "user-123";
    const factCheckId = "fc-123";

    it("userId와 factCheckId로 deleteMany를 호출해야 한다", async () => {
      mockPrisma.factCheck.deleteMany.mockResolvedValue({ count: 1 });

      await repository.deleteById(userId, factCheckId);

      expect(mockPrisma.factCheck.deleteMany).toHaveBeenCalledWith({
        where: { id: factCheckId, userId },
      });
    });

    it("삭제 count > 0이면 true를 반환해야 한다", async () => {
      mockPrisma.factCheck.deleteMany.mockResolvedValue({ count: 1 });

      const result = await repository.deleteById(userId, factCheckId);

      expect(result).toBe(true);
    });

    it("삭제 count === 0이면 false를 반환해야 한다", async () => {
      mockPrisma.factCheck.deleteMany.mockResolvedValue({ count: 0 });

      const result = await repository.deleteById(userId, factCheckId);

      expect(result).toBe(false);
    });
  });

  describe("updateClaimStatus", () => {
    const userId = "user-123";
    const factCheckId = "fc-123";
    const claimId = "claim-1";

    it("CLAIM 타입 + factCheck 소유자 조건으로 updateMany를 호출해야 한다", async () => {
      mockPrisma.sentence.updateMany.mockResolvedValue({ count: 1 });

      await repository.updateClaimStatus(userId, factCheckId, claimId, ClaimStatus.APPLIED);

      expect(mockPrisma.sentence.updateMany).toHaveBeenCalledWith({
        where: {
          id: claimId,
          factCheck: { id: factCheckId, userId },
          type: SentenceType.CLAIM,
        },
        data: { status: ClaimStatus.APPLIED },
      });
    });

    it("변경 count > 0이면 true를 반환해야 한다", async () => {
      mockPrisma.sentence.updateMany.mockResolvedValue({ count: 1 });

      const result = await repository.updateClaimStatus(
        userId,
        factCheckId,
        claimId,
        ClaimStatus.IGNORED,
      );

      expect(result).toBe(true);
    });

    it("변경 count === 0이면 false를 반환해야 한다", async () => {
      mockPrisma.sentence.updateMany.mockResolvedValue({ count: 0 });

      const result = await repository.updateClaimStatus(
        userId,
        factCheckId,
        claimId,
        ClaimStatus.APPLIED,
      );

      expect(result).toBe(false);
    });
  });
});

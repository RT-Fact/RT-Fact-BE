import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/auth.types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireLogin } from "../common/decorators/require-login.decorator";
import { CreateFactCheckDto } from "./dto/create-factcheck.dto";
import type { FactCheckListResponse } from "./dto/factcheck-list-response.dto";
import type { ClaimStatusUpdateResponse, FactCheckResponse } from "./dto/factcheck-response.dto";
import { GetFactCheckListQueryDto } from "./dto/pagination-query.dto";
import { FactCheckService } from "./factcheck.service";
import type { FactCheckRequest } from "./types/factcheck.types";

@Controller("factcheck")
export class FactCheckController {
  constructor(private readonly factCheckService: FactCheckService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Request() req: FactCheckRequest,
    @Body() dto: CreateFactCheckDto,
  ): Promise<FactCheckResponse> {
    return this.factCheckService.processFactCheck(req.user, dto.text);
  }

  @Get()
  @RequireLogin()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetFactCheckListQueryDto,
  ): Promise<FactCheckListResponse> {
    return this.factCheckService.getFactCheckHistory(user, query);
  }

  @Get(":id")
  @RequireLogin()
  async findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<FactCheckResponse> {
    return this.factCheckService.getFactCheckById(user, id);
  }

  @Delete(":id")
  @RequireLogin()
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<{ success: boolean }> {
    return this.factCheckService.deleteFactCheck(user, id);
  }

  @Patch(":id/claims/:claimId/apply")
  @HttpCode(HttpStatus.OK)
  async apply(
    @Request() req: FactCheckRequest,
    @Param("id") id: string,
    @Param("claimId") claimId: string,
  ): Promise<ClaimStatusUpdateResponse> {
    return this.factCheckService.applyClaim(req.user, id, claimId);
  }

  @Patch(":id/claims/:claimId/ignore")
  @HttpCode(HttpStatus.OK)
  async ignore(
    @Request() req: FactCheckRequest,
    @Param("id") id: string,
    @Param("claimId") claimId: string,
  ): Promise<ClaimStatusUpdateResponse> {
    return this.factCheckService.ignoreClaim(req.user, id, claimId);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
} from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireLogin } from "../common/decorators/require-login.decorator";
import { CreateFactCheckDto } from "./dto/create-factcheck.dto";
import { FactCheckListResponse } from "./dto/factcheck-list-response.dto";
import { FactCheckResponse } from "./dto/factcheck-response.dto";
import { GetFactCheckListQueryDto } from "./dto/pagination-query.dto";
import { FactCheckService } from "./factcheck.service";
import type { AuthenticatedUser, RequestWithUser } from "./types/factcheck.types";

@Controller("factcheck")
export class FactCheckController {
  constructor(private readonly factCheckService: FactCheckService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Request() req: RequestWithUser,
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
    return this.factCheckService.getFactCheckList(user, query);
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
}

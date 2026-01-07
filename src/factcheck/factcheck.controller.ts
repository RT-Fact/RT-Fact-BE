import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Request } from "@nestjs/common";
import { CreateFactCheckDto } from "./dto/create-factcheck.dto";
import { FactCheckListResponse } from "./dto/factcheck-list-response.dto";
import { FactCheckResponse } from "./dto/factcheck-response.dto";
import { GetFactCheckListQueryDto } from "./dto/pagination-query.dto";
import { FactCheckService } from "./factcheck.service";
import { RequestWithUser } from "./types/factcheck.types";

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
  async findAll(
    @Request() req: RequestWithUser,
    @Query() query: GetFactCheckListQueryDto,
  ): Promise<FactCheckListResponse> {
    return this.factCheckService.getFactCheckList(req.user, query);
  }
}

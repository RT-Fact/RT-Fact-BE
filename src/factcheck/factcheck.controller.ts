import { Body, Controller, HttpCode, HttpStatus, Post, Request } from "@nestjs/common";
import { CreateFactCheckDto } from "./dto/create-factcheck.dto";
import { FactCheckResponse } from "./dto/factcheck-response.dto";
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
}

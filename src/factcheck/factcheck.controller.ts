import { Body, Controller, HttpCode, HttpStatus, Post, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CreateFactCheckDto } from "./dto/create-factcheck.dto";
import { FactCheckResponse } from "./dto/factcheck-response.dto";
import { FactCheckService } from "./factcheck.service";

interface AuthenticatedUser {
  userId: string;
  email: string;
  isGuest: false;
}

interface GuestUser {
  ip: string;
  isGuest: true;
}

type RequestUser = AuthenticatedUser | GuestUser;

interface RequestWithUser {
  user: RequestUser;
}

@Controller("factcheck")
export class FactCheckController {
  constructor(private readonly factCheckService: FactCheckService) {}

  @Post()
  @UseGuards(AuthGuard("jwt"))
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Request() req: RequestWithUser,
    @Body() dto: CreateFactCheckDto,
  ): Promise<FactCheckResponse> {
    return this.factCheckService.processFactCheck(req.user, dto.text);
  }
}

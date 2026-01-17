import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { User } from "@prisma/client";
import { LoginGuard } from "../auth/guards/login.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ApiKeysService } from "./api-keys.service";
import { CreateApiKeyDto } from "./dto/create-api-key.dto";
import { VerifyApiKeyDto } from "./dto/verify-api-key.dto";
import type {
  ApiKeyInfo,
  ApiKeyVerificationResult,
  CreatedApiKeyInfo,
} from "./types/api-key.types";

@Controller("api-keys")
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @UseGuards(LoginGuard)
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateApiKeyDto,
  ): Promise<CreatedApiKeyInfo> {
    return this.apiKeysService.createApiKey(user.id, dto);
  }

  @Get()
  @UseGuards(LoginGuard)
  async findAll(@CurrentUser() user: User): Promise<ApiKeyInfo[]> {
    return this.apiKeysService.listApiKeys(user.id);
  }

  @Delete(":id")
  @UseGuards(LoginGuard)
  async remove(@CurrentUser() user: User, @Param("id") id: string): Promise<{ success: boolean }> {
    return this.apiKeysService.deleteApiKey(user.id, id);
  }

  @Post("verify")
  async verify(@Body() dto: VerifyApiKeyDto): Promise<ApiKeyVerificationResult> {
    return this.apiKeysService.verifyApiKey(dto.key);
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { SharedSecretGuard } from "../auth/guards/shared-secret.guard";
import { AuthenticatedUser } from "../auth/types/auth.types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { RequireLogin } from "../common/decorators/require-login.decorator";
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
  @RequireLogin()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApiKeyDto,
  ): Promise<CreatedApiKeyInfo> {
    return this.apiKeysService.createApiKey(user.userId, dto);
  }

  @Get()
  @RequireLogin()
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<ApiKeyInfo[]> {
    return this.apiKeysService.listApiKeys(user.userId);
  }

  @Delete(":id")
  @RequireLogin()
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<{ success: boolean }> {
    return this.apiKeysService.deleteApiKey(user.userId, id);
  }

  @Post("verify")
  @Public()
  @UseGuards(SharedSecretGuard)
  @HttpCode(200)
  async verify(@Body() dto: VerifyApiKeyDto): Promise<ApiKeyVerificationResult> {
    return this.apiKeysService.verifyApiKey(dto.key);
  }
}

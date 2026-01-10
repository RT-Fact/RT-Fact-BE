import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/types/auth.types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireLogin } from "../common/decorators/require-login.decorator";
import { CreateDomainDto } from "./dto/create-domain.dto";
import { SettingsService } from "./settings.service";

@Controller("settings")
@RequireLogin()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getSettings(user.userId);
  }

  @Post("whitelist")
  @HttpCode(HttpStatus.CREATED)
  async addWhitelist(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDomainDto) {
    return this.settingsService.addWhitelist(user.userId, dto.domain);
  }

  @Delete("whitelist/:domain")
  async deleteWhitelist(@CurrentUser() user: AuthenticatedUser, @Param("domain") domain: string) {
    return this.settingsService.deleteWhitelist(user.userId, domain);
  }

  @Post("blacklist")
  @HttpCode(HttpStatus.CREATED)
  async addBlacklist(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDomainDto) {
    return this.settingsService.addBlacklist(user.userId, dto.domain);
  }

  @Delete("blacklist/:domain")
  async deleteBlacklist(@CurrentUser() user: AuthenticatedUser, @Param("domain") domain: string) {
    return this.settingsService.deleteBlacklist(user.userId, domain);
  }
}

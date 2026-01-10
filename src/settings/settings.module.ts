import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DomainFilterRepository } from "./repositories/domain-filter.repository";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";

@Module({
  imports: [PrismaModule],
  controllers: [SettingsController],
  providers: [SettingsService, DomainFilterRepository],
})
export class SettingsModule {}

import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { McpModule } from "../mcp/mcp.module";
import { PrismaModule } from "../prisma/prisma.module";
import { FactCheckController } from "./factcheck.controller";
import { FactCheckService } from "./factcheck.service";
import { FactCheckRepository } from "./repositories/factcheck.repository";

@Module({
  imports: [McpModule, AuthModule, PrismaModule],
  controllers: [FactCheckController],
  providers: [FactCheckService, FactCheckRepository],
  exports: [FactCheckService],
})
export class FactCheckModule {}

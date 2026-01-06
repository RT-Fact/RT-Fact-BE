import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { McpModule } from "../mcp/mcp.module";
import { PrismaModule } from "../prisma/prisma.module";
import { FactCheckController } from "./factcheck.controller";
import { FactCheckService } from "./factcheck.service";

@Module({
  imports: [McpModule, AuthModule, PrismaModule],
  controllers: [FactCheckController],
  providers: [FactCheckService],
  exports: [FactCheckService],
})
export class FactCheckModule {}

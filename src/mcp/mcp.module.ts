import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { McpService } from "./mcp.service";

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
    }),
  ],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule {}

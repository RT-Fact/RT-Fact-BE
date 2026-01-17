import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RedisModule } from "../redis/redis.module";
import { ApiKeysController } from "./api-keys.controller";
import { ApiKeysService } from "./api-keys.service";
import { ApiKeysRepository } from "./repositories/api-keys.repository";

@Module({
  imports: [PrismaModule, RedisModule, AuthModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeysRepository],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}

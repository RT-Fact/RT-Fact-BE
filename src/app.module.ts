import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import * as Joi from "joi";
import { ApiKeysModule } from "./api-keys/api-keys.module";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { LoginGuard } from "./auth/guards/login.guard";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { FactCheckModule } from "./factcheck/factcheck.module";
import { McpModule } from "./mcp/mcp.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { SettingsModule } from "./settings/settings.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      validationSchema: Joi.object({
        // Database
        DATABASE_URL: Joi.string().required(),
        // Redis
        REDIS_URL: Joi.string().required(),
        // JWT
        JWT_SECRET: Joi.string().required(),
        JWT_REFRESH_SECRET: Joi.string().required(),
        // IP Hashing
        IP_SECRET_KEY: Joi.string().length(64).required(),
        // Google OAuth
        GOOGLE_CLIENT_ID: Joi.string().required(),
        GOOGLE_CLIENT_SECRET: Joi.string().required(),
        GOOGLE_CALLBACK_URL: Joi.string().uri(),
        // Frontend
        FRONTEND_URL: Joi.string().uri(),
        // MCP Server
        MCP_SERVER_URL: Joi.string().uri().required(),
        // API Keys
        API_KEY_MAX_PER_USER: Joi.number().default(5),
      }),
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    ApiKeysModule,
    McpModule,
    FactCheckModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: LoginGuard,
    },
  ],
})
export class AppModule {}

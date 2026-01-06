import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import * as Joi from "joi";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { FactCheckModule } from "./factcheck/factcheck.module";
import { McpModule } from "./mcp/mcp.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";

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
      }),
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    McpModule,
    FactCheckModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

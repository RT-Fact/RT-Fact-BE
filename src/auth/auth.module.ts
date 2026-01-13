import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../prisma/prisma.module";
import { RedisModule } from "../redis/redis.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { LoginGuard } from "./guards/login.guard";
import { GuestRepository } from "./repositories/guest.repository";
import { GoogleStrategy } from "./strategies/google.strategy";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({}),
    PrismaModule,
    RedisModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, GuestRepository, GoogleStrategy, JwtStrategy, JwtAuthGuard, LoginGuard],
  exports: [AuthService, GuestRepository, JwtAuthGuard, LoginGuard],
})
export class AuthModule {}

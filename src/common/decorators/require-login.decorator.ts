import { SetMetadata } from "@nestjs/common";

export const REQUIRE_LOGIN_KEY = "requireLogin";
export const RequireLogin = () => SetMetadata(REQUIRE_LOGIN_KEY, true);

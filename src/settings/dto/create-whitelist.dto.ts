import { IsString, Matches } from "class-validator";

export class CreateWhitelistDto {
  @IsString()
  @Matches(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/,
    {
      message: "INVALID_DOMAIN",
    },
  )
  domain: string;
}

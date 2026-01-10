import { IsString, Matches } from "class-validator";

export class CreateDomainDto {
  @IsString()
  @Matches(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/,
    {
      message: "INVALID_DOMAIN",
    },
  )
  domain: string;
}

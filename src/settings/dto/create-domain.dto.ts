import { Transform } from "class-transformer";
import { IsString, Matches } from "class-validator";

export class CreateDomainDto {
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  @Matches(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/,
    {
      message: "INVALID_DOMAIN",
    },
  )
  domain: string;
}

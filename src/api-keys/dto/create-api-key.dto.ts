import { IsString, Length, Matches } from "class-validator";

export class CreateApiKeyDto {
  @IsString()
  @Length(1, 50)
  @Matches(/^[a-zA-Z0-9\s\-_]+$/, {
    message: "이름은 영문, 숫자, 공백, 하이픈(-), 언더바(_)만 포함할 수 있습니다.",
  })
  name: string;
}

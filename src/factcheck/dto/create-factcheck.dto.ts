import { IsNotEmpty, IsString } from "class-validator";

export class CreateFactCheckDto {
  @IsString()
  @IsNotEmpty({ message: "EMPTY_TEXT" })
  text: string;
}

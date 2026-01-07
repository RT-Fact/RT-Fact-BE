import { Transform, Type, type TransformFnParams } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

export class GetFactCheckListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }: TransformFnParams) => (value as number) ?? DEFAULT_PAGE)
  @IsInt()
  @Min(1)
  page: number = DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }: TransformFnParams) => (value as number) ?? DEFAULT_LIMIT)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = DEFAULT_LIMIT;
}

import { IsNotEmpty, IsString, Matches } from "class-validator";
import { ERROR_MESSAGES } from "../../common/constants/error-messages";
import { API_KEY_PREFIX } from "../constants";

export class VerifyApiKeyDto {
  @IsString({ message: ERROR_MESSAGES.VALIDATION_ERROR })
  @IsNotEmpty({ message: ERROR_MESSAGES.VALIDATION_ERROR })
  @Matches(new RegExp(`^${API_KEY_PREFIX}`), {
    message: ERROR_MESSAGES.INVALID_API_KEY_FORMAT,
  })
  key: string;
}

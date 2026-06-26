import { redactSecrets } from "../core/security/secretsRedactor.js";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly userMessage = "Something went wrong."
  ) {
    super(redactSecrets(message));
  }
}

export function userError(message: string, statusCode = 400): AppError {
  return new AppError(message, statusCode, message);
}

export function asUserMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.userMessage;
  }

  if (error instanceof Error) {
    const message = redactSecrets(error.message);
    if (message.toLowerCase() === "fetch failed") {
      return "Provider connection failed. Check internet access, the saved API key, or provider availability.";
    }
    return message;
  }

  return "Something went wrong.";
}

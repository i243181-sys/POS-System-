const INTERNAL_ERROR_PATTERN =
  /(SQLITE|constraint|database|prepare|stack|TypeError|ReferenceError|SyntaxError|ENOENT|EACCES|EPERM|path|no such table|foreign key|unique constraint)/i

export class PublicError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublicError'
  }
}

export function publicErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof PublicError) return error.message
  if (!(error instanceof Error) || !error.message) return fallback
  if (INTERNAL_ERROR_PATTERN.test(error.message)) return fallback
  return error.message.slice(0, 240)
}

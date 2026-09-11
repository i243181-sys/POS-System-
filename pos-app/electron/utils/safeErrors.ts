export class PublicError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublicError'
  }
}

export function publicErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return error instanceof PublicError ? error.message : fallback
}

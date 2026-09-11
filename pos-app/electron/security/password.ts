export function passwordError(password: string, minimum = 12): string | null {
  if (password.length < minimum || Buffer.byteLength(password, 'utf8') > 72) {
    return `Password must contain at least ${minimum} characters and at most 72 UTF-8 bytes.`
  }
  return null
}

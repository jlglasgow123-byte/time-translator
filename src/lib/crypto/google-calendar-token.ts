import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const PREFIX = 'ttenc:v1:'
const ALGORITHM = 'aes-256-gcm'

function encryptionKey() {
  const secret = process.env.JIRA_TOKEN_ENCRYPTION_KEY
  if (!secret) {
    throw new Error('JIRA_TOKEN_ENCRYPTION_KEY is required to encrypt Google Calendar tokens')
  }

  return createHash('sha256').update(secret).digest()
}

export function encryptGoogleCalendarToken(token: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function decryptGoogleCalendarToken(value: string) {
  if (!value.startsWith(PREFIX)) throw new Error('Stored Google Calendar token is not encrypted — possible data integrity issue')

  const payload = value.slice(PREFIX.length)
  const [ivRaw, tagRaw, encryptedRaw] = payload.split('.')

  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('Stored Google Calendar token is not in a valid encrypted format')
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(ivRaw, 'base64url')
  )

  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

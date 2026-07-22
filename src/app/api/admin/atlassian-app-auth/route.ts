import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/admin'
import { randomBytes, createHmac } from 'crypto'

function stateSecret() {
  const s = process.env.JIRA_TOKEN_ENCRYPTION_KEY
  if (!s) throw new Error('JIRA_TOKEN_ENCRYPTION_KEY not set')
  return s
}

export async function GET() {
  const { isPlatformAdmin } = await requirePlatformAdmin()
  if (!isPlatformAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const nonce = randomBytes(16).toString('hex')
  const sig = createHmac('sha256', stateSecret()).update(nonce).digest('hex')
  const state = `${nonce}.${sig}`

  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: process.env.ATLASSIAN_CLIENT_ID!,
    scope: 'read:account offline_access',
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/atlassian-app-auth/callback`,
    state,
    response_type: 'code',
    prompt: 'consent',
  })

  return NextResponse.redirect(`https://auth.atlassian.com/authorize?${params}`)
}

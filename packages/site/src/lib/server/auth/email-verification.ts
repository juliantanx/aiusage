import { createHash } from 'node:crypto'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { Resend } from 'resend'
import { env } from '$env/dynamic/private'
import { nanoid } from 'nanoid'
import { sql } from '$lib/server/db/pool.js'
import { getConfigValue, CFG } from '$lib/server/config.js'

const PURPOSE = 'email_verification'

let sesClient: SESv2Client | null = null
let resendClient: Resend | null = null

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function hashValue(value: string): string {
  return createHash('sha256').update(`${env.IP_HASH_SECRET || 'default-ip-hash-secret'}:${value}`).digest('hex')
}

function getSiteUrl(): string {
  return (env.SITE_URL || 'http://localhost:5173').replace(/\/$/, '')
}

function getSesClient(): SESv2Client {
  if (!sesClient) {
    sesClient = new SESv2Client({
      region: env.AWS_SES_REGION || 'us-west-2',
      credentials: env.AWS_SES_ACCESS_KEY_ID && env.AWS_SES_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.AWS_SES_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY
          }
        : undefined
    })
  }
  return sesClient
}

function hasSesConfig(): boolean {
  return env.EMAIL_PROVIDER === 'ses' && Boolean(env.AWS_SES_ACCESS_KEY_ID && env.AWS_SES_SECRET_ACCESS_KEY)
}

function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY)
  }
  return resendClient
}

function hasResendConfig(): boolean {
  return env.EMAIL_PROVIDER === 'resend' && Boolean(env.RESEND_API_KEY)
}

export async function createEmailVerification(userId: string, email: string): Promise<string> {
  const tokenTtlHours = await getConfigValue(CFG.EMAIL_TOKEN_TTL_HOURS)
  const token = nanoid(48)
  const expiresAt = new Date(Date.now() + tokenTtlHours * 60 * 60 * 1000)

  await sql`
    INSERT INTO email_verification_tokens (id, user_id, email, token_hash, expires_at)
    VALUES (${nanoid()}, ${userId}, ${email}, ${hashToken(token)}, ${expiresAt})
  `

  return `${getSiteUrl()}/verify-email?token=${encodeURIComponent(token)}`
}

export async function checkVerificationEmailRateLimit(ip: string, email: string): Promise<string | null> {
  const [
    ipLimitWindowMinutes,
    ipLimit,
    emailLimitWindowHours,
    emailLimit,
    globalLimitWindowHours,
    globalLimit
  ] = await Promise.all([
    getConfigValue(CFG.EMAIL_IP_LIMIT_WINDOW_MINUTES),
    getConfigValue(CFG.EMAIL_IP_LIMIT),
    getConfigValue(CFG.EMAIL_LIMIT_WINDOW_HOURS),
    getConfigValue(CFG.EMAIL_LIMIT),
    getConfigValue(CFG.EMAIL_GLOBAL_LIMIT_WINDOW_HOURS),
    getConfigValue(CFG.EMAIL_GLOBAL_LIMIT)
  ])

  const ipHash = hashValue(ip)
  const emailHash = hashValue(email)

  const [ipRows, emailRows, globalRows] = await Promise.all([
    sql`
      SELECT COUNT(*)::INTEGER AS count
      FROM email_send_attempts
      WHERE purpose = ${PURPOSE}
        AND ip_hash = ${ipHash}
        AND created_at > NOW() - (${`${ipLimitWindowMinutes} minutes`})::INTERVAL
    `,
    sql`
      SELECT COUNT(*)::INTEGER AS count
      FROM email_send_attempts
      WHERE purpose = ${PURPOSE}
        AND email_hash = ${emailHash}
        AND created_at > NOW() - (${`${emailLimitWindowHours} hours`})::INTERVAL
    `,
    sql`
      SELECT COUNT(*)::INTEGER AS count
      FROM email_send_attempts
      WHERE purpose = ${PURPOSE}
        AND created_at > NOW() - (${`${globalLimitWindowHours} hours`})::INTERVAL
    `
  ])

  if (Number(ipRows[0]?.count || 0) >= ipLimit) {
    return 'Too many registration attempts from this network. Please try again later.'
  }
  if (Number(emailRows[0]?.count || 0) >= emailLimit) {
    return 'Too many verification emails for this address. Please try again later.'
  }
  if (Number(globalRows[0]?.count || 0) >= globalLimit) {
    return 'Email sending is temporarily rate limited. Please try again later.'
  }

  return null
}

export async function recordVerificationEmailAttempt(ip: string, email: string): Promise<void> {
  const retentionDays = await getConfigValue(CFG.EMAIL_SEND_ATTEMPT_RETENTION_DAYS)

  await sql`
    INSERT INTO email_send_attempts (id, purpose, ip_hash, email_hash)
    VALUES (${nanoid()}, ${PURPOSE}, ${hashValue(ip)}, ${hashValue(email)})
  `

  await sql`
    DELETE FROM email_send_attempts
    WHERE created_at < NOW() - (${`${retentionDays} days`})::INTERVAL
  `
}

export async function sendVerificationEmail(email: string, username: string, verificationUrl: string): Promise<void> {
  const tokenTtlHours = await getConfigValue(CFG.EMAIL_TOKEN_TTL_HOURS)

  const subject = 'Verify your AIUsage email'
  const text = [
    `Hi ${username},`,
    '',
    'Open this link to verify your AIUsage email address:',
    verificationUrl,
    '',
    `This link expires in ${tokenTtlHours} hours.`
  ].join('\n')

  const html = [
    `<p>Hi ${escapeHtml(username)},</p>`,
    '<p>Open this link to verify your AIUsage email address:</p>',
    `<p><a href="${verificationUrl}">Verify email address</a></p>`,
    `<p>This link expires in ${tokenTtlHours} hours.</p>`
  ].join('')

  if (hasSesConfig()) {
    await getSesClient().send(new SendEmailCommand({
      FromEmailAddress: env.EMAIL_FROM || 'AIUsage <noreply@jtanx.com>',
      Destination: {
        ToAddresses: [email]
      },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: text, Charset: 'UTF-8' },
            Html: { Data: html, Charset: 'UTF-8' }
          }
        }
      }
    }))
    return
  }

  if (hasResendConfig()) {
    const { error } = await getResendClient().emails.send({
      from: env.EMAIL_FROM || 'AIUsage <noreply@aiusage.jtanx.com>',
      to: email,
      subject,
      text,
      html
    })
    if (error) {
      throw new Error(`Resend error: ${error.message}`)
    }
    return
  }

  if (!env.EMAIL_WEBHOOK_URL) {
    console.info(`[email] Verification link for ${email}: ${verificationUrl}`)
    return
  }

  const response = await fetch(env.EMAIL_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      to: email,
      from: env.EMAIL_FROM || 'AIUsage <noreply@aiusage.local>',
      subject,
      text,
      html
    })
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Email webhook failed: ${response.status} ${detail}`)
  }
}

export async function consumeEmailVerificationToken(token: string): Promise<{ userId: string; email: string } | null> {
  const rows = await sql.begin(async (tx) => {
    const matches = await tx`
      SELECT id, user_id, email
      FROM email_verification_tokens
      WHERE token_hash = ${hashToken(token)}
        AND consumed_at IS NULL
        AND expires_at > NOW()
      FOR UPDATE
    `
    const match = matches[0] as { id: string; user_id: string; email: string } | undefined
    if (!match) return []

    await tx`UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = ${match.user_id} AND email = ${match.email}`
    await tx`UPDATE email_verification_tokens SET consumed_at = NOW() WHERE id = ${match.id}`
    await tx`UPDATE email_verification_tokens SET consumed_at = NOW() WHERE user_id = ${match.user_id} AND consumed_at IS NULL`

    return [{ userId: match.user_id, email: match.email }]
  })

  return rows[0] || null
}

// ── Password Reset ──

const RESET_PURPOSE = 'password_reset'

export async function createPasswordResetToken(userId: string): Promise<string> {
  const tokenTtlHours = await getConfigValue(CFG.EMAIL_TOKEN_TTL_HOURS)
  const token = nanoid(48)
  const expiresAt = new Date(Date.now() + tokenTtlHours * 60 * 60 * 1000)

  await sql`
    INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
    VALUES (${nanoid()}, ${userId}, ${hashToken(token)}, ${expiresAt})
  `

  return `${getSiteUrl()}/reset-password?token=${encodeURIComponent(token)}`
}

export async function checkPasswordResetRateLimit(ip: string, email: string): Promise<string | null> {
  const [
    ipLimitWindowMinutes,
    ipLimit,
    emailLimitWindowHours,
    emailLimit,
  ] = await Promise.all([
    getConfigValue(CFG.EMAIL_IP_LIMIT_WINDOW_MINUTES),
    getConfigValue(CFG.EMAIL_IP_LIMIT),
    getConfigValue(CFG.EMAIL_LIMIT_WINDOW_HOURS),
    getConfigValue(CFG.EMAIL_LIMIT),
  ])

  const ipHash = hashValue(ip)
  const emailHash = hashValue(email)

  const [ipRows, emailRows] = await Promise.all([
    sql`
      SELECT COUNT(*)::INTEGER AS count
      FROM email_send_attempts
      WHERE purpose = ${RESET_PURPOSE}
        AND ip_hash = ${ipHash}
        AND created_at > NOW() - (${`${ipLimitWindowMinutes} minutes`})::INTERVAL
    `,
    sql`
      SELECT COUNT(*)::INTEGER AS count
      FROM email_send_attempts
      WHERE purpose = ${RESET_PURPOSE}
        AND email_hash = ${emailHash}
        AND created_at > NOW() - (${`${emailLimitWindowHours} hours`})::INTERVAL
    `,
  ])

  if (Number(ipRows[0]?.count || 0) >= ipLimit) {
    return 'Too many reset attempts from this network. Please try again later.'
  }
  if (Number(emailRows[0]?.count || 0) >= emailLimit) {
    return 'Too many reset emails for this address. Please try again later.'
  }

  return null
}

export async function recordPasswordResetAttempt(ip: string, email: string): Promise<void> {
  await sql`
    INSERT INTO email_send_attempts (id, purpose, ip_hash, email_hash)
    VALUES (${nanoid()}, ${RESET_PURPOSE}, ${hashValue(ip)}, ${hashValue(email)})
  `
}

export async function sendPasswordResetEmail(email: string, username: string, resetUrl: string): Promise<void> {
  console.info(`[email] Password reset link for ${email}: ${resetUrl}`)
  const tokenTtlHours = await getConfigValue(CFG.EMAIL_TOKEN_TTL_HOURS)

  const subject = 'Reset your AIUsage password'
  const text = [
    `Hi ${username},`,
    '',
    'Open this link to reset your AIUsage password:',
    resetUrl,
    '',
    `This link expires in ${tokenTtlHours} hours.`,
    '',
    'If you did not request this, you can safely ignore this email.'
  ].join('\n')

  const html = [
    `<p>Hi ${escapeHtml(username)},</p>`,
    '<p>Open this link to reset your AIUsage password:</p>',
    `<p><a href="${resetUrl}">Reset password</a></p>`,
    `<p>This link expires in ${tokenTtlHours} hours.</p>`,
    '<p>If you did not request this, you can safely ignore this email.</p>'
  ].join('')

  if (hasSesConfig()) {
    await getSesClient().send(new SendEmailCommand({
      FromEmailAddress: env.EMAIL_FROM || 'AIUsage <noreply@jtanx.com>',
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: text, Charset: 'UTF-8' },
            Html: { Data: html, Charset: 'UTF-8' }
          }
        }
      }
    }))
    return
  }

  if (hasResendConfig()) {
    const { error } = await getResendClient().emails.send({
      from: env.EMAIL_FROM || 'AIUsage <noreply@aiusage.jtanx.com>',
      to: email,
      subject,
      text,
      html
    })
    if (error) throw new Error(`Resend error: ${error.message}`)
    return
  }

  if (!env.EMAIL_WEBHOOK_URL) {
    console.info(`[email] Password reset link for ${email}: ${resetUrl}`)
    return
  }

  const response = await fetch(env.EMAIL_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      to: email,
      from: env.EMAIL_FROM || 'AIUsage <noreply@aiusage.local>',
      subject,
      text,
      html
    })
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Email webhook failed: ${response.status} ${detail}`)
  }
}

export async function consumePasswordResetToken(token: string): Promise<{ userId: string } | null> {
  const rows = await sql.begin(async (tx) => {
    const matches = await tx`
      SELECT id, user_id
      FROM password_reset_tokens
      WHERE token_hash = ${hashToken(token)}
        AND consumed_at IS NULL
        AND expires_at > NOW()
      FOR UPDATE
    `
    const match = matches[0] as { id: string; user_id: string } | undefined
    if (!match) return []

    // Consume this token and invalidate all other pending tokens for this user
    await tx`UPDATE password_reset_tokens SET consumed_at = NOW() WHERE id = ${match.id}`
    await tx`UPDATE password_reset_tokens SET consumed_at = NOW() WHERE user_id = ${match.user_id} AND consumed_at IS NULL`

    return [{ userId: match.user_id }]
  })

  return rows[0] || null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Branded HTML email template for AIUsage transactional emails.
 * Uses table-based layout for maximum email client compatibility.
 */

const BRAND_COLOR = '#0d9488'
const BRAND_COLOR_DARK = '#0f766e'
const BG_COLOR = '#f8fafc'
const CARD_BG = '#ffffff'
const TEXT_COLOR = '#1e293b'
const TEXT_MUTED = '#64748b'
const BORDER_COLOR = '#e2e8f0'

// Base64-encoded PNG of the AIUsage icon (teal bars chart, 64x64)
// For email clients that don't support SVG
const LOGO_URL = 'https://aiusage.jtanx.com/logo-icon.svg'

export interface EmailButton {
  label: string
  url: string
}

export function wrapBrandedEmail(options: {
  title: string
  preheader?: string
  greeting: string
  bodyHtml: string
  button?: EmailButton
  footerHtml?: string
}): string {
  const { title, preheader, greeting, bodyHtml, button, footerHtml } = options

  const buttonHtml = button ? `
    <tr>
      <td style="padding: 8px 0 24px 0;">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="border-radius: 8px; background: ${BRAND_COLOR};">
              <a href="${button.url}"
                 style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; background: ${BRAND_COLOR};"
              >${button.label}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : ''

  const footerSection = footerHtml ? `
    <tr>
      <td style="padding: 16px 0 0 0; border-top: 1px solid ${BORDER_COLOR}; font-size: 13px; color: ${TEXT_MUTED}; line-height: 1.6;">
        ${footerHtml}
      </td>
    </tr>` : ''

  // preheader is hidden text shown in email client preview
  const preheaderSpan = preheader
    ? `<span style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: ${BG_COLOR};">${preheader}</span>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background: ${BG_COLOR}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: ${TEXT_COLOR};">
  ${preheaderSpan}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: ${BG_COLOR};">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 520px;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <img src="${LOGO_URL}" alt="AIUsage" width="48" height="48" style="display: block; border-radius: 10px;">
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background: ${CARD_BG}; border-radius: 12px; border: 1px solid ${BORDER_COLOR}; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <!-- Title -->
                <tr>
                  <td style="font-size: 20px; font-weight: 700; color: ${TEXT_COLOR}; padding-bottom: 16px;">
                    ${title}
                  </td>
                </tr>
                <!-- Greeting -->
                <tr>
                  <td style="font-size: 15px; color: ${TEXT_COLOR}; line-height: 1.6; padding-bottom: 12px;">
                    ${greeting}
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="font-size: 15px; color: ${TEXT_COLOR}; line-height: 1.6; padding-bottom: 8px;">
                    ${bodyHtml}
                  </td>
                </tr>
                <!-- Button -->
                ${buttonHtml}
                <!-- Footer -->
                ${footerSection}
              </table>
            </td>
          </tr>
          <!-- Brand footer -->
          <tr>
            <td align="center" style="padding-top: 24px; font-size: 12px; color: ${TEXT_MUTED}; line-height: 1.5;">
              AIUsage &mdash; Track your AI usage across tools and models<br>
              <a href="https://aiusage.jtanx.com" style="color: ${BRAND_COLOR}; text-decoration: none;">aiusage.jtanx.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

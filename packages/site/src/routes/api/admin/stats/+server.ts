import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/auth/session.js'
import { sql } from '$lib/server/db/pool.js'

export const GET: RequestHandler = async (event) => {
  await requireAdmin(event)

  const [users, flagged, priceTables, logs] = await Promise.all([
    sql`SELECT COUNT(*)::INTEGER AS count FROM users`,
    sql`SELECT COUNT(*)::INTEGER AS count FROM upload_snapshots WHERE status = 'flagged' AND review_status IS NULL`,
    sql`SELECT COUNT(*)::INTEGER AS count FROM official_price_entries e JOIN official_price_tables t ON t.id = e.table_id WHERE t.status = 'published'`,
    sql`SELECT COUNT(*)::INTEGER AS count FROM admin_audit_logs`,
  ])

  return json({
    users: (users[0] as { count: number }).count,
    flaggedUploads: (flagged[0] as { count: number }).count,
    priceModels: (priceTables[0] as { count: number }).count,
    auditLogs: (logs[0] as { count: number }).count,
  })
}

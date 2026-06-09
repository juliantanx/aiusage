import { sql } from '$lib/server/db/pool.js'

interface ConfigEntry {
  value: number
  updatedAt: number
}

const CACHE_TTL_MS = 60_000
const cache = new Map<string, ConfigEntry>()

async function readConfig(key: string): Promise<number | null> {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
    return cached.value
  }

  try {
    const rows = await sql`SELECT value FROM site_config WHERE key = ${key}`
    const row = rows[0] as { value: number } | undefined
    if (row) {
      cache.set(key, { value: row.value, updatedAt: Date.now() })
      return row.value
    }
  } catch {
    // DB unavailable (e.g. tests without DB) — fall back to default
  }
  return null
}

export async function getConfig(key: string, defaultValue: number): Promise<number> {
  const val = await readConfig(key)
  return val ?? defaultValue
}

function getConfigSync(key: string, defaultValue: number): number {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
    return cached.value
  }
  return defaultValue
}

export async function setConfig(key: string, value: number, description: string, userId: string): Promise<void> {
  await sql`
    INSERT INTO site_config (key, value, description, updated_at, updated_by)
    VALUES (${key}, ${value}, ${description}, NOW(), ${userId})
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW(), updated_by = ${userId}
  `
  cache.set(key, { value, updatedAt: Date.now() })
}

export async function getAllConfigs(): Promise<Record<string, { value: number; description: string | null }>> {
  const rows = await sql`SELECT key, value, description FROM site_config ORDER BY key`
  const result: Record<string, { value: number; description: string | null }> = {}
  for (const row of rows as Array<{ key: string; value: number; description: string | null }>) {
    result[row.key] = { value: row.value, description: row.description }
  }
  return result
}

export function invalidateConfigCache(): void {
  cache.clear()
}

// ── Email Verification ──
export const CFG = {
  EMAIL_TOKEN_TTL_HOURS:          'email.token_ttl_hours',
  EMAIL_IP_LIMIT:                 'email.ip_limit',
  EMAIL_IP_LIMIT_WINDOW_MINUTES:  'email.ip_limit_window_minutes',
  EMAIL_LIMIT:                    'email.limit',
  EMAIL_LIMIT_WINDOW_HOURS:       'email.limit_window_hours',
  EMAIL_GLOBAL_LIMIT:             'email.global_limit',
  EMAIL_GLOBAL_LIMIT_WINDOW_HOURS:'email.global_limit_window_hours',
  EMAIL_SEND_ATTEMPT_RETENTION_DAYS: 'email.send_attempt_retention_days',

  // ── User Profile ──
  USERNAME_COOLDOWN_DAYS:    'profile.username_cooldown_days',
  USERNAME_MIN_LENGTH:       'profile.username_min_length',
  USERNAME_MAX_LENGTH:       'profile.username_max_length',
  DISPLAY_NAME_MIN_LENGTH:   'profile.display_name_min_length',
  DISPLAY_NAME_MAX_LENGTH:   'profile.display_name_max_length',
  PASSWORD_MIN_LENGTH:       'profile.password_min_length',

  // ── Avatar ──
  AVATAR_MAX_FILE_SIZE:   'avatar.max_file_size',
  AVATAR_OUTPUT_SIZE:     'avatar.output_size',
  AVATAR_QUALITY:         'avatar.quality',

  // ── Sync ──
  SYNC_MAX_RECORDS:       'sync.max_records',
  SYNC_MAX_TOMBSTONES:    'sync.max_tombstones',
  SYNC_BODY_MAX_SIZE:     'sync.body_max_size',
  SYNC_PULL_DEFAULT_LIMIT:'sync.pull_default_limit',
  SYNC_PULL_MAX_LIMIT:    'sync.pull_max_limit',

  // ── Cloud Sync Gating ──
  CLOUD_SYNC_GLOBALLY_ENABLED: 'cloud.sync_globally_enabled',
  CLOUD_STAR_CACHE_TTL_HOURS: 'cloud.star_cache_ttl_hours',

  // ── Upload ──
  UPLOAD_MAX_PAYLOAD_SIZE:    'upload.max_payload_size',
  UPLOAD_MAX_SNAPSHOTS:       'upload.max_snapshots',
  UPLOAD_MAX_BREAKDOWNS:      'upload.max_breakdowns',
  UPLOAD_TIMESTAMP_WINDOW_MS: 'upload.timestamp_window_ms',
  UPLOAD_RATE_LIMIT:          'upload.rate_limit',
  UPLOAD_RATE_LIMIT_WINDOW_HOURS: 'upload.rate_limit_window_hours',

  // ── Risk Thresholds ──
  RISK_INCONSISTENCY_PCT:     'risk.inconsistency_pct',
  RISK_UNKNOWN_MODEL_PCT:     'risk.unknown_model_pct',
  RISK_REPEAT_COUNT:          'risk.repeat_count',
  RISK_REPEAT_WINDOW_HOURS:   'risk.repeat_window_hours',
  RISK_TOKEN_SPIKE_MULTIPLIER:'risk.token_spike_multiplier',
  RISK_TOKEN_SPIKE_MIN_AVG:   'risk.token_spike_min_avg',
  RISK_TOKEN_SPIKE_LOOKBACK_DAYS:'risk.token_spike_lookback_days',
  RISK_RULE_INCONSISTENCY:    'risk.rule_inconsistency',
  RISK_RULE_UNKNOWN_MODEL:    'risk.rule_unknown_model',
  RISK_RULE_REPEAT:           'risk.rule_repeat',
  RISK_RULE_TOKEN_SPIKE:      'risk.rule_token_spike',

  // ── Leaderboard ──
  LEADERBOARD_PAGE_SIZE:   'leaderboard.page_size',
  LEADERBOARD_CACHE_TTL_MS:'leaderboard.cache_ttl_ms',

  // ── Device Auth ──
  DEVICE_AUTH_EXPIRY_MINUTES:'device.auth_expiry_minutes',
  DEVICE_AUTH_POLL_INTERVAL_SECONDS:'device.auth_poll_interval_seconds',

  // ── Session ──
  SESSION_DURATION_DAYS:'session.duration_days',

  // ── OAuth ──
  OAUTH_STATE_MAX_AGE_SECONDS:'oauth.state_max_age_seconds',

  // ── Nonce ──
  NONCE_RETENTION_MINUTES:'nonce.retention_minutes',

  // ── Data Retention ──
  RETENTION_NONCE_HOURS:        'retention.nonce_hours',
  RETENTION_UPLOAD_REQUEST_DAYS:'retention.upload_request_days',
  RETENTION_SYNC_BATCH_DAYS:    'retention.sync_batch_days',
  RETENTION_TOMBSTONE_DAYS:     'retention.tombstone_days',
  RETENTION_DEVICE_AUTH_HOURS:  'retention.device_auth_hours',
} as const

// ── Default values ──
const DEFAULTS: Record<string, number> = {
  [CFG.EMAIL_TOKEN_TTL_HOURS]:           24,
  [CFG.EMAIL_IP_LIMIT]:                  5,
  [CFG.EMAIL_IP_LIMIT_WINDOW_MINUTES]:   10,
  [CFG.EMAIL_LIMIT]:                     3,
  [CFG.EMAIL_LIMIT_WINDOW_HOURS]:        1,
  [CFG.EMAIL_GLOBAL_LIMIT]:              1000,
  [CFG.EMAIL_GLOBAL_LIMIT_WINDOW_HOURS]: 24,
  [CFG.EMAIL_SEND_ATTEMPT_RETENTION_DAYS]: 7,

  [CFG.USERNAME_COOLDOWN_DAYS]:   30,
  [CFG.USERNAME_MIN_LENGTH]:      3,
  [CFG.USERNAME_MAX_LENGTH]:      32,
  [CFG.DISPLAY_NAME_MIN_LENGTH]:  1,
  [CFG.DISPLAY_NAME_MAX_LENGTH]:  64,
  [CFG.PASSWORD_MIN_LENGTH]:      8,

  [CFG.AVATAR_MAX_FILE_SIZE]: 5 * 1024 * 1024,
  [CFG.AVATAR_OUTPUT_SIZE]:   256,
  [CFG.AVATAR_QUALITY]:       80,

  [CFG.SYNC_MAX_RECORDS]:        1000,
  [CFG.SYNC_MAX_TOMBSTONES]:     500,
  [CFG.SYNC_BODY_MAX_SIZE]:      2 * 1024 * 1024,
  [CFG.SYNC_PULL_DEFAULT_LIMIT]: 1000,
  [CFG.SYNC_PULL_MAX_LIMIT]:     2000,

  [CFG.CLOUD_STAR_CACHE_TTL_HOURS]:     24,
  [CFG.CLOUD_SYNC_GLOBALLY_ENABLED]: 1,

  [CFG.UPLOAD_MAX_PAYLOAD_SIZE]:        1_000_000,
  [CFG.UPLOAD_MAX_SNAPSHOTS]:           5,
  [CFG.UPLOAD_MAX_BREAKDOWNS]:          1000,
  [CFG.UPLOAD_TIMESTAMP_WINDOW_MS]:     5 * 60 * 1000,
  [CFG.UPLOAD_RATE_LIMIT]:              30,
  [CFG.UPLOAD_RATE_LIMIT_WINDOW_HOURS]: 1,

  [CFG.RISK_INCONSISTENCY_PCT]:        0.01,
  [CFG.RISK_UNKNOWN_MODEL_PCT]:        0.8,
  [CFG.RISK_REPEAT_COUNT]:             5,
  [CFG.RISK_REPEAT_WINDOW_HOURS]:      24,
  [CFG.RISK_TOKEN_SPIKE_MULTIPLIER]:   10,
  [CFG.RISK_TOKEN_SPIKE_MIN_AVG]:      1000,
  [CFG.RISK_TOKEN_SPIKE_LOOKBACK_DAYS]:30,
  [CFG.RISK_RULE_INCONSISTENCY]:  1,
  [CFG.RISK_RULE_UNKNOWN_MODEL]:  1,
  [CFG.RISK_RULE_REPEAT]:         1,
  [CFG.RISK_RULE_TOKEN_SPIKE]:    1,

  [CFG.LEADERBOARD_PAGE_SIZE]:   50,
  [CFG.LEADERBOARD_CACHE_TTL_MS]:60_000,

  [CFG.DEVICE_AUTH_EXPIRY_MINUTES]: 10,
  [CFG.DEVICE_AUTH_POLL_INTERVAL_SECONDS]: 5,

  [CFG.SESSION_DURATION_DAYS]: 7,
  [CFG.OAUTH_STATE_MAX_AGE_SECONDS]: 600,
  [CFG.NONCE_RETENTION_MINUTES]: 10,

  [CFG.RETENTION_NONCE_HOURS]:         24,
  [CFG.RETENTION_UPLOAD_REQUEST_DAYS]: 180,
  [CFG.RETENTION_SYNC_BATCH_DAYS]:     30,
  [CFG.RETENTION_TOMBSTONE_DAYS]:      90,
  [CFG.RETENTION_DEVICE_AUTH_HOURS]:   1,
}

// ── Category grouping for admin UI ──
export const CONFIG_CATEGORIES: Record<string, { label: string; label_zh: string; keys: string[] }> = {
  email: {
    label: 'Email Verification',
    label_zh: '邮箱验证',
    keys: [
      CFG.EMAIL_TOKEN_TTL_HOURS, CFG.EMAIL_IP_LIMIT, CFG.EMAIL_IP_LIMIT_WINDOW_MINUTES,
      CFG.EMAIL_LIMIT, CFG.EMAIL_LIMIT_WINDOW_HOURS, CFG.EMAIL_GLOBAL_LIMIT,
      CFG.EMAIL_GLOBAL_LIMIT_WINDOW_HOURS, CFG.EMAIL_SEND_ATTEMPT_RETENTION_DAYS,
    ],
  },
  profile: {
    label: 'User Profile',
    label_zh: '用户资料',
    keys: [
      CFG.USERNAME_COOLDOWN_DAYS, CFG.USERNAME_MIN_LENGTH, CFG.USERNAME_MAX_LENGTH,
      CFG.DISPLAY_NAME_MIN_LENGTH, CFG.DISPLAY_NAME_MAX_LENGTH, CFG.PASSWORD_MIN_LENGTH,
    ],
  },
  avatar: {
    label: 'Avatar',
    label_zh: '头像',
    keys: [CFG.AVATAR_MAX_FILE_SIZE, CFG.AVATAR_OUTPUT_SIZE, CFG.AVATAR_QUALITY],
  },
  sync: {
    label: 'Data Sync',
    label_zh: '数据同步',
    keys: [
      CFG.CLOUD_SYNC_GLOBALLY_ENABLED,
      CFG.SYNC_MAX_RECORDS, CFG.SYNC_MAX_TOMBSTONES, CFG.SYNC_BODY_MAX_SIZE,
      CFG.SYNC_PULL_DEFAULT_LIMIT, CFG.SYNC_PULL_MAX_LIMIT,
      CFG.CLOUD_STAR_CACHE_TTL_HOURS,
    ],
  },
  upload: {
    label: 'Upload',
    label_zh: '数据上传',
    keys: [
      CFG.UPLOAD_MAX_PAYLOAD_SIZE, CFG.UPLOAD_MAX_SNAPSHOTS, CFG.UPLOAD_MAX_BREAKDOWNS,
      CFG.UPLOAD_TIMESTAMP_WINDOW_MS, CFG.UPLOAD_RATE_LIMIT, CFG.UPLOAD_RATE_LIMIT_WINDOW_HOURS,
    ],
  },
  risk: {
    label: 'Risk Detection',
    label_zh: '风控检测',
    keys: [
      CFG.RISK_INCONSISTENCY_PCT, CFG.RISK_UNKNOWN_MODEL_PCT, CFG.RISK_REPEAT_COUNT,
      CFG.RISK_REPEAT_WINDOW_HOURS, CFG.RISK_TOKEN_SPIKE_MULTIPLIER,
      CFG.RISK_TOKEN_SPIKE_MIN_AVG, CFG.RISK_TOKEN_SPIKE_LOOKBACK_DAYS,
      CFG.RISK_RULE_INCONSISTENCY, CFG.RISK_RULE_UNKNOWN_MODEL,
      CFG.RISK_RULE_REPEAT, CFG.RISK_RULE_TOKEN_SPIKE,
    ],
  },
  leaderboard: {
    label: 'Leaderboard',
    label_zh: '排行榜',
    keys: [CFG.LEADERBOARD_PAGE_SIZE, CFG.LEADERBOARD_CACHE_TTL_MS],
  },
  session: {
    label: 'Login & Security',
    label_zh: '登录与安全',
    keys: [
      CFG.SESSION_DURATION_DAYS, CFG.OAUTH_STATE_MAX_AGE_SECONDS,
      CFG.DEVICE_AUTH_EXPIRY_MINUTES, CFG.DEVICE_AUTH_POLL_INTERVAL_SECONDS,
    ],
  },
  retention: {
    label: 'Data Retention',
    label_zh: '数据保留',
    keys: [
      CFG.NONCE_RETENTION_MINUTES, CFG.RETENTION_NONCE_HOURS,
      CFG.RETENTION_UPLOAD_REQUEST_DAYS, CFG.RETENTION_SYNC_BATCH_DAYS,
      CFG.RETENTION_TOMBSTONE_DAYS, CFG.RETENTION_DEVICE_AUTH_HOURS,
    ],
  },
}

// ── Descriptions for admin UI ──
export const CONFIG_DESCRIPTIONS: Record<string, string> = {
  [CFG.EMAIL_TOKEN_TTL_HOURS]:           'How long a verification link stays valid (hours)',
  [CFG.EMAIL_IP_LIMIT]:                  'Max verification emails one IP can request',
  [CFG.EMAIL_IP_LIMIT_WINDOW_MINUTES]:   'Time window for IP email limit (minutes)',
  [CFG.EMAIL_LIMIT]:                     'Max verification emails per email address',
  [CFG.EMAIL_LIMIT_WINDOW_HOURS]:        'Time window for per-email limit (hours)',
  [CFG.EMAIL_GLOBAL_LIMIT]:              'Max verification emails site-wide',
  [CFG.EMAIL_GLOBAL_LIMIT_WINDOW_HOURS]: 'Time window for site-wide email limit (hours)',
  [CFG.EMAIL_SEND_ATTEMPT_RETENTION_DAYS]: 'Keep email send logs for this many days',

  [CFG.USERNAME_COOLDOWN_DAYS]:   'Days before a user can change username again',
  [CFG.USERNAME_MIN_LENGTH]:      'Minimum characters for username',
  [CFG.USERNAME_MAX_LENGTH]:      'Maximum characters for username',
  [CFG.DISPLAY_NAME_MIN_LENGTH]:  'Minimum characters for display name',
  [CFG.DISPLAY_NAME_MAX_LENGTH]:  'Maximum characters for display name',
  [CFG.PASSWORD_MIN_LENGTH]:      'Minimum characters for password',

  [CFG.AVATAR_MAX_FILE_SIZE]: 'Maximum file size for avatar upload (MB)',
  [CFG.AVATAR_OUTPUT_SIZE]:   'Avatar image output size in pixels',
  [CFG.AVATAR_QUALITY]:       'Avatar compression quality (1-100)',

  [CFG.SYNC_MAX_RECORDS]:        'Max records per sync push from CLI',
  [CFG.SYNC_MAX_TOMBSTONES]:     'Max deleted record markers per sync',
  [CFG.SYNC_BODY_MAX_SIZE]:      'Max request body size for sync (MB)',
  [CFG.SYNC_PULL_DEFAULT_LIMIT]: 'Default number of records returned per sync pull',
  [CFG.SYNC_PULL_MAX_LIMIT]:     'Maximum records allowed per sync pull',
  [CFG.CLOUD_STAR_CACHE_TTL_HOURS]: 'How long to cache GitHub star check results (hours)',
  [CFG.CLOUD_SYNC_GLOBALLY_ENABLED]: 'Enable or disable AIUsage Cloud globally (1=on, 0=off)',

  [CFG.UPLOAD_MAX_PAYLOAD_SIZE]:        'Max data size per upload (MB)',
  [CFG.UPLOAD_MAX_SNAPSHOTS]:           'Max usage snapshots per upload',
  [CFG.UPLOAD_MAX_BREAKDOWNS]:          'Max model breakdowns per snapshot',
  [CFG.UPLOAD_TIMESTAMP_WINDOW_MS]:     'Allowed time drift for upload signatures (sec)',
  [CFG.UPLOAD_RATE_LIMIT]:              'Max uploads per device in time window',
  [CFG.UPLOAD_RATE_LIMIT_WINDOW_HOURS]: 'Upload rate limit time window (hours)',

  [CFG.RISK_INCONSISTENCY_PCT]:        'Flag upload if data inconsistency exceeds this ratio',
  [CFG.RISK_UNKNOWN_MODEL_PCT]:        'Flag if unknown model usage exceeds this ratio',
  [CFG.RISK_REPEAT_COUNT]:             'Flag if a device uploads this many times in window',
  [CFG.RISK_REPEAT_WINDOW_HOURS]:      'Time window for repeated upload detection (hours)',
  [CFG.RISK_TOKEN_SPIKE_MULTIPLIER]:   'Flag if usage exceeds historical average by this factor',
  [CFG.RISK_TOKEN_SPIKE_MIN_AVG]:      'Minimum average tokens before spike detection applies',
  [CFG.RISK_TOKEN_SPIKE_LOOKBACK_DAYS]:'Days of history used for spike comparison',
  [CFG.RISK_RULE_INCONSISTENCY]:  'Enable breakdown inconsistency check (1=on, 0=off)',
  [CFG.RISK_RULE_UNKNOWN_MODEL]:  'Enable unknown model ratio check (1=on, 0=off)',
  [CFG.RISK_RULE_REPEAT]:         'Enable repeat upload detection (1=on, 0=off)',
  [CFG.RISK_RULE_TOKEN_SPIKE]:    'Enable token spike detection (1=on, 0=off)',

  [CFG.LEADERBOARD_PAGE_SIZE]:   'Entries shown per leaderboard page',
  [CFG.LEADERBOARD_CACHE_TTL_MS]:'How long leaderboard data is cached (sec)',

  [CFG.DEVICE_AUTH_EXPIRY_MINUTES]: 'How long a CLI login code stays valid (minutes)',
  [CFG.DEVICE_AUTH_POLL_INTERVAL_SECONDS]: 'How often the CLI checks if login is approved (seconds)',

  [CFG.SESSION_DURATION_DAYS]: 'How long a user stays logged in (days)',
  [CFG.OAUTH_STATE_MAX_AGE_SECONDS]: 'How long a third-party login link stays valid (seconds)',
  [CFG.NONCE_RETENTION_MINUTES]: 'How often expired upload tokens are cleaned up (minutes)',

  [CFG.RETENTION_NONCE_HOURS]:         'Keep upload tokens for this many hours',
  [CFG.RETENTION_UPLOAD_REQUEST_DAYS]: 'Keep upload history for this many days',
  [CFG.RETENTION_SYNC_BATCH_DAYS]:     'Keep sync history for this many days',
  [CFG.RETENTION_TOMBSTONE_DAYS]:      'Permanently delete removed records after this many days',
  [CFG.RETENTION_DEVICE_AUTH_HOURS]:   'Clean up expired CLI login codes after this many hours',
}

export const CONFIG_DESCRIPTIONS_ZH: Record<string, string> = {
  [CFG.EMAIL_TOKEN_TTL_HOURS]:           '验证链接在多少小时内有效',
  [CFG.EMAIL_IP_LIMIT]:                  '同一 IP 最多可发送几封验证邮件',
  [CFG.EMAIL_IP_LIMIT_WINDOW_MINUTES]:   'IP 发送限制的时间窗口（分钟）',
  [CFG.EMAIL_LIMIT]:                     '同一邮箱最多可收到几封验证邮件',
  [CFG.EMAIL_LIMIT_WINDOW_HOURS]:        '单邮箱发送限制的时间窗口（小时）',
  [CFG.EMAIL_GLOBAL_LIMIT]:              '全站最多同时发送多少封验证邮件',
  [CFG.EMAIL_GLOBAL_LIMIT_WINDOW_HOURS]: '全站发送限制的时间窗口（小时）',
  [CFG.EMAIL_SEND_ATTEMPT_RETENTION_DAYS]: '邮件发送日志保留几天',

  [CFG.USERNAME_COOLDOWN_DAYS]:   '修改用户名后需要等待几天才能再次修改',
  [CFG.USERNAME_MIN_LENGTH]:      '用户名最少几个字符',
  [CFG.USERNAME_MAX_LENGTH]:      '用户名最多几个字符',
  [CFG.DISPLAY_NAME_MIN_LENGTH]:  '显示名称最少几个字符',
  [CFG.DISPLAY_NAME_MAX_LENGTH]:  '显示名称最多几个字符',
  [CFG.PASSWORD_MIN_LENGTH]:      '密码最少几个字符',

  [CFG.AVATAR_MAX_FILE_SIZE]: '头像文件最大多少 MB',
  [CFG.AVATAR_OUTPUT_SIZE]:   '头像输出尺寸（像素）',
  [CFG.AVATAR_QUALITY]:       '头像压缩质量（1-100）',

  [CFG.SYNC_MAX_RECORDS]:        'CLI 单次同步最多推送几条记录',
  [CFG.SYNC_MAX_TOMBSTONES]:     '单次同步最多推送几条删除标记',
  [CFG.SYNC_BODY_MAX_SIZE]:      '同步请求体最大多少 MB',
  [CFG.SYNC_PULL_DEFAULT_LIMIT]: '同步拉取时默认返回几条',
  [CFG.SYNC_PULL_MAX_LIMIT]:     '同步拉取时最多返回几条',
  [CFG.CLOUD_STAR_CACHE_TTL_HOURS]: 'GitHub Star 检查结果缓存多少小时',
  [CFG.CLOUD_SYNC_GLOBALLY_ENABLED]: '全局启用或禁用 AIUsage Cloud（1=开启，0=关闭）',

  [CFG.UPLOAD_MAX_PAYLOAD_SIZE]:        '单次上传数据最大多少 MB',
  [CFG.UPLOAD_MAX_SNAPSHOTS]:           '单次上传最多包含几个快照',
  [CFG.UPLOAD_MAX_BREAKDOWNS]:          '每个快照最多包含几条模型明细',
  [CFG.UPLOAD_TIMESTAMP_WINDOW_MS]:     '上传签名允许的时间偏差（秒）',
  [CFG.UPLOAD_RATE_LIMIT]:              '每台设备在限制窗口内最多上传几次',
  [CFG.UPLOAD_RATE_LIMIT_WINDOW_HOURS]: '上传频率限制的时间窗口（小时）',

  [CFG.RISK_INCONSISTENCY_PCT]:        '数据不一致比例超过多少时标记为可疑',
  [CFG.RISK_UNKNOWN_MODEL_PCT]:        '未知模型用量占比超过多少时标记为可疑',
  [CFG.RISK_REPEAT_COUNT]:             '设备在窗口内上传超过几次时标记为可疑',
  [CFG.RISK_REPEAT_WINDOW_HOURS]:      '重复上传检测的时间窗口（小时）',
  [CFG.RISK_TOKEN_SPIKE_MULTIPLIER]:   '用量超过历史平均值几倍时标记为可疑',
  [CFG.RISK_TOKEN_SPIKE_MIN_AVG]:      '启用异常检测所需的最低平均 Token 数',
  [CFG.RISK_TOKEN_SPIKE_LOOKBACK_DAYS]:'计算历史平均值时回溯几天的数据',
  [CFG.RISK_RULE_INCONSISTENCY]:  '启用数据不一致检测（1=开启，0=关闭）',
  [CFG.RISK_RULE_UNKNOWN_MODEL]:  '启用未知模型占比检测（1=开启，0=关闭）',
  [CFG.RISK_RULE_REPEAT]:         '启用重复上传检测（1=开启，0=关闭）',
  [CFG.RISK_RULE_TOKEN_SPIKE]:    '启用 Token 异常飙升检测（1=开启，0=关闭）',

  [CFG.LEADERBOARD_PAGE_SIZE]:   '排行榜每页显示几条',
  [CFG.LEADERBOARD_CACHE_TTL_MS]:'排行榜数据缓存多久（秒）',

  [CFG.DEVICE_AUTH_EXPIRY_MINUTES]: 'CLI 登录码在几分钟内有效',
  [CFG.DEVICE_AUTH_POLL_INTERVAL_SECONDS]: 'CLI 每隔几秒检查一次登录是否通过',

  [CFG.SESSION_DURATION_DAYS]: '用户登录后保持几天免登录',
  [CFG.OAUTH_STATE_MAX_AGE_SECONDS]: '第三方登录链接在几秒内有效',
  [CFG.NONCE_RETENTION_MINUTES]: '每隔几分钟清理过期的上传令牌',

  [CFG.RETENTION_NONCE_HOURS]:         '上传令牌保留几小时后自动清理',
  [CFG.RETENTION_UPLOAD_REQUEST_DAYS]: '上传历史记录保留几天',
  [CFG.RETENTION_SYNC_BATCH_DAYS]:     '同步历史记录保留几天',
  [CFG.RETENTION_TOMBSTONE_DAYS]:      '已删除的记录在几天后彻底清除',
  [CFG.RETENTION_DEVICE_AUTH_HOURS]:   '过期的 CLI 登录码在几小时后清理',
}

// ── Units for admin UI ──
export const CONFIG_UNITS: Record<string, { en: string; zh: string }> = {
  [CFG.EMAIL_TOKEN_TTL_HOURS]:           { en: 'hours', zh: '小时' },
  [CFG.EMAIL_IP_LIMIT_WINDOW_MINUTES]:   { en: 'min', zh: '分钟' },
  [CFG.EMAIL_LIMIT_WINDOW_HOURS]:        { en: 'hours', zh: '小时' },
  [CFG.EMAIL_GLOBAL_LIMIT_WINDOW_HOURS]: { en: 'hours', zh: '小时' },
  [CFG.EMAIL_SEND_ATTEMPT_RETENTION_DAYS]: { en: 'days', zh: '天' },

  [CFG.USERNAME_COOLDOWN_DAYS]:   { en: 'days', zh: '天' },

  [CFG.AVATAR_MAX_FILE_SIZE]: { en: 'MB', zh: 'MB' },
  [CFG.AVATAR_OUTPUT_SIZE]:   { en: 'px', zh: 'px' },

  [CFG.SYNC_BODY_MAX_SIZE]:      { en: 'MB', zh: 'MB' },
  [CFG.CLOUD_STAR_CACHE_TTL_HOURS]: { en: 'hours', zh: '小时' },

  [CFG.UPLOAD_MAX_PAYLOAD_SIZE]:        { en: 'MB', zh: 'MB' },
  [CFG.UPLOAD_TIMESTAMP_WINDOW_MS]:     { en: 'sec', zh: '秒' },
  [CFG.UPLOAD_RATE_LIMIT_WINDOW_HOURS]: { en: 'hours', zh: '小时' },

  [CFG.RISK_REPEAT_WINDOW_HOURS]:      { en: 'hours', zh: '小时' },
  [CFG.RISK_TOKEN_SPIKE_LOOKBACK_DAYS]:{ en: 'days', zh: '天' },

  [CFG.LEADERBOARD_CACHE_TTL_MS]:{ en: 'sec', zh: '秒' },

  [CFG.DEVICE_AUTH_EXPIRY_MINUTES]: { en: 'min', zh: '分钟' },
  [CFG.DEVICE_AUTH_POLL_INTERVAL_SECONDS]: { en: 'sec', zh: '秒' },

  [CFG.SESSION_DURATION_DAYS]: { en: 'days', zh: '天' },
  [CFG.OAUTH_STATE_MAX_AGE_SECONDS]: { en: 'sec', zh: '秒' },
  [CFG.NONCE_RETENTION_MINUTES]: { en: 'min', zh: '分钟' },

  [CFG.RETENTION_NONCE_HOURS]:         { en: 'hours', zh: '小时' },
  [CFG.RETENTION_UPLOAD_REQUEST_DAYS]: { en: 'days', zh: '天' },
  [CFG.RETENTION_SYNC_BATCH_DAYS]:     { en: 'days', zh: '天' },
  [CFG.RETENTION_TOMBSTONE_DAYS]:      { en: 'days', zh: '天' },
  [CFG.RETENTION_DEVICE_AUTH_HOURS]:   { en: 'hours', zh: '小时' },
}

// ── Display multiplier for admin UI ──
// When set, the admin UI divides the stored value by this number for display,
// and multiplies back when saving. E.g. 1048576 bytes → 1 MB in UI.
export const CONFIG_DISPLAY_MULTIPLIER: Record<string, number> = {
  [CFG.AVATAR_MAX_FILE_SIZE]:      1024 * 1024,  // bytes → MB
  [CFG.SYNC_BODY_MAX_SIZE]:        1024 * 1024,  // bytes → MB
  [CFG.UPLOAD_MAX_PAYLOAD_SIZE]:   1024 * 1024,  // bytes → MB
  [CFG.UPLOAD_TIMESTAMP_WINDOW_MS]: 1000,         // ms → sec
  [CFG.LEADERBOARD_CACHE_TTL_MS]:  1000,         // ms → sec
}

export function getDefaultValue(key: string): number {
  return DEFAULTS[key] ?? 0
}

export async function getConfigValue(key: string): Promise<number> {
  return getConfig(key, DEFAULTS[key] ?? 0)
}

// Sync version for hot paths that already cached via getConfigSync
export { getConfigSync }

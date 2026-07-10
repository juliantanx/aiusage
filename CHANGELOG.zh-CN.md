# 更新日志

本文件记录项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
并遵循 [语义化版本控制](https://semver.org/lang/zh-CN/)。

## [1.5.10] - 2026-07-10

### 新增
- **CodeFuse 支持** ([#42](https://github.com/juliantanx/aiusage/pull/42) by [@Ed-Bg](https://github.com/Ed-Bg)) — 检测并解析 `~/.codefuse` 下的 [CodeFuse](https://github.com/codefuse-ai) 使用日志，覆盖其多种日志布局（`projects`、含 Claude Code 形态 `ant_cc_*.json` 的 `engine/cc/projects`、以及 `engine/codex/sessions`）。可从 Claude Code、原生和 Codex payload 三种结构中读取 token 用量，并一并提取工具调用。可用 `AIUSAGE_CODEFUSE_PATH` 覆盖路径。

## [1.5.9] - 2026-07-06

### 修复
- **Trae 解析不再阻塞 `serve` 启动和仪表盘** ([#40](https://github.com/juliantanx/aiusage/issues/40)) — Trae 解析器读取会话元数据时,对每个 git tag 都单独 spawn 一次 `git log`(没有 `chain-start` tag 时还会再全量扫一遍做回退)。在大型快照存储上(约 72 个仓库、696 个 tag),单次解析要产生数百个 git 子进程 —— Windows 上约 40 秒 —— 从而阻塞 `/api/refresh`,使仪表盘一直卡在加载状态。现在解析器改为每个仓库只用一次 `git for-each-ref` 取回所有 tag 名和时间戳(约 768 次 → 72 次),首页/概览页也改为先渲染已有数据、再后台触发刷新,首屏不再阻塞在日志解析上。

## [1.5.8] - 2026-07-01

### 新增
- **CodeBuddy IDE 支持** — 检测并解析腾讯 CodeBuddy IDE（含 CN 变体）。其逐条消息的 JSON 日志位于 `CodeBuddyExtension/Data/**/CodeBuddyIDE/**/history/<会话>/<对话>/messages/`。原有的 `codebuddy` JSONL 解析器仅覆盖 `~/.codebuddy/projects`，因此 IDE 用量此前无法被检测到。用量数据取自每个对话累计的 `statsSnapshot`（未命中缓存的输入、缓存输入、输出）。归入现有的 **CodeBuddy** 工具，新增 `codebuddy-ide` 数据源；可用 `AIUSAGE_CODEBUDDY_IDE_PATH` 覆盖路径。

### 修复
- **CodeBuddy CLI 缓存 token 重复计数** — CLI 同时把用量写在 `message.usage`（字段名是 Anthropic 风格，但语义是 OpenAI 风格——`input_tokens` 已包含缓存 token）和 `providerData.rawUsage` 里。通用解析器按 Anthropic 语义处理，在已含缓存的 `input_tokens` 之上又加了一遍 `cache_read_input_tokens`，导致输入被缓存量虚高（缓存密集的轮次可达约 100 倍）。现在 codebuddy 改为读取 `rawUsage` 中干净的 `prompt_cache_hit/miss` 分解（缺失时回退到 `message.usage` 并减去缓存读取部分）。
- **回填的 cwd/source_file 现在可跨设备传播** ([#12](https://github.com/juliantanx/aiusage/issues/12)) — 在运行 `aiusage serve` 的设备上，跨设备项目统计会丢失 Codex（及其他依赖 cwd 的）项目：cwd 与 Hermes source_file 的回填虽然补全了本地记录，却没有更新 `updated_at`，而跨设备同步只会重新上传 `updated_at > synced_at` 的记录，因此补全后的字段从未传播到其他设备。现在这些回填会像 `backfillCodexModels` 一样更新 `updated_at`。迁移 v12 会修复已运行过 v1.5.0–v1.5.7 有缺陷回填的既有安装：重新将已补全的记录标记为已变更，强制重新上传一次。

## [1.5.7] - 2026-06-25

### 新增
- **Trae 支持** ([#35](https://github.com/juliantanx/aiusage/pull/35)) — 检测并解析 Trae 会话，覆盖 Trae CN、TRAE SOLO CN 和国际版 Trae 三个变体。
- **Cursor 隐私模式解析** ([#35](https://github.com/juliantanx/aiusage/pull/35)) — 当 Cursor 以 `PRIVACY_MODE_NO_STORAGE` 运行时，回退到 agent-transcript JSONL 日志，仍可统计用量。

### 变更
- **会话列表显示完整日期和时间** — Sessions 表格的「时间」列现在显示日期和时间（`toLocaleString`），不再只显示日期，与会话详情页保持一致。

### 修复
- **Kiro 解析器** ([#35](https://github.com/juliantanx/aiusage/pull/35)) — 支持 `workspace-sessions` JSON 格式，新增 `tokens_generated.jsonl` 探测，修复 token 估算。
- **Trae 会话 ID 提取** ([#35](https://github.com/juliantanx/aiusage/pull/35)) — 从 v2 子目录读取会话 ID。
- **工具发现审计** ([#35](https://github.com/juliantanx/aiusage/pull/35)) — 修正 Trae、Cursor、Kiro、KiloCode 的日志发现逻辑（含 KiloCode 的 Windows 数据库路径）。
- **OpenClaw 零成本记录卡在 $0** ([#13](https://github.com/juliantanx/aiusage/issues/13)) — 只要日志里存在 `usage.cost` 字段，OpenClaw 解析器就把 `cost_source` 标为 `'log'`，即使 `total` 是 `0`。自定义网关（如 openclaw → `deepseek-v4-pro`）对它们不计价的模型会上报 `cost.total: 0`，这些记录因此被当作权威的 `$0`、永远无法计价。现在解析器要求日志成本为正数才使用 `'log'`，否则回退到按价格表计算 —— 与 Cline、Hermes 解析器保持一致。
- **重算修正日志来源费用** ([#13](https://github.com/juliantanx/aiusage/issues/13)) — 当 `cost_source = 'log'` 记录的日志成本为非正数（网关上报的不可靠 `0`），或用户为该模型设置了手动价格时，重算现在会重新计算费用。这样无需重新导入即可修复已入库的记录。真正为正的日志成本仍会保留。
- **旧版 config 价格覆盖现已生效** ([#13](https://github.com/juliantanx/aiusage/issues/13)) — 在定价注册表出现之前配置的价格覆盖只存在于 `config.json`，重算时被忽略，导致手动设置的价格不影响重算后的费用。服务端现在会在启动时把 `config.priceOverrides` 导入注册表作为用户价格（已通过 UI 设置的价格会保留），并从 config 中清除，使注册表成为唯一数据源。升级后点击一次 **重算** 即可应用到存量记录。

---

## [1.5.6] - 2026-06-17

### 新增
- **Widget 自动设置** — 当 `cache.db` 缺失时自动设置 CLI 并运行首次解析，包含显示设置阶段的覆盖层 UI、IPC 状态通道和国际化支持。

### 修复
- **CLI 逐工具进度** — 解析过程中显示逐工具进度，替代之前误导的全局计数器。
- **CLI 损坏数据库恢复** — 启动时自动重建损坏的 SQLite 数据库。

---

## [1.5.5] - 2026-06-17

### 修复
- **Qoder Windows 数据库路径** ([#34](https://github.com/juliantanx/aiusage/pull/34)，@Mnoisec 贡献) — 将 Windows 上 Qoder Desktop SQLite 数据库路径从 `LOCALAPPDATA`（Local）修正为 `APPDATA`（Roaming）。

---

## [1.5.4] - 2026-06-15

### 新增
- **ZCode 解析器** ([#33](https://github.com/juliantanx/aiusage/pull/33)，@zhaolu83949426-hub 贡献) — 新增 ZCode CLI 的用量统计支持，解析其 SQLite 数据库（`~/.zcode/cli/db/db.sqlite`）。从 `model_usage` 表读取每次请求的 token 用量（输入、输出、推理、缓存读/写），从 `tool_usage` 表读取工具调用记录。token 记录关联 `session.directory` 作为工作目录；工具调用作为孤儿记录入库（无父记录），因为 zcode 仅通过 `turn_id`（多对多）将它们与模型请求关联。两张表各有独立的增量游标。
- **ZCode 环境变量文档** — 在站点文档中记录 `ZCODE_DB` 环境变量，用于自定义 ZCode 数据库路径。

### 修复
- **Claude Code 消息去重** ([#32](https://github.com/juliantanx/aiusage/pull/32)，@joyshan1986 贡献) — 通过 `message.id` 对 Claude Code 记录去重，防止重复条目。
- **孤儿工具调用计数** — 在工具调用统计和仪表盘中计入孤儿工具调用。

---

## [1.5.3] - 2026-06-10

### 新增
- **LiteLLM 定价同步** — 从 LiteLLM 注册表同步模型定价，在本地 Web 引导首次定价同步，并将本地模型绑定到定价别名。
- **云端全局开关和公开定价** — 新增云端全局关闭开关（ban 语义），公开只读定价页面和 API 端点，以及配置中的逐条风控规则开关。
- **代理云同步状态端点** — 通过代理端点暴露云同步状态。

### 修复
- **Pi 会话解析** ([#31](https://github.com/juliantanx/aiusage/pull/31)，@joyshan1986 贡献) — 按文件提取 Pi 的会话 ID，并识别其缓存 token 字段。
- **排行榜费用聚合** — 按周期聚合排行榜费用，并在重算时保留费用数据。
- **定价别名解析** — 在费用重算时正确解析同步的定价别名。
- **本地数据库写入串行化** — 串行化本地数据库写入以防止并发写冲突。
- **配置目录安全** — 在保存前确保配置目录存在，并分离错误处理。
- **定价表重新设计** — 移除过时的云同步引用并重新设计定价表。
- **快照审核流程** — 将已审核的快照排除在标记列表之外，审批时恢复 leaderboard_metrics 的公开可见性。
- **同步记录字段命名** — 将同步 API 请求/响应中的 `record_id` 重命名为 `id`；同步拉取时仅计算实际变更的记录数。

### 变更
- **定价管理全面改版** — 增强定价管理，新增重算追踪、显式重算工作流，以及优化交互体验。
- **移除内置定价种子** — 从运行时移除内置定价种子数据和站点定价版本模型。
- **站点 Docker 缓存优化** — 优化站点 Docker 依赖缓存。

---

## [1.5.2] - 2026-06-08

### 新增
- **Kelivo 手动备份导入** ([#29](https://github.com/juliantanx/aiusage/pull/29)，@Fiveo9 贡献) — 将 Kelivo 加入手动导入来源，支持解析导出的 `chats.json` 与 `.zip` 备份，新增 `POST /api/import/kelivo`，并在设置页展示导入状态和结果。
- **排行榜加入指南** — 在文档和仪表盘中补充加入公开排行榜的引导。
- **高分辨率布局支持** — 在大屏上加宽站点内容，同时保持文档导航和设置页布局对齐。

### 修复
- **头像上传错误与限制展示** — 提供更清晰的上传失败提示，并在设置页动态显示当前头像大小限制。
- **仪表盘启动通知** — 仪表盘首次成功打开时也会发送 `install:done` 通知。
- **文档锚点导航** — 修复站点头部下的锚点滚动，并补充 Kelivo 手动导入文档。
- **首页 URL、SEO 与响应头** — 刷新首页元数据、规范 URL 和响应头。

### 变更
- **`aiusage clean` 重置流程** — 将 reset 行为合并到 `clean`，并通过 Git、S3 和 Cloud Sync 传播云同步清理；同步更新交互式菜单和测试。
- **排行榜周期与设置页清理** — 移除滚动排行榜周期，简化相关查询/UI 代码，并保持设置页展示行为一致。
- **支持工具数量文案** — 将 README、文档、首页和发布记录中的固定 `23 种工具` 文案调整为 `20+ 种工具`。
- **README 清理** — 精简 license 前的过时章节，并移除废弃 docs 资源。

---

## [1.5.1] - 2026-06-07

### 新增
- **认证错误国际化** — 登录、注册、忘记密码和重置密码页面现在返回机器可读的错误码，并显示本地化消息（中/英文）。
- **品牌化 HTML 邮件模板** — 验证邮件和密码重置邮件使用响应式品牌布局，包含 logo、卡片设计和样式化 CTA 按钮。
- **邮箱验证结果页面** — 专用的验证结果页面，显示成功/失败状态，替代之前的纯服务器重定向；在任何设备上均可正常显示。
- **跨设备邮箱验证** — 注册成功后，PC 端自动轮询验证状态，在手机上点击验证链接后自动跳转到登录页。
- **OAuth 解绑安全检查** — 防止解绑最后一个认证方式；通过 OAuth 重新登录时，自动关联已有账号。
- **管理后台配置显示优化** — 字节值现在显示为 MB，毫秒值显示为秒。
- **排行榜 @用户名显示** — 在排行榜条目中显示名下方展示 `@username`，区分显示名相同的用户。

### 修复
- **排行榜缓存清除** — `unbanUser` 和 `setUserRole` 现在正确清除排行榜缓存。
- **API 响应 Cache-Control: no-store** — 在 hooks 和排行榜端点直接添加 `Cache-Control: no-store`，防止 Cloudflare 缓存动态 API 响应。
- **头像上传大小限制** — 移除无效的 `bodySizeLimit` svelte.config.js 配置；adapter-node 通过 `BODY_SIZE_LIMIT` 环境变量控制。

### 变更
- **OAuth 重新关联逻辑** — 用户通过 OAuth 登录时，如果已存在相同邮箱的账号，将身份关联到已有账号，而不是报 duplicate key 错误。

---

## [1.5.0] - 2026-06-07

### 新增
- **Windows 仪表盘启动器** ([#23](https://github.com/juliantanx/aiusage/pull/23)，@joyshan1986 贡献) — 提供专用的 Windows 启动器，避免依赖 shell 包装即可打开仪表盘。
- **token 排行榜、云同步与 Web 增强** ([#24](https://github.com/juliantanx/aiusage/pull/24)) — 引入 token 排行榜，扩展云同步流程，并围绕同步与排行榜工作流更新 Web 仪表盘。
- **交互式 `aiusage menu` 命令** ([#25](https://github.com/juliantanx/aiusage/pull/25)) — 新增终端菜单，把常用 CLI 操作集中到一个入口。
- **仪表盘密码解锁流程** ([#27](https://github.com/juliantanx/aiusage/pull/27)，@Fiveo9 贡献) — 新增本地仪表盘密码保护与解锁流程。
- **会话详情和排行榜功能增强** ([#28](https://github.com/juliantanx/aiusage/pull/28)) — 扩展会话详情页和排行榜工作流，提供更多上下文与管理端可用性优化。
- **密码重置流程与 Resend 邮件服务** — 新增忘记密码和重置密码支持，并补充账号恢复与管理相关增强。
- **Widget 费用显示与 UI 刷新** — Widget 会根据所选货币显示费用，并带来重新设计的 i18n / 设置 / 图表体验。

### 修复
- **云同步校验与同步可靠性** — 通过 GitHub 星标校验限制 Cloud Sync，正确保留同步配置，修复 R2 路径风格处理，并修正上传记录计数。
- **OAuth 与认证流程加固** — 用内存存储替换基于 cookie 的 OAuth state，修复显式 `Set-Cookie` 处理，从 `SITE_URL` 推导安全 cookie，并在 GitHub OAuth 启动流程中使用 SvelteKit redirect。
- **仪表盘与排行榜打磨** — `serve` 启动时自动解析日志，用成功 toast 替代上传结果摘要，改进排行榜前三名展示和排序筛选，并优化管理后台徽章与角色切换布局。
- **Web 界面清理** — 改善深色主题对比度，抑制对话框遮罩层的可访问性警告，并减少筛选器布局冲突。

### 变更
- **文档与发布内容刷新** — 更新仪表盘文档/截图、项目概览与安全策略、演示 GIF 托管，以及站点/版本元数据到 `1.5.0`。

---

## [1.4.0] - 2026-06-03

### 新增
- **GitHub Copilot 用量追踪与配额支持** ([#19](https://github.com/juliantanx/aiusage/pull/19)) — CopilotParser 解析 OTEL JSONL 文件（Copilot CLI 和 VS Code Copilot Chat），通过 GitHub OAuth 查询 Copilot 配额 API，自动发现 `~/.copilot/otel/*.jsonl` 和 `$COPILOT_OTEL_FILE_EXPORTER_PATH`
- **KiloCode 解析器** ([#20](https://github.com/juliantanx/aiusage/pull/20)，@zhaolu83949426-hub 贡献) — 解析 KiloCode VS Code 扩展的 SQLite 数据库 (`kilo.db`)，支持输入/输出/缓存/思考 token 和费用计算
- **按模型 token 分解与堆叠柱状图** ([#21](https://github.com/juliantanx/aiusage/pull/21)) — API 暴露每个模型的 inputTokens、outputTokens、cacheReadTokens、cacheWriteTokens、thinkingTokens、totalCost；统一排名列表与堆叠组合柱状图
- **自动检测工具，从 8 个扩展到 20+ 个** ([#22](https://github.com/juliantanx/aiusage/pull/22)) — 自动检测已安装的 AI 工具，替代手动配置源路径；设置页面只读的"已检测工具"面板；`GET /api/detected-tools` 接口
- **USD/CNY 货币切换** ([#17](https://github.com/juliantanx/aiusage/pull/17)) — 定价页面分段切换器，在 USD 和 CNY 显示之间切换并自动汇率转换
- **扩展模型定价表** — 新增 OpenRouter、Google 及更多 Claude/OpenAI 模型变体；新增 `inputText` 定价字段，用于文本输入单独计价的模型

### 修复
- **定价保存/重置后自动重算费用** ([#15](https://github.com/juliantanx/aiusage/pull/15)) — 服务器在保存/重置定价后自动重算所有记录费用，无需手动操作；修复中文标签的编辑表单布局
- **密钥链数据不可用时回退到凭据文件** ([#18](https://github.com/juliantanx/aiusage/pull/18)) — 当 macOS 钥匙串条目不可用（解析错误、auth_mode 错误）时回退到基于文件的凭据

### 变更
- 移除站点布局中的公告横幅
- 简化首页 hero 区域

---

## [1.3.4] - 2026-05-29

### 修复
- **Widget 全局安装崩溃** — `aiusage-widget` 在 `npm install -g` 后报错 `Cannot find module 'electron'`，因为 `electron` 是开发依赖，不会安装给终端用户。现已改为运行时依赖。
- **跨平台原生绑定** — 此前 widget 仅包含在 CI 运行器（Linux x64）上构建的单一 `better-sqlite3` 预编译二进制文件，无法在 macOS 或 Windows 上加载。新增 `postinstall` 步骤，自动获取匹配用户平台、架构和已安装 Electron ABI 的 `better-sqlite3` 绑定，同时不影响 CLI 使用的 Node-ABI 绑定。

---

## [1.3.3] - 2026-05-28

### 新增
- **Logo 重设计** — 全新上升柱状图图标替代旧 logo
- **联系方式页脚** — 站点新增微信二维码弹窗、Discord、Telegram 和 Email 链接
- 站点联系页脚新增 **Facebook 链接**
- **小米 MiMo 模型定价** 添加到定价表
- **全面站点 SEO 优化** — 结构化数据、meta 标签、favicon 集
- 侧边栏导航新增**官网链接**
- **扩展 Widget 文档** — 截图、面板功能、托盘图标使用说明
- **字体大小可读性和移动端响应式** 改进

### 修复
- **Widget 面板定位与 Node/Electron sqlite ABI 冲突** — 解决 Electron 环境下加载 sqlite 的崩溃问题
- **Widget launcher 语法错误** 导致后台分离失败
- **Widget 托盘图标渲染** — 用新 logo 替换闪电图标
- **PM2 启动失败** — 解决 ESM 和原生模块兼容性问题
- **Docker 发布构建** — 修复损坏的构建流程
- **GitHub 统计徽章** — 通过 API 渲染替代不稳定的 shields.io
- **Node 26 widget sqlite 依赖** — 修复原生绑定加载
- **文档侧边栏滚动** — 导航时保持活动项可见

### 变更
- 最低 Node.js 要求从 18 提升至 20
- 生成的 SvelteKit 构建输出不再纳入 git 跟踪
- README GIF 替换为静态截图
- 站点文档与实际仪表盘行为对齐
- 截图脱敏处理（项目名称、源路径、设备别名）

---

## [1.3.2] - 2026-05-27

### 新增
- README 和 `site` 包中添加官网链接

### 修复
- 修正所有文档中的 PM2 后台服务说明

---

## [1.3.1] - 2026-05-26

### 新增
- **桌面系统托盘 widget** — `@juliantanx/aiusage-widget` 包与 npm 发布工作流 ([#7](https://github.com/juliantanx/aiusage/pull/7))
- **PM2 后台支持** — 通过 PM2 将 aiusage 作为后台服务运行
- **Cursor 工具支持** — 检测并显示 Cursor AI 工具使用情况
- **Widget 端口自动检测** — widget 自动发现后端端口
- **官方配额仪表盘** — 显示订阅用量和限额
- **会话详情页** — `/sessions/[sessionId]` 显示时长、工具调用次数和时间偏移
- **MCP 服务器标签页** — 在概览工具调用卡片中查看热门 MCP 服务器
- **工具调用类型分类** — 按类型（内置、MCP、skill）过滤工具调用
- **Cursor AI 消耗支持** — 解析并显示 Cursor AI 用量数据
- **Skill 名称提取** — 从 Claude Code `Skill` tool_use 块中提取具体 skill 名称，含显示名称分类
- **改进项目名称提取** — 使用 cwd 解析项目名称并显示完整路径

### 修复
- 会话查询 LEFT JOIN 后 SQL 列限定符（`ts`、`tool`）歧义
- Codex 记录显示 `model=unknown` — 解析水印前行并扫描 `turn_context` 事件进行回填
- `formatRelativeTs` 负偏移保护和空记录状态处理
- 会话详情端点中去除 `skill__` 前缀显示名
- SQL LIKE 下划线转义防止 `skill_view` 匹配 `skill__` 过滤器
- 回填 `skill__unknown` 行（不仅限于旧版 Skill 行）
- 当 `input.skill` 缺失时从 `input.name` 提取 skill 名称，同时检查 `input.skillName`
- 工具调用信息提示边框颜色修正
- 验证 `/api/tool-calls` 中的 `toolType` 参数
- 会话详情 URL 中始终包含 `tool` 和 `device` 参数
- 当基于 cwd 的项目名未知时回退到 `source_file` 提取

### 变更
- 移除未使用的 `aiusage-data` gitlink

---

## [1.3.0] - 2026-05-25

### 新增
- CNY 定价与实时汇率 — 以人民币显示价格，启动时自动获取汇率，设置中可配置货币和汇率
- 全新 UI 重设计与设计系统
- Qoder 结构化会话日志解析 ([#5](https://github.com/juliantanx/aiusage/pull/5)，@jlxyfll 贡献)
- Qoder SQLite 数据库解析、cwd 追踪和设置页面重构
- 过滤状态跨页面刷新持久化
- 重置命令、解析进度条和状态设备名修复

### 修复
- 清除覆盖时将 exchangeRate 存储重置为缓存汇率
- 移除 serve.ts 和 pricing.ts 中未使用的导入
- 显式推送带注释的标签以触发下游工作流

---

## [1.2.1] - 2026-05-22

### 新增
- Node.js 18–24 兼容性和多版本 CI 测试
- `pnpm rebuild:sqlite` 脚本，切换 Node 版本后重新编译原生模块
- 自动化 Star History 每日刷新工作流
- Release Patch 一键发布补丁工作流

### 变更
- README（英文/中文）：Node 版本说明、重编译文档、Hermes 支持

---

## [1.2.0] - 2026-05-22

### 新增
- **Hermes Agent 解析器** — 检测并显示 Hermes AI agent 使用情况 ([#3](https://github.com/juliantanx/aiusage/pull/3))
- Hermes 水印管理器和工具类型集成

### 修复
- 将 hermes 添加到工具过滤白名单，修复孤立会话的 token 导入

### 变更
- 通过 engine 约束设置最低 Node.js 要求为 >=18

---

## [1.1.1] - 2026-05-21

### 修复
- UI 布局不再限制为 1100px 最大宽度，修复高分辨率/宽屏显示器右侧空白
- 文档页面文本限制为 72ch 最大宽度以提高宽屏可读性
- `serve` 命令现在优雅处理被占用的开发端口

### 变更
- CI npm 认证重写为直接写入 `~/.npmrc`，不再依赖 `setup-node` registry-url

---

## [1.1.0] - 2026-05-21

### 新增
- 可折叠侧边栏导航，分组区域（分析、数据、管理）与图标
- 应用内文档页面（`/docs`），含 CLI 参考和功能指南
- Token 图表分解/总计模式切换 — 在分类柱状图和单一组合柱状图之间切换
- token 详情表新增思考 token 列

### 修复
- 路由变化时导航活动状态正确更新
- `thinkingTokens` 空值守卫防止字段缺失时 token 总计出现 NaN
- 文档页面目录在 701–800px 视口的粘性偏移修正
- 文档页面响应式断点对齐至 800px
- 侧边栏折叠按钮提示使用 i18n（`nav.expand` / `nav.collapse`）

### 变更
- 导航首页标签重命名：Dashboard → Home
- 更新 README 截图（仪表盘、概览、token 页面）

---

## [1.0.6] - 2026-05-17

### 变更
- CLI 包添加包元数据（homepage、repository、keywords、license）
- README 截图通过 jsDelivr CDN 提供以支持国内访问

---

## [1.0.5] - 2026-05-17

### 变更
- README 截图压缩并重新导出为干净的 PNG
- npm 包中添加 README 文件

---

## [1.0.4] - 2026-05-17

### 新增
- **设置页面** — 通用/源/同步/数据分区，支持 i18n
- **运行时设置控制器** — 更改立即生效无需重启
- **首页重设计** — 实时 token 计数器替代概览统计；统计移至 `/overview`
- **开发模式支持** — tsx 和 Vite API 代理
- 设置表单中的凭据显示/隐藏切换
- `weekStart` 配置字段用于每周聚合起始日

### 修复
- 设置表单动态 type 属性、i18n 显示/隐藏标签
- 空字符串的设备名回退处理
- 轮询间隔使用空值合并回退
- `onConfigUpdated` 测试服务器 try/finally 清理

---

## [1.0.3] - 2026-05-16

### 修复
- **修复 6 个安全和正确性问题**
- 定价表新增模型价格，清理思考相关死代码

### 变更
- 改进测试覆盖率

---

## [1.0.2] - 2026-05-16

### 新增
- **分层项目提取** — 从会话数据中更智能地解析项目名称

### 变更
- 移除仓库中的 superpowers 规划产物

---

## [1.0.1] - 2026-05-16

### 新增
- **OpenCode 支持** — 从 SQLite 解析并显示 OpenCode AI 工具用量
- **自定义源路径** — 配置非默认日志文件位置
- **跨平台修复** — 改善 macOS、Linux 和 Windows 兼容性
- **完整 UI 重设计** — Obsidian Terminal 主题，支持 i18n 和主题系统
- **双向数据同步** — 与 GitHub 和 S3 后端进行拉取/推送
- **Docker 支持** — 容器化部署与部署指南
- **多设备过滤** — CLI 的 `--device` 参数，Web 仪表盘的设备选择器
- **定价管理** — 在设置中编辑和自定义模型定价
- **后台同步** — 进度追踪，按小时分区与数据库视图
- **工具过滤** — 按工具类型过滤仪表盘视图

### 修复
- 包重命名为 `@juliantanx/aiusage` 以避免 npm 命名冲突
- 定价表更新为已验证的 2026 模型价格
- 解析数据丢失和准确性问题
- 防止记录 ID 冲突，跳过检查中包含缓存 token
- 时间戳归一化为整数，添加冲突重试逻辑

---

[1.5.10]: https://github.com/juliantanx/aiusage/compare/v1.5.9...v1.5.10
[1.5.9]: https://github.com/juliantanx/aiusage/compare/v1.5.8...v1.5.9
[1.5.8]: https://github.com/juliantanx/aiusage/compare/v1.5.7...v1.5.8
[1.5.7]: https://github.com/juliantanx/aiusage/compare/v1.5.6...v1.5.7
[1.5.6]: https://github.com/juliantanx/aiusage/compare/v1.5.5...v1.5.6
[1.5.5]: https://github.com/juliantanx/aiusage/compare/v1.5.4...v1.5.5
[1.5.4]: https://github.com/juliantanx/aiusage/compare/v1.5.3...v1.5.4
[1.5.3]: https://github.com/juliantanx/aiusage/compare/v1.5.2...v1.5.3
[1.5.2]: https://github.com/juliantanx/aiusage/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/juliantanx/aiusage/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/juliantanx/aiusage/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/juliantanx/aiusage/compare/v1.3.4...v1.4.0
[1.3.4]: https://github.com/juliantanx/aiusage/compare/v1.3.3...v1.3.4
[1.3.3]: https://github.com/juliantanx/aiusage/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/juliantanx/aiusage/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/juliantanx/aiusage/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/juliantanx/aiusage/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/juliantanx/aiusage/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/juliantanx/aiusage/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/juliantanx/aiusage/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/juliantanx/aiusage/compare/v1.0.6...v1.1.0
[1.0.6]: https://github.com/juliantanx/aiusage/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/juliantanx/aiusage/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/juliantanx/aiusage/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/juliantanx/aiusage/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/juliantanx/aiusage/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/juliantanx/aiusage/releases/tag/v1.0.1

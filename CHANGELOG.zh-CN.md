# 更新日志

本文件记录项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
并遵循 [语义化版本控制](https://semver.org/lang/zh-CN/)。

## [1.4.0] - 2026-06-03

### 新增
- **GitHub Copilot 用量追踪与配额支持** ([#19](https://github.com/juliantanx/aiusage/pull/19)) — CopilotParser 解析 OTEL JSONL 文件（Copilot CLI 和 VS Code Copilot Chat），通过 GitHub OAuth 查询 Copilot 配额 API，自动发现 `~/.copilot/otel/*.jsonl` 和 `$COPILOT_OTEL_FILE_EXPORTER_PATH`
- **KiloCode 解析器** ([#20](https://github.com/juliantanx/aiusage/pull/20)，@zhaolu83949426-hub 贡献) — 解析 KiloCode VS Code 扩展的 SQLite 数据库 (`kilo.db`)，支持输入/输出/缓存/思考 token 和费用计算
- **按模型 token 分解与堆叠柱状图** ([#21](https://github.com/juliantanx/aiusage/pull/21)) — API 暴露每个模型的 inputTokens、outputTokens、cacheReadTokens、cacheWriteTokens、thinkingTokens、totalCost；统一排名列表与堆叠组合柱状图
- **自动检测工具，从 8 个扩展到 22 个** ([#22](https://github.com/juliantanx/aiusage/pull/22)) — 自动检测已安装的 AI 工具，替代手动配置源路径；设置页面只读的"已检测工具"面板；`GET /api/detected-tools` 接口
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

# 设备筛选功能 — 设计文档

**日期：** 2026-05-14
**状态：** 草案

## 概述

为 Web Dashboard 和 CLI `aiusage summary` 添加多设备数据合并展示与设备筛选能力。Dashboard 合并展示本地 `records` 与已同步的 `synced_records` 数据，用户可通过设备筛选器选择查看全部设备或指定设备的数据。

## 目标

- Web Dashboard 所有数据页面支持按设备筛选
- Dashboard 合并展示多设备数据（本地 + 已同步远端）
- CLI `aiusage summary` 支持 `--device` 参数和多设备数据合并
- 无同步数据时行为与改造前完全一致

## 非目标

- 不改变同步逻辑或数据模型
- 不为 CLI 其他命令（export、status 等）添加设备筛选
- 不改变工具调用页和会话页的本地数据约束

## 数据合并与设备筛选查询逻辑

核心规则（与主设计文档一致）：

- `records` = 本地当前设备的记录
- `synced_records` = 从云端拉取的记录（可能包含当前设备的副本 + 其他设备的记录）
- 合并查询时，`synced_records` 必须排除 `device_instance_id = currentDeviceInstanceId` 的行（避免重复计数）

### 设备筛选逻辑

| `device` 参数 | 查询行为 |
|---|---|
| 未指定（"全部设备"） | `records UNION ALL synced_records WHERE device_instance_id != currentDeviceInstanceId` |
| 指定且等于当前设备 | 仅查 `records` |
| 指定且为其他设备 | 仅查 `synced_records WHERE device_instance_id = ?` |

### 设备列表获取

`currentDeviceInstanceId` 从 `~/.aiusage/state.json` 读取。设备列表通过合并 `records` 和 `synced_records`（排除当前设备副本）中的 `device` + `device_instance_id` 去重聚合得出。

## API 改造

### 新增端点：`GET /api/devices`

返回当前可见的设备列表，用于填充筛选下拉框。

**响应格式：**

```json
{
  "currentDeviceInstanceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "devices": [
    { "device": "macbook-pro", "deviceInstanceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "recordCount": 1247 },
    { "device": "desktop-pc", "deviceInstanceId": "e5f67890-abcd-ef12-a1b2c3d4567890", "recordCount": 842 }
  ]
}
```

- `devices` 数组始终包含当前设备（即使记录数为 0）
- 其他设备仅在 `synced_records` 中有记录时出现
- 按 `recordCount` 降序排列

### 现有端点新增 `device` 参数

以下端点新增可选查询参数 `?device=`（值为 `deviceInstanceId`，如 `a1b2c3d4-e5f6-7890-abcd-ef1234567890`）：

| 端点 | 说明 |
|---|---|
| `GET /api/summary` | 概览数据 |
| `GET /api/tokens` | Token 趋势 |
| `GET /api/cost` | 成本趋势 |
| `GET /api/models` | 模型分布 |
| `GET /api/tool-calls` | 工具调用频率 |
| `GET /api/sessions` | 会话列表 |
| `GET /api/projects` | 项目分布 |

### 实现方式

提取公共函数 `getDeviceFilter(db, device)` 返回 SQL WHERE 片段和参数，各端点调用它拼接查询：

```typescript
function getDeviceFilter(
  db: Database.Database,
  device: string | null,
  currentDeviceInstanceId: string,
  prefix = ''
): { where: string; params: Record<string, unknown>; useUnion: boolean }
```

- `device` 为 null 或空字符串 → 全部设备，`useUnion = true`
- `device` 等于当前设备的 `deviceInstanceId` → 仅查 records，`useUnion = false`
- `device` 为其他设备的 `deviceInstanceId` → 仅查 synced_records，`useUnion = false`

### sessions 和 tool-calls 端点特殊处理

设计文档规定"工具调用页和会话页仅查询本地 records + tool_calls"。因此：

- `device` 未指定时，这两个端点仍只查本地数据（行为不变）
- `device` 指定为其他设备时，返回空结果（工具调用不同步到云端）
- `device` 指定为当前设备时，正常查询本地数据

## Dashboard UI 改造

### 新增组件：`DeviceSelector.svelte`

位置：`packages/web/src/lib/components/DeviceSelector.svelte`，放在 `DateRangeSelector` 旁边（同一行）。

**交互逻辑：**

1. 组件挂载时调用 `GET /api/devices` 获取设备列表
2. 下拉框选项：`全部设备` + 各设备别名（附带记录数，如 `macbook-pro (1247)`）
3. 默认选中"全部设备"（`device = ''`）
4. 选择后将值写入 `selectedDevice` store，所有页面的 API 请求自动附带 `?device=` 参数
5. 本地无同步数据时（仅 1 个设备），下拉框仍然显示但只有当前设备一个选项

### Store 改造

在 `packages/web/src/lib/stores.js` 中新增：

```javascript
export const selectedDevice = writable('') // '' = 全部设备，值为 deviceInstanceId

export function setDevice(deviceInstanceId) {
  selectedDevice.set(deviceInstanceId)
}
```

### 各页面数据获取改造

所有页面的数据获取函数从 `selectedDevice` store 读取值，拼入 API 请求参数。例如：

```javascript
// 改造前
const url = `/api/summary?range=${range}`

// 改造后
const deviceParam = $selectedDevice ? `&device=${$selectedDevice}` : ''
const url = `/api/summary?range=${range}${deviceParam}`
```

### 国际化

`DeviceSelector` 的文案需加入 i18n：

- `device.allDevices`：`全部设备` / `All Devices`
- `device.loading`：`加载中...` / `Loading...`

## CLI `aiusage summary` 改造

### 查询逻辑

改造后查询 `records UNION ALL synced_records`（排除当前设备副本），与 Dashboard API 逻辑一致。同步仍不触发（设计有意如此），但已同步的数据会展示。

### 新增 `--device` 参数

- `aiusage summary` — 合并所有设备数据
- `aiusage summary --device macbook-pro` — 只看指定设备（按设备别名匹配，显示时使用别名）

### 输出格式变化

**全部设备（有同步数据时）：**

```
aiusage — 今日摘要 (2026-05-14)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
设备：全部（2 台设备在线）

AI 助手       Token 消耗      成本
Claude Code   12,450 (↑23%)  $0.18
Codex          8,320          $0.09
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
合计          20,770          $0.27
```

**指定设备：**

```
设备：macbook-pro
```

**无同步数据时（纯本地）：** 不显示设备行，行为与改造前完全一致。

## 测试策略

- **单元测试**：`getDeviceFilter()` 函数的三种分支（全部设备 / 当前设备 / 其他设备）
- **API 测试**：各端点在有/无 device 参数下的返回值正确性
- **集成测试**：`/api/devices` 端点在有/无 synced_records 时的返回值
- **E2E 测试**：Dashboard 设备筛选器交互 + `aiusage summary --device` 输出格式

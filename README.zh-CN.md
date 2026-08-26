# dsh-provider-rate-limit

[English](./README.md) | 简体中文

适用于 [DeepSeek Harness](https://github.com/deepseek-ai/dsh) 的按供应商/模型粒度 LLM 限速插件，附带网关身份规则（客户端伪装）能力，面向有身份校验的免费档网关。

## 功能特性

- **令牌桶限速**，按 `(provider, model)` 路由生效 —— 平滑补充、支持突发、空闲后自动恢复额度
- **两种模式**（桶空时）：
  - `wait` —— 排队等待至多 `maxWaitMs` 后放行（对上层完全透明）
  - `reject` —— 立即短路，返回合成的 `RATE_LIMIT` 响应并携带 `providerRetryAfterMs`
- **严格 FIFO** —— 预约式设计保证进入顺序与到达顺序一致，全程无轮询
- **网关身份规则** —— 对匹配 URL 改写 `User-Agent` / 注入静态请求头（用于校验客户端身份的网关），内置一键 **OpenCode Zen** 预设
- **总开关** —— `enabled` 关掉即全量直通，无需反注册监听器，即时生效
- **设置界面卡片** —— 在 Harness 设置页完成全部配置，中英双语
- **实时统计行** —— 聊天输入框下方的精简读数，每 5 秒自动刷新；鼠标悬停可查看各路由 provider·model 明细
- **统计 HTTP 接口** —— `GET /api/provider-rate-limit.stats` 返回聚合与分路由计数的 JSON（供统计行使用，也可对接外部工具）
- **跨插件统计服务** —— `provider-rate-limit/stats` 服务供进程内消费者调用（getStats、getAllStats、getAggregateStats、resetStats）

## 安装

### DSH 插件管理器（推荐）

```bash
dsh plugin --profile web add github:jyao-SUSE-power-group/dsh-provider-rate-limit
```

然后重启 DeepSeek Harness，插件会经 cordis patch 注册进 `llm` 服务。

### 手动安装

```bash
git clone https://github.com/jyao-SUSE-power-group/dsh-provider-rate-limit.git ~/.dsh/plugins/dsh-provider-rate-limit
cd ~/.dsh/plugins/dsh-provider-rate-limit && pnpm install --prod
```

## 配置说明

打开 **设置 → 插件 → Provider Rate Limit**。所有配置热更新，无需重启。

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关；关闭后所有流量直通 |
| `requestsPerMinute` | `20` | 全局稳态速率（无路由规则命中时生效） |
| `burst` | `4` | 桶容量 —— 允许连续瞬时发出的请求数 |
| `mode` | `wait` | `wait` = 排队等待；`reject` = 快速失败 |
| `maxWaitMs` | `30000` | `wait` 模式最长排队时间，超过后回落到 reject 行为 |
| `models` | `[]` | 路由规则：按 provider/model 子串匹配，每条可独立设 RPM/burst |

### 路由规则

路由规则按解析出的 provider id 与模型名的**子串**匹配（例如 provider `opencode` + 模型 `claude-*`）。命中最具体的规则；未命中的流量走全局限额。

### 身份规则

部分免费网关（如 OpenCode Zen）会拒绝"看起来不像官方客户端"的请求。身份规则让选定的出站 URL 携带不同身份：

- `urlPattern` —— 对请求 URL 做子串匹配
- `userAgent` —— 替换后的 `User-Agent`
- `dynamicIds` —— 追加每次请求随机的 `x-opencode-client/project/session/request` 头组
- `headers` —— 任意静态请求头（`Name: Value`），最后应用，因此可以覆盖上面所有项

fetch 补丁带引用计数、干净卸载：插件停用时恰好恢复原生 `fetch` 一次；期间叠在我们之上的其他补丁不会被破坏。

> ⚠️ 请仅为你有权使用、且符合其服务条款的服务伪装身份。

## 实时统计

插件在 **composer dock**（聊天输入框下方）显示精简统计行：

```
限流统计 已拒绝 0 · 已排队 0 · 平均等待 — · 总请求 153 · 活跃路由 3
```

鼠标悬停可查看各路由 provider·model 明细。数据每 5 秒自动刷新。

### HTTP 接口

```
GET /api/provider-rate-limit.stats
```

返回聚合与分路由计数的 JSON：

```json
{
  "ok": true,
  "value": {
    "aggregate": { "reserved": 153, "waited": 0, "totalWaitMs": 0, "rejected": 0, "avgWaitMs": 0, "routes": 3 },
    "routes": {
      "opencode\u0000big-pickle": { "reserved": 117, ... },
      "opencode-vision\u0000big-pickle": { "reserved": 34, ... },
      "amd-r\u0000DeepSeek-V4-Flash": { "reserved": 2, ... }
    }
  }
}
```

## 工作原理

所有出站 LLM 流量经过唯一的 `llm/stream` 钩子（瀑布式收口点，同时覆盖 agent 循环、标题生成与压缩）。每次调用**同步预约**路由令牌桶的一个名额：

```
waitMs = bucket.reserve()        // 由单调地板值精确算出等待时长
if waitMs === 0                  → 立即放行
else if mode=wait && ≤ maxWaitMs → sleep(waitMs) 后放行
else                             → 产出 RATE_LIMIT 结束事件（附 Retry-After 提示）
```

桶的地板值为 `now − (capacity − 1) × interval`，呈现经典的「突发 + 自恢复」语义：空闲一段时间后桶自动回满；运行时调整容量/速率也绝不凭空发放免费突发额度。

## 开发

```bash
pnpm install
npm test   # node:test 套件：桶行为、FIFO、中止/reject、身份补丁、卸载生命周期、总开关
```

## 截图

### 设置卡片

![设置卡片](./assets/screenshots/settings-card.png)

### 设置配置

| | |
|---|---|
| ![设置配置 1](./assets/screenshots/settings-config-1.png) | ![设置配置 2](./assets/screenshots/settings-config-2.png) |

### Composer Dock 实时统计

![Composer Dock 统计](./assets/screenshots/composer-dock-stats.png)

## 许可证

[MIT](./LICENSE)

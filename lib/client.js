window.__ModuleLoader__.load({
	id: "dsh-provider-rate-limit",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let _runtime = require("@deepseek-ai/dsh-client-store");
		let react = require("react");
		let jsxRuntime = require("react/jsx-runtime");
		const { jsx, jsxs, Fragment } = jsxRuntime;

	const NS = "provider-rate-limit";
	const CONFIG_URL = "/api/provider-rate-limit.config";
	// Live counters served by the host half as plain HTTP, like the config route.
	const STATS_URL = "/api/provider-rate-limit.stats";
	const inject = ["slots", "locale", "connection"];
	const OPENCODE_PRESET = {
		urlPattern: "opencode.ai/zen",
		userAgent: "opencode/1.18.25 ai-sdk/provider-utils/4.0.38 runtime/bun/1.3.14",
		dynamicIds: true,
		enabled: true
	};

	// One-click presets shown as buttons under the identity section. Each entry
	// carries its own locale key so labels follow the UI language. Add a gateway
	// by appending { key, rule } once its verified header contract is known —
	// never guess values: a wrong UA looks like replay abuse to the gateway.
	const IDENTITY_PRESETS = [
		{ key: "presetZen", rule: OPENCODE_PRESET },
	];

	// "Name: Value; Name2: Value2" → [{name, value}]. A segment without a
	// colon parses to null so validation can flag it instead of dropping it.
	function parseHeaderList(text) {
		return String(text ?? "")
			.split(";")
			.map((part) => part.trim())
			.filter((part) => part !== "")
			.map((part) => {
				const colon = part.indexOf(":");
				return colon === -1 ? null : { name: part.slice(0, colon).trim(), value: part.slice(colon + 1).trim() };
			});
	}

	// One validator for both the save-button gate and save(), so they cannot drift.
	function draftIssues(draft) {
		const numeric = (value) => Number(value);
		const numbers =
			numeric(draft.requestsPerMinute) < 0 ||
			!Number.isInteger(numeric(draft.burst)) ||
			numeric(draft.burst) < 1 ||
			!Number.isFinite(numeric(draft.maxWaitMs)) ||
			numeric(draft.maxWaitMs) < 0 ||
			!Number.isFinite(numeric(draft.backoffMs)) ||
			numeric(draft.backoffMs) < 0 ||
			!Number.isFinite(numeric(draft.maxBackoffMs)) ||
			numeric(draft.maxBackoffMs) < 0 ||
			!Number.isFinite(numeric(draft.backoffJitter)) ||
			numeric(draft.backoffJitter) < 0 ||
			numeric(draft.backoffJitter) > 1 ||
			!Number.isFinite(numeric(draft.maxConcurrentRequests)) ||
			numeric(draft.maxConcurrentRequests) < 0 ||
			!(Array.isArray(draft.models) ? draft.models : []).every((row) =>
				numeric(row.requestsPerMinute) >= 0 &&
				Number.isInteger(numeric(row.burst)) &&
				numeric(row.burst) >= 1);
		const identity = !(draft.identityRules ?? []).every((row) => {
			if (!(typeof row.urlPattern === "string" && row.urlPattern.trim() !== "")) return false;
			return parseHeaderList(row.headersText).every((header) => header !== null);
		});
		return { numbers, identity };
	}

		const zh = {
			title: "限流配置",
			desc: "按供应商和模型区分 LLM 请求的速率限制,防止触发上游限流",
			enabled: "启用限速",
			enabledHint: "关闭后所有请求直接放行,立即生效",
			defaultRpm: "默认 RPM",
			defaultRpmHint: "未匹配到任何规则时的请求速率(次/分钟)",
			defaultBurst: "默认突发",
			defaultBurstHint: "静默期后允许的连续请求数",
			mode: "超限模式",
			modeReject: "拒绝(自动重试)",
			modeWait: "排队等待",
			maxWaitMs: "最长等待 (ms)",
			maxWaitMsHint: "超过此时间仍未等到令牌则拒绝",
			upstream429Backoff: "上游 429 自动降速",
			upstream429BackoffHint: "遇到上游配额 429 时暂停该路由请求，直到窗口结束",
			backoffMs: "429 冷却时间 (ms)",
			backoffMsHint: "上游未返回 Retry-After 时的初始冷却时长(连续 429 会指数递增至最大冷却上限)",
			maxBackoffMs: "最大冷却时间 (ms)",
			maxBackoffMsHint: "连续 429 时指数递增的最大冷却上限,默认 60000(60s);0=固定冷却",
			backoffJitter: "冷却抖动比例",
			backoffJitterHint: "0-1 之间的随机偏移比例,防惊群;0=确定性延迟",
			maxConcurrentRequests: "最大并发数",
			maxConcurrentRequestsHint: "每路由同时在飞的最大请求数,0=不限",
			rowsTitle: "按路由限速",
			provider: "供应商",
			model: "模型",
			rpm: "RPM",
			burst: "突发",
			allProviders: "全部供应商",
			providerWide: "该供应商全部模型(留空)",
			allModels: "全部模型",
			remove: "移除",
			addRow: "添加限速规则",
			save: "保存",
			discard: "放弃更改",
			resetAll: "恢复默认",
			dirty: "有未保存更改",
			stateOn: "已启用",
			stateOff: "已停用",
			failed: "保存失败",
			invalidNumbers: "无法保存:速率不能为负数(0 表示不限速),突发需为不小于 1 的整数,最长等待/冷却时间不能为负数,抖动比例须在 0-1 之间,并发数不能为负",
			conflictStale: "配置已被其他窗口修改,已加载最新版本;你的修改仍保留,再次点击保存即可覆盖",
			serverRejected: "服务端拒绝",
			resetConfirm: "放弃未保存的更改并恢复默认配置?",
			notWritable: "当前命名空间只读",
			unavailable: "配置界面不可用",
			loading: "加载中…",
			identityTitle: "客户端身份伪装",
			identityDesc: "匹配出站请求 URL 后改写请求头,使网关按官方客户端身份放行(如 OpenCode 免费模型校验 user-agent)",
			identityUrl: "URL 匹配串",
			identityUa: "User-Agent 改写",
			identityUaPlaceholder: "留空则不改写",
			identityDynamic: "动态会话 ID",
			identityHeaders: "自定义 Header(通用,适配任意网关)",
			identityHeadersPlaceholder: "格式 Name: Value,多个用 ; 分隔,留空不添加。如 x-api-key: abc; x-client: myapp",
			identityEnabled: "启用",
			identityAdd: "添加身份规则",
			presetZen: "OpenCode Zen 预设",
			identityInvalid: "身份规则需填写 URL 匹配串;自定义 Header 需为 Name: Value 格式",
			statsTitle: "限流统计",
			statsLoading: "加载中…",
			statsError: "获取统计失败",
			statsRejected: "已拒绝",
			statsWaited: "当前排队",
			statsWaitedTotal: "累计排队",
			statsAvgWait: "平均等待",
			statsTotal: "总请求",
			statsRoutes: "活跃路由",
			statsMore: ""
		};

		const en = {
			title: "Rate limits",
			desc: "Per-provider and per-model rate limits for LLM requests, applied before they reach the upstream",
			enabled: "Enable rate limiting",
			enabledHint: "When off, every request passes through immediately",
			defaultRpm: "Default RPM",
			defaultRpmHint: "Requests per minute for routes without a matching rule",
			defaultBurst: "Default burst",
			defaultBurstHint: "Consecutive requests allowed after a quiet period",
			mode: "When over the limit",
			modeReject: "Reject (auto-retry)",
			modeWait: "Queue and wait",
			maxWaitMs: "Max wait (ms)",
			maxWaitMsHint: "Reject if no token frees up within this window",
			upstream429Backoff: "Back off on upstream 429",
			upstream429BackoffHint: "Pause this route when the upstream returns a 429 (e.g. quota), until the window passes",
			backoffMs: "429 cooldown (ms)",
			backoffMsHint: "Fallback cooldown when the upstream sends no Retry-After (doubles on consecutive 429s up to the max)",
			maxBackoffMs: "Max cooldown (ms)",
			maxBackoffMsHint: "Ceiling for exponential backoff on consecutive 429s; default 60000 (60s); 0 = fixed cooldown",
			backoffJitter: "Cooldown jitter",
			backoffJitterHint: "0–1 symmetric ratio to prevent thundering herd; 0 = deterministic",
			maxConcurrentRequests: "Max concurrent",
			maxConcurrentRequestsHint: "Max in-flight requests per route; 0 = unlimited",
			rowsTitle: "Per-route limits",
			provider: "Provider",
			model: "Model",
			rpm: "RPM",
			burst: "Burst",
			allProviders: "All providers",
			providerWide: "All models of this provider (empty)",
			allModels: "All models",
			remove: "Remove",
			addRow: "Add limit",
			save: "Save",
			discard: "Discard",
			resetAll: "Reset to defaults",
			dirty: "Unsaved changes",
			stateOn: "Enabled",
			stateOff: "Disabled",
			failed: "Save failed",
			invalidNumbers: "Cannot save — rates cannot be negative (0 = unlimited), burst a whole number >= 1, max wait/cooldown non-negative, jitter 0–1, concurrency non-negative",
			conflictStale: "Settings changed in another window; the latest version is loaded. Your edits are kept — click Save again to overwrite",
			serverRejected: "Server rejected",
			resetConfirm: "Discard unsaved changes and restore defaults?",
			notWritable: "Namespace is read-only",
			unavailable: "Config UI unavailable",
			loading: "Loading…",
			identityTitle: "Client identity",
			identityDesc: "Rewrites outbound request headers on matching URLs so gateways treat the client as official (e.g. OpenCode free models check the user-agent)",
			identityUrl: "URL substring",
			identityUa: "User-Agent override",
			identityUaPlaceholder: "Empty keeps the original value",
			identityDynamic: "Dynamic session IDs",
			identityHeaders: "Custom headers (generic, works with any gateway)",
			identityHeadersPlaceholder: "Format Name: Value, separate multiple with ; — e.g. x-api-key: abc; x-client: myapp",
			identityEnabled: "Enabled",
			identityAdd: "Add identity rule",
			presetZen: "OpenCode Zen preset",
			identityInvalid: "Identity rules need a URL substring; custom headers must be Name: Value",
			statsTitle: "Rate limit stats",
			statsLoading: "Loading…",
			statsError: "Failed to load stats",
			statsRejected: "Rejected",
			statsWaited: "Queued now",
			statsWaitedTotal: "Total queued",
			statsAvgWait: "Avg wait",
			statsTotal: "Total",
			statsRoutes: "Active routes",
			statsMore: ""
		};

		const css = ".rl_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:14px;display:flex}.rl_title{margin:0;font-size:16px;font-weight:600;line-height:24px}.rl_desc{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:20px}.rl_field{flex-direction:column;gap:6px;display:flex}.rl_label{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px}.rl_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}.rl_grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;display:grid}.rl_control{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 10px;font-size:13px;height:34px;line-height:1.5}.rl_control:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}.rl_control:disabled{opacity:.55;cursor:default}.rl_select{appearance:none;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");background-position:right 12px center;background-repeat:no-repeat;background-size:12px 12px;padding-right:30px}.rl_rows{flex-direction:column;gap:8px;margin:0;padding:0;list-style:none;display:flex}.rl_row{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;flex-direction:column;gap:10px;padding:12px;display:flex}.rl_rowLine{grid-template-columns:minmax(0,1.2fr) minmax(0,1.4fr) minmax(0,0.7fr) minmax(0,0.7fr) auto;align-items:center;gap:8px;display:grid}.rl_iconGroup{display:flex;align-items:center;gap:4px;justify-content:flex-end}.rl_iconButton{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:6px;font-size:14px;justify-content:center;align-items:center;display:inline-flex}.rl_iconButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.rl_iconButton:disabled{opacity:.4;cursor:default}.rl_addButton{border:1px dashed var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:10px;height:36px;font-size:13px;transition:background .12s}.rl_addButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.rl_addButton:disabled{opacity:.4;cursor:default}.rl_actions{align-items:center;gap:8px;justify-content:flex-end;display:flex}.rl_button{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:16px;height:32px;padding:0 14px;font-size:13px}.rl_button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.rl_button:disabled{opacity:.4;cursor:default}.rl_primary{border:none;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}.rl_primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.rl_badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px}.rl_error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:18px}.rl_unavailable{color:var(--dsw-alias-state-warn-label);margin:0;font-size:12px;line-height:18px}.rl_check{align-items:center;gap:6px;display:flex}.rl_check input{width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer;margin:0}.rl_check span{font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}.rl_idRow{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;flex-direction:column;gap:8px;padding:12px;display:flex}.rl_idLine{grid-template-columns:auto minmax(0,1fr) minmax(0,1.4fr) auto auto;align-items:center;gap:8px;display:grid}.rl_preset{border:1px dashed var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);cursor:pointer;background:0 0;border-radius:10px;height:36px;padding:0 14px;font-size:13px;transition:background .12s}.rl_preset:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.rl_preset:disabled{opacity:.4;cursor:default}.rlCard{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-0,transparent)}.rlCardHead{width:100%;display:flex;align-items:center;gap:8px;padding:13px 16px;background:none;border:none;cursor:pointer;text-align:left;color:inherit;font:inherit;border-radius:12px}.rlCardHead:hover{background:var(--dsw-alias-interactive-bg-hover)}.rlCardHeadStatic{cursor:default}.rlCardHeadStatic:hover{background:none}.rlHeadText{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}.rlName{font-size:14px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}.rlDesc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rl_state{white-space:nowrap;font-size:11px;line-height:17px;padding:1px 8px;border-radius:999px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}.rl_stateOff{opacity:.6}.rlChevron{display:inline-block;transition:transform .15s;color:var(--dsw-alias-label-tertiary)}.rlChevronOpen{transform:rotate(180deg)}.rlCardBody{padding:2px 16px 16px}.rl_fold{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:0 12px}.rl_foldHead{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;padding:10px 0;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);user-select:none}.rl_foldHead::-webkit-details-marker{display:none}.rl_foldRow{display:flex;align-items:center;gap:8px}.rl_chevron{display:inline-block;transition:transform .15s;color:var(--dsw-alias-label-tertiary);font-size:11px}.rl_fold[open] .rl_chevron{transform:rotate(90deg)}.rl_foldBody{display:flex;flex-direction:column;gap:10px;padding:2px 0 12px}.rl_statsCard{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-0,transparent);padding:12px 14px;display:flex;flex-direction:column;gap:8px}.rl_statsHead{display:flex;align-items:center;gap:6px}.rl_statsTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);margin:0}.rl_statsBadge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 7px;font-size:11px;line-height:17px}.rl_statsGrid{grid-template-columns:repeat(4,1fr);gap:6px;display:grid}.rl_statItem{display:flex;flex-direction:column;gap:2px}.rl_statVal{font-size:18px;font-weight:600;line-height:24px;color:var(--dsw-alias-label-primary)}..rl_statLabel{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:16px}.rl_statSub{font-size:10px;color:var(--dsw-alias-label-tertiary);line-height:14px;opacity:.8}.rl_statsRoutes{display:flex;flex-wrap:wrap;align-items:center;gap:4px}.rl_statsRouteLabel{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-right:2px}.rl_statsRouteChip{display:inline-flex;align-items:center;gap:3px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:1px 6px;font-size:11px;color:var(--dsw-alias-label-secondary)}.rl_statsRouteProvider{color:var(--dsw-alias-label-primary)}.rl_statsRouteModel{color:var(--dsw-alias-label-tertiary)}.rl_statsRouteReject{color:var(--dsw-alias-status-danger);font-weight:600}.rl_statsMore{font-size:11px;color:var(--dsw-alias-label-tertiary)}.rl_statsLoading,.rl_statsError{display:flex;flex-direction:column;gap:4px}.rl_statsHint{font-size:12px;color:var(--dsw-alias-label-tertiary)}.rl_statsDock{position:relative;cursor:default}.rl_statsDockDrop{display:none;position:absolute;bottom:100%;left:0;z-index:50;min-width:240px;margin-bottom:6px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 12px;box-shadow:0 -4px 16px rgba(0,0,0,.08)}.rl_statsDock:hover .rl_statsDockDrop{display:block}.rl_statsDockDropTitle{font-size:11px;font-weight:600;color:var(--dsw-alias-label-tertiary);text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px;padding-bottom:4px;border-bottom:1px solid var(--dsw-alias-border-l2)}.rl_statsDockDropRow{display:flex;justify-content:space-between;align-items:center;padding:2px 0;font-size:12px;color:var(--dsw-alias-label-secondary)}.rl_statsDockDropP{color:var(--dsw-alias-label-primary);font-weight:500}.rl_statsDockDropM{color:var(--dsw-alias-label-tertiary);margin-left:3px}.rl_statsDockDropV{font-variant-numeric:tabular-nums;white-space:nowrap}";
		const tagId = "dsh-provider-rate-limit/card.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-provider-rate-limit";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		class RateLimitCardController {
			constructor(api, host) {
				this.api = api;
				this.host = host;
				this.draft = null;
				this.saving = false;
				this.failed = false;
				this.failedConfig = false;
				this.failedIdentity = false;
				this.serverError = null;
				this.stale = false;
				this.providers = [];
				this.modelsByProvider = {}; // provider -> [model id]
				this.state = { status: "loading", writable: true, revision: void 0, value: {} };
				this.store = _runtime.createSnapshotStore(() => this.projection());
				this.statsState = { status: "loading", data: null };
				this.statsStore = _runtime.createSnapshotStore(() => this.statsState);
				this.load();
				this.loadProviders();
				this.loadModels();
				this.startStatsStream();
			}

			async loadStats() {
				try {
					const response = await fetch(STATS_URL);
					if (!response.ok) throw new Error("stats http " + response.status);
					const body = await response.json();
					if (!body || body.ok !== true || !body.value) throw new Error("stats rejected");
					this.statsState = { status: "ready", data: body.value };
				} catch {
					this.statsState = { status: "error", data: null };
				}
				this.statsStore.set(this.statsState);
			}

			startStatsStream() {
				// Prime the stats state once via HTTP so the UI has data immediately.
				this.loadStats();
				// Open a persistent SSE connection; every frame pushes a fresh
				// snapshot so the client never needs to poll for changes.
				const es = new EventSource("/api/provider-rate-limit.events");
				es.onmessage = (ev) => {
					try {
						const payload = JSON.parse(ev.data);
						if (payload && typeof payload === "object") {
							this.statsState = { status: "ready", data: payload };
							this.statsStore.set(this.statsState);
						}
					} catch { /* malformed frame, ignore */ }
				};
				es.onerror = () => {
					// SSE reconnects automatically, but if the endpoint is
					// gone (server restart etc.) fall back to polling.
					es.close();
					this._statsFallbackPoll();
				};
				// Safety net: if the browser doesn't support EventSource
				// (e.g. file:// origin), fall back to polling immediately.
				if (typeof EventSource === "undefined") {
					es.close?.();
					this._statsFallbackPoll();
				}
				this._statsES = es;
			}

			_statsFallbackPoll() {
				if (this._statsFallbackTimer) return;
				this._statsFallbackTimer = setInterval(() => this.loadStats(), 30_000);
			}

			value() {
				const value = this.state.value;
				return value && typeof value === "object" ? value : {};
			}

			projection() {
				const status = this.state.status;
				const effective = this.draft ?? this.value();
				return {
					available: status === "ready",
					writable: this.state.writable !== false,
					status,
					dirty: this.draft !== null,
					saving: this.saving,
					failed: this.failed,
					failedConfig: this.failedConfig === true,
					failedIdentity: this.failedIdentity === true,
					issues: this.draft === null ? { numbers: false, identity: false } : draftIssues(this.draft),
					serverError: this.serverError,
					stale: this.stale === true,
					providers: this.providers,
					modelsByProvider: this.modelsByProvider,
				config: {
					enabled: effective.enabled !== false,
					requestsPerMinute: effective.requestsPerMinute ?? 10,
					burst: effective.burst ?? 2,
					mode: effective.mode ?? "reject",
					maxWaitMs: effective.maxWaitMs ?? 30000,
					upstream429Backoff: effective.upstream429Backoff !== false,
					backoffMs: effective.backoffMs ?? 30000,
					maxBackoffMs: effective.maxBackoffMs ?? 0,
					backoffJitter: effective.backoffJitter ?? 0,
					maxConcurrentRequests: effective.maxConcurrentRequests ?? 0,
					models: Array.isArray(effective.models) ? effective.models : [],
					identityRules: Array.isArray(effective.identityRules) ? effective.identityRules.map((rule) => ({
						...rule,
						headersText: Array.isArray(rule.headers)
							? rule.headers.map((header) => `${header.name}: ${header.value}`).join("; ")
							: ""
					})) : []
				}
				};
			}

			publish() {
				this.store.set(this.projection());
			}

			async load() {
				try {
					const response = await fetch(CONFIG_URL);
					const body = await response.json();
					if (body.ok !== true) {
						this.state = { ...this.state, status: "unavailable" };
					} else {
						this.state = {
							status: "ready",
							writable: body.value.writable !== false,
							revision: body.value.revision,
							value: body.value.value && typeof body.value.value === "object" ? body.value.value : {}
						};
					}
				} catch {
					this.state = { ...this.state, status: "unavailable" };
				}
				this.publish();
			}

			async loadProviders() {
				try {
					const providersResponse = await this.api.llm.providers({});
					if (providersResponse.result.ok) {
						this.providers = providersResponse.result.value.providers
							.filter((entry) => entry.active !== false)
							.map((entry) => entry.provider);
					}
				} catch {}
				this.publish();
			}

			async loadModels() {
				try {
					const modelsResponse = await this.api.llm.models({});
					if (modelsResponse.result.ok) {
						const next = {};
						for (const group of modelsResponse.result.value.groups || []) {
							if (!group || !group.id) continue;
							next[group.id] = (group.models || []).map((model) => model && model.id).filter(Boolean);
						}
						this.modelsByProvider = next;
					}
				} catch {}
				this.publish();
			}

			editConfig(patch) {
				this.draft = { ...this.value(), ...(this.draft ?? {}), ...patch };
				this.failed = false;
				this.failedConfig = false;
				this.serverError = null;
				this.stale = false;
				this.publish();
			}

			editRow(index, patch) {
				const base = this.draft ?? this.value();
				const models = (Array.isArray(base.models) ? base.models : []).map((entry) => ({ ...entry }));
				models[index] = { ...models[index], ...patch };
				this.draft = { ...base, models };
				this.failed = false;
				this.failedConfig = false;
				this.serverError = null;
				this.stale = false;
				this.publish();
			}

			addRow() {
				const base = this.draft ?? this.value();
				const models = [...(Array.isArray(base.models) ? base.models : []), { provider: "", model: "", requestsPerMinute: 10, burst: 2 }];
				this.draft = { ...base, models };
				this.failed = false;
				this.failedConfig = false;
				this.serverError = null;
				this.stale = false;
				this.publish();
			}

			removeRow(index) {
				const base = this.draft ?? this.value();
				const models = (Array.isArray(base.models) ? base.models : []).filter((_, i) => i !== index);
				this.draft = { ...base, models };
				this.failed = false;
				this.failedConfig = false;
				this.serverError = null;
				this.stale = false;
				this.publish();
			}

			editIdentity(index, patch) {
				const base = this.draft ?? this.value();
				const identityRules = (Array.isArray(base.identityRules) ? base.identityRules : []).map((entry) => ({ ...entry }));
				identityRules[index] = { ...identityRules[index], ...patch };
				this.draft = { ...base, identityRules };
				this.failed = false;
				this.failedIdentity = false;
				this.serverError = null;
				this.stale = false;
				this.publish();
			}

			addIdentity(rule) {
				const base = this.draft ?? this.value();
				const identityRules = [...(Array.isArray(base.identityRules) ? base.identityRules : []), rule ?? { urlPattern: "", userAgent: "", dynamicIds: false, enabled: true }];
				this.draft = { ...base, identityRules };
				this.failed = false;
				this.failedIdentity = false;
				this.serverError = null;
				this.stale = false;
				this.publish();
			}

			removeIdentity(index) {
				const base = this.draft ?? this.value();
				const identityRules = (Array.isArray(base.identityRules) ? base.identityRules : []).filter((_, i) => i !== index);
				this.draft = { ...base, identityRules };
				this.failed = false;
				this.failedIdentity = false;
				this.serverError = null;
				this.stale = false;
				this.publish();
			}

			async writeConfig(patch) {
				try {
					const response = await fetch(CONFIG_URL, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ patch, expectedRevision: this.state.revision })
					});
					const body = await response.json();
					if (body.ok !== true) return { ok: false, code: body.code ?? "error", message: typeof body.message === "string" ? body.message : "" };
					this.state = { ...this.state, revision: body.value.revision, value: patch };
					return { ok: true };
				} catch {
					return { ok: false, code: "network", message: "" };
				}
			}

			async save() {
				if (this.draft === null) return;
				const draft = this.draft;
				const issues = draftIssues(draft);
				if (issues.numbers || issues.identity) {
					this.failedConfig = issues.numbers;
					this.failedIdentity = issues.identity;
					this.failed = issues.numbers || issues.identity;
					this.publish();
					return;
				}
				const parsedIdentity = (draft.identityRules ?? []).map((row) => ({
					url: row.urlPattern.trim(),
					headers: parseHeaderList(row.headersText)
				}));
				this.saving = true;
				this.publish();
				const outcome = await this.writeConfig({
					enabled: draft.enabled !== false,
					requestsPerMinute: Number(draft.requestsPerMinute),
					burst: Number(draft.burst),
					mode: draft.mode,
					maxWaitMs: Number(draft.maxWaitMs),
					upstream429Backoff: draft.upstream429Backoff !== false,
					backoffMs: Number(draft.backoffMs ?? 30000),
					maxBackoffMs: Number(draft.maxBackoffMs ?? 0),
					backoffJitter: Number(draft.backoffJitter ?? 0),
					maxConcurrentRequests: Number(draft.maxConcurrentRequests ?? 0),
					models: (Array.isArray(draft.models) ? draft.models : []).map((row) => ({ provider: row.provider ?? "", model: row.model ?? "", requestsPerMinute: Number(row.requestsPerMinute), burst: Number(row.burst) })),
					identityRules: parsedIdentity.map((parsed, index) => {
						const row = draft.identityRules[index];
						// Server rows lack headersText (projection adds it for display only).
						const headers = row.headersText === undefined && Array.isArray(row.headers)
							? row.headers.filter((header) => header && typeof header.name === "string")
							: parsed.headers;
						return { urlPattern: parsed.url, userAgent: row.userAgent ?? "", dynamicIds: row.dynamicIds === true, headers, enabled: row.enabled !== false };
					})
				});
				this.saving = false;
				if (outcome.ok) {
					this.draft = null;
					this.failed = false;
					this.failedConfig = false;
					this.failedIdentity = false;
					this.serverError = null;
					this.stale = false;
				} else if (outcome.code === "settings-rejected" && /revision/i.test(outcome.message)) {
					// Stale revision: refresh from server but keep local edits so a retry wins.
					this.stale = true;
					await this.load();
				} else if (outcome.code === "settings-rejected") {
					this.serverError = outcome.message;
				} else {
					this.failed = true;
				}
				this.publish();
				if (outcome.ok) this.load();
			}

			async resetAll() {
				if (this.saving) return;
				// Destructive and immediate: it overwrites the stored namespace with
				// defaults, silently dropping both the draft and any fields the user
				// forgot were unsaved. Ask once.
				if (this.draft !== null && typeof confirm === "function" && !confirm(this.t ? this.t("resetConfirm") : "Discard unsaved changes and restore defaults?")) return;
				this.saving = true;
				this.publish();
				const { ok } = await this.writeConfig({});
				this.saving = false;
				this.draft = null;
				this.failed = !ok;
				this.failedConfig = !ok;
				this.failedIdentity = false;
				this.publish();
				if (ok) this.load();
			}

				discard() {
					this.draft = null;
					this.failed = false;
					this.failedConfig = false;
					this.failedIdentity = false;
					this.serverError = null;
					this.stale = false;
					this.publish();
				}

		inject() {
			return {
				hooks: { rateLimitCard: this.store, rateLimitStats: this.statsStore },
				save: () => this.save(),
				discard: () => this.discard(),
				resetAll: () => this.resetAll(),
				editConfig: (patch) => this.editConfig(patch),
				editRow: (index, patch) => this.editRow(index, patch),
				addRow: () => this.addRow(),
				removeRow: (index) => this.removeRow(index),
				editIdentity: (index, patch) => this.editIdentity(index, patch),
				addIdentity: (rule) => this.addIdentity(rule),
				removeIdentity: (index) => this.removeIdentity(index)
			};
		}
		}

		function statsSection(stats, t) {
			if (!stats || stats.status === "loading") return null;
			if (stats.status === "error" || !stats.data) {
				return jsxs("div", { className: "rl_statsCard rl_statsError", children: [
					jsx("span", { className: "rl_statsTitle", children: t("statsTitle") }),
					jsx("span", { className: "rl_statsHint", children: t("statsError") })
				] });
			}
			const agg = stats.data.aggregate || {};
			const routes = stats.data.routes || {};
			const routeKeys = Object.keys(routes);
			return jsxs("div", { className: "rl_statsCard", children: [
				jsxs("div", { className: "rl_statsHead", children: [
					jsx("span", { className: "rl_statsTitle", children: t("statsTitle") }),
					routeKeys.length > 0 ? jsx("span", { className: "rl_statsBadge", children: String(routeKeys.length) }) : null
				] }),
				jsxs("div", { className: "rl_statsGrid", children: [
					jsxs("div", { className: "rl_statItem", children: [
						jsx("span", { className: "rl_statVal", style: (agg.rejected || 0) > 0 ? { color: "var(--dsw-alias-status-danger)" } : {} }, String(agg.rejected || 0)),
						jsx("span", { className: "rl_statLabel", children: t("statsRejected") })
					] }),
					jsxs("div", { className: "rl_statItem", children: [
						jsx("span", { className: "rl_statVal", children: String(agg.queuedNow || 0) }),
						jsx("span", { className: "rl_statLabel", children: t("statsWaited") }),
						jsx("span", { className: "rl_statSub", children: `${t("statsWaitedTotal")} ${agg.waited || 0}` })
					] }),
					jsxs("div", { className: "rl_statItem", children: [
						jsx("span", { className: "rl_statVal", children: (agg.avgWaitMs || 0) > 0 ? `${agg.avgWaitMs}ms` : "\u2014" }),
						jsx("span", { className: "rl_statLabel", children: t("statsAvgWait") })
					] }),
					jsxs("div", { className: "rl_statItem", children: [
						jsx("span", { className: "rl_statVal", children: String(agg.reserved || 0) }),
						jsx("span", { className: "rl_statLabel", children: t("statsTotal") })
					] })
				] }),
				routeKeys.length > 0 ? jsxs("div", { className: "rl_statsRoutes", children: [
					jsx("span", { className: "rl_statsRouteLabel", children: t("statsRoutes") }),
					...routeKeys.slice(0, 3).map((key) => {
						const parts = key.split("\u0000");
						const provider = parts[0] || t("allProviders");
						const model = parts.slice(1).join("/");
						const st = routes[key] || {};
						return jsxs("span", { className: "rl_statsRouteChip", children: [
							jsx("span", { className: "rl_statsRouteProvider", children: provider }),
							model ? jsx("span", { className: "rl_statsRouteModel", children: model }) : null,
							(st.rejected || 0) > 0 ? jsx("span", { className: "rl_statsRouteReject", children: `\u00d7${st.rejected}` }) : null
						] }, key);
					}),
					routeKeys.length > 3 ? jsx("span", { className: "rl_statsMore", children: `+${routeKeys.length - 3}` }) : null
				] }) : null
			] });
		}

		function RateLimitCard(props) {
			const state = props.useRateLimitCard((snapshot) => snapshot);
			const stats = props.useRateLimitStats ? props.useRateLimitStats((s) => s) : null;
			const { t } = props;
			const [open, setOpen] = react.useState(false);

			if (state.status === "loading") {
				return jsxs("li", {
					className: "rlCard",
					children: jsxs("div", { className: "rlCardHead rlCardHeadStatic", children: [
						jsx("span", { className: "rlHeadText", children: jsx("span", { className: "rlName", children: t("title") }) }),
						jsx("span", { className: "rlDesc", children: t("loading") })
					] })
				});
			}

			if (!state.available) {
				return jsxs("li", {
					className: "rlCard",
					children: jsxs("div", { className: "rlCardHead rlCardHeadStatic", children: [
						jsx("span", { className: "rlHeadText", children: jsx("span", { className: "rlName", children: t("title") }) }),
						jsx("span", { className: "rl_unavailable", children: t("unavailable") })
					] })
				});
			}

			const disabled = state.saving || state.writable === false;
			const config = state.config;
			const providerOptions = [{ value: "", label: t("allProviders") }, ...state.providers.map((entry) => ({ value: entry, label: entry }))];

			const identityControls = (row, index) => jsxs("div", {
			className: "rl_field",
			children: [
				jsxs("div", {
				className: "rl_idLine",
				children: [
				jsxs("label", {
					className: "rl_check",
					children: [
						jsx("input", { type: "checkbox", checked: row.enabled !== false, disabled, onChange: (event) => props.editIdentity(index, { enabled: event.target.checked }) }),
						jsx("span", { children: t("identityEnabled") })
					]
				}),
				jsx("input", {
					className: "rl_control",
					value: row.urlPattern ?? "",
					placeholder: "opencode.ai/zen",
					disabled,
					onChange: (event) => props.editIdentity(index, { urlPattern: event.target.value })
				}),
				jsx("input", {
					className: "rl_control",
					value: row.userAgent ?? "",
					placeholder: t("identityUaPlaceholder"),
					disabled,
					onChange: (event) => props.editIdentity(index, { userAgent: event.target.value })
				}),
				jsxs("label", {
					className: "rl_check",
					children: [
						jsx("input", { type: "checkbox", checked: row.dynamicIds === true, disabled, onChange: (event) => props.editIdentity(index, { dynamicIds: event.target.checked }) }),
						jsx("span", { children: t("identityDynamic") })
					]
				}),
				jsx("span", {
					className: "rl_iconGroup",
					children: jsx("button", {
						className: "rl_iconButton",
						title: t("remove"),
						disabled,
						onClick: () => props.removeIdentity(index),
						children: "✕"
					})
				})
				]
				}),
				jsx("input", {
					className: "rl_control",
					value: row.headersText ?? "",
					placeholder: t("identityHeadersPlaceholder"),
					title: t("identityHeaders"),
					disabled,
					onChange: (event) => props.editIdentity(index, { headersText: event.target.value })
				})
			]
		});

		const rowControls = (row, index) => {
				const rowModels = row.provider && state.modelsByProvider && state.modelsByProvider[row.provider] ? state.modelsByProvider[row.provider] : [];
				const modelControl = jsxs(Fragment, {
					children: [
						jsx("input", {
							className: "rl_control",
							list: rowModels.length ? "rl-models-" + index : void 0,
							value: row.model,
							disabled,
							placeholder: t("providerWide"),
							onChange: (event) => props.editRow(index, { model: event.target.value })
						}),
						rowModels.length ? jsx("datalist", {
							id: "rl-models-" + index,
							children: rowModels.map((m) => jsx("option", { value: m }, m))
						}) : null
					]
				});
				// A stored provider may be missing from the active list (removed,
				// disabled, renamed since the rule was written). React selects fall
				// back to the first option visually, so saving would silently turn
				// the rule into a global one — pin the stored value in instead.
				const rowProviderOptions = row.provider !== "" && !providerOptions.some((option) => option.value === row.provider)
					? [...providerOptions, { value: row.provider, label: row.provider }]
					: providerOptions;
				return jsxs("div", {
					className: "rl_rowLine",
					children: [
						jsxs("select", {
							className: "rl_control rl_select",
							value: row.provider,
							disabled,
							title: row.provider,
							onChange: (event) => props.editRow(index, { provider: event.target.value, model: "" }),
							children: rowProviderOptions.map((option) => jsx("option", { value: option.value, children: option.label }, option.value))
						}),
						modelControl,
						jsx("input", {
							className: "rl_control",
							type: "number",
							min: 0,
							step: 1,
							value: row.requestsPerMinute,
							disabled,
							onChange: (event) => props.editRow(index, { requestsPerMinute: event.target.valueAsNumber })
						}),
						jsx("input", {
							className: "rl_control",
							type: "number",
							min: 1,
							step: 1,
							value: row.burst,
							disabled,
							onChange: (event) => props.editRow(index, { burst: event.target.valueAsNumber })
						}),
						jsxs("span", {
							className: "rl_iconGroup",
							children: [
								jsx("button", {
									className: "rl_iconButton",
									title: t("remove"),
									disabled,
									onClick: () => props.removeRow(index),
									children: "✕"
								})
							]
						})
					]
				});
			};

		// Collapsible sub-sections: native <details>, uncontrolled so user toggles
		// survive re-renders; ref seeds the initial open state exactly once.
		function fold(title, count, initialOpen, children) {
			return jsxs("details", {
				className: "rl_fold",
				ref: (el) => {
					if (el && !el.dataset.seeded && initialOpen) {
						el.dataset.seeded = "1";
						el.open = true;
					}
				},
				children: [
					jsxs("summary", { className: "rl_foldHead", children: [
						jsx("span", { className: "rl_chevron", "aria-hidden": "true", children: "▸" }),
						title,
						count > 0 ? jsx("span", { className: "rl_badge", children: String(count) }) : null
					] }),
					jsxs("div", { className: "rl_foldBody", children })
				]
			});
		}

		return jsxs("li", {
			className: open ? "rlCard rlCardOpen" : "rlCard",
				children: [
					jsxs("button", {
						type: "button",
						className: "rlCardHead",
						"aria-expanded": open,
						onClick: () => setOpen(!open),
						children: [
							jsxs("span", { className: "rlHeadText", children: [
								jsx("span", { className: "rlName", children: t("title") }),
								jsx("span", { className: "rlDesc", children: t("desc") })
							] }),
							config.enabled !== false
								? jsx("span", { className: "rl_state", children: t("stateOn") })
								: jsx("span", { className: "rl_state rl_stateOff", children: t("stateOff") }),
							state.dirty ? jsx("span", { className: "rl_badge", children: t("dirty") }) : null,
							jsx("span", { className: open ? "rlChevron rlChevronOpen" : "rlChevron", "aria-hidden": "true", children: "▾" })
						]
					}),
					open ? jsxs("div", {
						className: "rl_section rlCardBody",
						children: [
					jsxs("div", {
						className: "rl_grid",
						children: [
							jsxs("div", {
								className: "rl_field",
								children: [
									jsx("label", { className: "rl_label", children: t("enabled") }),
									jsxs("label", {
										className: "rl_check",
										children: [
											jsx("input", {
												type: "checkbox",
												checked: config.enabled !== false,
												disabled,
												onChange: (event) => props.editConfig({ enabled: event.target.checked })
											}),
											jsx("span", { children: t("enabledHint") })
										]
									})
								]
							}),
							jsxs("div", {
								className: "rl_field",
								children: [
									jsx("label", { className: "rl_label", children: t("defaultRpm") }),
									jsx("input", {
										className: "rl_control",
										type: "number",
										min: 0,
										step: 1,
										value: config.requestsPerMinute,
										disabled,
										onChange: (event) => props.editConfig({ requestsPerMinute: event.target.valueAsNumber })
									}),
									jsx("p", { className: "rl_hint", children: t("defaultRpmHint") })
								]
							}),
							jsxs("div", {
								className: "rl_field",
								children: [
									jsx("label", { className: "rl_label", children: t("defaultBurst") }),
									jsx("input", {
										className: "rl_control",
										type: "number",
										min: 1,
										step: 1,
										value: config.burst,
										disabled,
										onChange: (event) => props.editConfig({ burst: event.target.valueAsNumber })
									}),
									jsx("p", { className: "rl_hint", children: t("defaultBurstHint") })
								]
							}),
							jsxs("div", {
								className: "rl_field",
								children: [
									jsx("label", { className: "rl_label", children: t("mode") }),
									jsx("select", {
										className: "rl_control rl_select",
										value: config.mode,
										disabled,
										onChange: (event) => props.editConfig({ mode: event.target.value }),
										children: [
											jsx("option", { value: "reject", children: t("modeReject") }, "reject"),
											jsx("option", { value: "wait", children: t("modeWait") }, "wait")
										]
									}),
									jsx("p", { className: "rl_hint", children: config.mode === "wait" ? t("maxWaitMsHint") : "" })
								]
							}),
							config.mode === "wait"
								? jsxs("div", {
									className: "rl_field",
									children: [
										jsx("label", { className: "rl_label", children: t("maxWaitMs") }),
										jsx("input", {
											className: "rl_control",
											type: "number",
											min: 0,
											step: 100,
											value: config.maxWaitMs,
											disabled,
											onChange: (event) => props.editConfig({ maxWaitMs: event.target.valueAsNumber })
										}),
										jsx("p", { className: "rl_hint", children: t("maxWaitMsHint") })
									]
								})
								: null,
							jsxs("div", {
								className: "rl_field",
								children: [
									jsx("label", {
										className: "rl_check",
										children: [
											jsx("input", {
												type: "checkbox",
												checked: config.upstream429Backoff !== false,
												disabled,
												onChange: (event) => props.editConfig({ upstream429Backoff: event.target.checked })
											}),
											jsx("span", { children: t("upstream429Backoff") })
										]
									}),
									jsx("p", { className: "rl_hint", children: t("upstream429BackoffHint") })
								]
							}),
								config.upstream429Backoff !== false
								? jsxs("div", {
									className: "rl_field",
									children: [
										jsx("label", { className: "rl_label", children: t("backoffMs") }),
										jsx("input", {
											className: "rl_control",
											type: "number",
											min: 0,
											step: 1000,
											value: config.backoffMs,
											disabled,
											onChange: (event) => props.editConfig({ backoffMs: event.target.valueAsNumber })
										}),
										jsx("p", { className: "rl_hint", children: t("backoffMsHint") })
									]
								})
								: null,
							config.upstream429Backoff !== false
								? jsxs("div", {
									className: "rl_field",
									children: [
										jsx("label", { className: "rl_label", children: t("maxBackoffMs") }),
										jsx("input", {
											className: "rl_control",
											type: "number",
											min: 0,
											step: 1000,
											value: config.maxBackoffMs,
											disabled,
											onChange: (event) => props.editConfig({ maxBackoffMs: event.target.valueAsNumber })
										}),
										jsx("p", { className: "rl_hint", children: t("maxBackoffMsHint") })
									]
								})
								: null,
							config.upstream429Backoff !== false
								? jsxs("div", {
									className: "rl_field",
									children: [
										jsx("label", { className: "rl_label", children: t("backoffJitter") }),
										jsx("input", {
											className: "rl_control",
											type: "number",
											min: 0,
											max: 1,
											step: 0.05,
											value: config.backoffJitter,
											disabled,
											onChange: (event) => props.editConfig({ backoffJitter: event.target.valueAsNumber })
										}),
										jsx("p", { className: "rl_hint", children: t("backoffJitterHint") })
									]
								})
								: null,
							jsxs("div", {
								className: "rl_field",
								children: [
									jsx("label", { className: "rl_label", children: t("maxConcurrentRequests") }),
									jsx("input", {
										className: "rl_control",
										type: "number",
										min: 0,
										step: 1,
										value: config.maxConcurrentRequests,
										disabled,
										onChange: (event) => props.editConfig({ maxConcurrentRequests: event.target.valueAsNumber })
									}),
									jsx("p", { className: "rl_hint", children: t("maxConcurrentRequestsHint") })
								]
							})
						]
					}),
					fold(t("rowsTitle"), config.models.length, config.models.length > 0, [
					jsx("ul", {
						className: "rl_rows",
						children: config.models.map((row, index) => jsx("li", { className: "rl_row", children: rowControls(row, index) }, index))
					}),
					jsx("button", {
						className: "rl_addButton",
						disabled,
						onClick: () => props.addRow(),
						children: `+ ${t("addRow")}`
					})
				]),
				fold(t("identityTitle"), config.identityRules.length, config.identityRules.length > 0, [
					jsx("p", { className: "rl_desc", children: t("identityDesc") }),
					config.identityRules.length > 0 ? jsx("ul", {
						className: "rl_rows",
						children: config.identityRules.map((row, index) => jsx("li", { className: "rl_idRow", children: identityControls(row, index) }, index))
					}) : null,
					jsxs("div", {
						className: "rl_actions",
						children: [
							...IDENTITY_PRESETS.map((preset) => jsx("button", {
								className: "rl_preset",
								disabled,
								onClick: () => props.addIdentity({ ...preset.rule }),
								children: t(preset.key)
							}, preset.key)),
							jsx("button", {
								className: "rl_addButton",
								disabled,
								onClick: () => props.addIdentity(),
								children: `+ ${t("identityAdd")}`
							})
						]
					})
				]),
				state.dirty && state.issues.numbers ? jsx("p", { className: "rl_error", children: t("invalidNumbers") }) : null,
				state.dirty && state.issues.identity ? jsx("p", { className: "rl_error", children: t("identityInvalid") }) : null,
				state.serverError ? jsx("p", { className: "rl_error", children: `${t("serverRejected")}: ${state.serverError}` }) : null,
				state.stale ? jsx("p", { className: "rl_hint", children: t("conflictStale") }) : null,
					state.writable === false ? jsx("p", { className: "rl_hint", children: t("notWritable") }) : null,
					jsxs("div", {
						className: "rl_actions",
						children: [
							jsx("button", {
								className: "rl_button",
								disabled: state.saving || !state.dirty,
								onClick: () => props.discard(),
								children: t("discard")
							}),
							jsx("button", {
								className: "rl_button",
								disabled: state.saving || !state.dirty,
								onClick: () => props.resetAll(),
								children: t("resetAll")
							}),
							jsx("button", {
								className: "rl_button rl_primary",
								disabled: state.saving || !state.dirty || state.issues.numbers || state.issues.identity,
								onClick: () => props.save(),
								children: state.saving ? "…" : t("save")
							})
						]
					}),
					statsSection(stats, t)
					] })
					: null
			]
		});
	}

		function apply(ctx) {
			const { api, host } = ctx.get("connection");
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "provider-rate-limit: card dictionaries");
			const controller = new RateLimitCardController(api, host);
			controller.t = t;
			ctx.slots.inject("settings.plugin.item", function* () {
				yield ctx.slots.register({
					name: "settings.plugin.item",
					key: "provider-rate-limit",
					order: 30,
					locale: NS,
					inject: () => controller.inject()
				}, RateLimitCard);
			});

			// Ambient live readout in the band under the composer card. Reads the
			// controller's reactive stats store directly — every SSE frame (or
			// fallback poll) publishes a new snapshot, so no local timer is
			// needed. Mirrors the shipped stats line.
			const ComposerStatsLine = () => {
				const [snap, setSnap] = react.useState(controller.statsState);
				react.useEffect(() => {
					const dispose = controller.statsStore.subscribe(setSnap);
					return () => dispose();
				}, []);
				if (snap.status === "loading") return null;
				if (snap.status === "error" || !snap.data) {
					return jsx("div", {
						style: { fontSize: 12, color: "var(--dsw-alias-status-danger)" },
						children: `${t("statsTitle")}：${t("statsError")}`
					});
				}
				const agg = snap.data.aggregate || {};
				const routeEntries = Object.entries(snap.data.routes || {});
				const routeCount = routeEntries.length;
				const avg = (agg.avgWaitMs || 0) > 0 ? `${agg.avgWaitMs}ms` : "\u2014";
				return jsxs("div", {
					className: "rl_statsDock",
					children: [
						jsxs("div", {
							style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)", display: "flex", gap: 10, alignItems: "center" },
							children: [
								jsx("span", { children: t("statsTitle") }),
								jsx("span", { children: `${t("statsRejected")} ${agg.rejected || 0} \u00b7 ${t("statsWaited")} ${agg.queuedNow || 0} \u00b7 ${t("statsWaitedTotal")} ${agg.waited || 0} \u00b7 ${t("statsAvgWait")} ${avg} \u00b7 ${t("statsTotal")} ${agg.reserved || 0} \u00b7 ${t("statsRoutes")} ${routeCount}` })
							]
						}),
						routeCount > 0 ? jsxs("div", {
							className: "rl_statsDockDrop",
							children: [
								jsx("div", { className: "rl_statsDockDropTitle", children: t("statsRoutes") }),
								routeEntries.map(function (entry) {
									const key = entry[0], val = entry[1];
									const parts = key.split("\u0000");
									const provider = parts[0] || key;
									const model = parts[1] || "";
									return jsxs("div", {
										className: "rl_statsDockDropRow",
										children: [
											jsxs("span", { children: [
												jsx("span", { className: "rl_statsDockDropP", children: provider }),
												model ? jsx("span", { className: "rl_statsDockDropM", children: `\u00b7${model}` }) : null
											] }),
											jsx("span", { className: "rl_statsDockDropV", children: val.reserved || 0 })
										]
									}, key);
								})
							]
						}) : null
					]
				});
			};
			ctx.slots.inject("conversation.composer.dock", function* () {
				yield ctx.slots.register({
					name: "conversation.composer.dock",
					id: "provider-rate-limit/stats-line",
					order: 40
				}, ComposerStatsLine);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

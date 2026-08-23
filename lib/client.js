window.__ModuleLoader__.load({
	id: "dsh-provider-rate-limit",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let _runtime = require("@deepseek-ai/dsh-client-runtime/client");
		let react = require("react");
		let jsxRuntime = require("react/jsx-runtime");
		const { jsx, jsxs, Fragment } = jsxRuntime;

	const NS = "provider-rate-limit";
	const CONFIG_URL = "/api/provider-rate-limit.config";
	const inject = ["slots", "locale", "connection"];
	const OPENCODE_PRESET = {
		urlPattern: "opencode.ai/zen",
		userAgent: "opencode/1.18.18 ai-sdk/provider-utils/4.0.38 runtime/bun/1.3.14",
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
			!(numeric(draft.requestsPerMinute) > 0) ||
			!Number.isInteger(numeric(draft.burst)) ||
			numeric(draft.burst) < 1 ||
			!Number.isFinite(numeric(draft.maxWaitMs)) ||
			numeric(draft.maxWaitMs) < 0 ||
			!(Array.isArray(draft.models) ? draft.models : []).every((row) =>
				numeric(row.requestsPerMinute) > 0 &&
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
			invalidNumbers: "无法保存:速率需大于 0,突发需为不小于 1 的整数,最长等待不能为负数",
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
			identityInvalid: "身份规则需填写 URL 匹配串;自定义 Header 需为 Name: Value 格式"
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
			invalidNumbers: "Cannot save — rates must be > 0, burst a whole number >= 1, and max wait cannot be negative",
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
			identityInvalid: "Identity rules need a URL substring; custom headers must be Name: Value"
		};

		const css = ".rl_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:14px;display:flex}.rl_title{margin:0;font-size:16px;font-weight:600;line-height:24px}.rl_desc{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:20px}.rl_field{flex-direction:column;gap:6px;display:flex}.rl_label{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px}.rl_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}.rl_grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;display:grid}.rl_control{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 10px;font-size:13px;height:34px;line-height:1.5}.rl_control:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}.rl_control:disabled{opacity:.55;cursor:default}.rl_select{appearance:none;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");background-position:right 12px center;background-repeat:no-repeat;background-size:12px 12px;padding-right:30px}.rl_rows{flex-direction:column;gap:8px;margin:0;padding:0;list-style:none;display:flex}.rl_row{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;flex-direction:column;gap:10px;padding:12px;display:flex}.rl_rowLine{grid-template-columns:minmax(0,1.2fr) minmax(0,1.4fr) minmax(0,0.7fr) minmax(0,0.7fr) auto;align-items:center;gap:8px;display:grid}.rl_iconGroup{display:flex;align-items:center;gap:4px;justify-content:flex-end}.rl_iconButton{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:6px;font-size:14px;justify-content:center;align-items:center;display:inline-flex}.rl_iconButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.rl_iconButton:disabled{opacity:.4;cursor:default}.rl_addButton{border:1px dashed var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:10px;height:36px;font-size:13px;transition:background .12s}.rl_addButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.rl_addButton:disabled{opacity:.4;cursor:default}.rl_actions{align-items:center;gap:8px;justify-content:flex-end;display:flex}.rl_button{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:16px;height:32px;padding:0 14px;font-size:13px}.rl_button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.rl_button:disabled{opacity:.4;cursor:default}.rl_primary{border:none;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}.rl_primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.rl_badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px}.rl_error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:18px}.rl_unavailable{color:var(--dsw-alias-state-warn-label);margin:0;font-size:12px;line-height:18px}.rl_check{align-items:center;gap:6px;display:flex}.rl_check input{width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer;margin:0}.rl_check span{font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}.rl_idRow{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;flex-direction:column;gap:8px;padding:12px;display:flex}.rl_idLine{grid-template-columns:auto minmax(0,1fr) minmax(0,1.4fr) auto auto;align-items:center;gap:8px;display:grid}.rl_preset{border:1px dashed var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);cursor:pointer;background:0 0;border-radius:10px;height:36px;padding:0 14px;font-size:13px;transition:background .12s}.rl_preset:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.rl_preset:disabled{opacity:.4;cursor:default}.rlCard{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-0,transparent)}.rlCardHead{width:100%;display:flex;align-items:center;gap:8px;padding:13px 16px;background:none;border:none;cursor:pointer;text-align:left;color:inherit;font:inherit;border-radius:12px}.rlCardHead:hover{background:var(--dsw-alias-interactive-bg-hover)}.rlCardHeadStatic{cursor:default}.rlCardHeadStatic:hover{background:none}.rlHeadText{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}.rlName{font-size:14px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}.rlDesc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rl_state{white-space:nowrap;font-size:11px;line-height:17px;padding:1px 8px;border-radius:999px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}.rl_stateOff{opacity:.6}.rlChevron{display:inline-block;transition:transform .15s;color:var(--dsw-alias-label-tertiary)}.rlChevronOpen{transform:rotate(180deg)}.rlCardBody{padding:2px 16px 16px}.rl_fold{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:0 12px}.rl_foldHead{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;padding:10px 0;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);user-select:none}.rl_foldHead::-webkit-details-marker{display:none}.rl_foldRow{display:flex;align-items:center;gap:8px}.rl_chevron{display:inline-block;transition:transform .15s;color:var(--dsw-alias-label-tertiary);font-size:11px}.rl_fold[open] .rl_chevron{transform:rotate(90deg)}.rl_foldBody{display:flex;flex-direction:column;gap:10px;padding:2px 0 12px}";
		const tagId = "dsh-provider-rate-limit/card.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-provider-rate-limit";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		class RateLimitCardController {
			constructor(api) {
				this.api = api;
				this.draft = null;
				this.saving = false;
				this.failed = false;
				this.failedConfig = false;
				this.failedIdentity = false;
				this.serverError = null;
				this.stale = false;
				this.providers = [];
				this.state = { status: "loading", writable: true, revision: void 0, value: {} };
				this.store = _runtime.createSnapshotStore(() => this.projection());
				this.load();
				this.loadProviders();
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
				config: {
					enabled: effective.enabled !== false,
					requestsPerMinute: effective.requestsPerMinute ?? 10,
					burst: effective.burst ?? 2,
					mode: effective.mode ?? "reject",
					maxWaitMs: effective.maxWaitMs ?? 30000,
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
				hooks: { rateLimitCard: this.store },
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

		function RateLimitCard(props) {
			const state = props.useRateLimitCard((snapshot) => snapshot);
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
				const modelControl = jsx("input", {
					className: "rl_control",
					value: row.model,
					disabled,
					placeholder: t("providerWide"),
					onChange: (event) => props.editRow(index, { model: event.target.value })
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
								: null
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
					})
					] })
					: null
				]
			});
		}

		function apply(ctx) {
			const { api } = ctx.get("connection");
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "provider-rate-limit: card dictionaries");
			const controller = new RateLimitCardController(api);
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
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

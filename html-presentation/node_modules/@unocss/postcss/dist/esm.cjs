//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") {
		for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
			key = keys[i];
			if (!__hasOwnProp.call(to, key) && key !== except) {
				__defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
		}
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let node_fs_promises = require("node:fs/promises");
let node_path = require("node:path");
let node_process = require("node:process");
node_process = __toESM(node_process);
let _unocss_core = require("@unocss/core");
let _unocss_config = require("@unocss/config");
let _unocss_rule_utils = require("@unocss/rule-utils");
let postcss = require("postcss");
postcss = __toESM(postcss);
let tinyglobby = require("tinyglobby");
let css_tree = require("css-tree");

//#region ../../virtual-shared/integration/src/defaults.ts
const defaultFilesystemGlobs = ["**/*.{html,js,ts,jsx,tsx,vue,svelte,astro,elm,php,phtml,mdx,md,marko}"];

//#endregion
//#region src/apply.ts
async function parseApply(root, uno, directiveName) {
	const promises = [];
	root.walkAtRules(directiveName, (rule) => {
		promises.push((async () => {
			if (!rule.parent) return;
			const source = rule.source;
			const classNames = (0, _unocss_core.expandVariantGroup)(rule.params).split(/\s+/g).map((className) => className.trim().replace(/\\/, ""));
			const utils = (await Promise.all(classNames.map((i) => uno.parseToken(i, "-")))).filter(_unocss_core.notNull).flat().sort((a, b) => a[0] - b[0]).sort((a, b) => (a[3] ? uno.parentOrders.get(a[3]) ?? 0 : 0) - (b[3] ? uno.parentOrders.get(b[3]) ?? 0 : 0)).reduce((acc, item) => {
				const target = acc.find((i) => i[1] === item[1] && i[3] === item[3]);
				if (target) target[2] += item[2];
				else acc.push([...item]);
				return acc;
			}, []);
			if (!utils.length) return;
			const parentAfterNodes = [];
			for (const i of utils) {
				const [, _selector, body, parent] = i;
				const selector = (_selector === null || _selector === void 0 ? void 0 : _selector.replace(_unocss_core.regexScopePlaceholder, " ")) || _selector;
				if (parent || selector && selector !== ".\\-" && !selector.startsWith("@property")) {
					const node = (0, css_tree.parse)(rule.parent.toString(), { context: "rule" });
					let newSelector = (0, css_tree.generate)(node.prelude);
					if (selector && selector !== ".\\-") {
						const selectorAST = (0, css_tree.parse)(selector, { context: "selector" });
						const prelude = (0, css_tree.clone)(node.prelude);
						prelude.children.forEach((child) => {
							const parentSelectorAst = (0, css_tree.clone)(selectorAST);
							parentSelectorAst.children.forEach((i$1) => {
								if (i$1.type === "ClassSelector" && i$1.name === "\\-") Object.assign(i$1, (0, css_tree.clone)(child));
							});
							Object.assign(child, parentSelectorAst);
						});
						newSelector = (0, css_tree.generate)(prelude);
					}
					let css = `${newSelector}{${body}}`;
					if (parent) css = `${parent}{${css}}`;
					const css_parsed = postcss.default.parse(css);
					css_parsed.walkDecls((declaration) => {
						declaration.source = source;
					});
					parentAfterNodes.push(...css_parsed.nodes);
				} else {
					const css = postcss.default.parse(body);
					css.walkDecls((declaration) => {
						declaration.source = source;
					});
					rule.parent.insertAfter(rule, css);
				}
			}
			rule.parent.after(parentAfterNodes);
			rule.remove();
		})());
	});
	await Promise.all(promises);
}

//#endregion
//#region src/screen.ts
async function parseScreen(root, uno, directiveName) {
	root.walkAtRules(directiveName, async (rule) => {
		let breakpointName = "";
		let prefix = "";
		if (rule.params) breakpointName = rule.params.trim();
		if (!breakpointName) return;
		const match = breakpointName.match(/^(?:(lt|at)-)?(\w+)$/);
		if (match) {
			prefix = match[1];
			breakpointName = match[2];
		}
		const resolveBreakpoints = () => {
			const key = uno.config.presets.some((p) => p.name === "@unocss/preset-wind4") ? "breakpoint" : "breakpoints";
			const breakpoints = uno.config.theme[key];
			return breakpoints ? Object.entries(breakpoints).sort((a, b) => Number.parseInt(a[1].replace(/[a-z]+/gi, "")) - Number.parseInt(b[1].replace(/[a-z]+/gi, ""))).map(([point, size]) => ({
				point,
				size
			})) : void 0;
		};
		const variantEntries = (resolveBreakpoints() ?? []).map(({ point, size }, idx) => [
			point,
			size,
			idx
		]);
		const generateMediaQuery = (breakpointName$1, prefix$1) => {
			const [, size, idx] = variantEntries.find((i) => i[0] === breakpointName$1);
			if (prefix$1) if (prefix$1 === "lt") return `(max-width: ${(0, _unocss_rule_utils.calcMaxWidthBySize)(size)})`;
			else if (prefix$1 === "at") return `(min-width: ${size})${variantEntries[idx + 1] ? ` and (max-width: ${(0, _unocss_rule_utils.calcMaxWidthBySize)(variantEntries[idx + 1][1])})` : ""}`;
			else throw new Error(`breakpoint variant not supported: ${prefix$1}`);
			return `(min-width: ${size})`;
		};
		if (!variantEntries.find((i) => i[0] === breakpointName)) throw new Error(`breakpoint ${breakpointName} not found`);
		rule.name = "media";
		rule.params = `${generateMediaQuery(breakpointName, prefix)}`;
	});
}

//#endregion
//#region src/theme.ts
async function parseTheme(root, uno) {
	root.walkDecls((decl) => {
		decl.value = (0, _unocss_rule_utils.transformThemeFn)(decl.value, uno.config.theme);
	});
}

//#endregion
//#region src/esm.ts
function createPlugin(options) {
	const { cwd = node_process.default.cwd(), configOrPath } = options;
	const directiveMap = Object.assign({
		apply: "apply",
		theme: "theme",
		screen: "screen",
		unocss: "unocss"
	}, options.directiveMap || {});
	const fileMap = /* @__PURE__ */ new Map();
	const fileClassMap = /* @__PURE__ */ new Map();
	const classes = /* @__PURE__ */ new Set();
	const targetCache = /* @__PURE__ */ new Set();
	const loadConfig = (0, _unocss_config.createRecoveryConfigLoader)();
	const config = loadConfig(cwd, configOrPath);
	let uno;
	let promises = [];
	let last_config_mtime = 0;
	const targetRE = new RegExp(Object.values(directiveMap).join("|"));
	return async function plugin(root, result) {
		var _result$opts$from, _uno$config$content, _uno$config$content2;
		const from = (_result$opts$from = result.opts.from) === null || _result$opts$from === void 0 ? void 0 : _result$opts$from.split("?")[0];
		if (!from) return;
		let isTarget = targetCache.has(from);
		const isScanTarget = root.toString().includes(`@${directiveMap.unocss}`);
		if (targetRE.test(root.toString())) {
			if (!isTarget) {
				root.walkAtRules((rule) => {
					if (rule.name === directiveMap.unocss || rule.name === directiveMap.apply || rule.name === directiveMap.screen) isTarget = true;
					if (isTarget) return false;
				});
				if (!isTarget) root.walkDecls((decl) => {
					if ((0, _unocss_rule_utils.hasThemeFn)(decl.value)) {
						isTarget = true;
						return false;
					}
				});
				else targetCache.add(from);
			}
		} else if (targetCache.has(from)) targetCache.delete(from);
		if (!isTarget) return;
		try {
			const cfg = await config;
			if (!uno) uno = await (0, _unocss_core.createGenerator)(cfg.config);
			else if (cfg.sources.length) {
				const config_mtime = (await (0, node_fs_promises.stat)(cfg.sources[0])).mtimeMs;
				if (config_mtime > last_config_mtime) {
					uno = await (0, _unocss_core.createGenerator)((await loadConfig()).config);
					last_config_mtime = config_mtime;
				}
			}
		} catch (error) {
			throw new Error(`UnoCSS config not found: ${error.message}`);
		}
		const globs = ((_uno$config$content = uno.config.content) === null || _uno$config$content === void 0 ? void 0 : _uno$config$content.filesystem) ?? defaultFilesystemGlobs;
		const needCheckNodeMoudules = globs.some((i) => i.includes("node_modules"));
		const plainContent = ((_uno$config$content2 = uno.config.content) === null || _uno$config$content2 === void 0 ? void 0 : _uno$config$content2.inline) ?? [];
		const entries = await (0, tinyglobby.glob)(isScanTarget ? globs : [from], {
			cwd,
			absolute: true,
			ignore: needCheckNodeMoudules ? void 0 : ["**/node_modules/**"],
			expandDirectories: false
		});
		await parseApply(root, uno, directiveMap.apply);
		await parseTheme(root, uno);
		await parseScreen(root, uno, directiveMap.screen);
		promises.push(...plainContent.map(async (c$1, idx) => {
			if (typeof c$1 === "function") c$1 = await c$1();
			if (typeof c$1 === "string") c$1 = { code: c$1 };
			const { matched } = await uno.generate(c$1.code, { id: c$1.id ?? `__plain_content_${idx}__` });
			for (const candidate of matched) classes.add(candidate);
		}));
		await Promise.all(promises);
		promises = [];
		const BATCH_SIZE = 500;
		for (let i = 0; i < entries.length; i += BATCH_SIZE) {
			const batch = entries.slice(i, i + BATCH_SIZE);
			promises.push(...batch.map(async (file) => {
				result.messages.push({
					type: "dependency",
					plugin: directiveMap.unocss,
					file: (0, node_path.normalize)(file),
					parent: from
				});
				const { mtimeMs } = await (0, node_fs_promises.stat)(file);
				if (fileMap.has(file) && mtimeMs <= fileMap.get(file)) return;
				fileMap.set(file, mtimeMs);
				const content = await (0, node_fs_promises.readFile)(file, "utf8");
				const { matched } = await uno.generate(content, { id: file });
				fileClassMap.set(file, matched);
			}));
			await Promise.all(promises);
			promises = [];
		}
		for (const set of fileClassMap.values()) for (const candidate of set) classes.add(candidate);
		const c = await uno.generate(classes);
		classes.clear();
		const excludes = [];
		root.walkAtRules(directiveMap.unocss, (rule) => {
			const source = rule.source;
			if (rule.params) {
				const excludeLayers = [];
				const includeLayers = [];
				for (const layer of rule.params.split(",")) {
					const name = layer.trim();
					if (!name) continue;
					if (name.startsWith("!")) {
						if (name.slice(1)) excludeLayers.push(name.slice(1));
					} else includeLayers.push(name);
				}
				if (excludeLayers.length > 0 && includeLayers.length > 0) console.warn(`Warning: Mixing normal and negated layer names in "@${directiveMap.unocss} ${rule.params}" is not recommended.`);
				let result$1 = "";
				if (includeLayers.length > 0) {
					result$1 = includeLayers.map((i) => (i === "all" ? c.getLayers() : c.getLayer(i)) || "").filter(Boolean).join("\n");
					excludes.push(...includeLayers);
				} else if (excludeLayers.length > 0) {
					result$1 = c.getLayers(void 0, excludeLayers) || "";
					excludes.push(...excludeLayers);
				}
				const css = postcss.default.parse(result$1);
				css.walkDecls((declaration) => {
					declaration.source = source;
				});
				rule.replaceWith(css);
			} else {
				const css = postcss.default.parse(c.getLayers(void 0, excludes) || "");
				css.walkDecls((declaration) => {
					declaration.source = source;
				});
				rule.replaceWith(css);
			}
		});
	};
}

//#endregion
exports.createPlugin = createPlugin;
import { toArray } from "@unocss/core";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";

//#region ../../virtual-shared/integration/src/env.ts
function getEnvFlags() {
	const isNode = typeof process !== "undefined" && process.stdout;
	return {
		isNode,
		isVSCode: isNode && !!process.env.VSCODE_CWD,
		isESLint: isNode && !!process.env.ESLINT
	};
}

//#endregion
//#region src/resolver/babel.ts
const traverse = _traverse.default || _traverse;
async function attributifyJsxBabelResolver(params) {
	const { code, uno, isBlocked } = params;
	const tasks = [];
	const ast = parse(code.toString(), {
		sourceType: "module",
		plugins: ["jsx", "typescript"]
	});
	if (ast.errors?.length) throw new Error(`Babel parse errors:\n${ast.errors.join("\n")}`);
	traverse(ast, { JSXAttribute(path) {
		if (path.node.value === null) {
			const attr = path.node.name.type === "JSXNamespacedName" ? `${path.node.name.namespace.name}:${path.node.name.name.name}` : path.node.name.name;
			if (isBlocked(attr)) return;
			tasks.push(uno.parseToken(attr).then((matched) => {
				if (matched) code.appendRight(path.node.end, "=\"\"");
			}));
		}
	} });
	await Promise.all(tasks);
}

//#endregion
//#region src/resolver/regex.ts
const elementRE = /<([^/?<>0-9$_!][^\s>]*)\s+((?:"[^"]*"|'[^"]*'|(\{[^}]*\})|[^{>])+)>/g;
const attributeRE = /(?<![~`!$%^&*()_+\-=[{;':"|,.<>/?])([a-z()#][[?\w\-:()#%\]]*)(?:\s*=\s*('[^']*'|"[^"]*"|\S+))?|\{[^}]*\}/gi;
const valuedAttributeRE = /((?!\d|-{2}|-\d)[\w\u00A0-\uFFFF:!%.~<-]+)=(?:"[^"]*"|'[^']*'|(\{)((?:[`(][^`)]*[`)]|[^}])+)(\}))/g;
async function attributifyJsxRegexResolver(params) {
	const { code, uno, isBlocked } = params;
	const tasks = [];
	const attributifyPrefix = uno.config.presets.find((i) => i.name === "@unocss/preset-attributify")?.options?.prefix ?? "un-";
	for (const item of Array.from(code.original.matchAll(elementRE))) {
		let attributifyPart = item[2];
		if (valuedAttributeRE.test(attributifyPart)) attributifyPart = attributifyPart.replace(valuedAttributeRE, (match, _, dynamicFlagStart) => {
			if (!dynamicFlagStart) return " ".repeat(match.length);
			let preLastModifierIndex = 0;
			let temp = match;
			for (const _item of match.matchAll(elementRE)) {
				const attrAttributePart = _item[2];
				if (valuedAttributeRE.test(attrAttributePart)) attrAttributePart.replace(valuedAttributeRE, (m) => " ".repeat(m.length));
				const pre = temp.slice(0, preLastModifierIndex) + " ".repeat(_item.index + _item[0].indexOf(_item[2]) - preLastModifierIndex) + attrAttributePart;
				temp = pre + " ".repeat(_item.input.length - pre.length);
				preLastModifierIndex = pre.length;
			}
			if (preLastModifierIndex !== 0) return temp;
			return " ".repeat(match.length);
		});
		for (const attr of attributifyPart.matchAll(attributeRE)) {
			const matchedRule = attr[0];
			if (matchedRule.includes("=") || isBlocked(matchedRule)) continue;
			const updatedMatchedRule = matchedRule.startsWith(attributifyPrefix) ? matchedRule.slice(attributifyPrefix.length) : matchedRule;
			tasks.push(uno.parseToken(updatedMatchedRule).then((matched) => {
				if (matched) {
					const startIdx = (item.index || 0) + (attr.index || 0) + item[0].indexOf(item[2]);
					const endIdx = startIdx + matchedRule.length;
					code.overwrite(startIdx, endIdx, `${matchedRule}=""`);
				}
			}));
		}
	}
	await Promise.all(tasks);
}

//#endregion
//#region src/index.ts
function createFilter(include, exclude) {
	const includePattern = toArray(include || []);
	const excludePattern = toArray(exclude || []);
	return (id) => {
		if (excludePattern.some((p) => id.match(p))) return false;
		return includePattern.some((p) => id.match(p));
	};
}
function transformerAttributifyJsx(options = {}) {
	const { blocklist = [] } = options;
	const isBlocked = (matchedRule) => {
		for (const blockedRule of blocklist) if (blockedRule instanceof RegExp) {
			if (blockedRule.test(matchedRule)) return true;
		} else if (matchedRule === blockedRule) return true;
		return false;
	};
	return {
		name: "@unocss/transformer-attributify-jsx",
		enforce: "pre",
		idFilter: createFilter(options.include || [/\.[jt]sx$/, /\.mdx$/], options.exclude || []),
		async transform(code, id, { uno }) {
			try {
				if (getEnvFlags().isVSCode) return;
			} catch {}
			const params = {
				code,
				id,
				uno,
				isBlocked
			};
			try {
				await attributifyJsxBabelResolver(params);
			} catch (error) {
				console.warn(`[@unocss/transformer-attributify-jsx]: Babel resolver failed for "${id}", falling back to regex resolver:`, error);
				await attributifyJsxRegexResolver(params);
			}
		}
	};
}

//#endregion
export { transformerAttributifyJsx as default };
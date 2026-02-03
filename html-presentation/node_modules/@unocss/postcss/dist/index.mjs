//#region src/index.ts
function unocss(options = {}) {
	var _options$directiveMap;
	let promise;
	return {
		postcssPlugin: ((_options$directiveMap = options.directiveMap) === null || _options$directiveMap === void 0 ? void 0 : _options$directiveMap.unocss) || "unocss",
		plugins: [async (root, result) => {
			if (!promise) promise = import("@unocss/postcss/esm").then((r) => r.createPlugin(options));
			return await (await promise)(root, result);
		}]
	};
}
unocss.postcss = true;
unocss.default = unocss;
var src_default = unocss;

//#endregion
export { src_default as default };
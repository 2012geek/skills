import { VitePluginConfig } from "@unocss/vite";
import * as vite0 from "vite";
export * from "@unocss/vite";

//#region src/vite.d.ts
declare function UnocssVitePlugin<Theme extends object>(configOrPath?: VitePluginConfig<Theme> | string): vite0.Plugin<any>[];
//#endregion
export { UnocssVitePlugin as default };
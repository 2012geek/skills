import { WebpackPluginOptions } from "@unocss/webpack";
export * from "@unocss/webpack";

//#region src/webpack.d.ts
declare function UnocssWebpackPlugin<Theme extends object>(configOrPath?: WebpackPluginOptions<Theme> | string): any;
//#endregion
export { UnocssWebpackPlugin as default };
import { Result, Root } from "postcss";
import { UserConfig } from "@unocss/core";

//#region src/types.d.ts
interface UnoPostcssPluginOptions {
  content?: (string | {
    raw: string;
    extension: string;
  })[];
  directiveMap?: {
    apply?: string;
    screen?: string;
    theme?: string;
    unocss?: string;
  };
  cwd?: string;
  configOrPath?: string | UserConfig;
}
//#endregion
//#region src/index.d.ts
declare function unocss(options?: UnoPostcssPluginOptions): {
  postcssPlugin: string;
  plugins: ((root: Root, result: Result) => Promise<void>)[];
};
declare namespace unocss {
  export var postcss: boolean;
  var _a: typeof unocss;
  export { _a as default };
}
//#endregion
export { UnoPostcssPluginOptions, unocss as default };
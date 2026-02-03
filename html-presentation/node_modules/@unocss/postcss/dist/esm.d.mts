import { UserConfig } from "@unocss/core";
import { Result, Root } from "postcss";

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
//#region src/esm.d.ts
declare function createPlugin(options: UnoPostcssPluginOptions): (root: Root, result: Result) => Promise<void>;
//#endregion
export { createPlugin };
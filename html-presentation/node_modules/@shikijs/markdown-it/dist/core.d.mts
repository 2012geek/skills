import MarkdownIt from 'markdown-it';
import { HighlighterGeneric } from 'shiki';
import { M as MarkdownItShikiSetupOptions } from './shared/markdown-it.BMSlR5u0.mjs';
export { a as MarkdownItShikiExtraOptions } from './shared/markdown-it.BMSlR5u0.mjs';

declare function setupMarkdownIt(markdownit: MarkdownIt, highlighter: HighlighterGeneric<any, any>, options: MarkdownItShikiSetupOptions): void;
declare function fromHighlighter(highlighter: HighlighterGeneric<any, any>, options: MarkdownItShikiSetupOptions): (markdownit: MarkdownIt) => void;

export { MarkdownItShikiSetupOptions, fromHighlighter, setupMarkdownIt };

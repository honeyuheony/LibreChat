import { cjkFriendlyExtension } from 'micromark-extension-cjk-friendly';
import type { Extension } from 'micromark-util-types';

type ParserData = { micromarkExtensions?: Extension[] };

/**
 * remark plugin that lets `**`/`*` close after a bracket or period when a Korean,
 * Chinese or Japanese character follows (`**3년(2+1년)**이며`), which CommonMark's
 * flanking rule refuses. It registers the micromark extension the way `remark-gfm`
 * registers its own; `remark-cjk-friendly` does the same but requires unified 11,
 * which would install a second copy beside this app's unified 10.
 */
export function remarkCjkEmphasis(this: unknown) {
  /** Typed loosely on purpose: this app hands the plugin to both unified 10 (chat
   *  messages) and react-markdown's unified 11 (task results). */
  const data = (this as { data: () => ParserData }).data();
  (data.micromarkExtensions ??= []).push(cjkFriendlyExtension());
}

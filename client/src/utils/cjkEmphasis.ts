import { cjkFriendlyExtension } from 'micromark-extension-cjk-friendly';
import type { Extension } from 'micromark-util-types';

type ParserData = { micromarkExtensions?: Extension[] };

/** CommonMark는 강조 종료 표식 뒤에 한글·중국어·일본어 문자가 오면 강조로 처리하지 않는다.
 * remark-cjk-friendly는 unified 11을 요구해 unified 10과 중복 설치되므로 직접 등록한다. */
export function remarkCjkEmphasis(this: unknown) {
  /** unified 10과 react-markdown의 unified 11에서 함께 써 plugin 타입을 느슨하게 둔다. */
  const data = (this as { data: () => ParserData }).data();
  (data.micromarkExtensions ??= []).push(cjkFriendlyExtension());
}

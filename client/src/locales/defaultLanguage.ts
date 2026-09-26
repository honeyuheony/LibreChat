/**
 * The language a browser gets before its user picks one. The service is for a Korean
 * organization, so an English-language browser still opens in Korean; choosing 「자동 감지」
 * in settings brings the browser's own language back. Kept apart from `i18n.ts`, whose import
 * starts i18next, so the language store can read it without that side effect.
 */
export const DEFAULT_LANGUAGE = 'ko-KR';

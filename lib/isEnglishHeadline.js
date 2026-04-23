/**
 * Heuristic: headline is primarily Latin-script English.
 * NewsAPI's language=en is unreliable; sources often mis-tag multilingual feeds.
 */

const NON_LATIN_SCRIPTS =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af\u0600-\u06ff\u0590-\u05ff\u0400-\u04ff\u0e00-\u0e7f\u0900-\u097f\u0d80-\u0dff\u0370-\u03ff]/;

export function isLikelyEnglishHeadline(str) {
  if (typeof str !== 'string' || !str.trim()) return false;
  const t = str.trim();
  if (NON_LATIN_SCRIPTS.test(t)) return false;
  if (!/[a-zA-Z]/.test(t)) return false;
  return true;
}

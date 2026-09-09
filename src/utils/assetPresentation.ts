/** Presentation guard for DB-projected image values. Raw asset IDs are not URLs. */
export function resolvePresentableAssetUrl(value: unknown): string | null {
  const candidate = String(value || "").trim();
  // Version the four approved pre-open replacements, including older DB URLs.
  if (/^\/promotion\/(gvg_preopen_mission_keyvisual|mypage_banner_gvg_prep|guild_power_ranking_keyvisual|mypage_banner_guild_power_ranking)\.webp(?:\?.*)?$/.test(candidate)) {
    return `${candidate.split("?")[0]}?v=20260905`;
  }
  if (candidate.startsWith("/")) {
    if (/^\/bg\/bg_street_[a-z0-9_-]+\.png$/i.test(candidate)) return candidate.replace(/\.png$/i, ".jpg");
    if (/^\/gacha\/bg_gacha_(normal|sr|ssr)\.png$/i.test(candidate)) return candidate.replace(/\.png$/i, ".jpg");
    if (/^\/skills\/(basic|skill)_[a-z0-9_-]+\.png$/i.test(candidate)) return candidate.replace(/\.png$/i, ".jpg");
    if (candidate === "/banner_beginner_pack.png") return "/banner_beginner_pack.jpg";
    return candidate;
  }
  if (/^https:\/\//i.test(candidate)) return candidate;
  return null;
}

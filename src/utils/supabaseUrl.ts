const PRODUCTION_SUPABASE_PROJECT_REF = "ktpolnkyyfkowxdmijww";

const PRODUCTION_SUPABASE_ORIGIN_PATTERN =
  /^https:\/\/(?:ktpolnkyyfkowxdmijww\.supabase\.co|api\.tribe-neon\.com)\/?$/i;

const STANDARD_SUPABASE_ORIGIN_PATTERN = /^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i;

export function getSupabaseProjectRef(value: string): string | null {
  const url = value.trim();
  if (/^https:\/\/api\.tribe-neon\.com\/?$/i.test(url)) {
    return PRODUCTION_SUPABASE_PROJECT_REF;
  }
  return STANDARD_SUPABASE_ORIGIN_PATTERN.exec(url)?.[1]?.toLowerCase() ?? null;
}

export function isValidSupabaseUrl(value: string, appEnvironment: string): boolean {
  const url = value.trim();
  if (appEnvironment.trim().toLowerCase() === "production") {
    return PRODUCTION_SUPABASE_ORIGIN_PATTERN.test(url)
      && getSupabaseProjectRef(url) === PRODUCTION_SUPABASE_PROJECT_REF;
  }
  return STANDARD_SUPABASE_ORIGIN_PATTERN.test(url);
}

export const SITE_ORIGIN = "https://www.tribe-neon.com";
export const SITE_TITLE = "TRIBE NEON｜現代東京を舞台にしたブラウザRPG";
export const SITE_DESCRIPTION =
  "現代東京を舞台に、キャラクターを育成し、仲間とギルドで競うブラウザRPG『TRIBE NEON』。アプリのダウンロード不要でプレイできます。";
export const SOCIAL_IMAGE_PATH = "/ogp-image.png";

export function isVercelProduction(): boolean {
  return process.env.VERCEL_ENV === "production";
}

import type { MetadataRoute } from "next";
import { isVercelProduction, SITE_ORIGIN } from "./crawlerMetadata";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isVercelProduction()) return [];
  return [{ url: `${SITE_ORIGIN}/` }];
}

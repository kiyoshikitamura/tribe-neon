import type { MetadataRoute } from "next";
import { isVercelProduction, SITE_ORIGIN } from "./crawlerMetadata";

export default function robots(): MetadataRoute.Robots {
  if (!isVercelProduction()) {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}

import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "./crawlerMetadata";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TRIBE NEON",
    short_name: "TRIBE NEON",
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "16x16 32x32 48x48 256x256",
        type: "image/x-icon",
        purpose: "any",
      },
    ],
  };
}

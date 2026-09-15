"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/utils/supabase";
import { resolvePresentableAssetUrl } from "@/utils/assetPresentation";
import { createGuildEmblemCache, type GuildEmblemRow } from "@/domain/presentation/guildEmblemCache";
import "./GuildIdentity.css";

const DEFAULT = "/guild-emblems/guild_standard_01.svg";
const cache = createGuildEmblemCache(async ids => {
  const { data, error } = await supabase.rpc("get_guild_emblems", { p_guild_ids: ids });
  if (error) throw error;
  return Array.isArray(data) ? data as GuildEmblemRow[] : [];
});
export function refreshGuildEmblem(guildId: string) { return cache.invalidate(guildId); }

export function GuildEmblem({ guildId, legacySrc, size = "s" }: {
  guildId?: string | null; legacySrc?: string | null; size?: "s" | "m" | "l";
}) {
  const id = guildId || "";
  const subscribe = useCallback((listener: () => void) => cache.subscribe(id, listener), [id]);
  const read = useCallback(() => cache.get(id), [id]);
  const path = useSyncExternalStore(subscribe, read, () => undefined);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") cache.request(id); };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [id]);
  const src = resolvePresentableAssetUrl(path === undefined ? legacySrc : path) || DEFAULT;
  return <img className={`guild-emblem guild-emblem--${size}`} src={failedSrc === src ? DEFAULT : src} alt="" aria-hidden="true" onError={() => setFailedSrc(src)} />;
}

export default function GuildIdentity({ guildId, name, size = "s", legacySrc }: {
  guildId?: string | null; name: string; size?: "s" | "m" | "l"; legacySrc?: string | null;
}) {
  return <span className="guild-identity-label"><GuildEmblem guildId={guildId} legacySrc={legacySrc} size={size} /><span className="guild-identity-label__name">{name}</span></span>;
}

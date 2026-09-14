"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import honors from "@/domain/gameplay/canonical/data/season_power_honors_20260914.json";
import { refreshGuildEmblem } from "./GuildIdentity";
import "./SeasonHonors.css";

type Scope = "USER" | "GUILD";
type Equipped = { slot: string; cosmetic_id: string };
export const isSeasonHonorTitle = (value: string | null | undefined) => honors.some(honor => honor.slot === "PROFILE_TITLE" && (honor.id === value || honor.display_name === value));
const slotNames: Record<string, string> = { PROFILE_TITLE: "称号", PROFILE_BADGE: "バッジ", GUILD_EMBLEM: "紋章", GUILD_BASE_BACKGROUND: "拠点装飾", GUILD_TITLE: "称号", GUILD_BADGE: "バッジ" };

/** Only actual owned IDs are selectable; public views read equipped honors only. */
export default function SeasonHonors({ ownerId, scope, editable = false, onEquipped }: { ownerId?: string | null; scope: Scope; editable?: boolean; onEquipped?: (slot: string, id: string) => void }) {
  const [equipped, setEquipped] = useState<Equipped[]>([]);
  const [owned, setOwned] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("season-honors-changed", refresh);
    return () => window.removeEventListener("season-honors-changed", refresh);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setEquipped([]); setOwned([]); setError("");
    if (!ownerId) return;
    void (async () => {
      const [current, inventory] = await Promise.all([
        supabase.rpc("get_equipped_season_honors", { p_owner_scope: scope, p_owner_id: ownerId }),
        editable ? supabase.from(scope === "USER" ? "user_cosmetics" : "guild_cosmetics").select("cosmetic_id, expires_at").eq(scope === "USER" ? "user_id" : "guild_id", ownerId) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (current.error || inventory?.error) { if (editable) setError("シーズン装飾を取得できませんでした。"); return; }
      setEquipped(Array.isArray(current.data) ? current.data : []);
      setOwned((inventory?.data || []).filter(row => !row.expires_at || Date.parse(row.expires_at) > Date.now()).map(row => row.cosmetic_id));
    })().catch(() => { if (!cancelled && editable) setError("シーズン装飾を取得できませんでした。"); });
    return () => { cancelled = true; };
  }, [ownerId, scope, editable, revision]);
  const visible = honors.filter(honor => honor.owner_scope === scope && equipped.some(row => row.slot === honor.slot && row.cosmetic_id === honor.id));
  const available = honors.filter(honor => honor.owner_scope === scope && owned.includes(honor.id));
  const equip = async (slot: string, id: string) => {
    if (pending || !ownerId || !(slot === "PROFILE_TITLE" && id === "title_none") && !available.some(honor => honor.id === id && honor.slot === slot)) return;
    setPending(true); setError("");
    try {
      const args = { p_slot: slot, p_cosmetic_id: id };
      const result = scope === "USER"
        ? slot === "PROFILE_TITLE"
          ? await supabase.rpc("equip_owned_title", { p_title_id: id })
          : await supabase.rpc("equip_user_cosmetic", args)
        : slot === "GUILD_EMBLEM"
          ? await supabase.rpc("set_guild_emblem", { p_guild_id: ownerId, p_emblem_id: id })
          : await supabase.rpc("equip_guild_cosmetic", { ...args, p_guild_id: ownerId });
      if (result.error) throw result.error;
      if (scope === "GUILD" && slot === "GUILD_EMBLEM") await refreshGuildEmblem(ownerId);
      setEquipped(current => [...current.filter(row => row.slot !== slot), { slot, cosmetic_id: id }]);
      onEquipped?.(slot, id);
      window.dispatchEvent(new Event("season-honors-changed"));
    } catch { setError("装飾の保存に失敗しました。"); } finally { setPending(false); }
  };
  if (!visible.length && !available.length && !error) return null;
  return <div className="season-honors" aria-label="シーズン装飾">
    {visible.map(honor => <span key={honor.id} className={`season-honor season-honor--${honor.grade}`} data-slot={honor.slot}>{honor.display_name}</span>)}
    {editable && [...new Set(available.map(honor => honor.slot))].map(slot => <label key={slot}>{slotNames[slot] || "装飾"}<select disabled={pending} value={equipped.find(row => row.slot === slot)?.cosmetic_id || ""} onChange={event => void equip(slot, event.target.value)}><option value="" disabled>選択してください</option>{slot === "PROFILE_TITLE" && <option value="title_none">称号なし</option>}{available.filter(honor => honor.slot === slot).map(honor => <option value={honor.id} key={honor.id}>{honor.display_name}</option>)}</select></label>)}
    {error && <p role="alert">{error}</p>}
  </div>;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/utils/supabase";
import CanonicalDialog from "../ui/CanonicalDialog";
import OutlawButton from "../ui/OutlawButton";
import "./GuildEmblemEditor.css";

type Emblem = { id: string; display_name: string; asset_path: string };

function parseEmblems(value: unknown): Emblem[] {
  if (!Array.isArray(value)) throw new Error("Invalid emblem list");
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid emblem");
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.display_name !== "string" || typeof row.asset_path !== "string") throw new Error("Invalid emblem");
    return { id: row.id, display_name: row.display_name, asset_path: row.asset_path };
  });
}

export default function GuildEmblemEditor({ guildId, onChanged, onClose }: {
  guildId: string;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [emblems, setEmblems] = useState<Emblem[]>([]);
  const [selected, setSelected] = useState<Emblem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const busy = useRef(false);
  const persisted = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const safeClose = useCallback(() => { if (!busy.current) onClose(); }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setSelected(null);
    setSaveError(null);
    persisted.current = false;
    setSaved(false);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("list_guild_emblems", { p_guild_id: guildId });
        if (error) throw error;
        const rows = parseEmblems(data);
        if (!cancelled) setEmblems(rows);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [guildId, reloadKey]);

  useEffect(() => {
    if (!mounted) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.focus();
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) root.current?.focus();
    };
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("focusin", containFocus);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [mounted]);

  const save = async () => {
    if (!selected || busy.current) return;
    busy.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      if (!persisted.current) {
        const { error } = await supabase.rpc("set_guild_emblem", { p_guild_id: guildId, p_emblem_id: selected.id });
        if (error) throw error;
        persisted.current = true;
        setSaved(true);
      }
      // Keep the dialog blocking until the parent's identity refresh finishes.
      await onChanged();
      onClose();
    } catch {
      setSaveError(persisted.current ? "変更しました。表示の更新を再試行してください。" : "変更できませんでした。もう一度お試しください。");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  if (!mounted) return null;
  return createPortal(<div ref={root} tabIndex={-1} className="guild-emblem-editor" onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); safeClose(); }
    if (event.key === "Tab") {
      const focusable = Array.from(root.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [tabindex='0']") || []);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); root.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first.focus(); }
    }
  }}>
    <CanonicalDialog title="エンブレム変更" onClose={saving ? undefined : safeClose} actions={[
      { label: "キャンセル", onClick: safeClose, disabled: saving },
      { label: saved ? "表示を更新" : "このエンブレムに変更", semantic: "primary" as const, onClick: save, disabled: !selected || loading || saving },
    ]}>
      <div aria-busy={loading || saving}>
        {loading ? <div className="guild-emblem-editor-status" role="status"><span className="spinner" aria-hidden="true" />読み込み中…</div>
          : loadError ? <div className="guild-emblem-editor-status" role="alert"><p>エンブレムを読み込めませんでした。</p><OutlawButton onClick={() => setReloadKey(value => value + 1)}>再試行</OutlawButton></div>
            : <>
              <div className="guild-emblem-editor-grid" role="group" aria-label="利用可能なエンブレム">
                {emblems.map(emblem => <button key={emblem.id} type="button" className={`guild-emblem-editor-option ${selected?.id === emblem.id ? "is-selected" : ""}`} aria-pressed={selected?.id === emblem.id} disabled={saving || saved} onClick={() => { setSelected(emblem); setSaveError(null); }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={emblem.asset_path} alt="" width={56} height={56} />
                  <span>{emblem.display_name}</span>
                </button>)}
              </div>
              {emblems.length === 0 && <p>利用可能なエンブレムはありません。</p>}
              {selected && <div className="guild-emblem-editor-preview" aria-label="選択プレビュー" aria-live="polite">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.asset_path} alt="" width={88} height={88} />
                <strong>{selected.display_name}</strong>
              </div>}
            </>}
        {saveError && <p role="alert" className="guild-emblem-editor-error">{saveError}</p>}
        {saving && <div className="guild-emblem-editor-status" role="status"><span className="spinner" aria-hidden="true" />変更中…</div>}
      </div>
    </CanonicalDialog>
  </div>, document.body);
}

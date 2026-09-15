"use client";

import { exclusiveAssetLabel } from "@/utils/exclusiveAssetLabels";
import React from "react";
import { CANONICAL_SKILL_VIEW, type SkillCardMaster } from "@/utils/skills_master_data";
import { getCanonicalSkillIcon } from "@/utils/skillVisualAssets";
import CanonicalDialog from "../ui/CanonicalDialog";
import "./SkillPresentation.css";

const TYPE_LABEL: Record<string, string> = { ATTACK: "攻撃", HEAL: "回復", DEBUFF: "弱体", BUFF: "強化" };
const TARGET_LABEL: Record<string, string> = { ENEMY_SINGLE: "敵単体", ENEMY_ALL: "敵全体", ALLY_SINGLE: "味方単体", ALLY_ALL: "味方全体", SELF: "自身" };

export function resolveCanonicalSkill(skillOrId: string | SkillCardMaster | null | undefined): SkillCardMaster | undefined {
  if (!skillOrId) return undefined;
  if (typeof skillOrId !== "string") return CANONICAL_SKILL_VIEW.find((entry) => entry.id === skillOrId.id) || skillOrId;
  return CANONICAL_SKILL_VIEW.find((entry) => entry.id === skillOrId);
}

export function SkillIcon({ skill, onSelect, size = "compact" }: { skill: string | SkillCardMaster | null | undefined; onSelect?: (skill: SkillCardMaster) => void; size?: "compact" | "regular" }) {
  const canonical = resolveCanonicalSkill(skill);
  if (!canonical) return null;
  const icon = getCanonicalSkillIcon(canonical.id);
  const content = icon ? <img src={icon} alt="" /> : <span aria-hidden="true">技</span>;
  return onSelect
    ? <button type="button" className={`shared-skill-icon is-${size}`} onClick={() => onSelect(canonical)} aria-label={`${canonical.name}の詳細`}>{content}</button>
    : <span className={`shared-skill-icon is-${size}`} aria-label={canonical.name}>{content}</span>;
}

export function SkillIconGrid({ skills, onSelect, mode = "confirmation", className = "" }: { skills: Array<string | SkillCardMaster | null | undefined>; onSelect?: (skill: SkillCardMaster) => void; mode?: "confirmation" | "editing"; className?: string }) {
  const visible = skills.map(resolveCanonicalSkill).filter(Boolean).slice(0, 6) as SkillCardMaster[];
  if (mode === "confirmation" && visible.length === 0) return null;
  return <div className={`shared-skill-grid count-${visible.length} mode-${mode} ${className}`.trim()} data-skill-count={visible.length}>
    {visible.map((skill) => <SkillIcon key={skill.id} skill={skill} onSelect={onSelect} />)}
  </div>;
}

export function SkillDetailDialog({ skill, onClose }: { skill: string | SkillCardMaster | null | undefined; onClose: () => void }) {
  const canonical = resolveCanonicalSkill(skill);
  if (!canonical) return null;
  return <CanonicalDialog title="スキル詳細" ariaLabel={`${canonical.name}の詳細`} onClose={onClose} actions={[{ label: "閉じる", semantic: "secondary", onClick: onClose }]}>
    <div className="shared-skill-dialog shared-skill-dialog-card">
      <div className="shared-skill-dialog-hero"><SkillIcon skill={canonical} size="regular" /><div><strong>{canonical.name}</strong><small>{TYPE_LABEL[canonical.effect_type] || "特殊"}スキル</small></div></div>
      {canonical.exclusive_character_id && <p className="exclusive-asset-detail">{exclusiveAssetLabel(canonical.exclusive_character_id)}</p>}
      <dl>
        <div><dt>タイプ</dt><dd>{TYPE_LABEL[canonical.effect_type] || "特殊"}</dd></div>
        <div><dt>対象</dt><dd>{TARGET_LABEL[canonical.target] || "特殊"}</dd></div>
        <div><dt>威力</dt><dd>{canonical.power > 0 ? `${canonical.power}%` : "—"}</dd></div>
        <div><dt>再使用</dt><dd>{canonical.cooldown == null ? "なし" : `${canonical.cooldown}ラウンド`}</dd></div>
      </dl>
      <p>{canonical.description || "効果説明はありません。"}</p>
    </div>
  </CanonicalDialog>;
}

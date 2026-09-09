"use client";

import { supabase, usingMockSupabase } from "@/utils/supabase";
import {
  bindAcquisitionSubject,
  recordAcquisitionObservation as recordCanonicalAcquisitionObservation,
} from "@/utils/acquisitionAttribution";

export type AcquisitionObservation =
  | "TITLE_ARRIVED"
  | "TAP_TO_START"
  | "WORLD_INTRO_STARTED"
  | "WORLD_INTRO_COMPLETED"
  | "NAME_COMPLETED";

const MY_PAGE_CONTEXT_KEY = "tribe_kpi_mypage_context_v1";

function randomHex(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, (part) => part.toString(16).padStart(2, "0")).join("");
}

export async function recordAcquisitionObservation(eventType: AcquisitionObservation) {
  return recordCanonicalAcquisitionObservation(eventType);
}

export async function bindCurrentAcquisitionJourney(authoritativeGameStartSucceeded = false) {
  if (authoritativeGameStartSucceeded) await recordAcquisitionObservation("NAME_COMPLETED");
  return bindAcquisitionSubject();
}

type StoredMyPageContext = { userId: string; contextId: string; expiresAt: string; requestKey: string };

export async function confirmCanonicalFirstMyPage(userId: string) {
  if (usingMockSupabase || typeof window === "undefined") return false;
  let stored: StoredMyPageContext | null = null;
  try { stored = JSON.parse(window.sessionStorage.getItem(MY_PAGE_CONTEXT_KEY) || "null"); } catch { stored = null; }
  if (!stored || stored.userId !== userId || Date.parse(stored.expiresAt) <= Date.now() + 2_000) {
    const requestKey = `mypage-ready:${randomHex(12)}`;
    const { data, error } = await supabase.rpc("issue_kpi_mypage_ready_context_v1", {
      p_tutorial_version: "canonical-v1",
      p_idempotency_key: requestKey,
      p_source: "mypage_handshake_v1",
    });
    if (error || !data?.context_id || !data?.expires_at) {
      console.warn("KPI My Page readiness unavailable:", error?.message || "invalid context");
      return false;
    }
    stored = { userId, contextId: data.context_id, expiresAt: data.expires_at, requestKey };
    window.sessionStorage.setItem(MY_PAGE_CONTEXT_KEY, JSON.stringify(stored));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const { error } = await supabase.rpc("acknowledge_kpi_first_mypage_access_v1", {
    p_context_id: stored.contextId,
    p_idempotency_key: `mypage-ack:${stored.requestKey.slice("mypage-ready:".length)}`,
  });
  if (error) {
    if (error.code !== "23505") console.warn("KPI My Page acknowledgement unavailable:", error.message);
    return error.code === "23505";
  }
  return true;
}

export async function recordSameSubjectIdentityTransition(accessToken: string) {
  if (usingMockSupabase) return true;
  const response = await fetch("/api/kpi/identity-transition", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ phase: "same" }),
  });
  if (!response.ok) console.warn("KPI same-subject identity evidence unavailable");
  return response.ok;
}

export async function prepareAccountSwitchIdentityTransition(sourceAccessToken: string, destinationAccessToken: string) {
  if (usingMockSupabase) return "mock";
  const response = await fetch("/api/kpi/identity-transition", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${destinationAccessToken}` },
    body: JSON.stringify({ phase: "prepare_switch", sourceAccessToken }),
  });
  if (!response.ok) return null;
  return (await response.json() as { evidence?: string }).evidence || null;
}

export async function commitAccountSwitchIdentityTransition(evidence: string, destinationAccessToken: string) {
  if (usingMockSupabase) return true;
  const response = await fetch("/api/kpi/identity-transition", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${destinationAccessToken}` },
    body: JSON.stringify({ phase: "commit_switch", evidence }),
  });
  if (!response.ok) console.warn("KPI account-switch identity evidence unavailable");
  return response.ok;
}

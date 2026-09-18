"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import "./VerifiedUserName.css";

type VerificationCacheEntry = { verified: boolean; fetchedAt: number };
const cache = new Map<string, VerificationCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const RETRY_DELAY_MS = 1500;
const listeners = new Map<string, Set<(verified: boolean) => void>>();
const pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  flushTimer = null;
  const ids = [...pending].slice(0, 100);
  ids.forEach(id => pending.delete(id));
  if (!ids.length) return;

  const { data, error } = await supabase.rpc("get_public_account_verification_badges", { p_user_ids: ids });
  if (error) {
    // A token refresh / temporary RPC failure must never turn an already
    // verified account into an unverified presentation. Keep the last known
    // value and retry instead of publishing false.
    ids.forEach(id => pending.add(id));
    if (!flushTimer) flushTimer = setTimeout(() => void flush(), RETRY_DELAY_MS);
    return;
  }

  const result = new Map<string, boolean>();
  if (Array.isArray(data)) {
    data.forEach((row: any) => result.set(String(row.user_id), row.verified === true));
  }
  const fetchedAt = Date.now();
  ids.forEach(id => {
    const verified = result.get(id) === true;
    cache.set(id, { verified, fetchedAt });
    listeners.get(id)?.forEach(listener => listener(verified));
  });
  if (pending.size && !flushTimer) flushTimer = setTimeout(() => void flush(), 0);
}

function subscribe(userId: string, listener: (verified: boolean) => void) {
  let set = listeners.get(userId);
  if (!set) {
    set = new Set();
    listeners.set(userId, set);
  }
  set.add(listener);
  const cached = cache.get(userId);
  if (!cached || Date.now() - cached.fetchedAt >= CACHE_TTL_MS) {
    pending.add(userId);
    if (!flushTimer) flushTimer = setTimeout(() => void flush(), 0);
  }
  return () => {
    const current = listeners.get(userId);
    current?.delete(listener);
    if (current?.size === 0) listeners.delete(userId);
  };
}

export default function VerifiedUserName({ userId, name, verified: verifiedOverride, className = "" }: {
  userId?: string | null;
  name: string;
  verified?: boolean;
  className?: string;
}) {
  const [verified, setVerified] = useState(() => verifiedOverride ?? (userId ? cache.get(userId)?.verified : false) ?? false);

  useEffect(() => {
    if (verifiedOverride !== undefined) {
      setVerified(verifiedOverride);
      return;
    }
    if (!userId) {
      setVerified(false);
      return;
    }
    const cached = cache.get(userId);
    if (cached !== undefined) setVerified(cached.verified);
    return subscribe(userId, setVerified);
  }, [userId, verifiedOverride]);

  return <span className={`verified-user-name ${className}`.trim()}><span>{name}</span>{verified && <span className="verified-user-name__badge" aria-label="認証済み" title="認証済み">✓</span>}</span>;
}

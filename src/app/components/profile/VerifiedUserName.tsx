"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import "./VerifiedUserName.css";

const cache = new Map<string, boolean>();
const listeners = new Map<string, Set<(verified: boolean) => void>>();
const pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  flushTimer = null;
  const ids = [...pending].slice(0, 100);
  ids.forEach(id => pending.delete(id));
  if (!ids.length) return;

  const { data, error } = await supabase.rpc("get_public_account_verification_badges", { p_user_ids: ids });
  const result = new Map<string, boolean>();
  if (!error && Array.isArray(data)) {
    data.forEach((row: any) => result.set(String(row.user_id), row.verified === true));
  }
  ids.forEach(id => {
    const verified = result.get(id) === true;
    if (!error) cache.set(id, verified);
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
  if (!cache.has(userId)) {
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
  const [verified, setVerified] = useState(() => verifiedOverride ?? (userId ? cache.get(userId) : false) ?? false);

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
    if (cached !== undefined) setVerified(cached);
    return subscribe(userId, setVerified);
  }, [userId, verifiedOverride]);

  return <span className={`verified-user-name ${className}`.trim()}><span>{name}</span>{verified && <span className="verified-user-name__badge" aria-label="認証済み" title="認証済み">✓</span>}</span>;
}

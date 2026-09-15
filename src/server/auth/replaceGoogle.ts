import type { User } from '@supabase/supabase-js';

export type ReplacementStatus = 'PREPARED' | 'DELETING' | 'RELEASED' | 'COMPLETED' | 'CANCELLED';
export type ReplacementIntent = {
  id: string; source_user_id: string; destination_user_id: string; google_subject: string;
  current_username: string; existing_username: string; status: ReplacementStatus;
  expires_at: string; updated_at: string;
};
export class ReplacementError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}
export interface ReplacementStore {
  verifiedUser(token: string): Promise<User>;
  googleSubject(idToken: string, intentId: string): Promise<string>;
  userById(id: string): Promise<User | null>;
  username(id: string): Promise<string>;
  prepare(value: Omit<ReplacementIntent, 'id' | 'updated_at'>): Promise<ReplacementIntent>;
  intent(id: string): Promise<ReplacementIntent | null>;
  transition(intent: ReplacementIntent, status: ReplacementStatus): Promise<ReplacementIntent | null>;
  deleteUser(id: string): Promise<void>;
}
export function soleGoogleSubject(user: User): string | null {
  const identities = user.identities ?? [];
  if (user.is_anonymous || identities.length !== 1 || identities[0].provider !== 'google') return null;
  return typeof identities[0].id === 'string' && identities[0].id ? identities[0].id : null;
}
export function previewReplacementAllowed(env: Record<string, string | undefined>): boolean {
  return env.GOOGLE_ACCOUNT_REPLACEMENT_ENABLED === 'true' && env.VERCEL_GIT_COMMIT_REF === 'codex/formal-open-integration-preview-20260914' && env.VERCEL_ENV === 'preview' && env.NEXT_PUBLIC_SUPABASE_URL?.trim() === 'https://sufvuqdnqohpfzkwxohq.supabase.co';
}
function guest(user: User) {
  if (user.is_anonymous !== true || (user.identities ?? []).length !== 0) {
    throw new ReplacementError('現在のゲストデータを確認できません。');
  }
}
function response(intent: ReplacementIntent) {
  return { intentId: intent.id, status: intent.status, currentUsername: intent.current_username, existingUsername: intent.existing_username };
}
export async function replaceGoogle(
  store: ReplacementStore, sourceToken: string, body: Record<string, unknown>, now = Date.now(),
) {
  const source = await store.verifiedUser(sourceToken);
  if (body.phase === 'prepare') {
    guest(source);
    if (typeof body.googleAccessToken !== 'string') throw new ReplacementError('Google認証をやり直してください。', 400);
    const destination = await store.verifiedUser(body.googleAccessToken);
    const subject = soleGoogleSubject(destination);
    if (!subject || source.id === destination.id) throw new ReplacementError('置き換え対象のGoogle認証を確認できません。');
    const [currentUsername, existingUsername] = await Promise.all([store.username(source.id), store.username(destination.id)]);
    return response(await store.prepare({ source_user_id: source.id, destination_user_id: destination.id,
      google_subject: subject, current_username: currentUsername, existing_username: existingUsername,
      status: 'PREPARED', expires_at: new Date(now + 15 * 60_000).toISOString() }));
  }
  if (typeof body.intentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.intentId)) throw new ReplacementError('置き換え手続きを確認できません。', 400);
  let intent = await store.intent(body.intentId);
  if (!intent || intent.source_user_id !== source.id) throw new ReplacementError('置き換え手続きを確認できません。', 403);
  if (body.phase === 'finalize') {
    if (!['RELEASED', 'COMPLETED'].includes(intent.status) || soleGoogleSubject(source) !== intent.google_subject) {
      throw new ReplacementError('元のゲストデータへのGoogle連携がまだ完了していません。');
    }
    await store.username(source.id);
    if (intent.status !== 'COMPLETED') {
      const completed = await store.transition(intent, 'COMPLETED');
      if (!completed) throw new ReplacementError('連携状況を再確認してください。');
      intent = completed;
    }
    return response(intent);
  }
  guest(source);
  await store.username(source.id);
  if (body.phase === 'cancel') {
    if (intent.status === 'CANCELLED') return response(intent);
    if (intent.status !== 'PREPARED') throw new ReplacementError('置き換え開始後は取り消せません。Google連携を完了してください。');
    const cancelled = await store.transition(intent, 'CANCELLED');
    if (!cancelled) throw new ReplacementError('処理中です。状態を再確認してください。');
    return response(cancelled);
  }
  if (body.phase !== 'confirm' || body.confirmed !== true) throw new ReplacementError('削除と置き換えの再確認が必要です。', 400);
  // The same signed Google credential is subsequently used for native linking;
  // no OAuth account chooser runs after irreversible deletion.
  if (typeof body.googleIdToken !== 'string' || await store.googleSubject(body.googleIdToken, intent.id) !== intent.google_subject) {
    throw new ReplacementError('置き換え対象と同じGoogleアカウントで本人確認してください。');
  }
  if (intent.status === 'RELEASED') return response(intent);
  if (!['PREPARED', 'DELETING'].includes(intent.status)) throw new ReplacementError('この置き換え手続きは終了しています。');
  if (intent.status === 'PREPARED') {
    if (Date.parse(intent.expires_at) <= now) throw new ReplacementError('確認期限が切れました。Google認証からやり直してください。');
    // Recheck exactly the identity shown by prepare, before accepting irreversible intent.
    const target = await store.userById(intent.destination_user_id);
    if (!target || soleGoogleSubject(target) !== intent.google_subject) throw new ReplacementError('Google連携先が変更されています。');
    if (await store.username(target.id) !== intent.existing_username) throw new ReplacementError('対象のゲームデータが変更されています。最初から確認してください。');
    const claimed = await store.transition(intent, 'DELETING');
    if (!claimed || claimed.status !== 'DELETING') throw new ReplacementError('置き換え処理中です。再確認してください。');
    intent = claimed;
  }
  // A previous worker may have deleted Auth then lost its response. Only explicit
  // Auth user-not-found is recoverable; transport/permission failures are not absence.
  const target = await store.userById(intent.destination_user_id);
  if (target) {
    if (soleGoogleSubject(target) !== intent.google_subject) throw new ReplacementError('Google連携先が変更されています。');
    await store.deleteUser(target.id);
  }
  if (await store.userById(intent.destination_user_id)) throw new ReplacementError('元のGoogle連携の解除を確認できません。', 503);
  const released = await store.transition(intent, 'RELEASED');
  if (!released) {
    const current = await store.intent(intent.id);
    if (!current || !['RELEASED', 'COMPLETED'].includes(current.status)) throw new ReplacementError('解除状況を再確認してください。', 503);
    return response(current);
  }
  return response(released);
}

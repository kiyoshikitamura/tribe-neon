import { verifiedGoogleSubject } from '@/server/auth/googleIdToken';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { previewReplacementAllowed, replaceGoogle, ReplacementError, type ReplacementIntent, type ReplacementStore } from '@/server/auth/replaceGoogle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const table = 'preview_google_replacement_intents';
export async function POST(request: NextRequest) {
  const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!previewReplacementAllowed(process.env)) return json({ error: 'この環境ではアカウントの置き換えを利用できません。' }, 403);
  if (request.headers.get('origin') !== request.nextUrl.origin) return json({ error: '同じ画面から操作してください。' }, 403);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return json({ error: '置き換え機能は準備中です。' }, 503);
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return json({ error: 'ログイン状態を確認してください。' }, 401);
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(), key, { auth: { persistSession: false, autoRefreshToken: false } });
  const unavailable = () => new ReplacementError('置き換え処理を確認できません。しばらくして再確認してください。', 503);
  const store: ReplacementStore = {
    googleSubject(idToken, intentId) {
      return verifiedGoogleSubject(idToken, process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? '', intentId);
    },
    async verifiedUser(accessToken) {
      const { data, error } = await service.auth.getUser(accessToken);
      if (error || !data.user) throw new ReplacementError('認証の有効期限が切れました。再認証してください。', 401);
      return data.user;
    },
    async userById(id) {
      const { data, error } = await service.auth.admin.getUserById(id);
      if (error) {
        if (error.code === 'user_not_found') return null;
        throw unavailable();
      }
      if (!data.user) throw unavailable();
      return data.user;
    },
    async username(id) {
      const { data, error } = await service.from('users').select('username').eq('id', id).maybeSingle();
      if (error) throw unavailable();
      if (!data || typeof data.username !== 'string') throw new ReplacementError('ゲームデータを確認できません。');
      return data.username;
    },
    async prepare(value) {
      const { error: expiryError } = await service.from(table).update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
        .eq('source_user_id', value.source_user_id).eq('status', 'PREPARED').lte('expires_at', new Date().toISOString());
      if (expiryError) throw unavailable();
      // One active intent per source and per existing Google account. Repeated
      // prepare returns the same verified pair instead of creating duplicate work.
      const { data, error } = await service.from(table).insert(value).select('*').single();
      if (!error) return data as ReplacementIntent;
      if (error.code !== '23505') throw unavailable();
      const { data: existing, error: lookupError } = await service.from(table).select('*')
        .eq('source_user_id', value.source_user_id).eq('destination_user_id', value.destination_user_id)
        .eq('google_subject', value.google_subject).in('status', ['PREPARED', 'DELETING', 'RELEASED']).maybeSingle();
      if (lookupError || !existing) throw new ReplacementError('別の置き換え手続きが進行中です。');
      return existing as ReplacementIntent;
    },
    async intent(id) {
      const { data, error } = await service.from(table).select('*').eq('id', id).maybeSingle();
      if (error) throw unavailable();
      return data as ReplacementIntent | null;
    },
    async transition(intent, status) {
      if (status === 'DELETING') {
        const { data, error } = await service.rpc('retire_preview_google_game', { p_intent_id: intent.id });
        if (error) throw new ReplacementError('置き換え処理の状態を確認できません。同じ画面から再確認してください。解消しない場合は運営へお問い合わせください。');
        return data as ReplacementIntent;
      }
      const { data, error } = await service.from(table).update({ status, updated_at: new Date().toISOString() })
        .eq('id', intent.id).eq('status', intent.status).eq('updated_at', intent.updated_at).select('*').maybeSingle();
      if (error) throw unavailable();
      return data as ReplacementIntent | null;
    },
    async deleteUser(id) {
      // Public game retirement and old-JWT request guard are committed by the retirement RPC first.
      // Called only after the second explicit confirmation and durable DELETING.
      const { error } = await service.auth.admin.deleteUser(id, false);
      if (error && error.code !== 'user_not_found') throw unavailable();
    },
  };
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ReplacementError('操作内容を確認してください。', 400);
    return json(await replaceGoogle(store, token, body as Record<string, unknown>));
  } catch (error) {
    return error instanceof ReplacementError ? json({ error: error.message }, error.status) : json({ error: '置き換え処理を完了できませんでした。再確認してください。' }, 503);
  }
}

import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { marketing, noStore, rangeFrom, serviceClient } from "../v2/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const grains = new Set(["CAMPAIGN", "LINE_ITEM", "CREATIVE"]);
const sources = new Set(["x_ads_manager_manual", "x_ads_manager_import"]);
const idempotencyPattern = /^[A-Za-z0-9_.:-]{1,128}$/;
const keyPattern = /^\S.{0,127}$/;
const forbiddenDimension = /^(unknown|n\/?a|none|dummy|fake|null|-)$/i;

type ImportRow = {
  reportDateJst: string;
  accountKey: string;
  campaignKey: string;
  campaignName?: string | null;
  lineItemKey?: string | null;
  lineItemName?: string | null;
  creativeKey?: string | null;
  creativeName?: string | null;
  reportingGrain: string;
  spend: number;
  currency: string;
  impressions: number;
  clicks: number;
  externalKey: string;
  revision: number;
  idempotencyKey: string;
};

function uuidFromActor(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const encoded = authorization.startsWith("Basic ") ? authorization.slice(6) : "";
  let user = "unknown";
  try { user = Buffer.from(encoded, "base64").toString("utf8").split(":", 1)[0] || "unknown"; } catch { /* proxy rejects malformed auth */ }
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "unconfigured";
  const digest = createHmac("sha256", secret).update(`kpi-marketing-actor:${user}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function validText(value: unknown, max: number, required = false) {
  return (value == null && !required) || (typeof value === "string" && value.trim().length >= (required ? 1 : 0) && value.length <= max);
}

function validDimension(value: unknown, required = false) {
  return validText(value, 128, required) && (value == null || !forbiddenDimension.test(String(value).trim()));
}

function validateRow(value: unknown): value is ImportRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const date = typeof row.reportDateJst === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.reportDateJst)
    && !Number.isNaN(Date.parse(`${row.reportDateJst}T00:00:00Z`));
  const grain = typeof row.reportingGrain === "string" && grains.has(row.reportingGrain);
  const lineRequired = row.reportingGrain === "LINE_ITEM";
  const creativeRequired = row.reportingGrain === "CREATIVE";
  return date && grain
    && validDimension(row.accountKey, true) && validDimension(row.campaignKey, true)
    && validText(row.campaignName, 256)
    && validDimension(row.lineItemKey, lineRequired)
    && validText(row.lineItemName, 256) && (row.lineItemKey != null || row.lineItemName == null)
    && validDimension(row.creativeKey, creativeRequired)
    && validText(row.creativeName, 256) && (row.creativeKey != null || row.creativeName == null)
    && typeof row.spend === "number" && Number.isFinite(row.spend) && row.spend >= 0
    && row.currency === "JPY"
    && Number.isSafeInteger(row.impressions) && Number(row.impressions) >= 0
    && Number.isSafeInteger(row.clicks) && Number(row.clicks) >= 0
    && Number.isInteger(row.revision) && Number(row.revision) > 0
    && validText(row.externalKey, 256, true) && validText(row.idempotencyKey, 128, true)
    && idempotencyPattern.test(String(row.idempotencyKey)) && keyPattern.test(String(row.externalKey));
}

async function importRows(service: SupabaseClient, request: NextRequest, body: Record<string, unknown>) {
  const source = body.source;
  const batchKey = body.idempotencyKey;
  const fileHash = body.fileHash == null ? null : body.fileHash;
  const qa = body.qa === true;
  const rows = body.rows;
  if (typeof source !== "string" || !sources.has(source)
    || typeof batchKey !== "string" || !idempotencyPattern.test(batchKey)
    || (fileHash != null && (typeof fileHash !== "string" || !/^[a-f0-9]{64}$/.test(fileHash)))
    || !Array.isArray(rows) || rows.length < 1 || rows.length > 5000 || !rows.every(validateRow)) {
    return noStore({ error: "Invalid X Ads import contract" }, 400);
  }
  const scopeGrains = new Map<string, string>();
  for (const row of rows) {
    const scope = `${row.reportDateJst}:${row.accountKey}:JPY`;
    const existing = scopeGrains.get(scope);
    if (existing && existing !== row.reportingGrain) return noStore({ error: "INVALID_GRAIN_MIX", scope }, 409);
    scopeGrains.set(scope, row.reportingGrain);
  }
  const metadata = qa ? { qa: true } : {};
  const { data: batchId, error: batchError } = await service.rpc("create_kpi_marketing_import_batch_v1", {
    p_source: source, p_actor_identifier: uuidFromActor(request), p_file_hash: fileHash,
    p_idempotency_key: batchKey, p_metadata: metadata,
  });
  if (batchError || !batchId) return noStore({ error: batchError?.code === "23505" ? "IDEMPOTENCY_CONFLICT" : "Import batch rejected" }, batchError?.code === "23505" ? 409 : 500);
  const ids: string[] = [];
  for (const row of rows) {
    const { data, error } = await service.rpc("record_kpi_marketing_daily_revision_v1", {
      p_batch_id: batchId, p_report_date_jst: row.reportDateJst, p_account_key: row.accountKey,
      p_campaign_key: row.campaignKey, p_campaign_name: row.campaignName ?? null,
      p_line_item_key: row.lineItemKey ?? null, p_line_item_name: row.lineItemName ?? null,
      p_creative_key: row.creativeKey ?? null, p_creative_name: row.creativeName ?? null,
      p_reporting_grain: row.reportingGrain, p_spend: row.spend, p_currency: "JPY",
      p_impressions: row.impressions, p_clicks: row.clicks, p_external_key: row.externalKey,
      p_revision: row.revision, p_idempotency_key: row.idempotencyKey, p_metadata: metadata,
    });
    if (error || !data) return noStore({ error: error?.code === "23505" ? "IDEMPOTENCY_OR_GRAIN_CONFLICT" : "Revision rejected", batch_id: batchId, accepted: ids.length }, error?.code === "23505" ? 409 : 500);
    ids.push(data);
  }
  return noStore({ batch_id: batchId, accepted: ids.length, revision_ids: ids }, 201);
}

export async function GET(request: NextRequest) {
  const service = serviceClient();
  const range = rangeFrom(request);
  if (!service) return noStore({ error: "KPI server configuration unavailable" }, 503);
  if (!range) return noStore({ error: "Invalid JST date range" }, 400);
  const grain = request.nextUrl.searchParams.get("grain");
  try { return noStore(await marketing(service, range, grain)); }
  catch (error) { console.error("Marketing read failed", error); return noStore({ error: "Marketing authority unavailable" }, 500); }
}

export async function POST(request: NextRequest) {
  const service = serviceClient();
  if (!service) return noStore({ error: "KPI server configuration unavailable" }, 503);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return noStore({ error: "Invalid JSON body" }, 400);
  try { return await importRows(service, request, body as Record<string, unknown>); }
  catch (error) { console.error("Marketing import failed", error); return noStore({ error: "Marketing import unavailable" }, 500); }
}

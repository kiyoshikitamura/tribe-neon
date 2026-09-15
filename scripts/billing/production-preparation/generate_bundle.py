"""Offline only: build reviewed Production candidate; never connect to a database."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
preview = json.loads((HERE / 'preview_readonly_snapshot.json').read_text())
production = json.loads((HERE / 'production_readonly_snapshot.json').read_text())
sources = [
    'scripts/billing/preview_schema.sql',
    'supabase/migrations/20260913105839_billing_paid_pack_lots.sql',
    'supabase/migrations/20260913111028_billing_checkout_mode_contract.sql',
    'supabase/migrations/20260913120945_billing_dia_approved_contract.sql',
]
functions = [f for f in preview['functions'] if f['signature'].startswith('billing_') and not f['signature'].startswith('billing_validate_special_payment')]
def literal(value):
    return "'" + value.replace("'", "''") + "'"
claim_guard = '\n'.join(
    f"if md5(pg_get_functiondef(to_regprocedure({literal('public.'+f['signature'])}))) is distinct from {literal(f['md5'])} then raise exception 'SHARED_FUNCTION_DRIFT: {f['signature']}'; end if;"
    for f in production['functions'])
preflight = """-- READ ONLY。出力を実行直前にも確認する。
begin read only;
select * from public.feature_operating_states where feature_key='MAINTENANCE';
select tablename from pg_tables where schemaname='public' and tablename like 'billing%';
select p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'billing%' or p.proname in ('claim_present','claim_all_presents'));
rollback;
"""
(HERE / '00_preflight.sql').write_text(preflight)
sql = """-- Production課金候補。未適用。別承認・接続先検証後に単一transactionで実行。
-- Preview限定原本を変更せず、4段階を原子的に合成する。
-- app.billing_target_project は実行者の確認表明でありDB接続先を証明しない。
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $guard$
begin
 if current_setting('app.billing_target_project',true) is distinct from 'ktpolnkyyfkowxdmijww' then raise exception 'PRODUCTION_TARGET_NOT_CONFIRMED'; end if;
 perform 1 from public.feature_operating_states where feature_key='MAINTENANCE' and state='MAINTENANCE' for update;
 if not found then raise exception 'PRODUCTION_MAINTENANCE_REQUIRED'; end if;
 if exists(select 1 from pg_tables where schemaname='public' and tablename like 'billing%') or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'billing%') then raise exception 'BILLING_ALREADY_OR_PARTIALLY_APPLIED_DO_NOT_REAPPLY'; end if;
""" + claim_guard + "\nend $guard$;\n"
sql += "create temp table billing_preparation_states on commit drop as select jsonb_agg(to_jsonb(s) order by feature_key) snapshot from public.feature_operating_states s;\n"
for source in sources:
    text = (ROOT / source).read_text()
    lines = [line for line in text.splitlines() if line.strip().lower() not in ('begin;', 'commit;') and not line.startswith('--')]
    sql += '\n-- Reviewed source: ' + source + '\n' + '\n'.join(lines) + '\n'
# Capture exact current accepted Preview definitions rather than silently reverting later changes.
sql += '\n-- Final Preview definitions (gacha boundary excluded).\n'
for f in functions:
    sql += f['definition'].rstrip() + ';\n'
    sig = 'public.' + f['signature']
    sql += f'revoke all on function {sig} from public,anon,authenticated,service_role;\n'
    for role in ('service_role', 'authenticated'):
        if role + '=X/' in f['acl']:
            sql += f'grant execute on function {sig} to {role};\n'
catalog = json.dumps(preview['products'], ensure_ascii=False)
sql += f"\ndo $catalog$ begin if (select jsonb_agg(to_jsonb(p) order by id) from public.billing_products p) is distinct from {literal(catalog)}::jsonb then raise exception 'CATALOG_DIFF_FROM_ACCEPTED_PREVIEW'; end if; end $catalog$;\n"
checks = '\n'.join(f"if md5(pg_get_functiondef(to_regprocedure({literal('public.'+f['signature'])}))) is distinct from {literal(f['md5'])} then raise exception 'BILLING_FUNCTION_DIFF: {f['signature']}'; end if;" for f in functions)
postflight = "do $postflight$ begin\n" + claim_guard + '\n' + checks + """
 if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'billing%' and c.relkind='r' and c.relrowsecurity)<>5 then raise exception 'BILLING_RLS_MISSING'; end if;
 if exists(select 1 from public.billing_orders) or exists(select 1 from public.billing_grants) or exists(select 1 from public.billing_shop_receipts) or exists(select 1 from public.billing_asset_lots) then raise exception 'UNEXPECTED_BILLING_DATA'; end if;
end $postflight$;
"""
sql += postflight
sql += "do $states$ begin if (select jsonb_agg(to_jsonb(s) order by feature_key) from public.feature_operating_states s) is distinct from (select snapshot from billing_preparation_states) then raise exception 'OPERATIONS_STATE_CHANGED'; end if; end $states$;\ncommit;\n"
(HERE / '10_candidate.sql').write_text(sql)
(HERE / '20_postflight.sql').write_text('begin read only;\n' + postflight + "select count(*) as products from public.billing_products;\nselect * from public.feature_operating_states where feature_key='MAINTENANCE';\nrollback;\n")
print('Candidate generated offline: 5 tables,', len(functions), 'functions, 4 billing triggers, 20 products; no gacha or shared-claim replacement')

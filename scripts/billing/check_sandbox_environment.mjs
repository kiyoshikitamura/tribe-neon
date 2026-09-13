/** Run in the Preview deployment's environment. Never print secret values. */
import { billingConfig, PREVIEW_PROJECT_REF } from '../../src/server/billing/contracts.ts';
import { catalogMatches } from '../../src/server/billing/catalog.ts';
const env=process.env;
const checks={
 mode_sandbox:(env.BILLING_MODE??'sandbox')==='sandbox',
 sandbox_enabled:env.BILLING_SANDBOX_ENABLED==='true',
 non_production_runtime:env.VERCEL_ENV!=='production',
 preview_database:env.NEXT_PUBLIC_SUPABASE_URL===`https://${PREVIEW_PROJECT_REF}.supabase.co`,
 stripe_test_key_present:!!env.STRIPE_SECRET_KEY?.startsWith('sk_test_'),
 webhook_signing_secret_present:!!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'),
 service_role_present:!!env.SUPABASE_SERVICE_ROLE_KEY,
 return_origin_valid:false,
};
try { const u=new URL(env.BILLING_RETURN_ORIGIN??''); checks.return_origin_valid=u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash&&!['https://tribe-neon.com','https://www.tribe-neon.com'].includes(u.origin); } catch {}
console.log(JSON.stringify({checks},null,2));
let config;
try { config=billingConfig(env); } catch { console.log('BILLING_CONFIG_INVALID'); process.exitCode=1; }
if(config && process.argv.includes('--remote-catalog')) {
 try {
  const response=await fetch(`${config.databaseUrl}/rest/v1/billing_products?select=id,amount_jpy,purchase_limit,validity_days,items`,{
   headers:{apikey:config.serviceKey,Authorization:`Bearer ${config.serviceKey}`},signal:AbortSignal.timeout(10000),
  });
  const rows=response.ok?await response.json():null;
  const matches=Array.isArray(rows)&&catalogMatches(rows);
  console.log(JSON.stringify({catalog_http:response.status,catalog_matches:matches}));
  if(!matches)process.exitCode=1;
 } catch { console.log('CATALOG_CONNECTION_FAILED');process.exitCode=1; }
}

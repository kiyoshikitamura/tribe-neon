/** Run in the Preview deployment's environment. Never print secret values. */
import { billingConfig, sandboxEnvironmentChecks } from '../../src/server/billing/contracts.ts';
import { catalogMatches } from '../../src/server/billing/catalog.ts';
const env=process.env;
const checks=sandboxEnvironmentChecks(env);
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

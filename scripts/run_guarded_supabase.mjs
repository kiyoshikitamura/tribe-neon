import { spawnSync } from "node:child_process";
import { assertStandardRouteAllowed } from './raid-room/standard-route-guard.mjs';
import { verifySupabaseTarget } from "./supabase_target_guard.mjs";

const separatorIndex = process.argv.indexOf("--");
const environmentIndex = process.argv.indexOf("--environment");
const environment = environmentIndex >= 0 ? process.argv[environmentIndex + 1]?.toLowerCase() : "";
const supabaseArgs = separatorIndex >= 0 ? process.argv.slice(separatorIndex + 1) : [];

if (!environment || supabaseArgs.length === 0) {
  console.error("Usage: node scripts/run_guarded_supabase.mjs --environment <environment> -- <supabase arguments>");
  process.exit(1);
}

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(`.env.${environment}.local`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

try {
  assertStandardRouteAllowed({environment,args:supabaseArgs});
  const target = await verifySupabaseTarget({ environment, mutation: true });
  assertStandardRouteAllowed({environment,projectRef:target.projectRef,args:supabaseArgs});
  console.log(`Guard approved ${environment} mutation for ${target.projectRef}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(executable, ["--no-install", "supabase", ...supabaseArgs], {
  stdio: "inherit",
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
  shell: process.platform === "win32",
});
if (result.error) console.error(`Supabase CLI could not be started: ${result.error.message}`);
process.exit(result.status ?? 1);

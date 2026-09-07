import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { captureAcquisitionLandingMetadata } from "../src/utils/acquisitionAttributionMetadata.ts";

const x = captureAcquisitionLandingMetadata(
  "https://www.tribe-neon.com/?utm_source=twitter&utm_campaign=launch&utm_content=video-a&twclid=x-click-1",
  "https://t.co/example",
);
assert.equal(x.utm_source, "x");
assert.equal(x.x_click_id, "x-click-1");
assert.equal(x.utm_campaign, "launch");
assert.equal(x.utm_content, "video-a");

const meta = captureAcquisitionLandingMetadata(
  "https://www.tribe-neon.com/?utm_source=something&fbclid=meta-click-1",
  "https://www.facebook.com/",
);
assert.equal(meta.utm_source, "meta");
assert.equal(meta.fbclid, "meta-click-1");

assert.equal(captureAcquisitionLandingMetadata("https://www.tribe-neon.com/", "").utm_source, "direct");
assert.equal(
  captureAcquisitionLandingMetadata("https://www.tribe-neon.com/", "https://search.example/result").utm_source,
  "organic",
);
assert.equal(
  captureAcquisitionLandingMetadata("https://www.tribe-neon.com/?utm_source=partner", "").utm_source,
  "unknown",
);

const migration = await readFile(
  new URL("../supabase/migrations/20260907000250_acquisition_attribution_landing_authority.sql", import.meta.url),
  "utf8",
);
for (const required of [
  "first_arrived_at",
  "kpi_acquisition_journeys",
  "kpi_acquisition_journey_facts",
  "kpi_acquisition_subject_bindings",
  "begin_kpi_acquisition_journey_v1",
  "record_kpi_acquisition_observation_v1",
  "record_kpi_acquisition_landing_v1",
  "kpi_v250_landing_metadata_valid",
]) assert.match(migration, new RegExp(required));
assert.doesNotMatch(migration, /create\s+table/i);
assert.doesNotMatch(migration, /create\s+or\s+replace\s+function/i);
assert.doesNotMatch(migration, /rename\s+column/i);

console.log("Acquisition attribution contract: PASS");

import { readFileSync } from 'node:fs';
const candidate = readFileSync(new URL('../docs/development/sql/preview_google_replacement_intents_candidate.sql', import.meta.url), 'utf8');
const tests = readFileSync(new URL('../tests/db/preview_google_replacement_rollback.sql', import.meta.url), 'utf8');
if (!/^begin;$/m.test(candidate) || !/^commit;$/m.test(candidate)) throw Error('Candidate transaction structure changed');
// Suppress commit + NOTIFY. All candidate DDL, ALTER ROLE and fixtures roll back.
const transaction = candidate.replace(/^commit;\s*$/m, '').replace(/^notify pgrst,.*$/gm, '');
process.stdout.write(transaction + '\n' + tests);

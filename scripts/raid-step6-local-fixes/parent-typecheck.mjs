import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
// Prior deployment source copies are scratch artifacts, not a second application.
const files = parsed.fileNames.filter(file => !file.replace(/\\/g, '/').includes('/outputs/'));
const options = {...parsed.options, noEmit: true, incremental: false};
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options));
const results = diagnostics.map(d => ({file: d.file ? path.relative(process.cwd(), d.file.fileName) : null, code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, ' ')}));
fs.mkdirSync('outputs/raid-step6-local-fixes', {recursive: true});
fs.writeFileSync('outputs/raid-step6-local-fixes/typecheck.json', JSON.stringify({actualWorkingSource: true, checkedFiles: files.length, excluded: 'scratch outputs/', diagnostics: results}, null, 2));
console.log(JSON.stringify({checkedFiles: files.length, diagnostics: results}));
if (results.length) process.exitCode = 1;

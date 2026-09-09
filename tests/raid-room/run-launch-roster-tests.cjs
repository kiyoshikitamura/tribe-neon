// Reuse the project TypeScript dependency; no browser or external service required.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const load = Module._load;
Module._load = function(request, ...args) {
  if (request.endsWith('/raidPagePresentation')) return {
    RAID_BACKGROUND_FALLBACK: '/fallback.png', RAID_PERSON_FALLBACK: '/person.png',
    useRaidPageAssets: () => ({ ready: true, failed: false, resolve: value => value, retry() {} }),
    RaidPageSpinner: () => null, RaidPagePortrait: () => null,
  };
  if (request.endsWith('/GameContext')) return { useGame: () => ({ playCyberSe() {} }) };
  return load.call(this, request, ...args);
};
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : request, ...args);
};
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true, jsx: ts.JsxEmit.ReactJSX },
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
}
require.extensions['.css'] = () => {};
require('./launch-roster.test.ts');

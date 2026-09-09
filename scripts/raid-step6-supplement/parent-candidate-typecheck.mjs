// Type-check the proposed replacement virtually; do not edit product files.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const target=path.resolve('src/app/context/GameContext.tsx');
const original=fs.readFileSync(target,'utf8').replace(/\r\n/g,'\n');
const start=original.indexOf('      const { data: equipsData } = await supabase');
const end=original.indexOf('      // 総合力データの同期',start);
if(start<0||end<start)throw Error('Expected equipment bootstrap block missing');
const replacement=fs.readFileSync('scripts/raid-step6-supplement/c-equipment-projection.txt','utf8').replace(/\r\n/g,'\n');
const virtual=original.slice(0,start)+replacement+'\n'+original.slice(end);
fs.mkdirSync('outputs/raid-step6-supplement',{recursive:true});
fs.writeFileSync('outputs/raid-step6-supplement/GameContext.candidate.tsx',virtual);
const config=ts.readConfigFile('tsconfig.json',ts.sys.readFile);
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,process.cwd());
// Local source staging is an output artifact, not a second application.
const files=parsed.fileNames.filter(file=>!file.replace(/\\/g,'/').includes('/outputs/'));
const options={...parsed.options,noEmit:true,incremental:false};
const host=ts.createCompilerHost(options);
const get=host.getSourceFile.bind(host);
host.getSourceFile=(file,version,onError,create)=>path.resolve(file)===target?ts.createSourceFile(file,virtual,version,true):get(file,version,onError,create);
const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram(files,options,host));
const results=diagnostics.map(d=>({file:d.file?path.relative(process.cwd(),d.file.fileName):null,line:d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line+1:null,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}));
fs.writeFileSync('outputs/raid-step6-supplement/parent-candidate-typecheck.json',JSON.stringify({candidateOnly:true,productSourceEdited:false,checkedFiles:files.length,diagnostics:results},null,2));
console.log(JSON.stringify({candidateOnly:true,checkedFiles:files.length,diagnostics:results.length}));
if(results.length)process.exitCode=1;

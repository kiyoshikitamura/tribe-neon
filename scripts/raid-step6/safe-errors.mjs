import {credentialsFor,roles} from './qa-http.mjs';
const secretValues=roles.flatMap(role=>Object.values(credentialsFor(role)).slice(0,2));
export function redact(value){let s=String(value);for(const secret of secretValues)if(secret)s=s.split(secret).join('[REDACTED]');return s.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED_TOKEN]');}
process.on('uncaughtException',error=>{console.error(redact(error?.stack??error));process.exitCode=1;});
process.on('unhandledRejection',error=>{console.error(redact(error?.stack??error));process.exitCode=1;});

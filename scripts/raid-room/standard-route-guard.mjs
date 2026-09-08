export function assertStandardRouteAllowed({environment,projectRef,args=[],file=false}) {
 if(environment==='preview'||projectRef==='sufvuqdnqohpfzkwxohq') {
   if(file || (args.includes('db') && ['push','reset'].some(x=>args.includes(x))) || (args.includes('migration') && ['up','repair'].some(x=>args.includes(x))))
     throw Error('RAID_PREVIEW_STANDARD_MIGRATIONS_BLOCKED: use the reviewed Raid driver; migration history is not reconciled');
 }
}

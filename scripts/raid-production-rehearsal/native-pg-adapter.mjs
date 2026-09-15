// Guarded local PostgreSQL 17 adapter; never accepts an external connection string.
import {createRequire} from 'node:module';
import path from 'node:path';
const {Client}=createRequire(path.resolve(process.env.RAID_TOP_DATA_RUNTIME,'package.json'))('pg');
export class PGlite {
 constructor(){this.ready=this.init();}
 async init(){const cfg={host:'127.0.0.1',port:55462,user:'raid_top_local',database:'postgres'};const admin=new Client(cfg);await admin.connect();const {rows}=await admin.query('select current_user,inet_server_addr()::text host,inet_server_port() port,version()');if(rows[0].current_user!=='raid_top_local'||rows[0].host!=='127.0.0.1/32'||rows[0].port!==55462||!rows[0].version.includes('PostgreSQL 17'))throw Error('Isolated PG identity mismatch');this.database='raid_prod_rehearsal_'+Date.now();await admin.query('create database '+this.database);await admin.end();this.client=new Client({...cfg,database:this.database});await this.client.connect();}
 async exec(sql){await this.ready;return this.client.query(sql);}
 async query(sql,args){await this.ready;return this.client.query(sql,args);}
 async close(){await this.ready;await this.client.end();}
}

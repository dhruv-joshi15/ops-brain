import {PrismaBetterSqlite3} from "@prisma/adapter-better-sqlite3";
import {PrismaClient} from "../generated/prisma/client";
import type {Prisma} from "../generated/prisma/client";
import {defaultRules,goals,sampleTasks,seedTasks,todayMumbai,type Rules,type Task} from "./domain";
import type {AuditEvent,Catalog,Run,Workspace} from "./contracts";
import {liveEnabled} from "./extract";

const cache = globalThis as typeof globalThis & {
  opsDb?: {client:PrismaClient; constructor:typeof PrismaClient; url:string};
};
const url = process.env.DATABASE_URL || "file:./ops.db";
const cached = cache.opsDb;
// A dev reload can keep a client built from an earlier Prisma schema alive.
export const db = cached?.constructor===PrismaClient && cached.url===url
  ? cached.client
  : new PrismaClient({adapter:new PrismaBetterSqlite3({url})});
cache.opsDb = {client:db,constructor:PrismaClient,url};

export async function readRecords(tx:Prisma.TransactionClient) {
  const [rows,stored] = await Promise.all([tx.task.findMany(),tx.catalog.findUnique({where:{id:"workspace"}})]);
  const persisted = rows.map(row=>row.data as unknown as Task);
  const names = new Set([...seedTasks,...sampleTasks,...persisted].flatMap(task=>task.owner?[task.owner]:[]));
  const catalog:Catalog = stored ? stored.data as unknown as Catalog : {
    goals:goals.map(goal=>({...goal})),members:[...names].sort().map(name=>({id:name,name,active:true})),deletedSeeds:[],
  };
  const tasks = [...seedTasks.filter(task=>!catalog.deletedSeeds.includes(task.id)&&!rows.some(row=>row.id===task.id)),...persisted];
  return {catalog,tasks};
}

export async function workspace():Promise<Workspace> {
  const [{catalog,tasks},runs,versions,events] = await Promise.all([
    readRecords(db),
    db.run.findMany({orderBy:{createdAt:"desc"}}),
    db.ruleVersion.findMany({orderBy:{version:"desc"}}),
    db.auditEvent.findMany(),
  ]);
  const visible = runs.map(row=>row.data as unknown as Run).filter(run=>!run.removedAt);
  return {
    goals:catalog.goals,members:catalog.members,tasks,
    events:events.map(row=>row.data as unknown as AuditEvent).sort((a,b)=>b.at.localeCompare(a.at)),
    runs:visible.filter((run,index)=>index<50||run.state==="review"),
    rules:versions[0]?.data as unknown as Rules ?? defaultRules,
    version:versions[0]?.version ?? 0,
    versions:[...versions.map(row=>row.version),0],
    live:liveEnabled(),
    today:process.env.OPS_DEMO_DATE || todayMumbai(),
  };
}

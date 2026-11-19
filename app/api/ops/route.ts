import {createHash} from "node:crypto";
import {z} from "zod";
import {dateSchema, defaultRules, rulesSchema, taskSchema, validateGraph,type Task} from "../../../lib/domain";
import type {Run} from "../../../lib/contracts";
import {extract} from "../../../lib/extract";
import {manage,managementCommands,ReviewError,type ManagementCommand} from "../../../lib/manage";
import {db, readRecords, workspace} from "../../../lib/store";

const meetingKey = (notes:string,date:string) => createHash("sha256")
  .update(JSON.stringify([date,notes.normalize("NFC").trim().replace(/\s+/gu," ")]))
  .digest("hex");
const commandSchema = z.discriminatedUnion("action",[
  z.strictObject({action:z.literal("extract"),notes:z.string().trim().min(10).max(16000),meetingDate:dateSchema,goalId:z.string()}),
  z.strictObject({action:z.literal("commit"),id:z.uuid(),tasks:z.array(taskSchema.extend({approval:z.enum(["approved","rejected"])})).max(30)}),
  ...managementCommands,
  z.strictObject({action:z.literal("rules"),rules:rulesSchema}),
  z.strictObject({action:z.literal("restore"),version:z.number().int().nonnegative()}),
]);
export async function GET() {
  try {
    return Response.json(await workspace());
  } catch {
    return Response.json({error:"The workspace database is unavailable. Run npm run setup and restart the app."},{status:503});
  }
}

export async function POST(request:Request) {
  if (request.headers.get("sec-fetch-site")==="cross-site")
    return Response.json({error:"Open Ops Brain directly and try again."},{status:403});
  const parsed = commandSchema.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return Response.json({error:"Some fields are invalid. Check required values, dates and lengths."},{status:400});
  const command = parsed.data;
  try {
    if (command.action!=="extract"&&command.action!=="commit"&&command.action!=="rules"&&command.action!=="restore")
      await db.$transaction(tx=>manage(tx,command satisfies ManagementCommand,Boolean(process.env.OPENAI_API_KEY)));
    if (command.action==="rules") await db.ruleVersion.create({data:{data:command.rules}});
    if (command.action==="restore") {
      const version = command.version ? await db.ruleVersion.findUnique({where:{version:command.version}}) : null;
      if (command.version && !version) throw new ReviewError("This version was not found.");
      await db.ruleVersion.create({data:{data:rulesSchema.parse(version?.data ?? defaultRules)}});
    }
    if (command.action==="extract") {
      const state = await workspace();
      if (!state.goals.some(goal=>goal.id===command.goalId&&!goal.archived)) throw new ReviewError("Select an active goal.");
      const key = meetingKey(command.notes,command.meetingDate);
      const prior = (await db.run.findMany({where:{state:{in:["review","committed"]}},orderBy:{createdAt:"desc"}}))
        .map(row=>row.data as unknown as Run)
        .find(item=>(item.meetingKey ?? meetingKey(item.notes,item.meetingDate))===key && (item.state==="committed"||(!item.removedAt&&item.goalId===command.goalId)));
      if (prior) return Response.json({workspace:state,run:prior,runId:prior.id,reused:true});
      const run:Run = {
        id:crypto.randomUUID(),createdAt:new Date().toISOString(),state:"running",notes:command.notes,
        meetingDate:command.meetingDate,goalId:command.goalId,model:state.live?state.rules.model:"Local sample",
        meetingKey:key,provider:state.live?"Responses API":"Local fixture",version:state.version,tasks:[],decisions:[],cost:null,
      };
      await db.run.create({data:{id:run.id,state:run.state,data:{...run}}});
      let result:Run;
      try {
        result = await extract(run,state.rules,state.goals);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const recoverable = /^(Local sample mode|The model )/.test(message);
        result = {...run,state:"failed",error:recoverable ? message : "The model could not be reached. Check connectivity and retry."};
      }
      await db.run.update({where:{id:run.id},data:{state:result.state,data:{...result}}});
      return Response.json({workspace:await workspace(),runId:run.id});
    }
    if (command.action==="commit") {
      await db.$transaction(async tx=>{
        const row = await tx.run.findUnique({where:{id:command.id}});
        if (row?.state==="committed") return;
        if (!row || row.state!=="review") throw new ReviewError("This run is unavailable for review.");
        const run = row.data as unknown as Run;
        if(run.removedAt)throw new ReviewError("This review has been removed from Activity.");
        const {catalog,tasks:existing}=await readRecords(tx);
        const key = run.meetingKey ?? meetingKey(run.notes,run.meetingDate);
        const past = await tx.run.findMany({where:{state:"committed"}});
        if (past.some(entry=>{
          const item = entry.data as unknown as Run;
          return (item.meetingKey ?? meetingKey(item.notes,item.meetingDate))===key;
        })) throw new ReviewError("This meeting already has a committed review. Open its original run in Activity.");
        const originals = new Map(run.tasks.map(task=>[task.id,task]));
        if (command.tasks.length!==originals.size || new Set(command.tasks.map(task=>task.id)).size!==originals.size)
          throw new ReviewError("Set an approval decision for every proposal.");
        const reviewed = command.tasks.map(task=>{
          const original = originals.get(task.id);
          if (!original || (task.approval==="approved"&&!catalog.goals.some(goal=>goal.id===task.goalId&&!goal.archived))) throw new ReviewError("A proposal or its goal does not match this run.");
          return {...task,evidence:original.evidence,warnings:original.warnings};
        });
        const approved = reviewed.filter(task=>task.approval==="approved");
        if (approved.some(task=>!task.owner || !task.due)) throw new ReviewError("Add an owner and due date to each approved proposal.");
        if (approved.some(task=>!catalog.members.some(member=>member.active&&member.name===task.owner))) throw new ReviewError("Choose an active team member for each approved task.");
        try {validateGraph(approved);} catch(error) {throw new ReviewError((error as Error).message);}
        const mapId = (id:string) => `${run.id}_${id}`;
        if (new Set(approved.map(task=>`${task.goalId}:${task.title.toLowerCase()}`)).size!==approved.length)
          throw new ReviewError("Two approved proposals have the same title and goal.");
        const duplicates = approved.filter(task=>existing.some(saved=>saved.goalId===task.goalId && saved.evidence===task.evidence && saved.title.toLowerCase()===task.title.toLowerCase()));
        if (duplicates.length) throw new ReviewError("A matching task already exists. Reject the duplicate proposals to finish the review.");
        for (const task of approved) {
          const data:Task = {...taskSchema.parse({id:task.id,title:task.title,description:task.description,owner:task.owner,due:task.due,goalId:task.goalId,dependencies:task.dependencies,evidence:task.evidence,warnings:task.warnings}),id:mapId(task.id),dependencies:task.dependencies.map(mapId),status:"Open",runId:run.id};
          await tx.task.create({data:{id:data.id,data}});
        }
        await tx.run.update({where:{id:run.id},data:{state:"committed",data:{...run,state:"committed",meetingKey:key,reviewedAt:new Date().toISOString(),originals:run.tasks,tasks:reviewed}}});
      });
    }
    return Response.json({workspace:await workspace()});
  } catch (error) {
    if (error instanceof ReviewError) return Response.json({error:error.message},{status:409});
    console.error("Ops workspace request failed",error instanceof Error ? error.name : "Unknown error");
    return Response.json({error:"The workspace could not save this change. Retry in a moment."},{status:503});
  }
}

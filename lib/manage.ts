import {randomUUID} from "node:crypto";
import {z} from "zod";
import type {Prisma} from "../generated/prisma/client";
import {dateSchema,goals,sampleDate,sampleNotes,seedTasks,taskSchema,validateGraph,type Task} from "./domain";
import type {AuditEvent,Run} from "./contracts";
import {readRecords} from "./store";

const name=z.string().trim().min(1).max(100);
const editSchema=z.strictObject({
  title:taskSchema.shape.title,description:taskSchema.shape.description,owner:name.nullable(),
  due:dateSchema.nullable(),goalId:z.string(),status:z.enum(["Open","Done"]),
  dependencies:z.array(z.string()).max(30),priorityOverride:z.enum(["High","Medium","Normal"]).nullable(),
  duration:z.number().int().min(1).max(180).nullable(),
});
const confirmation=z.literal(true);
export const managementCommands=[
  z.strictObject({action:z.literal("task"),id:z.string().nullable(),revision:z.string().nullable(),fields:editSchema}),
  z.strictObject({action:z.literal("archiveTask"),id:z.string(),archived:z.boolean()}),
  z.strictObject({action:z.literal("deleteTask"),id:z.string(),replacement:z.string().nullable(),confirmed:confirmation}),
  z.strictObject({action:z.literal("goal"),id:z.string().nullable(),fields:z.strictObject({name,owner:name.nullable(),due:dateSchema,area:name,importance:z.number().int().min(1).max(3)})}),
  z.strictObject({action:z.literal("archiveGoal"),id:z.string(),archived:z.boolean()}),
  z.strictObject({action:z.literal("deleteGoal"),id:z.string(),destination:z.string().nullable(),confirmed:confirmation}),
  z.strictObject({action:z.literal("member"),id:z.string().nullable(),name,active:z.boolean()}),
  z.strictObject({action:z.literal("deleteMember"),id:z.string(),replacement:z.string().nullable(),confirmed:confirmation}),
  z.strictObject({action:z.literal("deleteRun"),id:z.uuid(),confirmed:confirmation}),
  z.strictObject({action:z.literal("clearDemoActivity"),ids:z.array(z.string()).max(500).optional(),confirmed:confirmation}),
  z.strictObject({action:z.literal("reset"),confirmation:z.literal("RESET")}),
] as const;
export type ManagementCommand=z.infer<(typeof managementCommands)[number]>;
export class ReviewError extends Error {}
export const isSampleRun=(run:Run)=>run.model==="Local sample"&&run.meetingDate===sampleDate&&run.notes===sampleNotes;
export const isLocalRun=(run:Run)=>run.model==="Local sample" && (!run.provider||run.provider==="Local fixture");

export async function manage(tx:Prisma.TransactionClient,command:ManagementCommand,live:boolean) {
  const {catalog,tasks}=await readRecords(tx);
  const at=new Date().toISOString();
  const rows=await tx.run.findMany();
  const runs=rows.map(row=>row.data as unknown as Run);
  const sampleIds=new Set(runs.filter(isSampleRun).map(run=>run.id));
  const sampleTask=(task:Task)=>!!task.runId&&sampleIds.has(task.runId);
  const audit=async(subject:string,changes:string[],demo=false)=>{
    const event:AuditEvent={id:randomUUID(),at,subject,changes,demo};
    await tx.auditEvent.create({data:{id:event.id,data:event}});
  };
  const persistCatalog=()=>tx.catalog.upsert({where:{id:"workspace"},create:{id:"workspace",data:catalog},update:{data:catalog}});
  const persistTask=async(task:Task,changes:string[])=>{
    const data={...task,updatedAt:at,history:[...(task.history??[]),{at,changes,managed:true}]};
    await tx.task.upsert({where:{id:task.id},create:{id:task.id,data},update:{data}});
    await audit(task.title,changes,!live&&sampleTask(task));
  };
  const validOwner=(owner:string|null,existing?:string|null)=>{
    if(owner&&owner!==existing&&!catalog.members.some(person=>person.active&&person.name===owner))
      throw new ReviewError("Choose an active team member.");
  };
  const validGoal=(id:string,existing?:string)=>{
    if(id&&id!==existing&&!catalog.goals.some(goal=>goal.id===id&&!goal.archived))
      throw new ReviewError("Choose an active goal.");
  };
  const checkGraph=(records:Task[])=>{
    try{validateGraph(records);}catch(error){throw new ReviewError((error as Error).message);}
  };
  if(command.action==="task"){
    const current=tasks.find(task=>task.id===command.id);
    if(command.id&&!current)throw new ReviewError("Task was not found.");
    if(current&&(current.updatedAt??null)!==command.revision)throw new ReviewError("This task has changed. Reopen it before editing.");
    const {duration,...fields}=command.fields;
    validOwner(fields.owner,current?.owner);
    validGoal(fields.goalId,current?.goalId);
    const data:Task={evidence:"Created manually",warnings:[],...current,...fields,id:current?.id??randomUUID()};
    if(duration===null)delete data.duration;else data.duration=duration;
    checkGraph([...tasks.filter(task=>task.id!==data.id),data]);
    const changes=current?Object.entries(command.fields).flatMap(([key,value])=>{
      const previous=current[key as keyof Task]??null;
      return JSON.stringify(previous)===JSON.stringify(value)?[]:[`${key}: ${previous??"unset"} → ${value??"unset"}`];
    }):["Task created"];
    if(changes.length)await persistTask(data,changes);
    return;
  }
  if(command.action==="archiveTask"||command.action==="deleteTask"){
    const task=tasks.find(item=>item.id===command.id);
    if(!task)throw new ReviewError("Task was not found.");
    if(command.action==="archiveTask"){
      await persistTask({...task,archived:command.archived},[command.archived?"Archived":"Restored from archive"]);
      return;
    }
    const replacement=command.replacement&&tasks.find(item=>item.id===command.replacement&&!item.archived&&item.id!==task.id);
    if(command.replacement&&!replacement)throw new ReviewError("Choose an existing active replacement task.");
    const dependents=tasks.filter(item=>item.dependencies.includes(task.id));
    const updates=dependents.map(item=>({...item,dependencies:[...new Set(item.dependencies.flatMap(id=>id!==task.id?[id]:replacement?[replacement.id]:[]))]}));
    checkGraph(tasks.filter(item=>item.id!==task.id).map(item=>updates.find(update=>update.id===item.id)??item));
    for(const item of updates)await persistTask(item,[replacement?`Dependency moved from ${task.title} to ${replacement.title}`:`Removed dependency on ${task.title}`]);
    for(const event of task.history?.filter(item=>!item.managed)??[]){
      const id=randomUUID();
      const record:AuditEvent={id,at:event.at,subject:task.title,changes:event.changes,demo:!live&&sampleTask(task)};
      await tx.auditEvent.create({data:{id,data:record}});
    }
    await tx.task.deleteMany({where:{id:task.id}});
    if(seedTasks.some(item=>item.id===task.id)){catalog.deletedSeeds.push(task.id);await persistCatalog();}
    await audit(task.title,["Task deleted"],!live&&sampleTask(task));
    return;
  }
  if(command.action==="goal"){
    const existing=catalog.goals.find(goal=>goal.id===command.id);
    if(command.id&&!existing)throw new ReviewError("Goal was not found.");
    validOwner(command.fields.owner,existing?.owner);
    if(existing)Object.assign(existing,command.fields);
    else catalog.goals.push({id:randomUUID(),color:"violet",...command.fields});
    await persistCatalog();
    await audit(command.fields.name,[existing?"Goal updated":"Goal created"]);
    return;
  }
  if(command.action==="archiveGoal"||command.action==="deleteGoal"){
    const goal=catalog.goals.find(item=>item.id===command.id);
    if(!goal)throw new ReviewError("Goal was not found.");
    if(command.action==="archiveGoal")goal.archived=command.archived;
    else{
      if(command.destination===goal.id)throw new ReviewError("Select a different goal.");
      validGoal(command.destination??"");
      for(const task of tasks.filter(task=>task.goalId===goal.id))
        await persistTask({...task,goalId:command.destination??""},[`Moved from goal ${goal.name}`]);
      catalog.goals=catalog.goals.filter(item=>item.id!==goal.id);
    }
    await persistCatalog();
    await audit(goal.name,[command.action==="deleteGoal"?"Goal deleted":command.archived?"Goal archived":"Goal restored"]);
    return;
  }
  if(command.action==="member"||command.action==="deleteMember"){
    const member=catalog.members.find(item=>item.id===command.id);
    if(command.id&&!member)throw new ReviewError("Team member was not found.");
    let replacement:string|null;
    if(command.action==="member"){
      if(catalog.members.some(item=>item.id!==command.id&&item.name.toLowerCase()===command.name.toLowerCase()))
        throw new ReviewError("A team member already has this name.");
      replacement=command.name;
      if(member){catalog.members=catalog.members.map(item=>item.id===member.id?{...item,name:command.name,active:command.active}:item);}
      else catalog.members.push({id:randomUUID(),name:command.name,active:command.active});
    }else{
      replacement=command.replacement;
      if(replacement===member?.name)throw new ReviewError("Select a different team member.");
      validOwner(replacement);
      catalog.members=catalog.members.filter(item=>item.id!==command.id);
    }
    if(member&&member.name!==replacement){
      for(const task of tasks.filter(task=>task.owner===member.name))
        await persistTask({...task,owner:replacement},[`owner: ${member.name} → ${replacement??"Unassigned"}`]);
      for(const goal of catalog.goals.filter(goal=>goal.owner===member.name))goal.owner=replacement;
    }
    await persistCatalog();
    await audit(member?.name??replacement??"Team member",[command.action==="deleteMember"?"Team member removed":member?"Team member updated":"Team member added"]);
    return;
  }
  if(live)throw new ReviewError("Audit retention actions are available only in local demo mode.");
  if(command.action==="deleteRun"){
    const run=runs.find(item=>item.id===command.id&&!item.removedAt);
    if(!run||run.state==="running"||!isLocalRun(run))throw new ReviewError("Only completed local extraction records can be removed.");
    await tx.run.update({where:{id:run.id},data:{data:{...run,removedAt:at}}});
    return;
  }
  const events=await tx.auditEvent.findMany();
  if(command.action==="clearDemoActivity"){
    const selected=command.ids&&new Set(command.ids);
    const ids=events.filter(row=>(row.data as unknown as AuditEvent).demo&&(!selected||selected.has(row.id))).map(row=>row.id);
    await tx.auditEvent.deleteMany({where:{id:{in:ids}}});
    if(!selected){
      for(const run of runs.filter(item=>isSampleRun(item)&&item.state!=="running"&&!item.removedAt))
        await tx.run.update({where:{id:run.id},data:{data:{...run,removedAt:at}}});
    }
    return;
  }
  if(runs.some(run=>isSampleRun(run)&&run.state==="running"))throw new ReviewError("Wait for the sample extraction to finish.");
  const ids=tasks.filter(sampleTask).map(task=>task.id);
  const deleted=new Set(ids);
  for(const task of tasks.filter(task=>!deleted.has(task.id)&&task.dependencies.some(id=>deleted.has(id))))
    await persistTask({...task,dependencies:task.dependencies.filter(id=>!deleted.has(id))},["Removed dependencies on reset sample tasks"]);
  await tx.task.deleteMany({where:{id:{in:ids}}});
  await tx.run.deleteMany({where:{id:{in:[...sampleIds]}}});
  await tx.auditEvent.deleteMany({where:{id:{in:events.filter(row=>(row.data as unknown as AuditEvent).demo).map(row=>row.id)}}});
  if(!catalog.goals.some(goal=>!goal.archived)&&!catalog.goals.some(goal=>goal.id===goals[0].id)){
    const sampleGoal={...goals[0],owner:catalog.members.some(member=>member.name===goals[0].owner)?goals[0].owner:null};
    catalog.goals.push(sampleGoal);await persistCatalog();
  }
}

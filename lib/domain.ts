import {z} from "zod";

export const dateSchema = z.iso.date();
export const taskSchema = z.strictObject({
  id:z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100),
  title:z.string().trim().min(1).max(150),
  description:z.string().max(2000),
  owner:z.string().trim().min(1).max(100).nullable(),
  due:dateSchema.nullable(),
  goalId:z.string(),
  dependencies:z.array(z.string()).max(30),
  evidence:z.string().trim().min(1).max(1000),
  warnings:z.array(z.string()).max(20),
});
export type Proposal = z.infer<typeof taskSchema>;
export type Review = Proposal & {approval:"pending"|"approved"|"rejected"};
export type Task = Proposal & {status:"Open"|"Done"; runId?:string; archived?:boolean; priorityOverride?:"High"|"Medium"|"Normal"|null; updatedAt?:string; history?:{at:string; changes:string[];managed?:boolean}[]; duration?:number};
export const rulesSchema = z.strictObject({
  prompt:z.string().trim().min(20).max(4000),
  model:z.string().trim().min(1).max(100),
  goalWeight:z.number().int().min(1).max(30),
  dependencyWeight:z.number().int().min(1).max(20),
  deadlineWeight:z.number().int().min(1).max(20),
  mediumThreshold:z.number().int().min(1).max(300).optional(),
  highThreshold:z.number().int().min(2).max(500).optional(),
  inputPrice:z.number().min(0).max(1000),
  outputPrice:z.number().min(0).max(1000),
}).refine(rules=>(rules.highThreshold??65)>(rules.mediumThreshold??43), "High priority must have a higher threshold than medium.");
export type Rules = z.infer<typeof rulesSchema>;
export const defaultRules: Rules = {
  prompt:"Extract only actionable commitments and explicit decisions from the notes. Preserve uncertainty, quote the source verbatim, resolve dates against the meeting date, and infer dependencies only where the notes support them. Use the selected goal.",
  model:"gpt-4o-mini",goalWeight:10,dependencyWeight:7,deadlineWeight:3,inputPrice:.15,outputPrice:.60,
};
export type Goal = {id:string;name:string;due:string;importance:number;owner:string|null;area:string;color:string;archived?:boolean};
export const goals:Goal[] = [
  {id:"website",name:"Launch the D2C website",due:"2026-12-20",importance:3,owner:"Aditi",area:"Growth & product",color:"violet"},
  {id:"fulfillment",name:"Get fulfillment launch-ready",due:"2026-12-03",importance:2,owner:"Maya",area:"Operations",color:"mint"},
  {id:"content",name:"Build the launch content library",due:"2026-12-12",importance:2,owner:"Karan",area:"Brand & content",color:"peach"},
];
export const sampleDate = "2026-11-19";
export const sampleNotes = `We need the website ready before December 20.

Aditi will finalize the homepage and product page designs by November 25.
Rahul will begin frontend development after Aditi finishes the designs. Development should be completed by December 5.
Priya will handle QA once Rahul finishes. Testing must be completed by December 10.
Karan will prepare the launch campaign after QA approval. Campaign assets should be ready by December 15.

Rahul: Design complete hone ke baad hi development start kar paunga.
Priya: Testing mate final build joie, nahi toh QA delay thashe.
Rahul: डिज़ाइन पूरा होने के बाद ही डेवलपमेंट शुरू कर पाऊँगा।
Priya: ટેસ્ટિંગ માટે ફાઇનલ બિલ્ડ જોઈએ.

The founder also wants everyone to flag blockers early.`;
function proposal(id:string,title:string,owner:string,due:string,dependencies:string[],evidence:string,goalId="website"):Proposal {
  return {id,title,owner,due,dependencies,evidence,goalId,description:evidence,warnings:[]};
}
export const sampleTasks = [
  proposal("design","Finalize homepage and product page designs","Aditi","2026-11-25",[],"Aditi will finalize the homepage and product page designs by November 25."),
  proposal("development","Build the website frontend","Rahul","2026-12-05",["design"],"Rahul will begin frontend development after Aditi finishes the designs. Development should be completed by December 5."),
  proposal("qa","Complete website QA","Priya","2026-12-10",["development"],"Priya will handle QA once Rahul finishes. Testing must be completed by December 10."),
  proposal("campaign","Prepare launch campaign assets","Karan","2026-12-15",["qa"],"Karan will prepare the launch campaign after QA approval. Campaign assets should be ready by December 15."),
];
export const seedTasks:Task[] = [
  {...proposal("courier","Confirm courier pickup windows","Maya","2026-11-18",[],"Confirm pickup windows with the courier team.","fulfillment"),status:"Open"},
  {...proposal("dispatch","Run a dispatch dry run","Neel","2026-11-23",["courier"],"Run the dry run after pickup windows are confirmed.","fulfillment"),status:"Open"},
  {...proposal("copy","Draft product page copy","Ishaan","2026-11-20",[],"Draft the first four product descriptions."),status:"Open"},
  {...proposal("shoot","Approve the product shoot brief","Aditi","2026-11-21",[],"Review the product photography brief.","content"),status:"Open"},
  {...proposal("assets","Organize reference imagery","Karan","2026-11-18",[],"Add references to the content library.","content"),status:"Done"},
];
export const daysBetween = (from:string,to:string) => Math.round((Date.parse(to)-Date.parse(from))/86400000);
export function addDays(date:string,days:number) {
  return new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
}
export function validateGraph(tasks:Proposal[]) {
  const indexed = new Map(tasks.map(task=>[task.id, task]));
  if (indexed.size !== tasks.length) throw new Error("Task IDs must be unique.");
  const active = new Set<string>();
  const visited = new Set<string>();
  function visit(id:string) {
    if (active.has(id)) throw new Error("Dependencies form a loop. Remove one link and try again.");
    if (visited.has(id)) return;
    const task = indexed.get(id);
    if (!task) throw new Error("A dependency is missing. Include it in the approval or remove the link.");
    if (new Set(task.dependencies).size !== task.dependencies.length) throw new Error("A task has duplicate dependency links.");
    active.add(id);
    task.dependencies.forEach(visit);
    active.delete(id);
    visited.add(id);
  }
  tasks.forEach(task=>visit(task.id));
}
export function analyze(tasks:Task[],today:string,rules:Rules,simulation?:{id:string;days:number},workspaceGoals:Goal[]=goals) {
  const index = new Map(tasks.map(task=>[task.id,task]));
  const open = tasks.filter(task=>task.status==="Open"&&!task.archived);
  const downstream = new Map<string,Set<string>>();
  function descendants(id:string):Set<string> {
    const cached = downstream.get(id);
    if (cached) return cached;
    const affected = new Set<string>();
    downstream.set(id,affected);
    open.filter(task=>task.dependencies.includes(id)).forEach(task=>{
      affected.add(task.id);
      descendants(task.id).forEach(next=>affected.add(next));
    });
    return affected;
  }
  const forecasts = new Map<string,string|null>();
  function forecast(task:Task):string|null {
    if (forecasts.has(task.id)) return forecasts.get(task.id) ?? null;
    let date = task.due;
    if (task.status==="Open" && date) {
      date = date < today ? today : date;
      if (task.id===simulation?.id && task.due) {
        const slipped = addDays(task.due,simulation.days);
        if (slipped > date) date = slipped;
      }
      for (const id of task.dependencies) {
        const parent = index.get(id);
        if (!parent || parent.status==="Done") continue;
        const parentForecast = forecast(parent);
        if (parentForecast) {
          const plannedGap = parent.due && task.due ? Math.max(1,daysBetween(parent.due,task.due)) : 1;
          const candidate = addDays(parentForecast,plannedGap);
          if (candidate > date) date = candidate;
        }
      }
    }
    forecasts.set(task.id,date);
    return date;
  }
  const tiers = {High:2,Medium:1,Normal:0};
  const ranked = open.map(task=>{
    const goal = workspaceGoals.find(goal=>goal.id===task.goalId);
    const remaining = task.due ? daysBetween(today,task.due) : null;
    const blockers = task.dependencies.filter(id=>index.get(id)?.status==="Open");
    const impact = descendants(task.id).size;
    const projected = forecast(task);
    const urgency = remaining===null ? 0 : Math.max(0, 10-Math.floor(Math.max(-7,remaining)/2));
    const slip = projected && task.due ? Math.max(0,daysBetween(task.due,projected)) : 0;
    const score = (goal?.importance ?? 0)*rules.goalWeight + impact*rules.dependencyWeight + urgency*rules.deadlineWeight + Math.min(14,slip)*rules.deadlineWeight;
    const reason = [task.priorityOverride&&"Manual priority override",goal && `Goal importance ${goal.importance}/3`, remaining===null ? "Due date missing" : remaining < 0 ? "Overdue" : `Due in ${remaining}d`, impact>0 && `Unlocks ${impact} downstream`, slip>0 && `Forecast +${slip}d`].filter(Boolean).join(" · ");
    return {...task, score, blockers, impact, projected, slip, reason, priority:task.priorityOverride ?? (score>=(rules.highThreshold??65)?"High":score>=(rules.mediumThreshold??43)?"Medium":"Normal")};
  }).sort((a,b)=>tiers[b.priority]-tiers[a.priority] || b.score-a.score || (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.id.localeCompare(b.id));
  const health = workspaceGoals.map(goal=>{
    const goalTasks = tasks.filter(task=>task.goalId===goal.id&&!task.archived);
    const relevant = ranked.filter(task=>task.goalId===goal.id);
    const beyond = relevant.some(task=>task.projected && task.projected>goal.due);
    const risk = relevant.some(task=>task.slip>0 || !task.due || !task.owner);
    return {...goal,health:beyond?"Off Track":risk?"At Risk":"On Track",count:goalTasks.length,done:goalTasks.filter(task=>task.status==="Done").length};
  });
  return {ranked,health,descendants};
}
export function formatDate(date:string,options:Intl.DateTimeFormatOptions={month:"short",day:"numeric"}) {
  return new Intl.DateTimeFormat("en-US",{...options,timeZone:"UTC"}).format(new Date(date+"T12:00:00Z"));
}
export function todayMumbai() {
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}

export function reviewProblems(tasks:Review[], task:Review,workspaceGoals:Goal[]=goals):string[] {
  const issues:string[] = [];
  if (!task.title.trim()) issues.push("Add a title.");
  if (!task.owner?.trim()) issues.push("Choose an owner.");
  if (!dateSchema.safeParse(task.due).success) issues.push("Choose a valid due date.");
  if (!workspaceGoals.some(goal=>goal.id===task.goalId&&!goal.archived)) issues.push("Choose a known goal.");
  if (task.dependencies.some(id=>!tasks.some(item=>item.id===id))) issues.push("A dependency is missing.");
  if (task.dependencies.some(id=>tasks.find(item=>item.id===id)?.approval==="rejected")) issues.push("A dependency was rejected.");
  const visited=new Set<string>();
  function reachesTask(id:string):boolean {
    if(id===task.id) return true;
    if(visited.has(id))return false;
    visited.add(id);
    return (tasks.find(item=>item.id===id)?.dependencies??[]).some(reachesTask);
  }
  if(task.dependencies.some(reachesTask)) issues.push("Dependencies form a loop.");
  if(tasks.some(item=>item.id!==task.id&&item.approval!=="rejected"&&item.goalId===task.goalId&&item.title.trim().toLowerCase()===task.title.trim().toLowerCase())) issues.push("Another proposal has this title and goal.");
  return issues;
}

export function goalRisk(goal:ReturnType<typeof analyze>["health"][number], tasks:ReturnType<typeof analyze>["ranked"]) {
  const work = tasks.filter(task=>task.goalId===goal.id&&!task.archived);
  const late = work.find(task=>task.projected && task.projected>goal.due);
  if (late?.projected) return `${late.title} forecasts to ${formatDate(late.projected)}, beyond the target.`;
  const slipped = work.find(task=>task.slip>0);
  if (slipped) return `${slipped.title} has a ${slipped.slip}-day forecast slip.`;
  if (work.some(task=>!task.owner||!task.due)) return "Open work needs an owner or due date.";
  return work.length ? "Open work still fits within the target date." : "No open work is currently linked.";
}

export function scheduleExposure(tasks:Task[],sourceId:string,completion:string) {
  const index=new Map(tasks.map(task=>[task.id,task]));
  const dates=new Map<string,string|null>([[sourceId,completion]]);
  function earliest(id:string):string|null {
    if(dates.has(id)) return dates.get(id)??null;
    const task=index.get(id);
    const bounds=task?.status==="Open" ? task.dependencies.map(earliest).filter((date):date is string=>!!date) : [];
    const latest=bounds.sort().at(-1);
    // Even with zero remaining time, a successor cannot finish before its predecessor.
    const date=latest ? addDays(latest,task?.duration??0) : null;
    dates.set(id,date);return date;
  }
  return (id:string)=>{
    const lowerBound=earliest(id);
    const due=index.get(id)?.due;
    return {lowerBound,conflict:Boolean(lowerBound&&due&&lowerBound>due)};
  };
}

import {describe,expect,it} from "vitest";
import {analyze,defaultRules,sampleDate,sampleTasks,validateGraph,type Task} from "../lib/domain";
import {providerSchema} from "../lib/extract";

const approved:Task[] = sampleTasks.map(task=>({...task,status:"Open"}));
describe("Dependency planning",()=>{
  it("propagates an upstream delay through three downstream tasks and the launch goal",()=>{
    const result = analyze(approved,sampleDate,defaultRules,{id:"design",days:8});
    expect([...result.descendants("design")]).toEqual(["development","qa","campaign"]);
    expect(result.ranked.find(task=>task.id==="campaign")).toMatchObject({due:"2026-12-15",projected:"2026-12-23",slip:8});
    expect(result.health[0].health).toBe("Off Track");
  });
  it("keeps rankings stable across changes to input ordering",()=>{
    const rank = (tasks:Task[])=>analyze(tasks,sampleDate,defaultRules).ranked.map(task=>task.id);
    expect(rank(approved)).toEqual(rank([...approved].reverse()));
  });
  it("validates cycles and dangling links before persistence",()=>{
    expect(()=>validateGraph([{...sampleTasks[0],dependencies:["campaign"]},...sampleTasks.slice(1)])).toThrow(/loop/);
    expect(()=>validateGraph(sampleTasks.slice(1))).toThrow(/missing/);
  });
  it("stops delay propagation across completed work",()=>{
    const tasks = approved.map(task=>task.id==="development"?{...task,status:"Done" as const}:task);
    expect(analyze(tasks,sampleDate,defaultRules,{id:"design",days:8}).descendants("design").size).toBe(0);
  });
});
it("preserves structural constraints in provider schemas",()=>{
  expect(providerSchema({type:"object",properties:{title:{type:"string",minLength:1}},required:["title"],additionalProperties:false})).toEqual({type:"object",properties:{title:{type:"string"}},required:["title"],additionalProperties:false});
});

it("validates live responses, flags unknown owners and estimates cost",async()=>{
  const {extract} = await import("../lib/extract");
  const {vi} = await import("vitest");
  const {goalId:_goalId,...proposal} = sampleTasks[0];
  const raw = JSON.stringify({tasks:[{...proposal,owner:null,due:null}],decisions:[]});
  const request = vi.fn(async()=>Response.json({output:[{content:[{type:"output_text",text:raw}]}],usage:{input_tokens:2000,output_tokens:1000}}));
  vi.stubEnv("OPENAI_API_KEY","mock-token");
  vi.stubGlobal("fetch",request);
  try {
    const result = await extract({
      id:"mock",createdAt:"2026-11-19T00:00:00Z",state:"running",notes:proposal.evidence,
      meetingDate:sampleDate,goalId:"website",model:defaultRules.model,version:0,tasks:[],decisions:[],cost:null,
    },defaultRules);
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.state).toBe("review");
    expect(result.cost).toBeCloseTo(0.0009);
    expect(result.tasks[0]).toMatchObject({owner:null,due:null,goalId:"website",approval:"pending",warnings:["Owner needs confirmation.","Due date needs confirmation."]});
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

it("separates a possible delay from a scheduling conflict",async()=>{
  const {scheduleExposure}=await import("../lib/domain");
  expect(scheduleExposure(approved,"design","2026-12-03")("campaign").conflict).toBe(false);
  expect(scheduleExposure(approved,"design","2026-12-16")("campaign").conflict).toBe(true);
  const estimated=approved.map(task=>task.id==="development"?{...task,duration:4}:task);
  expect(scheduleExposure(estimated,"design","2026-12-03")("development").conflict).toBe(true);
});

it("records a structurally invalid provider reply as a failed run",async()=>{
  const {extract}=await import("../lib/extract");
  const {vi}=await import("vitest");
  const raw='{"tasks":[{"title":"Missing required fields"}],"decisions":[]}';
  vi.stubEnv("OPENAI_API_KEY","mock-token");
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({output:[{content:[{type:"output_text",text:raw}]}]})));
  try {
    const result=await extract({id:"invalid",createdAt:"2026-11-19T00:00:00Z",state:"running",notes:"Meeting text",meetingDate:sampleDate,goalId:"website",model:defaultRules.model,version:0,tasks:[],decisions:[],cost:null},defaultRules);
    expect(result).toMatchObject({state:"failed",rawOutput:raw,error:expect.stringContaining("inconsistent"),tasks:[],cost:null});
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

it("preserves calendar gaps across time zones and smaller scenarios",async()=>{
  const {daysBetween,addDays,formatDate}=await import("../lib/domain");
  expect(daysBetween("2026-11-25","2026-12-03")).toBe(8);
  expect(addDays("2026-12-31",1)).toBe("2027-01-01");
  expect(daysBetween("2026-11-01","2026-11-02")).toBe(1);
  expect(formatDate("2026-12-03")).toBe("Dec 3");
  const baseline=analyze(approved,sampleDate,defaultRules);
  const small=analyze(approved,sampleDate,defaultRules,{id:"design",days:3});
  expect(small.health[0].health).toBe("At Risk");
  expect(small.ranked.find(task=>task.id==="campaign")?.projected).toBe("2026-12-18");
  const large=analyze(approved,sampleDate,defaultRules,{id:"design",days:8});
  for(const [id,date] of [["development","2026-12-13"],["qa","2026-12-18"],["campaign","2026-12-23"]]){
    expect(large.ranked.find(task=>task.id===id)?.projected).toBe(date);
  }
  expect(large.health[0].health).toBe("Off Track");
  expect(analyze(approved,sampleDate,defaultRules).ranked).toEqual(baseline.ranked);
});

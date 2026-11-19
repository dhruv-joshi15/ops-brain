"use client";
import {useEffect,useState,type FormEvent,type ReactNode} from "react";
import {Activity,ArrowRight,ArrowUpRight,AudioLines,BookOpen,CalendarDays,Check,ChevronDown,ChevronRight,CircleAlert,GitFork,LayoutGrid,ListTodo,Menu,Moon,PanelLeftClose,Sun,Settings2,Sparkles,Target,X} from "lucide-react";
import {Background,Handle,MarkerType,Position,ReactFlow,type Edge,type Node,type NodeProps,type ReactFlowInstance} from "@xyflow/react";
import {AnimatePresence,motion,useReducedMotion} from "motion/react";
import {addDays,analyze,dateSchema,daysBetween,formatDate,goalRisk,reviewProblems,scheduleExposure,sampleDate,sampleNotes,type Review,type Rules,type Task} from "../lib/domain";
import {AuditManagement,ConfirmAction,GoalManagement,ManagementErrorContext,RecordActions,TeamManagement} from "./management";
import {Owner} from "./owner";
import {TaskDrawer} from "./task-drawer";
import type {Run,Workspace} from "../lib/contracts";

type Page = "Overview"|"Meetings"|"Tasks"|"Goals"|"Dependencies"|"Activity"|"Settings";
type Filter = "Active"|"Today"|"Blocked"|"Attention"|"Upcoming"|"Completed"|"Archived";
const nav = [{name:"Overview",icon:LayoutGrid},{name:"Meetings",icon:AudioLines},{name:"Tasks",icon:ListTodo},{name:"Goals",icon:Target},{name:"Dependencies",icon:GitFork},{name:"Activity",icon:Activity},{name:"Settings",icon:Settings2}] as const;
const subheads:Record<Page,string> = {
  Overview:"A clear picture of what matters, what’s moving, and what needs you.",
  Meetings:"Turn meeting notes into decisions and tasks your team can review.",
  Tasks:"See what needs attention, what’s due next, and what’s blocked.",
  Goals:"Track launch commitments and see where intervention is needed.",
  Dependencies:"Trace how work connects and preview the effects of a delay.",
  Activity:"Inspect extraction inputs, outputs, estimated costs, and approvals.",
  Settings:"Version the instructions, model, and rules that power this workspace.",
};

function Badge({children}:{children:ReactNode}) {
  const status = String(children);
  const tone = ["On Track","Done","approved","committed"].includes(status)?"green":["At Risk","Medium","review","pending","Blocked"].includes(status)?"amber":["Off Track","High","failed","rejected"].includes(status)?"red":"neutral";
  return <span className={`badge ${tone}`}><i/>{children}</span>;
}
type GraphNode = Node<{label:string;owner:string|null;date:string;impacted:boolean;goal?:boolean;status?:string;blocked?:boolean;goalRisk?:boolean;conflict?:boolean},"work">;
function WorkNode({data}:NodeProps<GraphNode>) {
  return <div className={`graph-node ${data.impacted ? "impacted":""} ${data.goal?"goal-node":""} ${data.conflict?"conflict":""} ${data.status==="Done"?"complete":""} ${data.blocked?"node-blocked":""} ${data.goalRisk?"node-goal-risk":""}`}>
    <Handle type="target" position={Position.Left}/>
    <strong>{data.label}</strong>{data.goal?<small>{data.owner}</small>:<Owner compact name={data.owner}/>}<span>{data.date}{data.status&&` · ${data.status}`}</span>
    {!data.goal && <Handle type="source" position={Position.Right}/>}
  </div>;
}
const nodeTypes = {work:WorkNode};
function DependencyView({state,openTask,initialGoal}:{state:Workspace;openTask:(id:string)=>void;initialGoal:string}) {
  const goals=state.goals.filter(goal=>!goal.archived);
  const [graph,setGraph]=useState<ReactFlowInstance<GraphNode,Edge>>();
  const [selectedGoalId,setGoal] = useState(initialGoal);
  const goalId=goals.find(goal=>goal.id===selectedGoalId)?.id??goals[0]?.id;
  const [selected,setSelected] = useState("");
  const [dateOverride,setDateOverride] = useState("");
  const [focused,setFocused] = useState("");
  const [preview,setPreview] = useState(false);
  const linked=new Set(state.tasks.filter(task=>task.goalId===goalId).map(task=>task.id));
  for(let size=-1;size!==linked.size;){
    size=linked.size;
    state.tasks.filter(task=>linked.has(task.id)).forEach(task=>task.dependencies.forEach(id=>linked.add(id)));
  }
  const tasks = state.tasks.filter(task=>linked.has(task.id));
  const eligible = tasks.filter(task=>task.status==="Open" && task.due&&!task.archived);
  const source = eligible.find(task=>task.id===selected) ?? eligible.find(task=>tasks.some(next=>next.dependencies.includes(task.id))) ?? eligible[0];
  const completion=dateOverride || (source?.due?addDays(source.due,8):"");
  const days=source?.due&&dateSchema.safeParse(completion).success?daysBetween(source.due,completion):0;
  const exposure=scheduleExposure(state.tasks,source?.id??"",dateSchema.safeParse(completion).success?completion:state.today);
  const original = analyze(state.tasks,state.today,state.rules,undefined,state.goals);
  const result = analyze(state.tasks,state.today,state.rules,source && preview ? {id:source.id,days}:undefined,state.goals);
  const affected = preview && source ? result.descendants(source.id) : new Set<string>();
  const goal = result.health.find(goal=>goal.id===goalId);
  const baseGoal = original.health.find(item=>item.id===goalId);
  if(!goal||!baseGoal)return <div className="panel empty">Create or restore a goal to view dependencies.</div>;
  const upstream=new Set<string>();
  function markUpstream(id:string) {
    for(const parent of state.tasks.find(task=>task.id===id)?.dependencies??[]){
      if(upstream.has(parent))continue;
      upstream.add(parent);markUpstream(parent);
    }
  }
  if(focused) markUpstream(focused);
  const downstream=focused?result.descendants(focused):new Set<string>();
  const visibleIds = new Set(tasks.map(task=>task.id));
  const levels = new Map<string,number>();
  function depth(id:string):number {
    if (levels.has(id)) return levels.get(id)!;
    const deps = tasks.find(task=>task.id===id)?.dependencies.filter(dep=>visibleIds.has(dep)) ?? [];
    const level = deps.length ? 1+Math.max(...deps.map(depth)) : 0;
    levels.set(id,level); return level;
  }
  const rows = new Map<number,number>();
  const nodes:GraphNode[] = tasks.map(task=>{
    const level = depth(task.id);
    const row = rows.get(level) ?? 0;
    rows.set(level,row+1);
    const ranked=result.ranked.find(item=>item.id===task.id);
    const forecast = ranked?.projected ?? task.due;
    return {id:task.id,type:"work",position:{x:level*235,y:row*155},data:{label:task.title,owner:task.owner,blocked:Boolean(ranked?.blockers.length),date:forecast?formatDate(forecast):"No due date",status:task.archived?"Archived":ranked?`${ranked.priority}${ranked.blockers.length?" / Blocked":""}`:task.status,conflict:affected.has(task.id)&&exposure(task.id).conflict,impacted:affected.has(task.id)||(preview&&source?.id===task.id)||upstream.has(task.id)||downstream.has(task.id)||focused===task.id}};
  });
  nodes.push({id:"goal",type:"work",position:{x:(1+Math.max(0,...levels.values()))*235,y:0},data:{label:goal.name,owner:goal.health,date:formatDate(goal.due),goal:true,goalRisk:goal.health!=="On Track",impacted:preview&&goal.health!=="On Track"}});
  const edges:Edge[] = tasks.flatMap(task=>task.dependencies.filter(id=>visibleIds.has(id)).map(id=>({id:`${id}:${task.id}`,source:id,target:task.id,markerEnd:{type:MarkerType.ArrowClosed},animated:affected.has(task.id),style:{stroke:affected.has(task.id)?exposure(task.id).conflict?"#f07583":"#efb867":upstream.has(id)||downstream.has(task.id)?"#45bcd2":"#8277db",strokeWidth:2}})));
  for(const task of tasks.filter(task=>task.goalId===goalId&&!tasks.some(next=>next.goalId===goalId&&next.dependencies.includes(task.id)))) edges.push({id:`${task.id}:goal`,source:task.id,target:"goal",markerEnd:{type:MarkerType.ArrowClosed},animated:affected.has(task.id)});
  const notifications = result.ranked.filter(task=>affected.has(task.id));
  const baseline = new Map(original.ranked.map(task=>[task.id,task]));
  const projectedGoal = result.ranked.filter(task=>task.goalId===goalId && task.projected)
    .map(task=>task.projected!).sort().at(-1);
  const goalDelay = projectedGoal ? Math.max(0,daysBetween(goal.due,projectedGoal)) : 0;
  return <>
    <section className="panel graph-panel"><div className="section-head"><div><h2>Dependency map</h2><p>Choose a node to trace upstream and downstream work.</p>{focused&&<button className="text-button" onClick={()=>openTask(focused)}>Open selected task</button>}</div><select aria-label="Graph goal" value={goalId} onChange={e=>{setGoal(e.target.value);setSelected("");setDateOverride("");setFocused("");setPreview(false);}}>{goals.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    <div className="graph"><ReactFlow key={goalId} nodes={nodes} edges={edges} nodeTypes={nodeTypes} nodesDraggable={false} nodesConnectable={false} onNodeClick={(_,node)=>{if(node.id!=="goal")setFocused(node.id);}} onPaneClick={()=>setFocused("")} onInit={setGraph} fitView fitViewOptions={{padding:.24}} minZoom={.05}><Background gap={20} color="var(--grid)"/></ReactFlow></div>
    <div className="graph-toolbar"><ul aria-label="Graph legend"><li>Dependency</li><li>Blocked task</li><li>Simulated impact</li><li>Goal risk</li></ul><div className="inline-actions"><button className="button" disabled={!graph} aria-label="Zoom out" onClick={()=>void graph?.zoomOut()}>−</button><button className="button" disabled={!graph} aria-label="Zoom in" onClick={()=>void graph?.zoomIn()}>+</button><button className="button" disabled={!graph} onClick={()=>void graph?.fitView({padding:.24})}>Fit view</button></div></div></section>
    <section className="panel form-panel"><div className="section-head"><div><h2>Delay simulation</h2><p>Preview forecast dates, priority changes, and follow-ups. Saved tasks keep their approved dates.</p></div><Badge>{baseGoal.health}</Badge></div>
    <div className="inline-form"><label>Upstream task<select value={source?.id ?? ""} onChange={e=>{setSelected(e.target.value);setDateOverride("");setPreview(false);}}>{eligible.map(task=><option key={task.id} value={task.id}>{task.title}</option>)}</select></label><label>Projected completion<input type="date" value={completion} onChange={e=>{setDateOverride(e.target.value);setPreview(false);}}/></label><button className="primary" disabled={!source || !Number.isInteger(days) || days<1 || days>60} onClick={()=>setPreview(true)}>Simulate delay <ArrowRight size={15}/></button>{preview&&<button className="button" onClick={()=>{setDateOverride("");setPreview(false);}}>Clear</button>}</div>
    {preview&&<div className="simulation-result"><h3>{notifications.length} downstream {notifications.length===1?"task":"tasks"} affected</h3><p className="scenario-label">Hypothetical scenario · Saved workspace data stays unchanged.</p>
    <div className="scenario-facts">
      <div><small>Current goal health</small><Badge>{baseGoal.health}</Badge></div>
      <div><small>Simulated goal health</small><Badge>{goal.health}</Badge></div>
      <div><small>Target date</small><strong>{formatDate(goal.due)}</strong></div>
      <div><small>Latest task forecast</small><strong>{projectedGoal?formatDate(projectedGoal):"Unavailable"}</strong></div>
      <div><small>Potential goal delay</small><strong>{goalDelay} {goalDelay===1?"day":"days"}</strong></div>
    </div>
    <p>{source?.due&&`Original due date ${formatDate(source.due)} · Projected completion ${formatDate(completion)}`}</p>
    <p>{goalRisk(goal,result.ranked)} Forecasts preserve scheduled gaps. Missing duration estimates leave the earliest finish uncertain.</p>
    {result.health.filter(item=>item.id!==goalId&&notifications.some(task=>task.goalId===item.id)).map(item=><p key={item.id}>{item.name} · {item.health} · {goalRisk(item,result.ranked)}</p>)}
    <h3>Notification preview</h3><p>Slack drafts only. No messages sent.</p>
    {notifications.map(task=>{
      const before=baseline.get(task.id);
      const shift=task.due&&task.projected?daysBetween(task.due,task.projected):null;
      const risk=exposure(task.id).conflict?"Scheduling conflict under this scenario":task.slip>0?"Possible deadline risk":"Dependency exposure";
      return <div className="notice impact-notice" key={task.id}>
        <Owner name={task.owner} fallback="Goal lead"/>
        <div><strong>{task.title}</strong><p>{risk} · Upstream delay: {source?.title}. Confirm a recovery plan and flag blockers.</p>
        <small>Due {task.due?formatDate(task.due):"unscheduled"} · Forecast {task.projected?formatDate(task.projected):"uncertain"}{shift!==null&&` · ${shift}d after approved date`}</small>
        <small>Saved priority {before?.priority} ({before?.score}) · Simulated priority {task.priority} ({task.score})</small>
        <small>{task.reason}</small></div>
      </div>;
    })}
    {!notifications.length&&<p>No downstream follow-ups are needed for this task.</p>}</div>}</section>
  </>;
}

export default function Home() {
  const [state,setState] = useState<Workspace>();
  const [page,setPage] = useState<Page>("Overview");
  const [theme,setTheme]=useState("midnight");
  const [compact,setCompact]=useState(false);
  const [lowMotion,setLowMotion]=useState(false);
  const [search,setSearch]=useState("");
  const [sort,setSort]=useState("priority");
  const [priority,setPriority]=useState("");
  const [drawer,setDrawer]=useState("");
  const [goalDetail,setGoalDetail]=useState("");
  const [graphGoal,setGraphGoal]=useState("");
  const [pendingOnly,setPendingOnly]=useState(false);
  const [riskOnly,setRiskOnly]=useState(false);
  const [activitySearch,setActivitySearch]=useState("");
  const [activityStatus,setActivityStatus]=useState("");
  const [removeRun,setRemoveRun]=useState<Run>();
  const [reset,setReset]=useState(false);
  const [noticeType,setNoticeType]=useState("blocked");
  const [filter,setFilter] = useState<Filter>("Active");
  const [goalFilter,setGoalFilter] = useState("");
  const [ownerFilter,setOwnerFilter] = useState("");
  const [menu,setMenu] = useState(false);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [toast,setToast] = useState("");
  const [notes,setNotes] = useState("");
  const [date,setDate] = useState("");
  const [goal,setGoal] = useState("website");
  const [run,setRun] = useState<Run>();
  const [draft,setDraft] = useState<Review[]>([]);
  const [detail,setDetail] = useState("");
  const [rules,setRules] = useState<Rules>();
  const [restore,setRestore] = useState(0);
  const reduce = useReducedMotion();
  async function load() {
    try {
      const response = await fetch("/api/ops");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setState(body);setDate(previous=>previous || body.today);setRules(body.rules);setError("");
      setTheme(document.documentElement.dataset.theme??"midnight");
      setLowMotion(document.documentElement.dataset.motion==="reduce");
    } catch(error) {setError(error instanceof Error ? error.message : "The workspace could not be loaded.");}
  }
  useEffect(()=>{
    const timer=window.setTimeout(()=>{void load();},0);
    return ()=>window.clearTimeout(timer);
  },[]);
  function chooseTheme(next:string) {
    document.documentElement.dataset.theme=next;localStorage.setItem("ops-theme",next);setTheme(next);
  }
  function chooseMotion(value:boolean) {
    document.documentElement.dataset.motion=value?"reduce":"";localStorage.setItem("ops-motion",value?"reduce":"system");setLowMotion(value);
  }
  useEffect(()=>{
    if (!toast) return;
    const timeout = setTimeout(()=>setToast(""),3500);
    return ()=>clearTimeout(timeout);
  },[toast]);
  function go(next:Page) {
    setPage(next);setMenu(false);setError("");setDetail("");setGoalDetail("");setGraphGoal("");setPendingOnly(false);setRiskOnly(false);
    if(next==="Tasks"){setFilter("Active");setGoalFilter("");setOwnerFilter("");setSearch("");setPriority("");}
    window.scrollTo({top:0,behavior:"instant"});
  }
  function openTasks(next:Filter,id="") {go("Tasks");setFilter(next);setGoalFilter(id);}
  function openRun(found:Run) {
    setNotes(found.notes);setDate(found.meetingDate);setGoal(found.goalId);
    setRun(found);setDraft(found.tasks);
  }
  async function action(command:Record<string,unknown>) {
    setLoading(true);setError("");
    try {
      const response = await fetch("/api/ops",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(command)});
      const body = await response.json() as {workspace:Workspace;runId?:string;run?:Run;error?:string;reused?:boolean};
      if (!response.ok) throw new Error(body.error);
      setState(body.workspace);
      return body;
    } catch(error) {
      setError(error instanceof Error ? error.message:"Something went wrong. Please retry.");
    } finally {setLoading(false);}
  }
  async function saveManagement(command:Record<string,unknown>) {
    const response=await action(command);
    if(!response)return false;
    setToast(command.action==="deleteRun"?"Extraction record removed":command.action==="clearDemoActivity"?"Demo activity cleared":"Workspace updated");
    return true;
  }
  async function startExtraction(event:FormEvent) {
    event.preventDefault();
    setRun(undefined);setDraft([]);
    const result = await action({action:"extract",notes,meetingDate:date,goalId:activeGoal});
    const found = result?.run ?? result?.workspace.runs.find(item=>item.id===result.runId);
    if(found) {
      openRun(found);
      if(result?.reused) setToast("Opened the existing meeting review");
      else if(found.state==="review") setToast("Extraction ready for review");
    }
  }
  async function commit() {
    if(!run) return;
    const result = await action({action:"commit",id:run.id,tasks:draft});
    const found = result?.workspace.runs.find(item=>item.id===run.id);
    if(found) {openRun(found);setToast("Approval decisions saved");}
  }
  function edit(id:string,patch:Partial<Review>) {setDraft(items=>items.map(task=>task.id===id?{...task,...patch}:task));}
  if(!state) return <main className="loading-screen"><div className="brand-mark"><AudioLines size={21}/></div><h1>Ops Brain</h1>{error?<><p role="alert">{error}</p><button className="button" onClick={load}>Retry</button></>:<p role="status">Loading workspace…</p>}</main>;

  const goals=state.goals.filter(item=>!item.archived);
  const activeGoal=goals.some(item=>item.id===goal)?goal:goals[0]?.id??"";
  const {ranked,health:allHealth} = analyze(state.tasks,state.today,state.rules,undefined,state.goals);
  const health=allHealth.filter(item=>!item.archived);
  const blocked = ranked.filter(task=>task.blockers.length);
  const attention = ranked.filter(task=>task.slip || !task.owner || !task.due);
  const upcoming = ranked.filter(task=>task.due && daysBetween(state.today,task.due)>=0&&daysBetween(state.today,task.due)<=7);
  const goalTitle = (id:string) => state.goals.find(goal=>goal.id===id)?.name??"Unassigned goal";
  const pendingCount=state.runs.filter(item=>item.state==="review").reduce((sum,item)=>sum+item.tasks.length,0);
  const riskCount=health.filter(item=>item.health!=="On Track").length;
  const issues=(items:Review[],task:Review)=>[
    ...reviewProblems(items,task,goals),
    ...(task.owner&&!state.members.some(member=>member.active&&member.name===task.owner)?["Choose an active team member."]:[]),
  ];
  const invalid=draft.filter(task=>task.approval!=="rejected"&&issues(draft,task).length);
  const drawerTask:Task|undefined=drawer==="create"?{id:"",title:"",description:"",owner:null,due:null,goalId:"",dependencies:[],evidence:"",warnings:[],status:"Open"}:state.tasks.find(task=>task.id===drawer);
  const metrics = [
    {label:"Active goals",value:health.length,caption:`${health.filter(goal=>goal.health==="On Track").length} on track`,icon:Target,tone:"violet",open:()=>go("Goals")},
    {label:"Needs attention",value:attention.length,caption:"Tasks with forecast or data gaps",icon:CircleAlert,tone:"peach",open:()=>openTasks("Attention")},
    {label:"Blocked tasks",value:blocked.length,caption:"Waiting on upstream work",icon:GitFork,tone:"rose",open:()=>openTasks("Blocked")},
    {label:"Upcoming deadlines",value:upcoming.length,caption:"Due in the next 7 days",icon:CalendarDays,tone:"mint",open:()=>openTasks("Upcoming")},
    {label:"Pending approvals",value:pendingCount,caption:"Proposals in review",icon:ListTodo,tone:"violet",open:()=>{go("Activity");setPendingOnly(true);}},
    {label:"Goals at risk",value:riskCount,caption:"At risk or off track",icon:Activity,tone:"peach",open:()=>{go("Goals");setRiskOnly(true);}},
  ];
  function goalCards() {
    return <div className="goal-grid">{health.filter(item=>!riskOnly||item.health!=="On Track").map(item=><button className="goal-card" key={item.id} onClick={()=>{go("Goals");setGoalDetail(item.id);}}>
      <div className="goal-top"><span className={`icon-tile ${item.color}`}><Target size={16}/></span><Badge>{item.health}</Badge></div>
      <strong>{item.name}</strong><div className="goal-owner"><Owner name={item.owner} compact/><small>Due {formatDate(item.due)}</small></div>
      <div className="progress-track"><div style={{width:`${item.count?item.done/item.count*100:0}%`}}/></div><small>{item.done}/{item.count} complete · {blocked.filter(task=>task.goalId===item.id).length} blocked</small><p>{goalRisk(item,ranked)}</p>
    </button>)}</div>;
  }
  function taskRows(items:typeof ranked) {
    return items.length?<div className="task-list">{items.map(task=><div key={task.id} className="task-entry"><button className="task-row" aria-haspopup="dialog" onClick={()=>{setError("");setDrawer(task.id);}}>
      <span className="task-dot"/><span className="task-name"><strong>{task.title}</strong><small>{goalTitle(task.goalId)} · {task.blockers.length?"Blocked":"Open"} · {task.dependencies.length} dependencies</small></span><Owner name={task.owner} compact/><span className="row-date">{task.due?formatDate(task.due):"No date"}</span><Badge>{task.priority}</Badge><ChevronRight className="row-arrow" size={15}/>
    </button></div>)}</div>:<div className="empty"><ListTodo size={22}/><strong>No tasks in this view</strong><p>Tasks appear here as work enters this filter.</p></div>;
  }
  const taskMap = {Active:ranked,Today:ranked.filter(task=>task.due===state.today),Upcoming:upcoming,Blocked:blocked,Attention:attention,Completed:[],Archived:[]};
  const owners = state.members.map(member=>member.name).sort();
  const taskMatches = (task:Task) =>
    (!goalFilter||task.goalId===goalFilter) && (!ownerFilter||task.owner===ownerFilter) &&
    (!search||[task.title,task.description,task.owner,goalTitle(task.goalId)].join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  const visibleTasks=taskMap[filter].filter(task=>taskMatches(task)&&(!priority||task.priority===priority));
  if(sort==="date")visibleTasks.sort((a,b)=>(a.due??"9999").localeCompare(b.due??"9999"));
  if(sort==="title")visibleTasks.sort((a,b)=>a.title.localeCompare(b.title));
  const selectedGoal=health.find(item=>item.id===goalDetail);
  const notificationSubjects = {
    approval: state.tasks.filter(task=>task.runId).map(task=>({to:task.owner,subject:task.title,message:"Your approved task is ready in the workspace."})),
    blocked: blocked.map(task=>({to:task.owner,subject:task.title,message:`Waiting on ${task.blockers.map(id=>state.tasks.find(item=>item.id===id)?.title).join(", ")}.`})),
    upcoming: upcoming.map(task=>({to:task.owner,subject:task.title,message:`Due ${task.due&&formatDate(task.due)}. Flag any delivery risks.`})),
    risk: health.filter(item=>item.health!=="On Track").map(item=>({to:item.owner,subject:item.name,message:goalRisk(item,ranked)})),
    followup: attention.map(task=>({to:task.owner,subject:task.title,message:`Confirm a recovery plan. ${task.reason}.`})),
  };
  const previewNotices=notificationSubjects[noticeType as keyof typeof notificationSubjects]??[];
  const runs=state.runs.filter(item=>(!pendingOnly||item.state==="review")&&(!activityStatus||item.state===activityStatus)&&
    [item.notes,item.model,goalTitle(item.goalId),item.error].join(" ").toLowerCase().includes(activitySearch.trim().toLowerCase()));
  const completed = state.tasks.filter(task=>(filter==="Archived"?task.archived:task.status==="Done"&&!task.archived)&&taskMatches(task));
  return <ManagementErrorContext.Provider value={error}><div className={`shell ${compact?"collapsed":""}`}>
    {menu&&<button className="scrim" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}
    <aside className={`sidebar ${menu?"mobile-open":""}`}>
      <button className="brand" onClick={()=>go("Overview")}><span className="brand-mark"><AudioLines size={20}/></span><span><strong>Ops Brain</strong><small>by Just Sortd</small></span></button>
      <div className="workspace-label"><span className="workspace-icon">J</span><span><strong>Just Sortd</strong><small>Demo workspace</small></span></div>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Workspace">{nav.slice(0,5).map(({name,icon:Icon})=><button key={name} aria-label={name} className={page===name?"active":""} aria-current={page===name?"page":undefined} onClick={()=>go(name)}><Icon size={17}/><span className="nav-text">{name}</span>{page===name&&<span className="active-dot"/>}</button>)}</nav>
      <div className="nav-label secondary">SYSTEM</div>
      <nav aria-label="System">{nav.slice(5).map(({name,icon:Icon})=><button key={name} aria-label={name} className={page===name?"active":""} aria-current={page===name?"page":undefined} onClick={()=>go(name)}><Icon size={17}/><span className="nav-text">{name}</span>{page===name&&<span className="active-dot"/>}</button>)}</nav>
      <div className="sidebar-footer"><button className="button rail-toggle" aria-label={compact?"Expand sidebar":"Collapse sidebar"} onClick={()=>setCompact(!compact)}><PanelLeftClose size={16}/></button><span className="environment"><i/>{state.live?"Live AI enabled":"Local demo mode"}</span><div className="profile"><span className="avatar shade-2">JS</span><div><strong>Just Sortd</strong><small>Operations console</small></div></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb"><button className="mobile-menu button" aria-label="Open menu" onClick={()=>setMenu(true)}><Menu size={19}/></button><span>Just Sortd</span><ChevronRight size={13}/><strong>{page}</strong></div><div className="top-tools"><span className="environment"><i/>{state.live?"Live AI":"Sample mode"}</span><button className="button theme-toggle" aria-label="Toggle color theme" onClick={()=>chooseTheme(theme==="light"?"midnight":"light")}>{theme==="light"?<Moon size={16}/>:<Sun size={16}/>}</button><div className="top-date"><CalendarDays size={15}/>{formatDate(state.today,{weekday:"short",month:"short",day:"numeric",year:"numeric"})}</div></div></header>
      <AnimatePresence mode="wait"><motion.div key={page} className="content" initial={reduce||lowMotion?false:{opacity:0,y:5}} animate={{opacity:1,y:0}} transition={{duration:.18}}>
        <div className="page-heading"><div><h1>{page==="Overview"?"Overview":page==="Meetings"?"Meeting intelligence":page}</h1><p>{subheads[page]}</p></div>{page==="Overview"&&<button className="primary" onClick={()=>go("Meetings")}><Sparkles size={16}/> Process meeting</button>}</div>
        {error&&<div className="alert" role="alert"><CircleAlert size={17}/>{error}</div>}
        {page==="Overview"&&<>
          <section className="hero"><div className="hero-copy"><div className="hero-kicker"><span/> LAUNCH OPERATIONS</div><h2>Your operations, in focus.</h2><p>{health.length} active goals · {riskCount} need attention · {attention.length} tasks require intervention</p><button onClick={()=>go("Dependencies")}>Explore dependencies <ArrowRight size={15}/></button></div><div className="hero-mark" aria-hidden="true"><Activity size={76} strokeWidth={1.2}/></div></section>
          <section className="metric-grid" aria-label="Workspace metrics">{metrics.map(({label,value,caption,icon:Icon,tone,open})=><button className="metric" key={label} onClick={open}><div className="metric-top"><span className={`icon-tile ${tone}`}><Icon size={18}/></span><ArrowUpRight size={15}/></div><strong>{value}</strong><span>{label}</span><small>{caption}</small></button>)}</section>
          <section className="dashboard-section"><div className="section-head"><div><h2>Goal health</h2><p>Progress across launch commitments.</p></div><button className="text-button" onClick={()=>go("Goals")}>All goals <ArrowRight size={15}/></button></div>{goalCards()}</section>
          <div className="bottom-grid"><section className="panel"><div className="section-head"><div><h2>Today’s priorities</h2><p>Ranked by deadlines, goal weight, and downstream impact.</p></div><button className="text-button" onClick={()=>openTasks("Active")}>All tasks <ArrowRight size={15}/></button></div>{taskRows(ranked.slice(0,4))}</section>
          <section className="panel"><div className="section-head"><div><h2>Recent activity</h2><p>Meeting extraction and review history.</p></div><button className="text-button" onClick={()=>go("Activity")}>View log <ArrowRight size={15}/></button></div>{state.runs.length?state.runs.slice(0,3).map(item=><button className="activity-row" key={item.id} onClick={()=>{go("Activity");setDetail(item.id);}}><span className="icon-tile violet"><Sparkles size={15}/></span><span><strong>{goalTitle(item.goalId)}</strong><small>{item.model} · {item.tasks.length} proposals</small></span><Badge>{item.state}</Badge></button>):<div className="empty"><Activity size={22}/><strong>No extraction runs yet</strong><p>Process a meeting to start the history.</p></div>}</section></div>
        </>}
        {page==="Goals"&&<><section className="dashboard-section">{riskOnly&&<button className="button" onClick={()=>setRiskOnly(false)}>Show all goals</button>}{goalCards()}</section>{selectedGoal&&<section className="panel dashboard-section"><div className="section-head"><div><h2>{selectedGoal.name}</h2><div className="goal-owner"><Owner name={selectedGoal.owner} compact/><small>Weight {selectedGoal.importance}/3 · {selectedGoal.count?Math.round(selectedGoal.done/selectedGoal.count*100):0}% complete</small></div><p>{goalRisk(selectedGoal,ranked)}</p></div><button className="button" onClick={()=>{go("Dependencies");setGraphGoal(selectedGoal.id);}}>Open dependency map</button></div>{taskRows(ranked.filter(task=>task.goalId===selectedGoal.id))}</section>}<GoalManagement state={state} save={saveManagement}/></>}
        {page==="Tasks"&&<section className="panel"><div className="section-head"><div><h2>{goalFilter?goalTitle(goalFilter):"Task board"}</h2><p>{["Completed","Archived"].includes(filter)?completed.length:visibleTasks.length} matching tasks</p></div><button className="primary" onClick={()=>{setError("");setDrawer("create");}}>Create task</button></div><div className="task-filters"><input aria-label="Search tasks" placeholder="Search tasks…" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filter by goal" value={goalFilter} onChange={e=>setGoalFilter(e.target.value)}><option value="">All goals</option>{goals.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter by priority" value={priority} disabled={filter==="Completed"||filter==="Archived"} onChange={e=>setPriority(e.target.value)}><option value="">All priorities</option><option>High</option><option>Medium</option><option>Normal</option></select><select aria-label="Sort tasks" value={sort} onChange={e=>setSort(e.target.value)}><option value="priority">Priority order</option><option value="date">Due date</option><option value="title">Title</option></select></div><div className="tabs" aria-label="Task filter">{(Object.keys(taskMap) as Filter[]).map(key=><button key={key} className={key===filter?"selected":""} aria-pressed={key===filter} onClick={()=>setFilter(key)}>{key}</button>)}<select aria-label="Filter by owner" value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)}><option value="">All owners</option>{owners.map(owner=><option key={owner}>{owner}</option>)}</select></div>
        {(filter==="Completed"||filter==="Archived")&&completed.length>0?<div className="task-list">{completed.map(task=><div key={task.id} className="notice"><Owner name={task.owner} compact/><button className="text-button" onClick={()=>{setError("");setDrawer(task.id);}}>{task.title}</button><Badge>{task.archived?"Archived":"Done"}</Badge></div>)}</div>:taskRows(visibleTasks)}</section>}
        {page==="Dependencies"&&<DependencyView state={state} initialGoal={graphGoal} openTask={id=>{setError("");setDrawer(id);}}/>}
        {page==="Meetings"&&<div className="meeting-layout">
          <form className="panel form-panel" onSubmit={startExtraction}>
            <div className="section-head"><div><h2>Meeting notes</h2><p>English, Hindi, and Gujarati are supported in live extraction.</p></div><div className="inline-actions"><button type="button" className="button" disabled={loading||!notes} onClick={()=>{setNotes("");setRun(undefined);setDraft([]);setError("");}}>Clear</button><button type="button" className="button" disabled={loading} onClick={()=>{setNotes(sampleNotes);setDate(sampleDate);setGoal("website");setRun(undefined);setDraft([]);setError("");}}><BookOpen size={16}/> Load synthetic sample</button></div></div>
            <div className="inline-form"><label>Company goal<select disabled={loading} value={activeGoal} onChange={e=>setGoal(e.target.value)}>{goals.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Meeting date<input required type="date" disabled={loading} value={date} onChange={e=>setDate(e.target.value)}/></label></div>
            <label className="notes-label">Notes<textarea required minLength={10} maxLength={16000} rows={9} disabled={loading} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Paste the meeting transcript or your notes here…"/></label>
            <div className="form-footer"><p>{state.live?"Live model · Review required before tasks are saved.":"Local demo · The synthetic sample runs without API credentials."}</p><button className="primary" disabled={loading||!activeGoal||notes.trim().length<10}><Sparkles size={16}/>{loading&&!run?"Extracting…":"Extract tasks"}</button></div>
          </form>
          {loading&&!run&&<div className="panel feedback" role="status"><span className="spinner"/> {state.live?"Waiting for the configured model…":"Loading the validated synthetic sample…"}</div>}
          {run?.error&&<div className="alert" role="alert"><CircleAlert size={17}/><div>{run.error} {!state.live&&<button className="text-button" onClick={()=>go("Settings")}>AI configuration</button>}</div></div>}
          {!run&&!loading&&<section className="panel form-panel workflow-intro"><span className="icon-tile violet"><Sparkles size={19}/></span><h2>From notes to approved work</h2><ol><li>Extract decisions and task proposals</li><li>Review owners, dates, and dependencies</li><li>Commit approved tasks to the workspace</li></ol></section>}
          {run&&(run.state==="review"||run.state==="committed")&&<section className="panel form-panel review-panel">
            <div className="section-head"><div><h2>{run.state==="committed"?"Review committed":"Review proposed tasks"}</h2><p>{run.model} · {draft.length} proposals · {draft.filter(task=>task.approval==="approved").length} approved · {draft.filter(task=>task.approval==="pending").length} pending · {draft.filter(task=>task.approval==="rejected").length} rejected · {invalid.length} invalid</p></div>{run.state==="review"&&draft.length>0&&<button className="button" disabled={loading} onClick={()=>setDraft(items=>items.map(task=>task.approval==="pending"&&!issues(items,task).length?{...task,approval:"approved"}:task))}><Check size={16}/> Approve all valid</button>}</div>
            {run.decisions.length>0&&<div className="decisions"><strong>Decisions</strong><ul>{run.decisions.map((decision,index)=><li key={index}>{decision}</li>)}</ul></div>}
            {draft.map((task,index)=><details key={task.id} className="proposal"><summary className="proposal-header"><span className="proposal-title"><strong>{task.title}</strong><small>{task.due?formatDate(task.due):"Date missing"} · {task.dependencies.length} {task.dependencies.length===1?"dependency":"dependencies"}</small></span><Owner name={task.owner} fallback="Owner missing"/><span className="proposal-status"><Badge>{task.approval}</Badge><ChevronDown size={16} aria-hidden="true"/></span></summary>
              <fieldset disabled={loading||run.state==="committed"}><div className="proposal-fields"><label>Task title<input required value={task.title} onChange={e=>edit(task.id,{title:e.target.value})}/></label><label>Proposed owner<select aria-label="Proposed owner" value={task.owner??""} onChange={e=>edit(task.id,{owner:e.target.value||null})}><option value="">Unassigned</option>{state.members.filter(member=>member.active||member.name===task.owner).map(member=><option key={member.id}>{member.name}</option>)}{task.owner&&!state.members.some(member=>member.name===task.owner)&&<option>{task.owner}</option>}</select></label><label>Due date<input type="date" value={task.due??""} onChange={e=>edit(task.id,{due:e.target.value||null})}/></label><label>Decision<select aria-label={`Decision for task ${index+1}`} value={task.approval} onChange={e=>edit(task.id,{approval:e.target.value as Review["approval"]})}><option value="pending">Pending</option><option value="approved">Approve</option><option value="rejected">Reject</option></select></label></div>
              <label>Goal<select aria-label="Goal" value={task.goalId} onChange={e=>edit(task.id,{goalId:e.target.value})}>{goals.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Description<textarea rows={2} value={task.description} onChange={e=>edit(task.id,{description:e.target.value})}/></label>
              <div className="deps"><strong>Depends on</strong>{draft.filter(item=>item.id!==task.id).map(item=><label key={item.id}><input type="checkbox" checked={task.dependencies.includes(item.id)} onChange={e=>edit(task.id,{dependencies:e.target.checked?[...task.dependencies,item.id]:task.dependencies.filter(id=>id!==item.id)})}/>{item.title}</label>)}</div>
              <blockquote>{task.evidence}</blockquote>{[...new Set([...task.warnings,...issues(draft,task)])].map(warning=><p className="warning" key={warning}>{warning}</p>)}</fieldset>
            </details>)}
            {run.state==="review"?<div className="form-footer"><p>{draft.some(task=>task.approval==="pending")?"Choose a decision for each proposal.":"Commit saves approved tasks and records rejected proposals."}</p><button className="primary" disabled={loading||draft.some(task=>task.approval==="pending")} onClick={commit}><Check size={16}/> {loading?"Saving…":"Commit review"}</button></div>:<button className="button" onClick={()=>go("Dependencies")}>View dependencies <GitFork size={16}/></button>}
          </section>}
        </div>}
        {page==="Activity"&&<section className="panel"><div className="section-head"><div><h2>Extraction runs</h2><p>Latest 50 runs and any older pending reviews.</p></div></div><div className="task-filters"><input aria-label="Search activity" placeholder="Search notes and activity…" value={activitySearch} onChange={e=>setActivitySearch(e.target.value)}/><select aria-label="Filter extraction status" value={activityStatus} onChange={e=>setActivityStatus(e.target.value)}><option value="">All statuses</option><option value="review">In review</option><option value="committed">Committed</option><option value="failed">Failed</option><option value="running">Running</option></select></div>
        {removeRun&&<ConfirmAction title="Remove extraction record?" confirm="Confirm record removal" cancel={()=>setRemoveRun(undefined)} onConfirm={async()=>{
          const ok=await saveManagement({action:"deleteRun",id:removeRun.id,confirmed:true});
          if(ok&&run?.id===removeRun.id){setRun(undefined);setDraft([]);}
          return ok;
        }}><p>The record will be hidden from Activity. Committed tasks and the duplicate-prevention record are kept.</p></ConfirmAction>}
        {pendingOnly&&<button className="button" onClick={()=>setPendingOnly(false)}>Show all activity</button>}{runs.length?runs.map(item=><div key={item.id}><div className="run-action-row"><button className="activity-row" aria-expanded={detail===item.id} onClick={()=>setDetail(detail===item.id?"":item.id)}><span className="icon-tile violet"><Sparkles size={15}/></span><span><strong>{goalTitle(item.goalId)}</strong><small>{item.model} · {new Date(item.createdAt).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} · Rule v{item.version}</small></span><Badge>{item.state}</Badge><ChevronRight size={14}/></button><RecordActions label={`Extraction actions for ${item.id}`}>
          <button onClick={()=>setDetail(item.id)}>View details</button>
          {item.state==="review"&&<button onClick={()=>{go("Meetings");openRun(item);}}>Reopen review</button>}
          {!state.live&&item.model==="Local sample"&&item.state!=="running"&&<button className="danger" onClick={()=>setRemoveRun(item)}>Delete record</button>}
        </RecordActions></div>{detail===item.id&&<div className="audit-detail"><p>Run {item.id} · {item.provider??(item.model==="Local sample"?"Local fixture":"Responses API")} · Prompt and configuration v{item.version}</p><p>Estimated cost {item.cost===null?"unavailable":`$${item.cost.toFixed(6)}`}{item.tokens&&` · ${item.tokens.input} input / ${item.tokens.output} output tokens`}</p>{item.error&&<p className="warning">{item.error} Edit the notes or provider settings before retrying from this meeting.</p>}<details><summary>Input and output</summary><pre>{JSON.stringify({date:item.meetingDate,notes:item.notes,decisions:item.decisions,originalProposals:item.originals,reviewedAt:item.reviewedAt,proposals:item.tasks,rawOutput:item.rawOutput},null,2)}</pre></details><button className="button" onClick={()=>{go("Meetings");openRun(item);}}>{item.state==="review"?"Resume review":"Open meeting"} <ArrowRight size={15}/></button></div>}</div>):<div className="empty"><Activity size={22}/><strong>No runs yet</strong><p>Extract a meeting to populate the audit trail.</p><button className="button" onClick={()=>go("Meetings")}>Open meetings <ArrowRight size={15}/></button></div>}</section>}
        {page==="Activity"&&!pendingOnly&&<section className="panel form-panel dashboard-section"><div className="section-head"><div><h2>Slack notification previews</h2><p>Drafted from current workspace data. View dependency slip drafts in the simulator.</p></div><select aria-label="Notification type" value={noticeType} onChange={event=>setNoticeType(event.target.value)}><option value="approval">Task approval</option><option value="blocked">Task blocked</option><option value="upcoming">Upcoming deadline</option><option value="risk">Goal at risk</option><option value="followup">Follow-up required</option></select></div>{previewNotices.length?previewNotices.map((item,index)=><div className="notice" key={index}><Owner name={item.to} fallback="Goal lead"/><div><strong>{item.subject}</strong><p>{item.message}</p></div></div>):<p>No matching work in this workspace.</p>}</section>}
        {page==="Activity"&&!pendingOnly&&<AuditManagement state={state} save={saveManagement} search={activitySearch}/>}
        {page==="Settings"&&rules&&<><TeamManagement state={state} save={saveManagement}/><section className="panel form-panel system-settings"><div><h2>AI provider</h2><p>Responses API · {state.live?"API credential configured":"Sample mode"}. Set <code>OPENAI_API_KEY</code> in <code>.env.local</code> and restart to extract custom notes.</p></div><div><h2>Integrations</h2><p>Notion · Unconfigured</p><p>Slack · Preview only</p></div><div><h2>Appearance</h2><label>Color theme<select value={theme} onChange={e=>chooseTheme(e.target.value)}><option value="midnight">Midnight</option><option value="light">Light</option></select></label><label className="check-label"><input type="checkbox" checked={lowMotion} onChange={e=>chooseMotion(e.target.checked)}/> Reduce motion</label></div><div><h2>Operating assumptions</h2><p>Asia/Kolkata · Mon–Fri, 10:00–18:00 assumed. Forecasts use calendar days. Alerts are previews.</p></div></section><form className="panel form-panel" onSubmit={async event=>{event.preventDefault();const result=await action({action:"rules",rules});if(result){setRules(result.workspace.rules);setToast("New rule version saved");}}}><div className="section-head"><div><h2>Extraction and ranking rules</h2><p>Active version {state.version}. Saving creates a new version.</p></div></div><label>Extraction prompt<textarea rows={5} required minLength={20} value={rules.prompt} onChange={e=>setRules({...rules,prompt:e.target.value})}/></label><label>Model<input required value={rules.model} onChange={e=>setRules({...rules,model:e.target.value})}/></label><div className="settings-grid">{([{key:"goalWeight",label:"Goal importance weight",max:30},{key:"dependencyWeight",label:"Dependency weight",max:20},{key:"deadlineWeight",label:"Deadline weight",max:20},{key:"mediumThreshold",label:"Medium priority threshold",max:300},{key:"highThreshold",label:"High priority threshold",max:500},{key:"inputPrice",label:"Input USD / 1M tokens",max:1000},{key:"outputPrice",label:"Output USD / 1M tokens",max:1000}] as const).map(({key,label,max})=><label key={key}>{label}<input required type="number" min={key.endsWith("Price")?0:1} max={max} step={key.endsWith("Price")?"any":1} value={rules[key]??(key==="highThreshold"?65:43)} onChange={e=>setRules({...rules,[key]:Number(e.target.value)})}/></label>)}</div><button className="primary" disabled={loading}>Save rule version</button></form><section className="panel form-panel"><h2>Restore a version</h2><div className="inline-form"><label>Version<select value={restore} onChange={e=>setRestore(Number(e.target.value))}>{state.versions.map(version=><option key={version} value={version}>Version {version}</option>)}</select></label><button className="button" disabled={loading} onClick={async()=>{const result=await action({action:"restore",version:restore});if(result){setRules(result.workspace.rules);setToast("Rules restored as a new version");}}}>Restore as new version</button></div></section>{!state.live&&<section className="panel form-panel"><h2>Reset sample demo</h2><p>Remove synthetic meeting runs and the tasks they created. Other tasks, team members, goals, and rule versions are kept.</p>{reset?<ConfirmAction title="Reset the sample demo?" confirm="Confirm reset" cancel={()=>setReset(false)} onConfirm={async()=>{
          const result=await action({action:"reset",confirmation:"RESET"});
          if(result){if(run?.model==="Local sample"&&run.notes===sampleNotes){setRun(undefined);setDraft([]);setNotes("");}setToast("Sample demo reset");}
          return Boolean(result);
        }}><p>Sample extraction history and its committed tasks will be removed. Other workspace records are preserved.</p></ConfirmAction>:<button className="button" onClick={()=>setReset(true)}>Reset sample demo</button>}</section>}</>}
        <footer><span>Ops Brain · Just Sortd</span><span>Assessment console · Production workspace in Notion and Slack</span></footer>
      </motion.div></AnimatePresence>
    </main>
    {drawerTask&&<TaskDrawer key={drawerTask.id} task={drawerTask} state={state} close={()=>{setDrawer("");setError("");}} save={saveManagement} requestError={error}/>}
    {toast&&<div className="toast" role="status"><Check size={17}/>{toast}<button aria-label="Dismiss" onClick={()=>setToast("")}><X size={15}/></button></div>}
  </div></ManagementErrorContext.Provider>;
}

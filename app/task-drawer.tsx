"use client";
import {useEffect,useRef,useState} from "react";
import {ConfirmAction,RecordActions,type SaveManagement} from "./management";
import {Owner} from "./owner";
import {X} from "lucide-react";
import {analyze,formatDate,type Task} from "../lib/domain";
import type {Workspace} from "../lib/contracts";

export function TaskDrawer({task,state,close,save,requestError}:{task:Task;state:Workspace;close:()=>void;save:SaveManagement;requestError:string}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [editing,setEditing]=useState(!task.id);
  const [deleting,setDeleting]=useState(false);
  const [replacement,setReplacement]=useState("");

  const [saving,setSaving]=useState(false);
  const [fields,setFields]=useState({title:task.title,description:task.description,owner:task.owner??"",due:task.due??"",goalId:task.goalId,status:task.status,dependencies:task.dependencies,priorityOverride:task.priorityOverride??null,duration:task.duration??null as number|null});
  const {ranked,descendants}=analyze(state.tasks,state.today,state.rules,undefined,state.goals);
  const rank=ranked.find(item=>item.id===task.id);
  const source=state.runs.find(run=>run.id===task.runId);
  const dependents=state.tasks.filter(item=>item.dependencies.includes(task.id));
  useEffect(()=>{
    const element=dialog.current;
    const trigger=document.activeElement as HTMLElement|null;
    element?.showModal();
    return ()=>{element?.close();trigger?.focus();};
  },[]);
  return <dialog ref={dialog} className="task-drawer" aria-labelledby="drawer-title" onCancel={event=>{event.preventDefault();close();}}>
    <header><span className="eyebrow">TASK DETAILS</span><button className="button" aria-label="Close task details" onClick={close}><X size={17}/></button></header>
    <div className="section-head"><h2 id="drawer-title">{task.id?task.title:"Create task"}</h2>{task.id&&<RecordActions label="Task actions">
      <button onClick={()=>{setDeleting(false);setEditing(true);}}>Edit task</button>
      <button onClick={()=>void save({action:"archiveTask",id:task.id,archived:!task.archived})}>{task.archived?"Restore task":"Archive task"}</button>
      <button className="danger" onClick={()=>{setEditing(false);setReplacement("");setDeleting(true);}}>Delete task</button>
    </RecordActions>}</div>
    {requestError&&<p className="alert" role="alert">{requestError}</p>}
    {task.id&&<>
    <p>{task.description}</p>
    <dl><div><dt>Owner</dt><dd><Owner name={task.owner}/></dd></div><div><dt>Due</dt><dd>{task.due?formatDate(task.due):"Unscheduled"}</dd></div><div><dt>Goal</dt><dd>{state.goals.find(goal=>goal.id===task.goalId)?.name??"Unassigned"}</dd></div><div><dt>Status</dt><dd>{task.archived?"Archived":rank?.blockers.length?"Blocked":task.status}</dd></div></dl>
    <h3>Priority and risk</h3><p>{rank?`${rank.priority} · ${rank.score} · ${rank.reason}`:task.archived?"Archived":"Completed"}</p>
    <h3>Dependencies</h3><p>{task.dependencies.map(id=>state.tasks.find(item=>item.id===id)?.title).join(", ")||"None"}</p>
    <h3>Downstream work</h3><p>{[...descendants(task.id)].map(id=>state.tasks.find(item=>item.id===id)?.title).join(", ")||"None"}</p>
    <h3>Source {source&&`· ${formatDate(source.meetingDate)} meeting`}</h3><blockquote>{task.evidence}</blockquote>
    {!!task.history?.length&&<details><summary>Update history</summary>{[...task.history].reverse().map(event=><p key={event.at}>{new Date(event.at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} · {event.changes.join(" · ")}</p>)}</details>}
    </>}
    {deleting&&<ConfirmAction title="Delete task?" confirm="Confirm task deletion" cancel={()=>setDeleting(false)} onConfirm={async()=>{
      const ok=await save({action:"deleteTask",id:task.id,replacement:replacement==="unlink"?null:replacement||null,confirmed:true});
      if(ok)close();return ok;
    }}>
      {dependents.length?<><p>These tasks depend on this task: {dependents.map(item=>item.title).join(", ")}.</p><label>Update dependent tasks<select required value={replacement} onChange={e=>setReplacement(e.target.value)}><option value="">Choose dependency handling</option><option value="unlink">Remove dependency links</option>{state.tasks.filter(item=>!item.archived&&item.id!==task.id&&!dependents.some(dependent=>dependent.id===item.id)).map(item=><option value={item.id} key={item.id}>{item.title}</option>)}</select></label></>:<p>This task will be removed. Its audit history will be kept.</p>}
    </ConfirmAction>}
    {editing&&<form onSubmit={async event=>{
      event.preventDefault();setSaving(true);
      const ok=await save({action:"task",id:task.id||null,revision:task.updatedAt??null,fields:{...fields,owner:fields.owner||null,due:fields.due||null}});
      setSaving(false);
      if(ok){if(task.id)setEditing(false);else close();}
    }}>
      <label>Title<input required value={fields.title} onChange={e=>setFields({...fields,title:e.target.value})}/></label>
      <label>Description<textarea value={fields.description} onChange={e=>setFields({...fields,description:e.target.value})}/></label>
      <div className="proposal-fields">
        <label>Owner<select aria-label="Owner" value={fields.owner} onChange={e=>setFields({...fields,owner:e.target.value})}><option value="">Unassigned</option>{state.members.filter(member=>member.active||member.name===fields.owner).map(member=><option key={member.id}>{member.name}</option>)}</select></label>
        <label>Due date<input type="date" value={fields.due} onChange={e=>setFields({...fields,due:e.target.value})}/></label>
        <label>Goal<select aria-label="Goal" value={fields.goalId} onChange={e=>setFields({...fields,goalId:e.target.value})}><option value="">Unassigned</option>{state.goals.filter(goal=>!goal.archived||goal.id===fields.goalId).map(goal=><option key={goal.id} value={goal.id}>{goal.name}</option>)}</select></label>
        <label>Status<select aria-label="Status" value={fields.status} onChange={e=>setFields({...fields,status:e.target.value as Task["status"]})}><option>Open</option><option>Done</option></select></label>
        <label>Priority<select aria-label="Priority" value={fields.priorityOverride??""} onChange={e=>setFields({...fields,priorityOverride:(e.target.value||null) as Task["priorityOverride"]??null})}><option value="">Automatic</option><option>High</option><option>Medium</option><option>Normal</option></select></label>
        <label>Duration (days, optional)<input type="number" min="1" max="180" value={fields.duration??""} onChange={e=>setFields({...fields,duration:e.target.valueAsNumber||null})}/></label>
      </div>
      <fieldset className="dependency-editor"><legend>Prerequisites</legend>{state.tasks.filter(item=>item.id!==task.id&&(!item.archived||fields.dependencies.includes(item.id))).map(item=><label className="check-label" key={item.id}><input type="checkbox" checked={fields.dependencies.includes(item.id)} onChange={e=>setFields({...fields,dependencies:e.target.checked?[...fields.dependencies,item.id]:fields.dependencies.filter(id=>id!==item.id)})}/>{item.title}</label>)}</fieldset>
      <div className="inline-form"><button className="primary" disabled={saving}>{task.id?"Confirm task changes":"Save task"}</button><button type="button" className="button" onClick={()=>task.id?setEditing(false):close()}>Cancel</button></div>
    </form>}
  </dialog>;
}

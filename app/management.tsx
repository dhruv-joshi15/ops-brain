"use client";
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import {Ellipsis} from "lucide-react";
import type {Goal} from "../lib/domain";
import type {Member,Workspace} from "../lib/contracts";
import {Owner} from "./owner";

export const ManagementErrorContext=createContext("");
export type SaveManagement=(command:Record<string,unknown>)=>Promise<boolean>;

export function RecordActions({label,children}:{label:string;children:ReactNode}) {
  return <details className="record-actions" onClick={event=>{
    if((event.target as HTMLElement).closest("button"))event.currentTarget.open=false;
  }}><summary aria-label={label}><Ellipsis size={19} aria-hidden="true"/></summary><div>{children}</div></details>;
}

export function ConfirmAction({title,children,confirm,cancel,onConfirm}:{title:string;children:ReactNode;confirm:string;cancel:()=>void;onConfirm:()=>Promise<boolean>}) {
  const [busy,setBusy]=useState(false);
  const [failed,setFailed]=useState(false);
  const requestError=useContext(ManagementErrorContext);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const modal=dialog.current;
    const active=document.activeElement as HTMLElement|null;
    modal?.showModal();
    return ()=>{modal?.close();active?.focus();};
  },[]);
  return <dialog ref={dialog} className="confirmation-dialog" aria-label={title} onCancel={event=>{event.preventDefault();if(!busy)cancel();}}><form className="confirm-action" aria-label={title} onSubmit={async event=>{
    event.preventDefault();setBusy(true);setFailed(false);
    if(await onConfirm())cancel();
    else{setBusy(false);setFailed(true);}
  }}><h3>{title}</h3>{children}{failed&&<p role="alert" className="alert">{requestError||"The change could not be saved."}</p>}<div className="inline-actions"><button className="button danger" disabled={busy}>{confirm}</button><button type="button" className="button" disabled={busy} onClick={cancel}>Cancel</button></div></form></dialog>;
}

export function TeamManagement({state,save}:{state:Workspace;save:SaveManagement}) {
  const [editor,setEditor]=useState<Member>();
  const [remove,setRemove]=useState<Member>();
  const [replacement,setReplacement]=useState("");
  return <section className="panel form-panel management-panel">
    <div className="section-head"><div><h2>Team members</h2><p>Manage workspace ownership and assignments.</p></div><button className="button" onClick={()=>{setRemove(undefined);setEditor({id:"",name:"",active:true});}}>Add member</button></div>
    {state.members.map(member=>{
      const assigned=state.tasks.filter(task=>task.owner===member.name);
      const owned=state.goals.filter(goal=>goal.owner===member.name);
      return <div className="management-row" key={member.id}>
        <Owner name={member.name}/><div><small>{member.active?"Active":"Inactive"} · {assigned.length} tasks · {owned.length} goals</small>
          {!!assigned.length&&<details><summary>Assigned tasks</summary><ul>{assigned.map(task=><li key={task.id}>{task.title}{task.archived?" (archived)":""}</li>)}</ul></details>}
        </div><RecordActions label={`Actions for ${member.name}`}>
          <button onClick={()=>{setRemove(undefined);setEditor(member);}}>Edit member</button>
          <button onClick={()=>void save({action:"member",id:member.id,name:member.name,active:!member.active})}>{member.active?"Deactivate member":"Reactivate member"}</button>
          <button className="danger" onClick={()=>{setEditor(undefined);setReplacement("");setRemove(member);}}>Remove member</button>
        </RecordActions>
      </div>;
    })}
    {!state.members.length&&<p>No team members yet.</p>}
    {editor&&<form className="management-editor" aria-label={editor.id?"Edit member":"Add member"} onSubmit={async event=>{
      event.preventDefault();if(await save({action:"member",id:editor.id||null,name:editor.name,active:editor.active}))setEditor(undefined);
    }}><label>Member name<input required maxLength={100} value={editor.name} onChange={event=>setEditor({...editor,name:event.target.value})}/></label><div className="inline-actions"><button className="primary">Save member</button><button type="button" className="button" onClick={()=>setEditor(undefined)}>Cancel</button></div></form>}
    {remove&&<ConfirmAction title={`Remove ${remove.name}?`} confirm="Confirm removal" cancel={()=>setRemove(undefined)} onConfirm={()=>save({action:"deleteMember",id:remove.id,replacement:state.members.find(member=>member.id===replacement)?.name??null,confirmed:true})}>
      <p>{state.tasks.filter(task=>task.owner===remove.name).length} tasks and {state.goals.filter(goal=>goal.owner===remove.name).length} goals will be reassigned or unassigned.</p>
      <label>Transfer assignments to<select aria-label="Transfer assignments to" required value={replacement} onChange={e=>setReplacement(e.target.value)}>
        <option value="">Choose assignment handling</option><option value="unassign">Unassign ownership</option>{state.members.filter(member=>member.active&&member.id!==remove.id).map(member=><option key={member.id} value={member.id}>{member.name}</option>)}
      </select></label>
    </ConfirmAction>}
  </section>;
}

export function GoalManagement({state,save}:{state:Workspace;save:SaveManagement}) {
  const [editor,setEditor]=useState<Goal>();
  const [remove,setRemove]=useState<Goal>();
  const [destination,setDestination]=useState("");
  return <section className="panel form-panel management-panel">
    <div className="section-head"><div><h2>Manage goals</h2><p>Update launch commitments and restore archived goals.</p></div><button className="button" onClick={()=>{setRemove(undefined);setEditor({id:"",name:"",owner:null,due:state.today,area:"",importance:2,color:"violet"});}}>Create goal</button></div>
    {state.goals.map(goal=><div className="management-row" key={goal.id}><strong>{goal.name}</strong><small>{goal.archived?"Archived":"Active"} · {state.tasks.filter(task=>task.goalId===goal.id).length} assigned tasks</small>
      <RecordActions label={`Actions for ${goal.name}`}>
        <button onClick={()=>{setRemove(undefined);setEditor(goal);}}>Edit goal</button>
        <button onClick={()=>void save({action:"archiveGoal",id:goal.id,archived:!goal.archived})}>{goal.archived?"Restore goal":"Archive goal"}</button>
        <button className="danger" onClick={()=>{setEditor(undefined);setDestination("");setRemove(goal);}}>Delete goal</button>
      </RecordActions>
    </div>)}
    {!state.goals.length&&<p>No goals yet.</p>}
    {editor&&<form className="management-editor" aria-label={editor.id?"Edit goal":"Create goal"} onSubmit={async event=>{
      event.preventDefault();const {name,owner,due,area,importance}=editor;
      if(await save({action:"goal",id:editor.id||null,fields:{name,owner,due,area,importance}}))setEditor(undefined);
    }}>
      <div className="proposal-fields">
        <label>Goal name<input required maxLength={100} value={editor.name} onChange={event=>setEditor({...editor,name:event.target.value})}/></label>
        <label>Area<input required maxLength={100} value={editor.area} onChange={event=>setEditor({...editor,area:event.target.value})}/></label>
        <label>Goal owner<select aria-label="Goal owner" value={editor.owner??""} onChange={event=>setEditor({...editor,owner:event.target.value||null})}><option value="">Unassigned</option>{state.members.filter(member=>member.active||member.name===editor.owner).map(member=><option key={member.id}>{member.name}</option>)}</select></label>
        <label>Target date<input type="date" required value={editor.due} onChange={event=>setEditor({...editor,due:event.target.value})}/></label>
        <label>Importance<select aria-label="Importance" value={editor.importance} onChange={event=>setEditor({...editor,importance:Number(event.target.value)})}><option>1</option><option>2</option><option>3</option></select></label>
      </div>
      <div className="inline-actions"><button className="primary">Save goal</button><button type="button" className="button" onClick={()=>setEditor(undefined)}>Cancel</button></div>
    </form>}
    {remove&&<ConfirmAction title={`Delete ${remove.name}?`} confirm="Confirm goal deletion" cancel={()=>setRemove(undefined)} onConfirm={()=>save({action:"deleteGoal",id:remove.id,destination:destination==="unassign"?null:destination||null,confirmed:true})}>
      <p>{state.tasks.filter(task=>task.goalId===remove.id).length} tasks will be kept. Choose where they should go.</p>
      <label>Move tasks to<select aria-label="Move tasks to" required value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Choose where tasks go</option><option value="unassign">Unassign from goal</option>{state.goals.filter(goal=>!goal.archived&&goal.id!==remove.id).map(goal=><option value={goal.id} key={goal.id}>{goal.name}</option>)}</select></label>
    </ConfirmAction>}
  </section>;
}

export function AuditManagement({state,save,search}:{state:Workspace;save:SaveManagement;search:string}) {
  const [selected,setSelected]=useState<string[]>([]);
  const [clear,setClear]=useState<"selected"|"all">();
  const query=search.trim().toLowerCase();
  const events=[...state.events,...state.tasks.flatMap(task=>(task.history??[]).filter(event=>!event.managed).map(event=>({...event,id:task.id+event.at,subject:task.title,demo:false})))].sort((a,b)=>b.at.localeCompare(a.at));
  const visible=events.filter(event=>[event.subject,...event.changes].join(" ").toLowerCase().includes(query));
  return <section className="panel form-panel dashboard-section management-panel">
    <div className="section-head"><div><h2>Workspace changes</h2><p>Task, goal and team management history.</p></div>{!state.live&&<div className="inline-actions"><button className="button" disabled={!selected.length} onClick={()=>setClear("selected")}>Clear selected demo logs</button><button className="button" onClick={()=>setClear("all")}>Reset demo activity</button></div>}</div>
    {clear&&<ConfirmAction title="Clear demo activity?" confirm="Confirm clearing activity" cancel={()=>setClear(undefined)} onConfirm={async()=>{
      const ok=await save({action:"clearDemoActivity",...(clear==="selected"?{ids:selected}:{}),confirmed:true});
      if(ok)setSelected([]);return ok;
    }}><p>{clear==="selected"?"Selected sample events will be cleared.":"Sample extraction records will be hidden and sample management events cleared."} Committed tasks and protected audit records stay available.</p></ConfirmAction>}
    {visible.map(event=><div className="notice" key={event.id}>
      {!state.live&&event.demo&&<input type="checkbox" aria-label={`Select demo log for ${event.subject}`} checked={selected.includes(event.id)} onChange={e=>setSelected(current=>e.target.checked?[...current,event.id]:current.filter(id=>id!==event.id))}/>}
      <div><strong>{event.subject}</strong><p>{new Date(event.at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} · {event.changes.join(" · ")}</p></div>
    </div>)}
    {!visible.length&&<p>No matching changes.</p>}
  </section>;
}

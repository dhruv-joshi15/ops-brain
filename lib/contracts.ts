import type {Goal,Review,Rules,Task} from "./domain";
export interface Run {
  id:string;
  createdAt:string;
  meetingKey?:string;
  removedAt?:string;
  provider?:string;
  reviewedAt?:string;
  originals?:Review[];
  state:"running"|"review"|"failed"|"committed";
  notes:string;
  meetingDate:string;
  goalId:string;
  model:string;
  version:number;
  tasks:Review[];
  decisions:string[];
  error?:string;
  rawOutput?:string;
  cost:number|null;
  tokens?:{input:number;output:number};
}
export type Member = {id:string;name:string;active:boolean};
export type AuditEvent = {id:string;at:string;subject:string;changes:string[];demo:boolean};
export type Catalog = {goals:Goal[];members:Member[];deletedSeeds:string[]};
export interface Workspace {
  goals:Goal[];
  members:Member[];
  events:AuditEvent[];
  tasks:Task[];
  runs:Run[];
  rules:Rules;
  version:number;
  versions:number[];
  live:boolean;
  today:string;
}

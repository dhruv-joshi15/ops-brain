import {expect,it,vi} from "vitest";
import type {Prisma} from "../generated/prisma/client";
import {manage} from "../lib/manage";

it("rejects retention mutations when live mode is configured",async()=>{
  const deleteEvents=vi.fn();
  const updateRun=vi.fn();
  const tx={
    task:{findMany:async()=>[]},
    catalog:{findUnique:async()=>null},
    run:{findMany:async()=>[],update:updateRun},
    auditEvent:{deleteMany:deleteEvents},
  } as unknown as Prisma.TransactionClient;
  await expect(manage(tx,{action:"clearDemoActivity",confirmed:true},true)).rejects.toThrow("only in local demo mode");
  await expect(manage(tx,{action:"reset",confirmation:"RESET"},true)).rejects.toThrow("only in local demo mode");
  await expect(manage(tx,{action:"deleteRun",id:"sample-run",confirmed:true},true)).rejects.toThrow("only in local demo mode");
  expect(deleteEvents).not.toHaveBeenCalled();
  expect(updateRun).not.toHaveBeenCalled();
});

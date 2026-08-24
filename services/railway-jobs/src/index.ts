import { db, finishJob, idempotency, workerToken } from "./core.js";
import { embedKnowledge, prepareContent, prepareOutreach, rollupAnalytics, runLeadScan } from "./jobs.js";

async function seedDueJobs(){
  const now=new Date().toISOString();
  const [{data:configs},{data:docs},{data:recipients},{data:content}]=await Promise.all([
    db.from("lead_source_configs").select("id").eq("is_enabled",true).or(`next_run_at.is.null,next_run_at.lte.${now}`).limit(10),
    db.from("knowledge_documents").select("id,updated_at").eq("is_published",true).in("embedding_status",["pending","failed"]).limit(20),
    db.from("outreach_recipients").select("id,campaign_id").eq("status","eligible").limit(100),
    db.from("content_items").select("id").eq("status","idea").limit(5),
  ]);
  const jobs:any[]=[];
  for(const x of configs||[])jobs.push({job_type:"lead_scan",entity_id:x.id,payload:{configId:x.id},idempotency_key:idempotency("lead_scan",x.id,new Date().toISOString().slice(0,10))});
  for(const x of docs||[])jobs.push({job_type:"knowledge_embed",entity_id:x.id,payload:{documentId:x.id},idempotency_key:idempotency("knowledge_embed",x.id,x.updated_at)});
  for(const x of recipients||[])jobs.push({job_type:"outreach_draft",entity_id:x.id,payload:{recipientId:x.id},idempotency_key:idempotency("outreach_draft",x.id,"1")});
  for(const x of content||[])jobs.push({job_type:"content_prepare",entity_id:x.id,payload:{contentId:x.id},idempotency_key:idempotency("content_prepare",x.id)});
  jobs.push({job_type:"analytics_rollup",payload:{},idempotency_key:idempotency("analytics_rollup",new Date(Date.now()-86400000).toISOString().slice(0,10))});
  if(jobs.length)await db.from("job_runs").upsert(jobs,{onConflict:"idempotency_key",ignoreDuplicates:true});
}

async function runDue(){
  await seedDueJobs();
  const {data:jobs,error}=await db.rpc("claim_portfolio_jobs",{worker_token:workerToken,batch_size:10});if(error)throw error;
  for(const job of jobs||[]){try{if(job.job_type==="lead_scan")await runLeadScan(job.payload);else if(job.job_type==="knowledge_embed")await embedKnowledge(job.payload);else if(job.job_type==="outreach_draft")await prepareOutreach(job.payload);else if(job.job_type==="content_prepare")await prepareContent(job.payload);else if(job.job_type==="analytics_rollup")await rollupAnalytics();await finishJob(job.id,workerToken,true);}catch(error){console.error(job.job_type,job.id,error);await finishJob(job.id,workerToken,false,error);}}
  console.log(JSON.stringify({workerToken,claimed:(jobs||[]).length,finishedAt:new Date().toISOString()}));
}

if(process.argv[2]!=="run-due")throw new Error("Usage: npm run run-due");
await runDue();

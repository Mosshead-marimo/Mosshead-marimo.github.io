import { embedMany, gateway, generateText } from "ai";
import { chunkText, db, idempotency, normalizeDomain, stripHtml } from "./core.js";

const chatModel=process.env.GEMINI_CHAT_MODEL||"google/gemini-3.7-flash", embeddingModel=process.env.GEMINI_EMBEDDING_MODEL||"google/gemini-embedding-2";

async function robotsAllows(url:string){
  const parsed=new URL(url), robotsUrl=`${parsed.protocol}//${parsed.host}/robots.txt`;
  try{const response=await fetch(robotsUrl,{headers:{"user-agent":"KaushikPortfolioResearchBot/1.0 (+https://mosshead-marimo.github.io/)"},signal:AbortSignal.timeout(8000)});if(!response.ok)return true;const text=await response.text();const relevant=text.split(/user-agent:/i).slice(1).filter(x=>x.trim().startsWith("*")).join("\n");return !relevant.split(/\r?\n/).some(line=>/^\s*disallow:\s*\/\s*$/i.test(line));}catch{return false;}
}

export async function runLeadScan(payload:Record<string,unknown>){
  const configId=String(payload.configId||""); const {data:config,error}=await db.from("lead_source_configs").select("*").eq("id",configId).eq("is_enabled",true).single(); if(error||!config)throw new Error("Enabled scan configuration not found");
  const {data:run}=await db.from("lead_source_runs").insert({config_id:config.id,status:"running",started_at:new Date().toISOString()}).select().single();
  let pages=0,found=0; const urls=(config.start_urls||[]).slice(0,Number(process.env.MAX_SCAN_PAGES_PER_RUN||20));
  for(const url of urls){
    if(config.respect_robots && !(await robotsAllows(url)))continue;
    try{const response=await fetch(url,{headers:{"user-agent":"KaushikPortfolioResearchBot/1.0 (+https://mosshead-marimo.github.io/)"},signal:AbortSignal.timeout(15000)});if(!response.ok)continue;pages++;const html=(await response.text()).slice(0,1_000_000),text=stripHtml(html).slice(0,30000),lower=text.toLowerCase();const matches=(config.service_keywords||[]).filter((k:string)=>lower.includes(k.toLowerCase())),exclusions=(config.exclusion_keywords||[]).filter((k:string)=>lower.includes(k.toLowerCase()));if(!matches.length||exclusions.length)continue;const domain=normalizeDomain(url),score=Math.min(100,35+matches.length*12);const evidence=`Public page matched: ${matches.join(", ")}. ${text.slice(0,700)}`;const {error:insertError}=await db.from("discovered_leads").upsert({source_run_id:run?.id,company_name:domain.split(".")[0].replace(/[-_]/g," "),normalized_domain:domain,source_url:url,evidence,matched_service:matches[0],score,score_reasons:matches.map((x:string)=>({rule:"keyword",value:x,points:12})),confidence:Math.min(.95,.45+matches.length*.08)}, {onConflict:"normalized_domain,source_url",ignoreDuplicates:true});if(!insertError)found++;}catch{/* visible in run metrics without retrying unsafe pages */}
  }
  await db.from("lead_source_runs").update({status:"completed",completed_at:new Date().toISOString(),pages_scanned:pages,records_found:found,metrics:{urls_considered:urls.length,robots_respected:true}}).eq("id",run?.id);
  await db.from("lead_source_configs").update({next_run_at:new Date(Date.now()+24*60*60_000).toISOString()}).eq("id",config.id);
}

export async function embedKnowledge(payload:Record<string,unknown>){
  const documentId=String(payload.documentId||"");const {data:doc,error}=await db.from("knowledge_documents").select("*").eq("id",documentId).single();if(error||!doc)throw new Error("Knowledge document not found");
  await db.from("knowledge_documents").update({embedding_status:"processing",error_message:null}).eq("id",documentId);
  const chunks=chunkText(doc.content),{embeddings}=await embedMany({model:gateway.embeddingModel(embeddingModel),values:chunks,providerOptions:{google:{outputDimensionality:3072,taskType:"RETRIEVAL_DOCUMENT"}}});
  await db.from("knowledge_chunks").delete().eq("document_id",documentId);
  const {error:insertError}=await db.from("knowledge_chunks").insert(chunks.map((content,index)=>({document_id:documentId,chunk_index:index,heading:doc.title,content,token_count:Math.ceil(content.length/4),embedding:embeddings[index],metadata:{document_type:doc.document_type}})));if(insertError)throw insertError;
  await db.from("knowledge_documents").update({embedding_status:"ready",embedding_model:embeddingModel,last_embedded_at:new Date().toISOString()}).eq("id",documentId);
}

export async function prepareOutreach(payload:Record<string,unknown>){
  const recipientId=String(payload.recipientId||"");const {data:recipient,error}=await db.from("outreach_recipients").select("*,discovered_leads(*),lead_requests(*)").eq("id",recipientId).eq("status","eligible").single();if(error||!recipient)throw new Error("Eligible recipient not found");
  const lead=recipient.discovered_leads||recipient.lead_requests,evidence=lead?.evidence||lead?.problem;if(!evidence)throw new Error("Grounding evidence is required");
  const {text}=await generateText({model:gateway(chatModel),system:"Write a respectful, factual freelance introduction using only the evidence provided. Do not fabricate familiarity, results, urgency or private facts. Use 90 words or fewer. End with a low-pressure question and a plain reply-to-opt-out sentence.",prompt:`Company: ${lead.company_name||lead.company||"Prospect"}\nObserved public evidence: ${evidence}\nRelevant service: ${lead.matched_service||lead.service||"AI systems"}`,maxOutputTokens:220,temperature:.3});
  await db.from("outreach_messages").insert({recipient_id:recipientId,sequence_step:1,subject:`A practical ${lead.matched_service||"AI"} idea for ${lead.company_name||lead.company||"your team"}`,body_text:text,grounding:{source_url:lead.source_url||lead.relevant_link,evidence},model_id:chatModel,idempotency_key:idempotency("outreach",recipientId,"1")});
  await db.from("outreach_recipients").update({status:"drafted",current_step:1}).eq("id",recipientId);
}

export async function prepareContent(payload:Record<string,unknown>){
  const contentId=String(payload.contentId||"");const {data:item,error}=await db.from("content_items").select("*").eq("id",contentId).in("status",["idea","draft"]).single();if(error||!item)throw new Error("Draftable content item not found");
  const {data:knowledge}=await db.from("knowledge_documents").select("title,content,source_url").eq("is_published",true).limit(8);
  const {text}=await generateText({model:gateway(chatModel),system:"Create factual portfolio content using only the supplied notes. Return two sections headed LINKEDIN and GITHUB. Do not invent clients, metrics or outcomes. LinkedIn should be concise and conversational; GitHub should be technical Markdown.",prompt:`Topic: ${item.title}\nPillar: ${item.pillar}\nNotes:\n${(knowledge||[]).map(x=>`${x.title}: ${x.content}`).join("\n")}`,maxOutputTokens:1000,temperature:.35});
  const linkedin=text.split(/GITHUB/i)[0].replace(/^\s*LINKEDIN\s*/i,"").trim(),github=(text.split(/GITHUB/i)[1]||text).trim();
  await db.from("content_items").update({linkedin_content:linkedin,github_content:github,status:"review"}).eq("id",contentId);
}

export async function rollupAnalytics(){
  const day=new Date(Date.now()-86400000).toISOString().slice(0,10),start=`${day}T00:00:00.000Z`,end=new Date(new Date(start).getTime()+86400000).toISOString();const {data:events}=await db.from("analytics_events").select("event_type,session_id,page_path,referrer_host").gte("occurred_at",start).lt("occurred_at",end).limit(50000);const list=events||[],count=(type:string)=>list.filter(x=>x.event_type===type).length,top=(key:"page_path"|"referrer_host")=>Object.entries(list.reduce((a:any,e:any)=>{const v=e[key];if(v)a[v]=(a[v]||0)+1;return a;},{})).sort((a:any,b:any)=>b[1]-a[1]).slice(0,10).map(([label,value])=>({label,value}));await db.from("analytics_daily").upsert({analytics_date:day,page_views:count("page_view"),unique_sessions:new Set(list.map(x=>x.session_id)).size,cta_clicks:count("cta_click"),form_starts:count("form_start"),form_submissions:count("form_submit"),top_pages:top("page_path"),top_referrers:top("referrer_host"),updated_at:new Date().toISOString()});
}

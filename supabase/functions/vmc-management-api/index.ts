import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:corsHeaders});
const url=Deno.env.get("SUPABASE_URL")!;
const publicKeys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!);
const secretKeys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!);
const pub=publicKeys["default"];
const secret=secretKeys["default"];
const admin=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
const ROLES=["staff","manager","owner"] as const;

function todayMalawi(){
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Blantyre",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}
function addDuration(start:string,count:number,unit:string){
  const d=new Date(start+"T00:00:00Z");
  if(unit==="day")d.setUTCDate(d.getUTCDate()+count-1);
  else if(unit==="week")d.setUTCDate(d.getUTCDate()+count*7-1);
  else if(unit==="month"){
    const original=d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth()+count);
    const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
    d.setUTCDate(Math.min(original,last)-1);
  }else throw new Error("Invalid membership duration.");
  return d.toISOString().slice(0,10);
}
function nextDate(date:string){
  const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);
}
async function context(req:Request){
  const authorization=req.headers.get("Authorization")??"";
  const token=authorization.replace(/^Bearer\s+/i,"");
  if(!token)throw new Error("Authentication is required.");
  const userClient=createClient(url,pub,{global:{headers:{Authorization:authorization}},auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const {data,error}=await userClient.auth.getUser(token);
  if(error||!data.user)throw new Error("Your session is invalid or expired.");
  const {data:roles,error:roleError}=await admin.from("vmc_user_roles").select("role:vmc_roles(name)").eq("user_id",data.user.id);
  if(roleError)throw roleError;
  const role=(roles??[]).map((r:any)=>r.role?.name).find((r:string)=>ROLES.includes(r as any));
  if(!role)throw new Error("Management access is required.");
  const {data:profile,error:profileError}=await admin.from("vmc_profiles").select("id,full_name,username,account_status").eq("id",data.user.id).single();
  if(profileError||!profile||profile.account_status!=="active")throw new Error("This management account is not active.");
  return {userId:data.user.id,role,profile};
}
async function audit(actorId:string,action:string,entityType:string,entityId:string|null,metadata:any={}){
  const {error}=await admin.from("vmc_audit_logs").insert({actor_id:actorId,action,entity_type:entityType,entity_id:entityId,metadata});
  if(error)console.error("VMC audit log failed:",error);
}
async function dashboard(actorId:string,role:string){
  const {data:roleRows,error:roleError}=await admin.from("vmc_roles").select("id").eq("name","member").single();
  if(roleError||!roleRows)throw roleError??new Error("Member role is not configured.");
  const {data:memberLinks,error:memberLinksError}=await admin.from("vmc_user_roles").select("user_id").eq("role_id",roleRows.id);
  if(memberLinksError)throw memberLinksError;
  const memberIds=(memberLinks??[]).map((x:any)=>x.user_id);
  const [profilesRes,membershipsRes,paymentsRes,attendanceRes]=await Promise.all([
    memberIds.length?admin.from("vmc_profiles").select("id,full_name,username,phone,email,account_status,created_at"):Promise.resolve({data:[],error:null}),
    memberIds.length?admin.from("vmc_memberships").select("id,member_id,plan_id,start_date,end_date,status,training_mode,created_at,plan:vmc_membership_plans(name,duration_unit,duration_count,session_type,price)").in("member_id",memberIds).order("created_at",{ascending:false}):Promise.resolve({data:[],error:null}),
    memberIds.length?admin.from("vmc_payments").select("id,member_id,membership_id,amount,payment_method,receipt_reference,payment_date,status,verified_at,created_at").in("member_id",memberIds).order("payment_date",{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
    memberIds.length?admin.from("vmc_attendance").select("id,member_id,checked_in_at,checked_out_at").in("member_id",memberIds).order("checked_in_at",{ascending:false}).limit(200):Promise.resolve({data:[],error:null})
  ]);
  for(const r of [profilesRes,membershipsRes,paymentsRes,attendanceRes])if(r.error)throw r.error;
  const profiles=profilesRes.data??[], memberships=membershipsRes.data??[], payments=paymentsRes.data??[], attendance=attendanceRes.data??[];
  const latest=new Map<string,any>();
  for(const m of memberships)if(!latest.has(m.member_id))latest.set(m.member_id,m);
  const today=todayMalawi(),soon=new Date(today+"T00:00:00Z");soon.setUTCDate(soon.getUTCDate()+7);const soonDate=soon.toISOString().slice(0,10);
  const pendingPayments=payments.filter((p:any)=>p.status==="pending");
  const active=profiles.filter((p:any)=>{const m=latest.get(p.id);return p.account_status==="active"&&m?.status==="active"&&m?.end_date>=today}).length;
  const expiring=profiles.filter((p:any)=>{const m=latest.get(p.id);return m?.status==="active"&&m?.end_date>=today&&m?.end_date<=soonDate});
  const todayStart=new Date(today+"T00:00:00+02:00").toISOString();
  const tomorrow=new Date(today+"T00:00:00Z");tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  const todayEnd=new Date(tomorrow.toISOString().slice(0,10)+"T00:00:00+02:00").toISOString();
  const todayVisits=attendance.filter((a:any)=>a.checked_in_at>=todayStart&&a.checked_in_at<todayEnd).length;
  const verifiedRevenue=payments.filter((p:any)=>p.status==="verified").reduce((sum:number,p:any)=>sum+Number(p.amount||0),0);
  const recentPayments=payments.slice(0,8).map((p:any)=>({...p,member:profiles.find((m:any)=>m.id===p.member_id)?.full_name??"Unknown member"}));
  const recentMembers=[...profiles].sort((a:any,b:any)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,6).map((p:any)=>({...p,membership:latest.get(p.id)??null}));
  return {role,stats:{totalMembers:profiles.length,activeMembers:active,pendingPayments:pendingPayments.length,todayVisits,expiringSoon:expiring.length,verifiedRevenue},pendingPayments:pendingPayments.slice(0,8).map((p:any)=>({...p,member:profiles.find((m:any)=>m.id===p.member_id)?.full_name??"Unknown member",membership:latest.get(p.member_id)??null})),recentPayments,recentMembers,expiringSoon:expiring.map((p:any)=>({...p,membership:latest.get(p.id)})),actorId};
}
async function updatePayment(actorId:string,paymentId:string,status:"verified"|"rejected"){
  const {data:payment,error:paymentError}=await admin.from("vmc_payments").select("id,member_id,membership_id,amount,status").eq("id",paymentId).maybeSingle();
  if(paymentError)throw paymentError;if(!payment)throw new Error("Payment record not found.");
  if(payment.status!=="pending")throw new Error("This payment has already been reviewed.");
  const {data:membership,error:membershipError}=await admin.from("vmc_memberships").select("id,member_id,plan_id,status,start_date,end_date,plan:vmc_membership_plans(name,duration_unit,duration_count,session_type,price)").eq("id",payment.membership_id).maybeSingle();
  if(membershipError)throw membershipError;if(!membership)throw new Error("Membership record not found.");
  const now=new Date().toISOString();
  if(status==="rejected"){
    const {error}=await admin.from("vmc_payments").update({status:"rejected",verified_by:actorId,verified_at:now}).eq("id",paymentId).eq("status","pending");
    if(error)throw error;
    const {error:me}=await admin.from("vmc_memberships").update({status:"cancelled",updated_at:now}).eq("id",membership.id);
    if(me)throw me;
    await audit(actorId,"payment_rejected","payment",paymentId,{membership_id:membership.id,amount:payment.amount});
    return {ok:true,status:"rejected"};
  }
  const today=todayMalawi();
  const {data:active,error:activeError}=await admin.from("vmc_memberships").select("end_date").eq("member_id",payment.member_id).eq("status","active").gte("end_date",today).order("end_date",{ascending:false}).limit(1).maybeSingle();
  if(activeError)throw activeError;
  const start=active?.end_date?nextDate(active.end_date):today;
  const plan=membership.plan as any;
  const end=addDuration(start,Number(plan.duration_count||1),String(plan.duration_unit));
  const {error}=await admin.from("vmc_payments").update({status:"verified",verified_by:actorId,verified_at:now}).eq("id",paymentId).eq("status","pending");
  if(error)throw error;
  const {error:me}=await admin.from("vmc_memberships").update({status:"active",start_date:start,end_date:end,updated_at:now}).eq("id",membership.id);
  if(me)throw me;
  await audit(actorId,"payment_verified","payment",paymentId,{membership_id:membership.id,amount:payment.amount,start_date:start,end_date:end});
  return {ok:true,status:"verified",start_date:start,end_date:end};
}
async function setAccountStatus(actorId:string,userId:string,status:string){
  if(!["active","suspended","deactivated"].includes(status))throw new Error("Invalid account status.");
  const {data:profile,error}=await admin.from("vmc_profiles").select("id,account_status").eq("id",userId).maybeSingle();
  if(error)throw error;if(!profile)throw new Error("Member account not found.");
  const {data:memberRole}=await admin.from("vmc_roles").select("id").eq("name","member").single();
  const {data:link}=await admin.from("vmc_user_roles").select("user_id").eq("user_id",userId).eq("role_id",memberRole.id).maybeSingle();
  if(!link)throw new Error("Only member accounts can be changed here.");
  const {error:updateError}=await admin.from("vmc_profiles").update({account_status:status,updated_at:new Date().toISOString()}).eq("id",userId);
  if(updateError)throw updateError;
  await audit(actorId,"member_status_changed","profile",userId,{from:profile.account_status,to:status});
  return {ok:true,status};
}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"POST required."},405);
  try{
    const {userId,role}=await context(req);
    const body=await req.json().catch(()=>({}));
    const action=String(body.action??"");
    if(action==="dashboard")return json(await dashboard(userId,role));
    if(action==="verify_payment"||action==="reject_payment"){
      const result=await updatePayment(userId,String(body.payment_id??""),action==="verify_payment"?"verified":"rejected");
      return json(result);
    }
    if(action==="set_account_status")return json(await setAccountStatus(userId,String(body.user_id??""),String(body.status??"")));
    return json({error:"Unsupported management action."},400);
  }catch(error){
    console.error("VMC management API error:",error);
    return json({error:String((error as any)?.message??error)},400);
  }
});

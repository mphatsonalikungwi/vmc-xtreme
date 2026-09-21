import { createClient } from "https://unpkg.com/@supabase/supabase-js@2.116.0/+esm";
import { VMC_CONFIG } from "./config.js";
const supabase=createClient(VMC_CONFIG.supabaseUrl,VMC_CONFIG.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=s=>document.querySelector(s);
const pageType=document.body.classList.contains("management-page")?"management":"member";
const allowedRoles=pageType==="management"?["staff","manager","owner"]:["member"];
const loginPath=pageType==="management"?"../auth/management-login.html":"../auth/member-login.html";
const text=v=>v==null?"":String(v);
function formatDate(v){if(!v)return"—";const d=new Date(v+(v.length===10?"T00:00:00":""));return Number.isNaN(d.getTime())?v:new Intl.DateTimeFormat("en-MW",{day:"numeric",month:"short",year:"numeric"}).format(d)}
function formatMoney(v){return v==null?"—":"K"+Number(v).toLocaleString("en-MW")}
function titleCase(v){return text(v).replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
function initials(name){const p=text(name).trim().split(/\s+/).filter(Boolean);return(p.slice(0,2).map(x=>x[0]).join("")||"V").toUpperCase()}
const GALLERY_BUCKET="member-gallery";
const MAX_IMAGE_BYTES=8*1024*1024;
const ALLOWED_IMAGE_TYPES=["image/jpeg","image/png","image/webp"];
async function signedGalleryUrl(path){if(!path)return null;const{data,error}=await supabase.storage.from(GALLERY_BUCKET).createSignedUrl(path,3600);if(error)throw error;return data?.signedUrl||null}
async function resolveProfileAvatar(path){if(!path)return null;if(/^https?:\/\//i.test(path))return path;return signedGalleryUrl(path)}
function setNotice(el,message,isError=false){if(!el)return;el.textContent=message;el.dataset.state=isError?"error":"success";el.hidden=!message}
function buildGalleryPath(userId,file){const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");return userId+"/"+crypto.randomUUID()+"."+ext}
function setupMenu(){const sidebar=$("#member-nav"),overlay=$("[data-menu-overlay]"),toggle=$("[data-menu-toggle]");if(!sidebar||!toggle)return;const setOpen=open=>{sidebar.classList.toggle("is-open",open);if(overlay)overlay.toggleAttribute("hidden",!open);toggle.setAttribute("aria-expanded",String(open));document.body.classList.toggle("portal-menu-open",open)};toggle.addEventListener("click",()=>setOpen(!sidebar.classList.contains("is-open")));document.querySelectorAll("[data-menu-close]").forEach(b=>b.addEventListener("click",()=>setOpen(false)));overlay?.addEventListener("click",()=>setOpen(false));sidebar.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>setOpen(false)))}

async function loadMembershipPage(userId){const{data:memberships,error}=await supabase.from("vmc_memberships").select("id,status,start_date,end_date,training_mode,created_at,plan:vmc_membership_plans(id,name,duration_unit,duration_count,session_type,price)").eq("member_id",userId).order("created_at",{ascending:false});if(error)throw error;const current=memberships?.[0]||null;renderMembershipPage(current);renderMembershipHistory(memberships||[]);await loadRenewalPlans()}
function membershipProgress(start,end,status){if(status==="pending"||!start||!end)return 0;const a=new Date(start+"T00:00:00").getTime(),b=new Date(end+"T23:59:59").getTime();if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return 0;return Math.max(0,Math.min(100,Math.round((Date.now()-a)/(b-a)*100)))}
function renderMembershipPage(m){const s=m?.status||"not_set",p=m?.plan;document.querySelector("[data-membership-status]")?.replaceChildren(document.createTextNode(titleCase(s)));const pill=document.querySelector("[data-membership-pill]");if(pill){pill.textContent=titleCase(s);pill.dataset.status=s}document.querySelector("[data-membership-plan]")?.replaceChildren(document.createTextNode(p?.name||"No plan"));document.querySelector("[data-membership-training]")?.replaceChildren(document.createTextNode(m?.training_mode||"—"));document.querySelector("[data-membership-session]")?.replaceChildren(document.createTextNode(p?.session_type?titleCase(p.session_type):"—"));document.querySelector("[data-membership-price]")?.replaceChildren(document.createTextNode(p?.price!=null?formatMoney(p.price):"—"));document.querySelector("[data-membership-start]")?.replaceChildren(document.createTextNode(formatDate(m?.start_date)));document.querySelector("[data-membership-end]")?.replaceChildren(document.createTextNode(formatDate(m?.end_date)));const pct=membershipProgress(m?.start_date,m?.end_date,s);document.querySelector("[data-membership-percent]")?.replaceChildren(document.createTextNode(pct+"%"));const bar=document.querySelector("[data-membership-bar]");if(bar)bar.style.width=pct+"%";const next=document.querySelector("[data-membership-next]"),detail=document.querySelector("[data-membership-next-detail]");if(s==="pending"){next.textContent="Payment under review.";detail.textContent="Your submitted payment is waiting for VMC verification."}else if(s==="active"){const days=m?.end_date?Math.max(0,Math.ceil((new Date(m.end_date+"T23:59:59").getTime()-Date.now())/86400000)):null;next.textContent=days!=null&&days<=7?"Renew soon.":"Plan your next membership.";detail.textContent=days!=null?"You have "+days+" day"+(days===1?"":"s")+" remaining.":"Your membership is active."}else{next.textContent="Choose your next plan.";detail.textContent="Select the membership that fits your next training period."}}
function renderMembershipHistory(rows){const body=document.querySelector("[data-membership-history]");if(!body)return;if(!rows.length){body.innerHTML="<tr><td colspan=\"4\">No membership history yet.</td></tr>";return}body.innerHTML=rows.map(m=>"<tr><td>"+text(m.plan?.name||"—")+" · "+titleCase(m.plan?.session_type||"")+" </td><td>"+text(m.training_mode||"—")+"</td><td>"+formatDate(m.start_date)+" → "+formatDate(m.end_date)+"</td><td><span class=\"status-pill\" data-status=\""+text(m.status)+"\">"+titleCase(m.status)+"</span></td></tr>").join("")}
let renewalPlans=[];
async function loadRenewalPlans(){const{data,error}=await supabase.from("vmc_membership_plans").select("id,name,duration_unit,duration_count,session_type,price").order("price");if(error)throw error;renewalPlans=data||[];bindRenewalControls()}
function bindRenewalControls(){const d=document.querySelector("[data-renew-duration]"),c=document.querySelector("[data-renew-count]"),s=document.querySelector("[data-renew-session]");const update=()=>{const plan=renewalPlans.find(p=>p.duration_unit===d.value&&p.session_type===s.value);const count=Math.max(1,Math.min(12,Number(c.value)||1));const price=plan?Number(plan.price)*count:0;document.querySelector("[data-renew-name]").textContent=plan?(plan.name+" · "+titleCase(plan.session_type)):"Plan unavailable";document.querySelector("[data-renew-summary]").textContent=count+" "+d.value+(count===1?"":"s");document.querySelector("[data-renew-price]").textContent=plan?formatMoney(price):"—"};[d,c,s].forEach(x=>x?.addEventListener("input",update));update()}
async function loadPortal(){setupMenu();const{data:userData,error:userError}=await supabase.auth.getUser();if(userError||!userData.user){location.href=loginPath;return}const userId=userData.user.id;const{data:profile,error:profileError}=await supabase.from("vmc_profiles").select("id,full_name,username,phone,email,avatar_url,must_change_password,account_status").eq("id",userId).single();if(profileError||!profile||profile.account_status!=="active"){await supabase.auth.signOut();location.href=loginPath;return}if(profile.must_change_password){location.href="../auth/change-password.html?next="+encodeURIComponent(pageType==="management"?"../management/":"../member/");return}const{data:roleRows,error:roleError}=await supabase.from("vmc_user_roles").select("role:vmc_roles(name)").eq("user_id",userId);if(roleError)throw roleError;const roles=(roleRows||[]).map(r=>r.role?.name).filter(Boolean);const activeRole=roles.find(r=>allowedRoles.includes(r));if(!activeRole){await supabase.auth.signOut();location.href=loginPath;return}document.querySelectorAll("[data-portal-name]").forEach(e=>e.textContent=profile.full_name);document.querySelectorAll("[data-portal-username]").forEach(e=>e.textContent=profile.username||"Not assigned");$("[data-account-status]")?.replaceChildren(document.createTextNode(titleCase(profile.account_status)));if(profile.avatar_url){const img=$("[data-profile-avatar-image]");if(img){try{const avatarSrc=await resolveProfileAvatar(profile.avatar_url);if(avatarSrc){img.src=avatarSrc;img.alt=profile.full_name+"'s profile picture";img.hidden=false;$("[data-profile-initials]")?.setAttribute("hidden","")}}catch(e){console.error("VMC avatar load failed:",e)}}}else{$("[data-profile-initials]")?.replaceChildren(document.createTextNode(initials(profile.full_name)))}if(pageType==="member")await loadMemberOverview(userId);if(pageType==="member"&&location.pathname.endsWith("/membership.html"))await loadMembershipPage(userId);if(pageType==="member"&&location.pathname.endsWith("/payments.html"))await loadPaymentsPage(userId);if(pageType==="member"&&location.pathname.endsWith("/attendance.html"))await loadAttendancePage(userId);if(pageType==="member"&&location.pathname.endsWith("/profile.html"))await loadProfilePage(userId,profile);if(pageType==="member"&&location.pathname.endsWith("/photos.html"))await loadPhotosPage(userId);if(pageType==="management")await loadManagementOverview()}
async function loadMemberOverview(userId){const[m,a,p]=await Promise.all([supabase.from("vmc_memberships").select("status,start_date,end_date,training_mode,plan:vmc_membership_plans(name,duration_unit,duration_count,session_type,price)").eq("member_id",userId).order("created_at",{ascending:false}).limit(1).maybeSingle(),supabase.from("vmc_attendance").select("id",{count:"exact",head:true}).eq("member_id",userId),supabase.from("vmc_payments").select("amount,payment_method,receipt_reference,payment_date,status").eq("member_id",userId).order("payment_date",{ascending:false}).limit(1).maybeSingle()]);if(m.error)throw m.error;if(a.error)throw a.error;if(p.error)throw p.error;renderMembership(m.data);$("[data-attendance-count]")?.replaceChildren(document.createTextNode(String(a.count??0)));renderLatestPayment(p.data)}
function renderMembership(m){const s=m?.status||"not_set",start=m?.start_date,end=m?.end_date,plan=m?.plan;$("[data-membership-status]")?.replaceChildren(document.createTextNode(titleCase(s)));const pill=$("[data-membership-pill]");if(pill){pill.textContent=titleCase(s);pill.dataset.status=s}const planText=plan?plan.name+" · "+titleCase(plan.session_type)+" session"+(m?.training_mode?" · "+m.training_mode:""):"No membership plan recorded";$("[data-membership-detail]")?.replaceChildren(document.createTextNode(planText));$("[data-start-date]")?.replaceChildren(document.createTextNode("Start "+formatDate(start)));$("[data-end-date]")?.replaceChildren(document.createTextNode("End "+formatDate(end)));const progress=calculateProgress(start,end,s),bar=$("[data-membership-progress]"),percent=$("[data-progress-percent]"),track=$(".progress-track");if(bar)bar.style.width=progress+"%";if(percent)percent.textContent=progress+"%";track?.setAttribute("aria-valuenow",String(progress));const days=daysRemaining(end);$("[data-days-remaining]")?.replaceChildren(document.createTextNode(days==null?"—":String(days)));const na=$("[data-next-action]"),nd=$("[data-next-detail]");if(s==="active"&&days!=null){na.textContent=days<=7?"Renew soon.":"Keep showing up.";nd.textContent=days<=7?"Your membership ends in "+days+" day"+(days===1?"":"s")+".":"Your membership is active. Keep building your consistency."}else if(s==="pending"){na.textContent="Payment under review.";nd.textContent="VMC is reviewing your membership payment. Your status will update after verification."}else{na.textContent="Membership needs attention.";nd.textContent="Open Membership to review your current plan and renewal options."}$("[data-journey-title]")?.replaceChildren(document.createTextNode(days!=null&&days>0?"Build your consistency.":"Start your next VMC chapter."))}
function calculateProgress(start,end,status){if(status==="pending"||!start||!end)return 0;const a=new Date(start+"T00:00:00").getTime(),b=new Date(end+"T23:59:59").getTime();if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return 0;return Math.max(0,Math.min(100,Math.round(((Date.now()-a)/(b-a))*100)))}
function daysRemaining(end){if(!end)return null;const t=new Date(end+"T23:59:59").getTime();return Number.isFinite(t)?Math.max(0,Math.ceil((t-Date.now())/86400000)):null}
function renderLatestPayment(p){$("[data-latest-payment]")?.replaceChildren(document.createTextNode(p?formatMoney(p.amount):"—"));$("[data-latest-payment-detail]")?.replaceChildren(document.createTextNode(p?titleCase(p.status)+" · "+titleCase(p.payment_method)+" · "+formatDate(p.payment_date):"No payment recorded yet"))}
async function loadPaymentsPage(userId){
  const {data,error}=await supabase.from("vmc_payments").select("id,amount,payment_method,receipt_reference,payment_date,status,verified_at,notes,membership_id").eq("member_id",userId).order("payment_date",{ascending:false});
  if(error) throw error;
  const rows=data||[];
  const latest=rows[0];
  const verified=rows.filter(r=>r.status==="verified").length;
  const pending=rows.filter(r=>r.status==="pending").length;
  $("[data-payment-latest-amount]")?.replaceChildren(document.createTextNode(latest?formatMoney(latest.amount):"—"));
  $("[data-payment-latest-detail]")?.replaceChildren(document.createTextNode(latest?titleCase(latest.status)+" · "+titleCase(latest.payment_method)+" · "+formatDate(latest.payment_date):"No payment recorded yet."));
  $("[data-payment-verified-count]")?.replaceChildren(document.createTextNode(String(verified)));
  $("[data-payment-pending-count]")?.replaceChildren(document.createTextNode(String(pending)));
  const body=$("[data-payment-history]");
  if(body){
    body.replaceChildren();
    if(!rows.length){
      const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=5;td.textContent="No payment history yet.";tr.append(td);body.append(tr);
    } else {
      rows.forEach(r=>{
        const tr=document.createElement("tr");
        [formatDate(r.payment_date),formatMoney(r.amount),titleCase(r.payment_method),r.receipt_reference||"Not provided",titleCase(r.status)].forEach((v,i)=>{
          const td=document.createElement("td");td.textContent=v;
          if(i===4){const pill=document.createElement("span");pill.className="status-pill";pill.dataset.status=r.status;pill.textContent=v;td.replaceChildren(pill);}
          tr.append(td);
        });
        body.append(tr);
      });
    }
  }
  const note=$("[data-payment-note]");
  if(note) note.textContent=rows.length?"Payment records are read directly from your VMC account. Verification details appear when VMC confirms a payment.":"Your payment history will appear here after your first payment submission.";
}
async function loadAttendancePage(userId){
  const {data:rows,error}=await supabase.from("vmc_attendance").select("id,checked_in_at,checked_out_at,recorded_by,created_at").eq("member_id",userId).order("checked_in_at",{ascending:false});
  if(error) throw error;
  const list=rows||[], dates=new Set(list.map(r=>new Date(r.checked_in_at).toISOString().slice(0,10)));
  const now=new Date(), monthKey=now.toISOString().slice(0,7);
  const monthRows=list.filter(r=>new Date(r.checked_in_at).toISOString().slice(0,7)===monthKey);
  const sorted=[...dates].sort().reverse(); let streak=0;
  if(sorted.length){const first=new Date(sorted[0]+"T00:00:00");const todayOnly=new Date(now.getFullYear(),now.getMonth(),now.getDate());const gap=Math.round((todayOnly-first)/86400000);if(gap<=1){for(let i=0;i<sorted.length;i++){const d=new Date(sorted[i]+"T00:00:00");const expected=new Date(first.getFullYear(),first.getMonth(),first.getDate()-i);if(d.getTime()===expected.getTime())streak++;else break}}}
  const {data:membership}=await supabase.from("vmc_memberships").select("start_date,end_date,status").eq("member_id",userId).order("created_at",{ascending:false}).limit(1).maybeSingle();
  const membershipRows=membership?.start_date?list.filter(r=>{const d=new Date(r.checked_in_at);return d>=new Date(membership.start_date+"T00:00:00")&&(!membership.end_date||d<=new Date(membership.end_date+"T23:59:59"))}):[];
  $("[data-att-total]")?.replaceChildren(document.createTextNode(String(list.length)));
  $("[data-att-month]")?.replaceChildren(document.createTextNode(String(monthRows.length)));
  $("[data-att-streak]")?.replaceChildren(document.createTextNode(String(streak)));
  $("[data-att-membership]")?.replaceChildren(document.createTextNode(String(membershipRows.length)));
  renderAttendanceCalendar(dates);
  const body=$("[data-att-history]"); if(body){body.replaceChildren();if(!list.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=4;td.textContent="No attendance recorded yet.";tr.append(td);body.append(tr)}else list.forEach(r=>{const tr=document.createElement("tr");[formatDate(r.checked_in_at),formatTime(r.checked_in_at),formatTime(r.checked_out_at),r.recorded_by?"VMC staff":"VMC"].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.append(td)});body.append(tr)})}
  $("[data-att-note]")?.replaceChildren(document.createTextNode(list.length?"Attendance is read directly from your VMC check-in records.":"Your attendance history will appear after your first recorded check-in."));
}
let calendarDate=new Date();
function formatTime(v){if(!v)return"—";const d=new Date(v);return Number.isNaN(d.getTime())?v:new Intl.DateTimeFormat("en-MW",{hour:"numeric",minute:"2-digit"}).format(d)}
function formatDateTime(v){if(!v)return"—";const d=new Date(v);return Number.isNaN(d.getTime())?v:new Intl.DateTimeFormat("en-MW",{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"}).format(d)}
function renderAttendanceCalendar(dates){
  const root=$("[data-attendance-calendar]");if(!root)return;
  const y=calendarDate.getFullYear(),m=calendarDate.getMonth(),first=new Date(y,m,1),days=new Date(y,m+1,0).getDate(),offset=(first.getDay()+6)%7;
  const title=new Intl.DateTimeFormat("en-MW",{month:"long",year:"numeric"}).format(first);$("[data-calendar-title]")?.replaceChildren(document.createTextNode(title));root.replaceChildren();
  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(x=>{const e=document.createElement("div");e.className="attendance-weekday";e.textContent=x;root.append(e)});
  for(let i=0;i<offset;i++){const e=document.createElement("div");e.className="attendance-day is-empty";root.append(e)}
  const today=new Date().toISOString().slice(0,10);
  for(let day=1;day<=days;day++){const key=new Date(y,m,day).toISOString().slice(0,10),e=document.createElement("div");e.className="attendance-day"+(dates.has(key)?" is-present":"")+(key===today?" is-today":"");const n=document.createElement("span");n.className="attendance-day-number";n.textContent=String(day);e.append(n);root.append(e)}
}

async function uploadMemberPhoto(userId,file,makeProfile=false){
  if(!file)throw new Error("Choose an image first.");
  if(!ALLOWED_IMAGE_TYPES.includes(file.type))throw new Error("Use a JPG, PNG or WebP image.");
  if(file.size>MAX_IMAGE_BYTES)throw new Error("The image must be 8 MB or smaller.");
  const path=buildGalleryPath(userId,file);
  const{error:uploadError}=await supabase.storage.from(GALLERY_BUCKET).upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
  if(uploadError)throw uploadError;
  const{data:photo,error:photoError}=await supabase.from("vmc_member_photos").insert({member_id:userId,storage_path:path,is_profile_photo:false}).select("id,member_id,storage_path,is_profile_photo,created_at").single();
  if(photoError){await supabase.storage.from(GALLERY_BUCKET).remove([path]);throw photoError}
  if(makeProfile){const{error}=await supabase.rpc("vmc_set_profile_photo",{photo_id:photo.id});if(error){await supabase.from("vmc_member_photos").delete().eq("id",photo.id).eq("member_id",userId);await supabase.storage.from(GALLERY_BUCKET).remove([path]);throw error}}
  return photo
}
async function loadProfilePage(userId,profile){
  const form=$("[data-profile-form]");if(!form)return;
  const fields={full_name:form.querySelector("[name=full_name]"),phone:form.querySelector("[name=phone]"),email:form.querySelector("[name=email]"),date_of_birth:form.querySelector("[name=date_of_birth]"),gender:form.querySelector("[name=gender]"),emergency_contact:form.querySelector("[name=emergency_contact]")};
  Object.entries(fields).forEach(([key,el])=>{if(el)el.value=profile[key]||""});
  const username=form.querySelector("[data-profile-username]");if(username)username.textContent=profile.username||"Not assigned";
  const avatar=form.querySelector("[data-profile-page-avatar]");
  if(avatar&&profile.avatar_url){try{const src=await resolveProfileAvatar(profile.avatar_url);if(src){avatar.src=src;avatar.hidden=false}}catch(e){console.error("VMC profile avatar load failed:",e)}}
  form.addEventListener("submit",async event=>{
    event.preventDefault();const button=form.querySelector("[type=submit]"),notice=$("[data-profile-form-notice]");if(button)button.disabled=true;
    try{
      const payload={full_name:fields.full_name?.value.trim(),phone:fields.phone?.value.trim()||null,email:fields.email?.value.trim()||null,date_of_birth:fields.date_of_birth?.value||null,gender:fields.gender?.value||null,emergency_contact:fields.emergency_contact?.value.trim()||null};
      if(!payload.full_name)throw new Error("Full name is required.");
      const{error}=await supabase.from("vmc_profiles").update(payload).eq("id",userId);
      if(error)throw error;
      document.querySelectorAll("[data-portal-name]").forEach(e=>e.textContent=payload.full_name);
      setNotice(notice,"Profile updated.");
    }catch(e){setNotice(notice,e.message||"Could not update your profile.",true)}finally{if(button)button.disabled=false}
  });
  const upload=form.querySelector("[data-profile-upload]");
  upload?.addEventListener("change",async()=>{
    const file=upload.files?.[0],button=form.querySelector("[data-profile-upload-button]"),notice=$("[data-profile-photo-notice]");
    if(!file)return;if(button)button.disabled=true;
    try{const photo=await uploadMemberPhoto(userId,file,true);const src=await signedGalleryUrl(photo.storage_path);if(avatar&&src){avatar.src=src;avatar.hidden=false}setNotice(notice,"Profile picture updated.");}
    catch(e){setNotice(notice,e.message||"Could not upload the profile picture.",true)}finally{upload.value="";if(button)button.disabled=false}
  });
}
async function loadPhotosPage(userId){
  const grid=$("[data-photo-grid]"),empty=$("[data-photo-empty]"),notice=$("[data-photo-notice]"),input=$("[data-gallery-upload]");if(!grid)return;
  let rows=[];
  const render=async()=>{
    const{data,error}=await supabase.from("vmc_member_photos").select("id,member_id,storage_path,is_profile_photo,created_at").eq("member_id",userId).order("created_at",{ascending:false});
    if(error)throw error;rows=data||[];grid.replaceChildren();if(empty)empty.hidden=rows.length>0;
    for(const row of rows){const src=await signedGalleryUrl(row.storage_path);if(!src)continue;
      const card=document.createElement("button");card.type="button";card.className="member-photo-card";card.dataset.photoId=row.id;card.setAttribute("aria-label","Open photo");
      const img=document.createElement("img");img.src=src;img.alt="VMC member photo";img.loading="lazy";card.append(img);
      if(row.is_profile_photo){const badge=document.createElement("span");badge.className="member-photo-badge";badge.textContent="Profile";card.append(badge)}
      card.addEventListener("click",()=>openPhotoViewer(userId,row,src,render));grid.append(card);
    }
  };
  input?.addEventListener("change",async()=>{
    const file=input.files?.[0];if(!file)return;const button=$("[data-gallery-upload-button]");if(button)button.disabled=true;
    try{await uploadMemberPhoto(userId,file,false);setNotice(notice,"Photo added to your gallery.");await render()}
    catch(e){setNotice(notice,e.message||"Could not add that photo.",true)}finally{input.value="";if(button)button.disabled=false}
  });
  await render();
}
function openPhotoViewer(userId,row,src,refresh){
  const modal=$("[data-photo-viewer]");if(!modal)return;const image=modal.querySelector("[data-viewer-image]"),profileButton=modal.querySelector("[data-make-profile]"),deleteButton=modal.querySelector("[data-delete-photo]"),closeButtons=modal.querySelectorAll("[data-close-viewer"]);
  image.src=src;image.alt="VMC member photo";modal.hidden=false;document.body.classList.add("photo-viewer-open");
  const close=()=>{modal.hidden=true;document.body.classList.remove("photo-viewer-open")};closeButtons.forEach(b=>b.onclick=close);
  profileButton.onclick=async()=>{profileButton.disabled=true;try{const{error}=await supabase.rpc("vmc_set_profile_photo",{photo_id:row.id});if(error)throw error;close();await refresh()}catch(e){alert(e.message||"Could not set profile picture.")}finally{profileButton.disabled=false}};
  deleteButton.onclick=async()=>{if(!confirm("Delete this photo from your VMC gallery?"))return;deleteButton.disabled=true;try{const{error}=await supabase.storage.from(GALLERY_BUCKET).remove([row.storage_path]);if(error)throw error;const{error:dbError}=await supabase.from("vmc_member_photos").delete().eq("id",row.id).eq("member_id",userId);if(dbError)throw dbError;if(row.is_profile_photo){await supabase.from("vmc_profiles").update({avatar_url:null}).eq("id",userId)}close();await refresh()}catch(e){alert(e.message||"Could not delete this photo.")}finally{deleteButton.disabled=false}};
  modal.onclick=e=>{if(e.target===modal)close()};
}
async function countRows(t){const{count,error}=await supabase.from(t).select("*",{count:"exact",head:true});if(error)throw error;return count??0}
async function loadManagementOverview(){const[m,p,a]=await Promise.all([countRows("vmc_profiles"),countRows("vmc_payments"),countRows("vmc_attendance")]);$("[data-member-count]")?.replaceChildren(document.createTextNode(String(m)));$("[data-payment-count]")?.replaceChildren(document.createTextNode(String(p)));$("[data-attendance-count]")?.replaceChildren(document.createTextNode(String(a)))}
document.querySelectorAll("[data-sign-out]").forEach(b=>b.addEventListener("click",async()=>{await supabase.auth.signOut();location.href=loginPath}));
loadPortal().catch(async e=>{console.error("VMC portal load failed:",e);await supabase.auth.signOut();location.href=loginPath});

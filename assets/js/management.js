import { createClient } from "https://unpkg.com/@supabase/supabase-js@2.116.0/+esm";
import { VMC_CONFIG } from "./config.js";

const supabase = createClient(VMC_CONFIG.supabaseUrl, VMC_CONFIG.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const apiUrl = `${VMC_CONFIG.supabaseUrl}/functions/v1/vmc-management-api-v2`;
const $ = (s) => document.querySelector(s);
const page = document.body.dataset.managementPage || "members";

const esc = (v) => String(v ?? "");
const money = (v) => v == null ? "—" : "K" + Number(v).toLocaleString("en-MW");
const date = (v) => {
  if (!v) return "—";
  const d = new Date(String(v).length === 10 ? v + "T00:00:00" : v);
  return Number.isNaN(d.getTime()) ? String(v) : new Intl.DateTimeFormat("en-MW", { day:"numeric", month:"short", year:"numeric" }).format(d);
};
const dateTime = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : new Intl.DateTimeFormat("en-MW", { day:"numeric", month:"short", year:"numeric", hour:"numeric", minute:"2-digit" }).format(d);
};
const initials = (name) => String(name || "V").trim().split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join("").toUpperCase() || "V";

async function request(action, payload = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Your management session has expired. Please sign in again.");
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type":"application/json", Authorization:"Bearer " + token, apikey:VMC_CONFIG.supabasePublishableKey },
    body: JSON.stringify({ action, ...payload })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Management request failed.");
  return body;
}

function notice(message, error = false) {
  const el = $("[data-management-notice]");
  if (!el) return;
  el.textContent = message;
  el.dataset.state = error ? "error" : "success";
  el.hidden = !message;
}

function button(label, className = "management-action") {
  const b = document.createElement("button");
  b.type = "button"; b.className = className; b.textContent = label;
  return b;
}

function renderRows(target, rows, emptyText, renderer) {
  if (!target) return;
  target.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "management-empty";
    empty.textContent = emptyText;
    target.append(empty);
    return;
  }
  rows.forEach(row => target.append(renderer(row)));
}

async function loadMembers() {
  const data = await request("members");
  const rows = data.members || [];
  const target = $("[data-members-list]");
  const search = $("[data-member-search]");
  const render = () => {
    const q = String(search?.value || "").trim().toLowerCase();
    const filtered = rows.filter(r => !q || [r.full_name,r.username,r.phone,r.email].some(v => String(v || "").toLowerCase().includes(q)));
    renderRows(target, filtered, "No member accounts match this search.", memberRow);
    const count = $("[data-members-count]");
    if (count) count.textContent = filtered.length + " member" + (filtered.length === 1 ? "" : "s");
  };
  search?.addEventListener("input", render);
  render();
}

function memberRow(row) {
  const item = document.createElement("article");
  item.className = "management-record";
  const avatar = document.createElement("div"); avatar.className = "management-avatar"; avatar.textContent = initials(row.full_name);
  const body = document.createElement("div"); body.className = "management-record-main";
  const h = document.createElement("h3"); h.textContent = row.full_name;
  const meta = document.createElement("p"); meta.textContent = [row.username || "No username", row.phone || row.email || "No contact"].join(" · ");
  const detail = document.createElement("p"); detail.className = "management-record-detail";
  const m = row.membership;
  detail.textContent = m ? `${m.plan?.name || "Membership"} · ${m.training_mode || "No training mode"} · ${String(m.status || "").toUpperCase()} · ends ${date(m.end_date)}` : "No membership recorded";
  body.append(h, meta, detail);
  const actions = document.createElement("div"); actions.className = "management-record-actions";
  const status = button(row.account_status === "active" ? "Suspend" : "Activate");
  status.onclick = async () => {
    status.disabled = true;
    try {
      await request("set_account_status", { user_id:row.id, status:row.account_status === "active" ? "suspended" : "active" });
      notice("Member status updated.");
      await loadMembers();
    } catch (e) { notice(e.message, true); status.disabled = false; }
  };
  const del = button("Delete", "management-action is-danger");
  del.onclick = async () => {
    if (!confirm(`Delete ${row.full_name}'s VMC account? This cannot be undone.`)) return;
    del.disabled = true;
    try { await request("delete_account", { user_id:row.id }); notice("Member account deleted."); await loadMembers(); }
    catch (e) { notice(e.message, true); del.disabled = false; }
  };
  actions.append(status, del);
  item.append(avatar, body, actions);
  return item;
}

async function loadPayments() {
  const data = await request("payments");
  const rows = data.payments || [];
  const target = $("[data-payments-list]");
  const filter = $("[data-payment-filter]");
  const render = () => {
    const value = filter?.value || "all";
    const filtered = value === "all" ? rows : rows.filter(r => r.status === value);
    renderRows(target, filtered, "No payments match this filter.", paymentRow);
    const count = $("[data-payments-count]"); if (count) count.textContent = filtered.length + " payment" + (filtered.length === 1 ? "" : "s");
  };
  filter?.addEventListener("change", render);
  render();
}

function paymentRow(row) {
  const item = document.createElement("article"); item.className = "management-record";
  const body = document.createElement("div"); body.className = "management-record-main";
  const h = document.createElement("h3"); h.textContent = row.member_name || "Unknown member";
  const meta = document.createElement("p"); meta.textContent = `${money(row.amount)} · ${row.payment_method} · ${dateTime(row.payment_date)}`;
  const detail = document.createElement("p"); detail.className = "management-record-detail";
  detail.textContent = `${row.receipt_reference || "No reference"} · ${row.membership?.plan?.name || "Membership"} · ${String(row.status).toUpperCase()}`;
  body.append(h,meta,detail);
  const actions = document.createElement("div"); actions.className = "management-record-actions";
  if (row.status === "pending") {
    const verify = button("Verify","management-action is-verify");
    const reject = button("Reject","management-action is-danger");
    const run = async (action, b) => {
      verify.disabled = true; reject.disabled = true; b.textContent = action === "verify_payment" ? "Verifying…" : "Rejecting…";
      try { await request(action,{payment_id:row.id}); notice(action === "verify_payment" ? "Payment verified and membership activated." : "Payment rejected."); await loadPayments(); }
      catch(e){ notice(e.message,true); verify.disabled=false; reject.disabled=false; b.textContent=action === "verify_payment" ? "Verify" : "Reject"; }
    };
    verify.onclick=()=>run("verify_payment",verify); reject.onclick=()=>run("reject_payment",reject); actions.append(verify,reject);
  }
  item.append(body,actions); return item;
}

async function loadAttendance() {
  const data = await request("attendance");
  const rows = data.attendance || [];
  const target = $("[data-attendance-list]");
  renderRows(target, rows, "No attendance records have been recorded yet.", attendanceRow);
  const select = $("[data-checkin-member]");
  if (select) {
    select.replaceChildren();
    (data.members || []).forEach(m => {
      const o = document.createElement("option"); o.value=m.id; o.textContent=m.full_name; select.append(o);
    });
  }
  $("[data-attendance-count]")?.replaceChildren(document.createTextNode(String(rows.length)));
}

function attendanceRow(row) {
  const item=document.createElement("article"); item.className="management-record";
  const body=document.createElement("div"); body.className="management-record-main";
  const h=document.createElement("h3"); h.textContent=row.member_name || "Unknown member";
  const meta=document.createElement("p"); meta.textContent=`${dateTime(row.checked_in_at)} · ${row.checked_out_at ? "Checked out " + dateTime(row.checked_out_at) : "Currently checked in"}`;
  const detail=document.createElement("p"); detail.className="management-record-detail"; detail.textContent=row.recorded_by_name ? "Recorded by " + row.recorded_by_name : "VMC staff";
  body.append(h,meta,detail);
  const actions=document.createElement("div"); actions.className="management-record-actions";
  if(!row.checked_out_at){ const out=button("Check out"); out.onclick=async()=>{out.disabled=true;try{await request("check_out",{attendance_id:row.id});notice("Member checked out.");await loadAttendance()}catch(e){notice(e.message,true);out.disabled=false}};actions.append(out); }
  item.append(body,actions); return item;
}

async function bindCheckIn() {
  const form=$("[data-checkin-form]"); if(!form)return;
  form.addEventListener("submit",async e=>{
    e.preventDefault(); const memberId=form.querySelector("[name=member_id]")?.value; if(!memberId)return;
    const b=form.querySelector("[type=submit]"); b.disabled=true;
    try{await request("check_in",{member_id:memberId});notice("Member checked in.");form.reset();await loadAttendance()}catch(err){notice(err.message,true)}finally{b.disabled=false}
  });
}

async function loadReports() {
  const data=await request("reports");
  const stats=data.stats||{};
  const map={totalMembers:"report-members",activeMembers:"report-active",pendingPayments:"report-pending",verifiedRevenue:"report-revenue",totalVisits:"report-visits"};
  Object.entries(map).forEach(([key,id])=>{const el=document.getElementById(id);if(el)el.textContent=key==="verifiedRevenue"?money(stats[key]||0):String(stats[key]??0)});
  const target=$("[data-report-months]");
  renderRows(target,data.months||[],"No reporting data yet.",m=>{const row=document.createElement("div");row.className="management-list-row";const strong=document.createElement("strong");strong.textContent=m.month;const span=document.createElement("span");span.textContent=`${m.visits} visits · ${money(m.revenue)} verified revenue`;row.append(strong,span);return row});
}

async function loadStaff() {
  const data=await request("staff");
  const rows=data.staff||[];
  const target=$("[data-staff-list]");
  renderRows(target,rows,"No management accounts found.",staffRow);
  const form=$("[data-staff-form]");
  if(form && data.role === "owner"){
    form.hidden=false;
    form.querySelector("[name=role]")?.addEventListener("change",()=>{});
    form.onsubmit=async e=>{
      e.preventDefault(); const fd=new FormData(form); const b=form.querySelector("[type=submit]"); b.disabled=true;
      try{const created=await request("create_management_user",{full_name:fd.get("full_name"),email:fd.get("email"),phone:fd.get("phone"),role:fd.get("role")});notice(`Account created. Temporary password: ${created.temporary_password}`);form.reset();await loadStaff()}catch(err){notice(err.message,true)}finally{b.disabled=false}
    };
  }
}

function staffRow(row){
  const item=document.createElement("article");item.className="management-record";
  const avatar=document.createElement("div");avatar.className="management-avatar";avatar.textContent=initials(row.full_name);
  const body=document.createElement("div");body.className="management-record-main";const h=document.createElement("h3");h.textContent=row.full_name;const p=document.createElement("p");p.textContent=`${row.username||"No username"} · ${String(row.role).toUpperCase()}`;body.append(h,p);
  const actions=document.createElement("div");actions.className="management-record-actions";
  if(row.role !== "owner"){const del=button("Delete","management-action is-danger");del.onclick=async()=>{if(!confirm(`Delete ${row.full_name}'s management account?`))return;del.disabled=true;try{await request("delete_account",{user_id:row.id});notice("Management account deleted.");await loadStaff()}catch(e){notice(e.message,true);del.disabled=false}};actions.append(del)}
  item.append(avatar,body,actions);return item;
}

async function loadSettings() {
  const {data}=await supabase.auth.getUser(); const user=data?.user;
  if(!user)return;
  const {data:profile}=await supabase.from("vmc_profiles").select("full_name,username,email,phone").eq("id",user.id).single();
  if(!profile)return;
  Object.entries({name:profile.full_name,username:profile.username,email:profile.email,phone:profile.phone}).forEach(([key,value])=>{const el=$(`[data-setting-${key}]`);if(el)el.textContent=value||"—"});
}

async function init(){
  try{
    if(page==="members")await loadMembers();
    else if(page==="payments")await loadPayments();
    else if(page==="attendance"){await loadAttendance();await bindCheckIn();}
    else if(page==="reports")await loadReports();
    else if(page==="staff")await loadStaff();
    else if(page==="settings")await loadSettings();
  }catch(e){notice(e.message || "Management data could not be loaded.",true);}
}
init();

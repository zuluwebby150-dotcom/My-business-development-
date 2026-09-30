/* ZENTA BUSINESS
   Rebuilt as a single-page application.
   Important design rule: navigation never changes the URL and never loads
   another HTML page. This prevents the old black/blank-page problem.
*/

let auth, db, confirmationResult = null, recaptchaVerifier = null;
let currentUser = null;
let currentPage = "dashboard";
let state = {
  business: { name: "My Business", phone: "", address: "", currency: "ZMW" },
  sales: [], expenses: [], stock: [], customers: [], invoices: []
};

const $ = id => document.getElementById(id);
const money = n => `K ${Number(n || 0).toLocaleString("en-ZM", {minimumFractionDigits:2, maximumFractionDigits:2})}`;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

function showToast(msg, type="ok") {
  const el = $("toast");
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => el.className = "toast", 2800);
}
function setAuthError(msg) { $("authError").textContent = msg || ""; }
function today() { return new Date().toISOString().slice(0,10); }

function initFirebase() {
  if (!window.firebase) throw new Error("Firebase SDK did not load.");
  const cfg = window.ZENTA_FIREBASE_CONFIG || {};
  if (!cfg.apiKey || cfg.apiKey.startsWith("PASTE_")) {
    setAuthError("Firebase configuration is not filled in firebase-config.js.");
    return false;
  }
  if (!firebase.apps.length) firebase.initializeApp(cfg);
  auth = firebase.auth();
  db = firebase.firestore();

  auth.onAuthStateChanged(async user => {
    currentUser = user;
    if (user) {
      $("authScreen").classList.add("hidden");
      $("appScreen").classList.remove("hidden");
      await loadData();
      renderPage("dashboard");
    } else {
      $("authScreen").classList.remove("hidden");
      $("appScreen").classList.add("hidden");
    }
  });
  return true;
}

function setupRecaptcha() {
  if (recaptchaVerifier) return;
  recaptchaVerifier = new firebase.auth.RecaptchaVerifier("recaptcha-container", {
    size: "normal",
    callback: () => {}
  });
  recaptchaVerifier.render().catch(() => {});
}

async function sendOtp() {
  setAuthError("");
  if (!auth) return setAuthError("Firebase is not configured yet.");
  let phone = $("phoneInput").value.replace(/\s+/g,"").trim();
  if (!phone) return setAuthError("Enter your phone number.");
  if (!phone.startsWith("+")) phone = "+260" + phone.replace(/^0+/, "");
  if (!/^\+\d{8,15}$/.test(phone)) return setAuthError("Enter a valid phone number.");

  try {
    setupRecaptcha();
    $("sendOtpBtn").disabled = true;
    confirmationResult = await auth.signInWithPhoneNumber(phone, recaptchaVerifier);
    $("phoneStep").classList.add("hidden");
    $("otpStep").classList.remove("hidden");
    showToast("OTP sent.");
  } catch (e) {
    console.error(e);
    setAuthError(e.message || "Could not send OTP.");
    $("sendOtpBtn").disabled = false;
    if (recaptchaVerifier) {
      try { recaptchaVerifier.clear(); } catch (_) {}
      recaptchaVerifier = null;
    }
  }
}

async function verifyOtp() {
  setAuthError("");
  const code = $("otpInput").value.trim();
  if (!confirmationResult) return setAuthError("Please request a new OTP.");
  if (!/^\d{6}$/.test(code)) return setAuthError("Enter the 6-digit OTP.");
  try {
    $("verifyOtpBtn").disabled = true;
    await confirmationResult.confirm(code);
    showToast("Login successful.");
  } catch (e) {
    console.error(e);
    setAuthError(e.message || "Invalid OTP.");
    $("verifyOtpBtn").disabled = false;
  }
}

function userRef() {
  return db.collection("users").doc(currentUser.uid);
}
async function loadData() {
  const snap = await userRef().get();
  if (snap.exists) {
    const d = snap.data();
    state = {
      business: { ...state.business, ...(d.business || {}) },
      sales: d.sales || [], expenses: d.expenses || [], stock: d.stock || [],
      customers: d.customers || [], invoices: d.invoices || []
    };
  } else {
    await saveData();
  }
  $("businessBadge").textContent = state.business.name || "My Business";
}
async function saveData() {
  if (!currentUser) return;
  await userRef().set({
    business: state.business, sales: state.sales, expenses: state.expenses,
    stock: state.stock, customers: state.customers, invoices: state.invoices,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, {merge:true});
}

function totals() {
  const sales = state.sales.reduce((a,x) => a + Number(x.amount||0), 0);
  const expenses = state.expenses.reduce((a,x) => a + Number(x.amount||0), 0);
  const debts = state.customers.reduce((a,x) => a + Math.max(0, Number(x.amount||0)-Number(x.paid||0)), 0);
  const stockValue = state.stock.reduce((a,x) => a + Number(x.qty||0)*Number(x.price||0), 0);
  return {sales, expenses, profit:sales-expenses, debts, stockValue};
}

const templates = {
  dashboard() {
    const t = totals();
    return `
      <div class="hero">
        <div><span class="muted">Welcome back</span><h1>${esc(state.business.name || "My Business")}</h1><p class="muted">Your business at a glance.</p></div>
        <button class="primary" onclick="openModal('sale')">＋ Record Sale</button>
      </div>
      <div class="cards">
        <div class="card metric"><span>Total Sales</span><strong>${money(t.sales)}</strong><small>${state.sales.length} transactions</small></div>
        <div class="card metric"><span>Expenses</span><strong>${money(t.expenses)}</strong><small>${state.expenses.length} records</small></div>
        <div class="card metric"><span>Net Cash Result</span><strong>${money(t.profit)}</strong><small>Sales minus expenses</small></div>
        <div class="card metric"><span>Nkongole</span><strong>${money(t.debts)}</strong><small>Outstanding customer debt</small></div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="section-head"><h3>Quick actions</h3></div>
          <div class="quick-grid">
            <button onclick="openModal('sale')">＋ Sale</button>
            <button onclick="openModal('expense')">− Expense</button>
            <button onclick="openModal('stock')">＋ Stock</button>
            <button onclick="openModal('customer')">♙ Nkongole</button>
            <button onclick="openModal('invoice')">▧ Invoice</button>
            <button onclick="renderPage('reports')">◫ Reports</button>
          </div>
        </div>
        <div class="card"><div class="section-head"><h3>Recent activity</h3><button class="link" onclick="renderPage('reports')">View all</button></div>
          ${recentActivity()}
        </div>
      </div>`;
  },
  sales() {
    return pageTable("Sales", "Record every sale and track income.", "sale",
      ["Date","Description","Customer","Amount"],
      state.sales.map(x => [x.date,x.description,x.customer||"-",money(x.amount)]),
      "No sales recorded yet.");
  },
  expenses() {
    return pageTable("Expenses", "Track business spending.", "expense",
      ["Date","Description","Category","Amount"],
      state.expenses.map(x => [x.date,x.description,x.category||"-",money(x.amount)]),
      "No expenses recorded yet.");
  },
  stock() {
    return pageTable("Stock", "Manage products and stock levels.", "stock",
      ["Product","Quantity","Cost","Selling price","Stock value"],
      state.stock.map(x => [x.name,x.qty,money(x.cost),money(x.price),money(Number(x.qty||0)*Number(x.price||0))]),
      "No stock items yet.");
  },
  customers() {
    return pageTable("Customers / Nkongole", "Track customers who owe you and their payments.", "customer",
      ["Customer","Phone","Owed","Paid","Outstanding"],
      state.customers.map(x => [x.name,x.phone||"-",money(x.amount),money(x.paid),money(Math.max(0,Number(x.amount||0)-Number(x.paid||0)))]),
      "No customer debt records yet.");
  },
  invoices() {
    return pageTable("Invoices", "Create and manage invoices.", "invoice",
      ["Invoice","Date","Customer","Description","Amount","Status"],
      state.invoices.map(x => [x.number,x.date,x.customer,x.description,money(x.amount),x.status||"Unpaid"]),
      "No invoices yet.");
  },
  reports() {
    const t = totals();
    const months = {};
    [...state.sales.map(x=>({...x,type:"Sale"})),...state.expenses.map(x=>({...x,type:"Expense"}))].forEach(x=>{
      const m=(x.date||today()).slice(0,7);
      months[m] ||= {sales:0,expenses:0};
      months[m][x.type==="Sale"?"sales":"expenses"] += Number(x.amount||0);
    });
    const rows = Object.entries(months).sort().reverse().map(([m,v])=>`<tr><td>${m}</td><td>${money(v.sales)}</td><td>${money(v.expenses)}</td><td>${money(v.sales-v.expenses)}</td></tr>`).join("");
    return `<div class="hero"><div><span class="muted">Business intelligence</span><h1>Reports</h1><p class="muted">Summaries from your recorded transactions.</p></div></div>
      <div class="cards">
        <div class="card metric"><span>Sales</span><strong>${money(t.sales)}</strong></div>
        <div class="card metric"><span>Expenses</span><strong>${money(t.expenses)}</strong></div>
        <div class="card metric"><span>Net</span><strong>${money(t.profit)}</strong></div>
        <div class="card metric"><span>Stock Value</span><strong>${money(t.stockValue)}</strong></div>
      </div>
      <div class="card"><div class="section-head"><h3>Monthly summary</h3></div>
      <div class="table-wrap"><table><thead><tr><th>Month</th><th>Sales</th><th>Expenses</th><th>Net</th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="empty">No transactions yet.</td></tr>`}</tbody></table></div></div>`;
  },
  cashflow() {
    const events = [
      ...state.sales.map(x=>({...x, flow:"Money in", sign:"in"})),
      ...state.expenses.map(x=>({...x, flow:"Money out", sign:"out"}))
    ].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    let balance = 0;
    const reversed = [...events].reverse().map(x=>{ balance += x.sign==="in"?Number(x.amount||0):-Number(x.amount||0); return {...x,balance}; }).reverse();
    const rows = reversed.map(x=>`<tr><td>${x.date}</td><td>${esc(x.description)}</td><td><span class="pill ${x.sign}">${x.flow}</span></td><td>${money(x.amount)}</td><td>${money(x.balance)}</td></tr>`).join("");
    return `<div class="hero"><div><span class="muted">Money movement</span><h1>Cash Flow</h1><p class="muted">See money coming into and leaving the business.</p></div></div>
      <div class="cards"><div class="card metric"><span>Money In</span><strong>${money(totals().sales)}</strong></div><div class="card metric"><span>Money Out</span><strong>${money(totals().expenses)}</strong></div><div class="card metric"><span>Net Movement</span><strong>${money(totals().profit)}</strong></div></div>
      <div class="card"><div class="section-head"><h3>Cash-flow ledger</h3></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Amount</th><th>Running balance</th></tr></thead><tbody>${rows || `<tr><td colspan="5" class="empty">No cash-flow records yet.</td></tr>`}</tbody></table></div></div>`;
  },
  settings() {
    return `<div class="hero"><div><span class="muted">Configuration</span><h1>Settings</h1><p class="muted">Keep your business information up to date.</p></div></div>
      <div class="card form-card"><h3>Business information</h3>
        <label>Business name</label><input id="setName" value="${esc(state.business.name)}">
        <label>Phone</label><input id="setPhone" value="${esc(state.business.phone)}">
        <label>Address</label><input id="setAddress" value="${esc(state.business.address)}">
        <label>Currency</label><input value="ZMW / Zambian Kwacha" disabled>
        <button class="primary" onclick="saveSettings()">Save changes</button>
      </div>
      <div class="card"><h3>Account</h3><p class="muted">${esc(currentUser?.phoneNumber || "")}</p><button class="danger" onclick="logout()">Sign out</button></div>`;
  }
};

function pageTable(title, subtitle, type, headers, rows, empty) {
  return `<div class="hero"><div><span class="muted">Business records</span><h1>${title}</h1><p class="muted">${subtitle}</p></div><button class="primary" onclick="openModal('${type}')">＋ Add</button></div>
    <div class="card"><div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}" class="empty">${empty}</td></tr>`}</tbody></table></div></div>`;
}

function recentActivity() {
  const all = [...state.sales.map(x=>({...x,type:"Sale",icon:"＋"})), ...state.expenses.map(x=>({...x,type:"Expense",icon:"−"}))]
    .sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5);
  if (!all.length) return `<div class="empty">Your recent sales and expenses will appear here.</div>`;
  return all.map(x=>`<div class="activity"><span class="activity-icon">${x.icon}</span><div><b>${esc(x.description)}</b><small>${x.date} · ${x.type}</small></div><strong>${money(x.amount)}</strong></div>`).join("");
}

function renderPage(page) {
  currentPage = page;
  const title = page.charAt(0).toUpperCase()+page.slice(1);
  $("pageTitle").textContent = title === "Customers" ? "Customers / Nkongole" : title;
  $("pageEyebrow").textContent = page === "dashboard" ? "Business overview" : "Zenta Business";
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active", b.dataset.page===page));
  $("pageContent").innerHTML = templates[page] ? templates[page]() : templates.dashboard();
  $("sidebar").classList.remove("open");
}

function modalHtml(type) {
  const common = {
    sale: `<label>Date</label><input id="mDate" type="date" value="${today()}"><label>Description</label><input id="mDesc" placeholder="e.g. Mobile money commission"><label>Customer</label><input id="mCustomer" placeholder="Optional"><label>Amount</label><input id="mAmount" type="number" min="0" step="0.01">`,
    expense: `<label>Date</label><input id="mDate" type="date" value="${today()}"><label>Description</label><input id="mDesc" placeholder="e.g. Transport"><label>Category</label><input id="mCategory" placeholder="e.g. Transport"><label>Amount</label><input id="mAmount" type="number" min="0" step="0.01">`,
    stock: `<label>Product</label><input id="mName" placeholder="Product name"><label>Quantity</label><input id="mQty" type="number" min="0"><label>Cost per item</label><input id="mCost" type="number" min="0" step="0.01"><label>Selling price</label><input id="mPrice" type="number" min="0" step="0.01">`,
    customer: `<label>Customer name</label><input id="mName" placeholder="Name"><label>Phone</label><input id="mPhone" placeholder="Phone"><label>Amount owed</label><input id="mAmount" type="number" min="0" step="0.01"><label>Payment received now</label><input id="mPaid" type="number" min="0" step="0.01" value="0">`,
    invoice: `<label>Invoice number</label><input id="mNumber" value="INV-${Date.now().toString().slice(-6)}"><label>Date</label><input id="mDate" type="date" value="${today()}"><label>Customer</label><input id="mCustomer" placeholder="Customer name"><label>Description</label><input id="mDesc" placeholder="What is being invoiced?"><label>Amount</label><input id="mAmount" type="number" min="0" step="0.01"><label>Status</label><select id="mStatus"><option>Unpaid</option><option>Paid</option><option>Partially paid</option></select>`
  };
  return `<div id="modalBackdrop" class="modal-backdrop"><div class="modal"><button class="modal-close" onclick="closeModal()">×</button><h2>Add ${type==="customer"?"Customer / Nkongole":type[0].toUpperCase()+type.slice(1)}</h2>${common[type]}<button class="primary full" onclick="submitModal('${type}')">Save record</button></div></div>`;
}

function openModal(type) {
  $("appScreen").insertAdjacentHTML("beforeend", modalHtml(type));
}
function closeModal() { $("modalBackdrop")?.remove(); }

async function submitModal(type) {
  const val = id => $(id)?.value?.trim() || "";
  if (type==="sale") {
    const amount=Number(val("mAmount")); if(!val("mDesc")||amount<=0) return showToast("Enter a description and amount.","error");
    state.sales.push({id:uid(),date:val("mDate"),description:val("mDesc"),customer:val("mCustomer"),amount});
  } else if (type==="expense") {
    const amount=Number(val("mAmount")); if(!val("mDesc")||amount<=0) return showToast("Enter a description and amount.","error");
    state.expenses.push({id:uid(),date:val("mDate"),description:val("mDesc"),category:val("mCategory"),amount});
  } else if (type==="stock") {
    const qty=Number(val("mQty")), price=Number(val("mPrice")); if(!val("mName")||qty<0||price<0) return showToast("Complete the stock details.","error");
    state.stock.push({id:uid(),name:val("mName"),qty,cost:Number(val("mCost")),price});
  } else if (type==="customer") {
    const amount=Number(val("mAmount")), paid=Number(val("mPaid")); if(!val("mName")||amount<0) return showToast("Enter customer details.","error");
    state.customers.push({id:uid(),name:val("mName"),phone:val("mPhone"),amount,paid});
  } else if (type==="invoice") {
    const amount=Number(val("mAmount")); if(!val("mCustomer")||amount<=0) return showToast("Complete the invoice.","error");
    state.invoices.push({id:uid(),number:val("mNumber"),date:val("mDate"),customer:val("mCustomer"),description:val("mDesc"),amount,status:val("mStatus")});
  }
  try { await saveData(); closeModal(); renderPage(currentPage); showToast("Saved successfully."); }
  catch(e) { console.error(e); showToast("Saved locally in this session, but cloud save failed.","error"); }
}

async function saveSettings() {
  state.business.name = $("setName").value.trim() || "My Business";
  state.business.phone = $("setPhone").value.trim();
  state.business.address = $("setAddress").value.trim();
  await saveData();
  $("businessBadge").textContent = state.business.name;
  showToast("Business information updated.");
  renderPage("settings");
}

async function logout() {
  if (auth) await auth.signOut();
  location.reload();
}

document.addEventListener("DOMContentLoaded", () => {
  $("sendOtpBtn").addEventListener("click", sendOtp);
  $("verifyOtpBtn").addEventListener("click", verifyOtp);
  $("backPhoneBtn").addEventListener("click", () => {
    $("otpStep").classList.add("hidden"); $("phoneStep").classList.remove("hidden"); setAuthError("");
  });
  $("logoutBtn").addEventListener("click", logout);
  $("menuBtn").addEventListener("click", () => $("sidebar").classList.toggle("open"));
  document.querySelectorAll(".nav-item").forEach(b => b.addEventListener("click", () => renderPage(b.dataset.page)));
  $("phoneInput").addEventListener("keydown", e => { if(e.key==="Enter") sendOtp(); });
  $("otpInput").addEventListener("keydown", e => { if(e.key==="Enter") verifyOtp(); });
  try { initFirebase(); } catch(e) { console.error(e); setAuthError(e.message); }
});

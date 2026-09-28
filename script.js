// ======================
// FIREBASE CONFIG
// ======================
const firebaseConfig = {
  apiKey: "AIzaSyDMraLmuAsI3Nm_IyE0tHD6sgTJLrjbjVA",
  authDomain: "zenta-business.firebaseapp.com",
  projectId: "zenta-business",
  storageBucket: "zenta-business.firebasestorage.app",
  messagingSenderId: "357741602171",
  appId: "1:357741602171:web:8b7d14770fd3c16a7109de"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ======================
// APP STATE
// ======================
const STORAGE_KEY = "zenta_business_data";

let data = {
  businessName: "My Business",
  sales: [],
  expenses: [],
  stock: [],
  customers: [],
  invoices: []
};

let currentFormType = "";
let payDebtIndex = -1;
let currentUser = null;
let currentBusinessId = null;
let confirmationResult = null;

// ======================
// HELPERS
// ======================
function money(amount) {
  return "K " + Number(amount || 0).toFixed(2);
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(function () {
    toast.classList.remove("show");
  }, 2500);
}

function setGreeting() {
  const el = document.getElementById("greeting");
  if (!el) return;
  const hour = new Date().getHours();
  let text = "Good day";
  if (hour < 12) text = "Good morning";
  else if (hour < 17) text = "Good afternoon";
  else text = "Good evening";
  el.textContent = text;
}

// ======================
// AUTH & LOGIN
// ======================
auth.onAuthStateChanged(async function (user) {
  if (user) {
    currentUser = user;
    await loadOrCreateBusiness(user);
    showApp();
  } else {
    showLogin();
  }
});

function showLogin() {
  document.getElementById("login").classList.add("active");
  document.getElementById("mainHeader").style.display = "none";
  document.getElementById("mainContent").style.display = "none";
  document.getElementById("bottomNav").style.display = "none";
}

function showApp() {
  document.getElementById("login").classList.remove("active");
  document.getElementById("mainHeader").style.display = "block";
  document.getElementById("mainContent").style.display = "block";
  document.getElementById("bottomNav").style.display = "grid";
  loadData();
  render();
  showPage("dashboard");
}

async function loadOrCreateBusiness(user) {
  try {
    const userRef = db.collection("users").doc(user.uid);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      currentBusinessId = userDoc.data().businessId;
      // Load business name
      const bizDoc = await db.collection("businesses").doc(currentBusinessId).get();
      if (bizDoc.exists) {
        data.businessName = bizDoc.data().name || "My Business";
      }
    } else {
      // First time user → create business
      const businessRef = db.collection("businesses").doc();
      const trialEnds = new Date();
      trialEnds.setDate(trialEnds.getDate() + 14);

      await businessRef.set({
        name: "My Business",
        ownerId: user.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        trialEndsAt: trialEnds,
        plan: "trial",
        planExpiresAt: null
      });

      await userRef.set({
        phone: user.phoneNumber,
        businessId: businessRef.id,
        role: "owner",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      currentBusinessId = businessRef.id;
      showToast("Welcome! Your 14-day free trial has started.");
    }
  } catch (err) {
    console.error("Error loading business:", err);
    showToast("Error connecting to cloud. Using offline mode.");
  }
}

// Send OTP
document.addEventListener("DOMContentLoaded", function () {
  const sendBtn = document.getElementById("sendOtpBtn");
  const verifyBtn = document.getElementById("verifyOtpBtn");
  const backBtn = document.getElementById("backToPhone");
  const logoutBtn = document.getElementById("logoutBtn");

  if (sendBtn) {
    sendBtn.addEventListener("click", async function () {
      const phoneInput = document.getElementById("loginPhone").value.trim();
      const errorEl = document.getElementById("loginError");
      errorEl.style.display = "none";

      if (!phoneInput) {
        errorEl.textContent = "Please enter your phone number";
        errorEl.style.display = "block";
        return;
      }

      let phone = phoneInput.replace(/\D/g, "");
      if (phone.startsWith("0")) phone = "260" + phone.substring(1);
      if (!phone.startsWith("260")) phone = "260" + phone;
      phone = "+" + phone;

      try {
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier("recaptcha-container", {
          size: "invisible"
        });

        confirmationResult = await auth.signInWithPhoneNumber(phone, window.recaptchaVerifier);

        document.getElementById("loginStep1").style.display = "none";
        document.getElementById("loginStep2").style.display = "block";
        showToast("OTP sent to " + phone);
      } catch (err) {
        console.error(err);
        errorEl.textContent = err.message || "Failed to send OTP. Try again.";
        errorEl.style.display = "block";
      }
    });
  }

  if (verifyBtn) {
    verifyBtn.addEventListener("click", async function () {
      const code = document.getElementById("loginOtp").value.trim();
      const errorEl = document.getElementById("loginError");
      errorEl.style.display = "none";

      if (!code || code.length < 6) {
        errorEl.textContent = "Enter the 6-digit code";
        errorEl.style.display = "block";
        return;
      }

      try {
        await confirmationResult.confirm(code);
        // onAuthStateChanged will handle the rest
      } catch (err) {
        errorEl.textContent = "Wrong code. Please try again.";
        errorEl.style.display = "block";
      }
    });
  }

  if (backBtn) {
    backBtn.addEventListener("click", function () {
      document.getElementById("loginStep1").style.display = "block";
      document.getElementById("loginStep2").style.display = "none";
      document.getElementById("loginOtp").value = "";
      document.getElementById("loginError").style.display = "none";
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      auth.signOut();
    });
  }
});

// ======================
// LOCAL DATA (temporary – will move to Firestore later)
// ======================
function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      data = Object.assign({}, data, parsed);
    }
  } catch (e) {
    console.warn("Could not load saved data", e);
  }
  data.sales = Array.isArray(data.sales) ? data.sales : [];
  data.expenses = Array.isArray(data.expenses) ? data.expenses : [];
  data.stock = Array.isArray(data.stock) ? data.stock : [];
  data.customers = Array.isArray(data.customers) ? data.customers : [];
  data.invoices = Array.isArray(data.invoices) ? data.invoices : [];
  data.businessName = data.businessName || "My Business";
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Could not save data", e);
  }
}

// ======================
// NAVIGATION
// ======================
function showPage(pageId) {
  document.querySelectorAll(".page").forEach(function (page) {
    if (page.id !== "login") page.classList.remove("active");
  });

  const page = document.getElementById(pageId);
  if (page) page.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(function (item) {
    item.classList.remove("active");
    if (item.getAttribute("data-page") === pageId) {
      item.classList.add("active");
    }
  });

  if (pageId === "dashboard") renderDashboard();
  else if (pageId === "sales") renderSales();
  else if (pageId === "expenses") renderExpenses();
  else if (pageId === "stock") renderStock();
  else if (pageId === "customers") renderCustomers();
  else if (pageId === "invoices") renderInvoices();
  else if (pageId === "reports") renderReports();
  else if (pageId === "cashflow") renderCashFlow();
  else if (pageId === "settings") loadSettings();
}

function openForm(type) {
  currentFormType = type;
  const title = document.getElementById("formTitle");
  const fields = document.getElementById("formFields");
  if (!title || !fields) return;

  if (type === "sale") {
    title.textContent = "Record Sale";
    let stockOptions = '<option value="">— Select product (optional) —</option>';
    data.stock.forEach(function (item, i) {
      stockOptions += '<option value="' + i + '">' + escapeHtml(item.name) + " (qty: " + item.quantity + ")</option>";
    });
    fields.innerHTML =
      '<label for="saleStock">Product from stock</label>' +
      '<select id="saleStock">' + stockOptions + "</select>" +
      '<label for="saleDescription">Item / Description</label>' +
      '<input id="saleDescription" type="text" required placeholder="e.g. 2kg rice">' +
      '<label for="saleAmount">Amount</label>' +
      '<input id="saleAmount" type="number" step="0.01" min="0" required placeholder="0.00">' +
      '<label for="saleQty">Quantity sold (for stock)</label>' +
      '<input id="saleQty" type="number" min="1" value="1" placeholder="1">' +
      '<label for="salePayment">Payment Method</label>' +
      '<select id="salePayment"><option>Cash</option><option>MTN MoMo</option><option>Airtel Money</option><option>Bank</option><option>Credit</option></select>' +
      '<label for="saleCustomer">Customer (optional)</label>' +
      '<input id="saleCustomer" type="text" placeholder="Customer name">';

    setTimeout(function () {
      const sel = document.getElementById("saleStock");
      if (!sel) return;
      sel.addEventListener("change", function () {
        const idx = sel.value;
        if (idx === "") return;
        const item = data.stock[Number(idx)];
        if (!item) return;
        const desc = document.getElementById("saleDescription");
        const amt = document.getElementById("saleAmount");
        if (desc) desc.value = item.name;
        if (amt) amt.value = item.selling || "";
      });
    }, 0);
  }

  if (type === "expense") {
    title.textContent = "Record Expense";
    fields.innerHTML =
      '<label for="expenseDescription">Description</label>' +
      '<input id="expenseDescription" type="text" required placeholder="e.g. Transport">' +
      '<label for="expenseAmount">Amount</label>' +
      '<input id="expenseAmount" type="number" step="0.01" min="0" required placeholder="0.00">' +
      '<label for="expensePayment">Payment Method</label>' +
      '<select id="expensePayment"><option>Cash</option><option>MTN MoMo</option><option>Airtel Money</option><option>Bank</option></select>';
  }

  if (type === "stock") {
    title.textContent = "Add Stock";
    fields.innerHTML =
      '<label for="stockName">Product Name</label>' +
      '<input id="stockName" type="text" required placeholder="e.g. Cooking oil">' +
      '<label for="stockQuantity">Quantity</label>' +
      '<input id="stockQuantity" type="number" min="0" required placeholder="0">' +
      '<label for="stockBuying">Buying Price</label>' +
      '<input id="stockBuying" type="number" step="0.01" min="0" required placeholder="0.00">' +
      '<label for="stockSelling">Selling Price</label>' +
      '<input id="stockSelling" type="number" step="0.01" min="0" required placeholder="0.00">' +
      '<label for="stockAlert">Low Stock Alert At</label>' +
      '<input id="stockAlert" type="number" min="0" value="5" required>';
  }

  if (type === "customer") {
    title.textContent = "Add Customer";
    fields.innerHTML =
      '<label for="customerName">Customer Name</label>' +
      '<input id="customerName" type="text" required placeholder="Full name">' +
      '<label for="customerPhone">Phone Number</label>' +
      '<input id="customerPhone" type="tel" placeholder="e.g. 097xxxxxxx">' +
      '<label for="customerDebt">Nkongole (debt)</label>' +
      '<input id="customerDebt" type="number" step="0.01" min="0" value="0">' +
      '<label for="customerNotes">Notes</label>' +
      '<textarea id="customerNotes" placeholder="Optional notes"></textarea>';
  }

  if (type === "invoice") {
    title.textContent = "Create Invoice";
    fields.innerHTML =
      '<label for="invoiceCustomer">Customer Name</label>' +
      '<input id="invoiceCustomer" type="text" required>' +
      '<label for="invoicePhone">Customer Phone</label>' +
      '<input id="invoicePhone" type="tel">' +
      '<label for="invoiceDescription">Item / Description</label>' +
      '<input id="invoiceDescription" type="text" required>' +
      '<label for="invoiceAmount">Amount</label>' +
      '<input id="invoiceAmount" type="number" step="0.01" min="0" required>';
  }

  showPage("formPage");
}

function submitForm(event) {
  event.preventDefault();

  if (currentFormType === "sale") {
    const description = (document.getElementById("saleDescription") || {}).value;
    const amount = Number((document.getElementById("saleAmount") || {}).value);
    const payment = (document.getElementById("salePayment") || {}).value;
    const customer = ((document.getElementById("saleCustomer") || {}).value || "").trim();
    const qty = Number((document.getElementById("saleQty") || {}).value) || 1;
    const stockIdx = (document.getElementById("saleStock") || {}).value;

    if (!description || !description.trim() || isNaN(amount) || amount < 0) {
      showToast("Please enter valid sale details");
      return;
    }

    data.sales.push({
      description: description.trim(),
      amount: amount,
      payment: payment,
      customer: customer,
      qty: qty,
      date: new Date().toISOString()
    });

    if (stockIdx !== "" && stockIdx != null) {
      const idx = Number(stockIdx);
      if (!isNaN(idx) && data.stock[idx]) {
        data.stock[idx].quantity = Math.max(0, Number(data.stock[idx].quantity) - qty);
      }
    } else {
      const match = data.stock.find(function (s) {
        return s.name.toLowerCase() === description.trim().toLowerCase();
      });
      if (match) match.quantity = Math.max(0, Number(match.quantity) - qty);
    }

    if (payment === "Credit" && customer) {
      const existing = data.customers.find(function (item) {
        return item.name.toLowerCase() === customer.toLowerCase();
      });
      if (existing) {
        existing.debt = Number(existing.debt || 0) + amount;
      } else {
        data.customers.push({
          name: customer,
          phone: "",
          debt: amount,
          notes: "Credit sale",
          date: new Date().toISOString()
        });
      }
    }
    showToast("Sale saved");
  }

  if (currentFormType === "expense") {
    const description = ((document.getElementById("expenseDescription") || {}).value || "").trim();
    const amount = Number((document.getElementById("expenseAmount") || {}).value);
    const payment = (document.getElementById("expensePayment") || {}).value;
    if (!description || isNaN(amount) || amount < 0) {
      showToast("Please enter valid expense details");
      return;
    }
    data.expenses.push({
      description: description,
      amount: amount,
      payment: payment,
      date: new Date().toISOString()
    });
    showToast("Expense saved");
  }

  if (currentFormType === "stock") {
    const name = ((document.getElementById("stockName") || {}).value || "").trim();
    const quantity = Number((document.getElementById("stockQuantity") || {}).value);
    const buying = Number((document.getElementById("stockBuying") || {}).value);
    const selling = Number((document.getElementById("stockSelling") || {}).value);
    const alertAt = Number((document.getElementById("stockAlert") || {}).value);
    if (!name || isNaN(quantity) || quantity < 0) {
      showToast("Please enter valid stock details");
      return;
    }
    const existing = data.stock.find(function (s) {
      return s.name.toLowerCase() === name.toLowerCase();
    });
    if (existing) {
      existing.quantity = Number(existing.quantity) + quantity;
      existing.buying = buying;
      existing.selling = selling;
      existing.alert = alertAt;
    } else {
      data.stock.push({
        name: name,
        quantity: quantity,
        buying: buying,
        selling: selling,
        alert: alertAt,
        date: new Date().toISOString()
      });
    }
    showToast("Stock saved");
  }

  if (currentFormType === "customer") {
    const name = ((document.getElementById("customerName") || {}).value || "").trim();
    const phone = ((document.getElementById("customerPhone") || {}).value || "").trim();
    const debt = Number((document.getElementById("customerDebt") || {}).value);
    const notes = ((document.getElementById("customerNotes") || {}).value || "").trim();
    if (!name) {
      showToast("Customer name is required");
      return;
    }
    data.customers.push({
      name: name,
      phone: phone,
      debt: isNaN(debt) ? 0 : debt,
      notes: notes,
      date: new Date().toISOString()
    });
    showToast("Customer saved");
  }

  if (currentFormType === "invoice") {
    const customer = ((document.getElementById("invoiceCustomer") || {}).value || "").trim();
    const phone = ((document.getElementById("invoicePhone") || {}).value || "").trim();
    const description = ((document.getElementById("invoiceDescription") || {}).value || "").trim();
    const amount = Number((document.getElementById("invoiceAmount") || {}).value);
    if (!customer || !description || isNaN(amount) || amount < 0) {
      showToast("Please fill all required invoice fields");
      return;
    }
    const number = "INV-" + new Date().getFullYear() + "-" + String(data.invoices.length + 1).padStart(4, "0");
    data.invoices.push({
      number: number,
      customer: customer,
      phone: phone,
      description: description,
      amount: amount,
      date: new Date().toISOString()
    });
    showToast("Invoice created");
  }

  saveData();
  render();
  showPage("dashboard");
}

function openPayDebt(index) {
  payDebtIndex = index;
  const customer = data.customers[index];
  if (!customer) return;
  const nameEl = document.getElementById("payDebtCustomerName");
  const currentEl = document.getElementById("payDebtCurrent");
  const amountEl = document.getElementById("payDebtAmount");
  if (nameEl) nameEl.textContent = customer.name;
  if (currentEl) currentEl.textContent = "Outstanding: " + money(customer.debt);
  if (amountEl) {
    amountEl.value = "";
    amountEl.max = Number(customer.debt) || undefined;
  }
  showPage("payDebtPage");
}

function submitPayDebt(event) {
  event.preventDefault();
  if (payDebtIndex < 0 || !data.customers[payDebtIndex]) {
    showToast("Customer not found");
    return;
  }
  const amount = Number((document.getElementById("payDebtAmount") || {}).value);
  const method = (document.getElementById("payDebtMethod") || {}).value || "Cash";
  const customer = data.customers[payDebtIndex];
  const currentDebt = Number(customer.debt || 0);
  if (isNaN(amount) || amount <= 0) {
    showToast("Enter a valid amount");
    return;
  }
  if (amount > currentDebt) {
    showToast("Amount cannot be more than outstanding debt");
    return;
  }
  customer.debt = Math.max(0, currentDebt - amount);
  data.sales.push({
    description: "Nkongole payment – " + customer.name,
    amount: amount,
    payment: me
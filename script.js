// ======================
// ZENTA BUSINESS
// Core app script - repaired
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

const BASE_STORAGE_KEY = "zenta_business_data";

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

function money(amount) {
  return "K " + Number(amount || 0).toFixed(2);
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(window.zentaToastTimer);
  window.zentaToastTimer = setTimeout(function () {
    toast.classList.remove("show");
  }, 2500);
}

function setGreeting() {
  const el = document.getElementById("greeting");
  if (!el) return;
  const hour = new Date().getHours();
  el.textContent =
    hour < 12 ? "Good morning" :
    hour < 17 ? "Good afternoon" : "Good evening";
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isToday(date) {
  const d = new Date(date);
  return !isNaN(d.getTime()) && d.getTime() >= todayStart();
}

function safeNumber(value) {
  const n = Number(value);
  return isFinite(n) ? n : 0;
}

function getCashSales() {
  return data.sales.filter(function (s) {
    return s.payment !== "Credit";
  });
}

function getCashReceived() {
  return getCashSales().reduce(function (sum, s) {
    return sum + safeNumber(s.amount);
  }, 0);
}

function getExpensesTotal() {
  return data.expenses.reduce(function (sum, e) {
    return sum + safeNumber(e.amount);
  }, 0);
}

function getSalesTotal() {
  return data.sales.reduce(function (sum, s) {
    return sum + safeNumber(s.amount);
  }, 0);
}

function getDebtTotal() {
  return data.customers.reduce(function (sum, c) {
    return sum + safeNumber(c.debt);
  }, 0);
}

function getCostOfGoods() {
  return data.sales.reduce(function (sum, s) {
    return sum + safeNumber(s.cost);
  }, 0);
}

function getProfit() {
  return getSalesTotal() - getCostOfGoods() - getExpensesTotal();
}

function getBalance() {
  return getCashReceived() - getExpensesTotal();
}

function normalizeData() {
  data = Object.assign({
    businessName: "My Business",
    sales: [],
    expenses: [],
    stock: [],
    customers: [],
    invoices: []
  }, data || {});

  ["sales", "expenses", "stock", "customers", "invoices"].forEach(function (key) {
    if (!Array.isArray(data[key])) data[key] = [];
  });

  data.businessName = data.businessName || "My Business";
}

function storageKey() {
  return BASE_STORAGE_KEY + (currentBusinessId ? "_" + currentBusinessId : "");
}

function loadData() {
  try {
    let saved = localStorage.getItem(storageKey());

    if (!saved && currentBusinessId) {
      const old = localStorage.getItem(BASE_STORAGE_KEY);
      if (old) {
        saved = old;
        localStorage.setItem(storageKey(), old);
      }
    }

    if (saved) data = Object.assign({}, data, JSON.parse(saved));
  } catch (error) {
    console.warn("Could not load saved data:", error);
  }

  normalizeData();
}

function saveData() {
  normalizeData();

  try {
    localStorage.setItem(storageKey(), JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("Could not save data:", error);
    showToast("Could not save data on this device");
    return false;
  }
}

// ======================
// AUTH
// ======================

function startAuthListener() {
  auth.onAuthStateChanged(async function (user) {
    if (user) {
      currentUser = user;
      await loadOrCreateBusiness(user);
      showApp();
    } else {
      currentUser = null;
      currentBusinessId = null;
      showLogin();
    }
  });
}

function showLogin() {
  const login = document.getElementById("login");
  const header = document.getElementById("mainHeader");
  const content = document.getElementById("mainContent");
  const nav = document.getElementById("bottomNav");

  if (login) login.classList.add("active");
  if (header) header.style.display = "none";
  if (content) content.style.display = "none";
  if (nav) nav.style.display = "none";
}

function showApp() {
  const login = document.getElementById("login");
  const header = document.getElementById("mainHeader");
  const content = document.getElementById("mainContent");
  const nav = document.getElementById("bottomNav");

  if (login) login.classList.remove("active");
  if (header) header.style.display = "block";
  if (content) content.style.display = "block";
  if (nav) nav.style.display = "grid";

  loadData();
  setGreeting();
  render();
  showPage("dashboard");
}

async function loadOrCreateBusiness(user) {
  try {
    const userRef = db.collection("users").doc(user.uid);
    const userDoc = await userRef.get();

    if (userDoc.exists && userDoc.data().businessId) {
      currentBusinessId = userDoc.data().businessId;

      const bizDoc = await db.collection("businesses").doc(currentBusinessId).get();

      if (bizDoc.exists) {
        data.businessName = bizDoc.data().name || "My Business";
      }

      return;
    }

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
      phone: user.phoneNumber || "",
      businessId: businessRef.id,
      role: "owner",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    currentBusinessId = businessRef.id;

    showToast("Welcome! Your 14-day free trial has started.");

  } catch (error) {
    console.error("Business setup error:", error);
    showToast("Cloud connection unavailable. Your local data will still work.");
  }
}

async function sendOtp() {
  const phoneInput =
    (document.getElementById("loginPhone") || {}).value || "";

  const errorEl = document.getElementById("loginError");

  if (errorEl) errorEl.style.display = "none";

  if (!phoneInput.trim()) {
    if (errorEl) {
      errorEl.textContent = "Please enter your phone number";
      errorEl.style.display = "block";
    }
    return;
  }

  let phone = phoneInput.replace(/\D/g, "");

  if (phone.startsWith("0")) {
    phone = "260" + phone.substring(1);
  }

  if (!phone.startsWith("260")) {
    phone = "260" + phone;
  }

  phone = "+" + phone;

  try {
    if (window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
      } catch (e) {}
    }

    window.recaptchaVerifier =
      new firebase.auth.RecaptchaVerifier(
        "recaptcha-container",
        {
          size: "invisible"
        }
      );

    confirmationResult =
      await auth.signInWithPhoneNumber(
        phone,
        window.recaptchaVerifier
      );

    const step1 = document.getElementById("loginStep1");
    const step2 = document.getElementById("loginStep2");

    if (step1) step1.style.display = "none";
    if (step2) step2.style.display = "block";

    showToast("OTP sent");

  } catch (error) {
    console.error(error);

    if (errorEl) {
      errorEl.textContent =
        error.message || "Failed to send OTP. Try again.";

      errorEl.style.display = "block";
    }
  }
}

async function verifyOtp() {
  const code =
    ((document.getElementById("loginOtp") || {}).value || "").trim();

  const errorEl = document.getElementById("loginError");

  if (!code || code.length < 6) {
    if (errorEl) {
      errorEl.textContent = "Enter the 6-digit code";
      errorEl.style.display = "block";
    }

    return;
  }

  if (!confirmationResult) {
    if (errorEl) {
      errorEl.textContent = "Please request a new OTP";
      errorEl.style.display = "block";
    }

    return;
  }

  try {
    await confirmationResult.confirm(code);

  } catch (error) {
    if (errorEl) {
      errorEl.textContent = "Wrong code. Please try again.";
      errorEl.style.display = "block";
    }
  }
}

// ======================
// NAVIGATION / BUTTONS
// ======================

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(function (page) {
    page.classList.remove("active");
    page.style.display = "none";
  });

  const page = document.getElementById(pageId);

  if (!page) {
    console.warn("Page not found:", pageId);
    return;
  }

  page.classList.add("active");
  page.style.display = "block";

  document.querySelectorAll(".nav-item").forEach(function (item) {
    item.classList.toggle(
      "active",
      item.getAttribute("data-page") === pageId
    );
  });

  if (pageId === "dashboard") renderDashboard();
  if (pageId === "sales") renderSales();
  if (pageId === "expenses") renderExpenses();
  if (pageId === "stock") renderStock();
  if (pageId === "customers") renderCustomers();
  if (pageId === "invoices") renderInvoices();
  if (pageId === "reports") renderReports();
  if (pageId === "cashflow") renderCashFlow();
  if (pageId === "settings") loadSettings();
}

function openForm(type) {
  currentFormType = type;

  const title = document.getElementById("formTitle");
  const fields = document.getElementById("formFields");

  if (!title || !fields) return;

  if (type === "sale") {
    title.textContent = "Record Sale";

    let options =
      '<option value="">— Select product (optional) —</option>';

    data.stock.forEach(function (item, i) {
      options +=
        '<option value="' + i + '">' +
        escapeHtml(item.name) +
        " (qty: " +
        safeNumber(item.quantity) +
        ")" +
        "</option>";
    });

    fields.innerHTML =
      '<label for="saleStock">Product from stock</label>' +
      '<select id="saleStock">' +
      options +
      '</select>' +

      '<label for="saleDescription">Item / Description</label>' +
      '<input id="saleDescription" type="text" required placeholder="e.g. 2kg rice">' +

      '<label for="saleAmount">Amount</label>' +
      '<input id="saleAmount" type="number" step="0.01" min="0" required placeholder="0.00">' +

      '<label for="saleQty">Quantity sold</label>' +
      '<input id="saleQty" type="number" min="1" value="1" required>' +

      '<label for="salePayment">Payment Method</label>' +
      '<select id="salePayment">' +
      '<option>Cash</option>' +
      '<option>MTN MoMo</option>' +
      '<option>Airtel Money</option>' +
      '<option>Bank</option>' +
      '<option>Credit</option>' +
      '</select>' +

      '<label for="saleCustomer">Customer (optional)</label>' +
      '<input id="saleCustomer" type="text" placeholder="Customer name">';

    const sel = document.getElementById("saleStock");

    if (sel) {
      sel.addEventListener("change", function () {
        const item = data.stock[Number(sel.value)];

        if (!item) return;

        const desc =
          document.getElementById("saleDescription");

        const amount =
          document.getElementById("saleAmount");

        if (desc) desc.value = item.name;
        if (amount) amount.value = safeNumber(item.selling);
      });
    }
  }

  if (type === "expense") {
    title.textContent = "Record Expense";

    fields.innerHTML =
      '<label for="expenseDescription">Description</label>' +
      '<input id="expenseDescription" type="text" required placeholder="e.g. Transport">' +

      '<label for="expenseAmount">Amount</label>' +
      '<input id="expenseAmount" type="number" step="0.01" min="0" required placeholder="0.00">' +

      '<label for="expensePayment">Payment Method</label>' +
      '<select id="expensePayment">' +
      '<option>Cash</option>' +
      '<option>MTN MoMo</option>' +
      '<option>Airtel Money</option>' +
      '<option>Bank</option>' +
      '</select>';
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

  const now = new Date().toISOString();

  if (currentFormType === "sale") {
    const description =
      ((document.getElementById("saleDescription") || {}).value || "").trim();

    const amount =
      safeNumber(
        (document.getElementById("saleAmount") || {}).value
      );

    const payment =
      (document.getElementById("salePayment") || {}).value || "Cash";

    const customer =
      ((document.getElementById("saleCustomer") || {}).value || "").trim();

    const qty =
      Math.max(
        1,
        safeNumber(
          (document.getElementById("saleQty") || {}).value
        )
      );

    const stockValue =
      (document.getElementById("saleStock") || {}).value;

    if (!description || amount <= 0) {
      showToast("Enter valid sale details");
      return;
    }

    let cost = 0;

    if (stockValue !== "") {
      const item = data.stock[Number(stockValue)];

      if (item) {
        cost = safeNumber(item.buying) * qty;
        item.quantity =
          Math.max(
            0,
            safeNumber(item.quantity) - qty
          );
      }

    } else {
      const item = data.stock.find(function (s) {
        return (
          String(s.name).toLowerCase() ===
          description.toLowerCase()
        );
      });

      if (item) {
        cost = safeNumber(item.buying) * qty;

        item.quantity =
          Math.max(
            0,
            safeNumber(item.quantity) - qty
          );
      }
    }

    data.sales.push({
      description: description,
      amount: amount,
      payment: payment,
      customer: customer,
      qty: qty,
      cost: cost,
      date: now
    });

    if (payment === "Credit" && customer) {
      let existing = data.customers.find(function (c) {
        return (
          String(c.name).toLowerCase() ===
          customer.toLowerCase()
        );
      });

      if (existing) {
        existing.debt =
          safeNumber(existing.debt) + amount;
      } else {
        data.customers.push({
          name: customer,
          phone: "",
          debt: amount,
          notes: "Credit sale",
          date: now
        });
      }
    }

    saveData();
    render();
    showToast("Sale saved");
    showPage("dashboard");
    return;
  }

  if (currentFormType === "expense") {
    const description =
      ((document.getElementById("expenseDescription") || {}).value || "").trim();

    const amount =
      safeNumber(
        (document.getElementById("expenseAmount") || {}).value
      );

    const payment =
      (document.getElementById("expensePayment") || {}).value || "Cash";

    if (!description || amount <= 0) {
      showToast("Enter valid expense details");
      return;
    }

    data.expenses.push({
      description: description,
      amount: amount,
      payment: payment,
      date: now
    });

    saveData();
    render();
    showToast("Expense saved");
    showPage("dashboard");
    return;
  }

  if (currentFormType === "stock") {
    const name =
      ((document.getElementById("stockName") || {}).value || "").trim();

    const quantity =
      safeNumber(
        (document.getElementById("stockQuantity") || {}).value
      );

    const buying =
      safeNumber(
        (document.getElementById("stockBuying") || {}).value
      );

    const selling =
      safeNumber(
        (document.getElementById("stockSelling") || {}).value
      );

    const alertAt =
      safeNumber(
        (document.getElementById("stockAlert") || {}).value
      );

    if (
      !name ||
      quantity < 0 ||
      buying < 0 ||
      selling < 0
    ) {
      showToast("Enter valid stock details");
      return;
    }

    const existing = data.stock.find(function (s) {
      return (
        String(s.name).toLowerCase() ===
        name.toLowerCase()
      );
    });

    if (existing) {
      existing.quantity =
        safeNumber(existing.quantity) + quantity;

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
        date: now
      });
    }

    saveData();
    render();
    showToast("Stock saved");
    showPage("dashboard");
    return;
  }

  if (currentFormType === "customer") {
    const name =
      ((document.getElementById("customerName") || {}).value || "").trim();

    const phone =
      ((document.getElementById("customerPhone") || {}).value || "").trim();

    const debt =
      Math.max(
        0,
        safeNumber(
          (document.getElementById("customerDebt") || {}).value
        )
      );

    const notes =
      ((document.getElementById("customerNotes") || {}).value || "").trim();

    if (!name) {
      showToast("Customer name is required");
      return;
    }

    data.customers.push({
      name: name,
      phone: phone,
      debt: debt,
      notes: notes,
      date: now
    });

    saveData();
    render();
    showToast("Customer saved");
    showPage("dashboard");
    return;
  }

  if (currentFormType === "invoice") {
    const customer =
      ((document.getElementById("invoiceCustomer") || {}).value || "").trim();

    const phone =
      ((document.getElementById("invoicePhone") || {}).value || "").trim();

    const description =
      ((document.getElementById("invoiceDescription") || {}).value || "").trim();

    const amount =
      safeNumber(
        (document.getElementById("invoiceAmount") || {}).value
      );

    if (!customer || !description || amount <= 0) {
      showToast("Fill all required invoice fields");
      return;
    }

    const number =
      "INV-" +
      new Date().getFullYear() +
      "-" +
      String(data.invoices.length + 1).padStart(4, "0");

    data.invoices.push({
      number: number,
      customer: customer,
      phone: phone,
      description: description,
      amount: amount,
      date: now
    });

    saveData();
    render();
    showToast("Invoice created");
    showPage("dashboard");
  }
}

// ======================
// NKONGOLE / DEBT
// ======================

function openPayDebt(index) {
  payDebtIndex = Number(index);

  const customer = data.customers[payDebtIndex];

  if (!customer) return;

  const nameEl =
    document.getElementById("payDebtCustomerName");

  const currentEl =
    document.getElementById("payDebtCurrent");

  const amountEl =
    document.getElementById("payDebtAmount");

  if (nameEl) {
    nameEl.textContent = customer.name;
  }

  if (currentEl) {
    currentEl.textContent =
      "Outstanding: " + money(customer.debt);
  }

  if (amountEl) {
    amountEl.value = "";
    amountEl.max = safeNumber(customer.debt);
  }

  showPage("payDebtPage");
}

function submitPayDebt(event) {
  event.preventDefault();

  if (
    payDebtIndex < 0 ||
    !data.customers[payDebtIndex]
  ) {
    showToast("Customer not found");
    return;
  }

  const amount =
    safeNumber(
      (document.getElementById("payDebtAmount") || {}).value
    );

  const method =
    (document.getElementById("payDebtMethod") || {}).value ||
    "Cash";

  const customer =
    data.customers[payDebtIndex];

  const currentDebt =
    safeNumber(customer.debt);

  if (amount <= 0) {
    showToast("Enter a valid amount");
    return;
  }

  if (amount > currentDebt) {
    showToast("Amount is more than the outstanding debt");
    return;
  }

  customer.debt =
    Math.max(0, currentDebt - amount);

  data.sales.push({
    description:
      "Nkongole payment - " + customer.name,

    amount: amount,
    payment: method,
    customer: customer.name,
    qty: 0,
    cost: 0,
    isDebtPayment: true,
    date: new Date().toISOString()
  });

  saveData();
  render();

  payDebtIndex = -1;

  showToast("Payment recorded");
  showPage("customers");
}

// ======================
// SETTINGS
// ======================

function loadSettings() {
  const input =
    document.getElementById("businessNameInput");

  if (input) {
    input.value =
      data.businessName || "My Business";
  }
}

function saveSettings() {
  const input =
    document.getElementById("businessNameInput");

  const name =
    input ? input.value.trim() : "";

  if (!name) {
    showToast("Enter a business name");
    return;
  }

  data.businessName = name;

  saveData();

  const headerName =
    document.getElementById("businessName");

  if (headerName) {
    headerName.textContent = name;
  }

  showToast("Business settings saved");
}

// ======================
// RENDERING
// ======================

function emptyState(icon, title, text) {
  return (
    '<div class="empty-state">' +
      '<div>' + icon + '</div>' +
      '<strong>' + escapeHtml(title) + '</strong>' +
      '<p>' + escapeHtml(text) + '</p>' +
    '</div>'
  );
}

function renderDashboard() {
  const businessName =
    document.getElementById("businessName");

  const balance =
    document.getElementById("balance");

  const todaySales =
    document.getElementById("todaySales");

  const todayExpenses =
    document.getElementById("todayExpenses");

  const totalDebt =
    document.getElementById("totalDebt");

  const lowStock =
    document.getElementById("lowStock");

  const activity =
    document.getElementById("recentActivity");

  if (businessName) {
    businessName.textContent =
      data.businessName;
  }

  if (balance) {
    balance.textContent =
      money(getBalance());
  }

  const salesToday =
    data.sales.filter(function (s) {
      return isToday(s.date);
    });

  const expensesToday =
    data.expenses.filter(function (e) {
      return isToday(e.date);
    });

  if (todaySales) {
    todaySales.textContent =
      money(
        salesToday.reduce(
          function (sum, s) {
            return sum + safeNumber(s.amount);
          },
          0
        )
      );
  }

  if (todayExpenses) {
    todayExpenses.textContent =
      money(
        expensesToday.reduce(
          function (sum, e) {
            return sum + safeNumber(e.amount);
          },
          0
        )
      );
  }

  if (totalDebt) {
    totalDebt.textContent =
      money(getDebtTotal());
  }

  const low =
    data.stock.filter(function (s) {
      return (
        safeNumber(s.quantity) <=
        safeNumber(s.alert)
      );
    });

  if (lowStock) {
    lowStock.textContent =
      String(low.length);
  }

  if (activity) {
    const items = [];

    data.sales.forEach(function (s) {
      items.push({
        type: "sale",
        date: s.date,
        title: s.description,
        amount: safeNumber(s.amount),
        payment: s.payment
      });
    });

    data.expenses.forEach(function (e) {
      items.push({
        type: "expense",
        date: e.date,
        title: e.description,
        amount: safeNumber(e.amount),
        payment: e.payment
      });
    });

    items.sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });

    const recent =
      items.slice(0, 5);

    activity.innerHTML =
      recent.length
        ? recent.map(function (item) {
            return (
              '<div class="list-item">' +

                '<div class="list-main">' +

                  '<strong>' +
                    escapeHtml(item.title) +
                  '</strong>' +

                  '<small>' +
                    escapeHtml(
                      formatDate(item.date)
                    ) +
                    ' · ' +
                    escapeHtml(
                      item.payment || ""
                    ) +
                  '</small>' +

              '</div>' +

                '<div class="list-amount ' +
                  (
                    item.type === "sale"
                      ? "green"
                      : "red"
                  ) +
                '">' +

                  (
                    item.type === "sale"
                      ? "+"
                      : "-"
                  ) +

                  money(item.amount) +

                '</div>' +

              '</div>'
            );

          );
          }).join("")
        : emptyState(
            "📋",
            "No activity yet",
            "Your business activity will appear here."
          );
  }
}

function renderSales() {
  const el =
    document.getElementById("salesList");

  if (!el) return;

  const list =
    data.sales.slice().sort(function (a, b) {
      return new Date(b.date) -
        new Date(a.date);
    });

  el.innerHTML =
    list.length
      ? list.map(function (s) {
          return (
            '<div class="list-item">' +

              '<div class="list-main">' +

                '<strong>' +
                  escapeHtml(s.description) +
                '</strong>' +

                '<small>' +
                  escapeHtml(
                    formatDate(s.date)
                  ) +
                  ' · ' +
            escapeHtml(
                    s.payment || "Cash"
                  ) +
                  (
                    s.customer
                      ? ' · ' +
                        escapeHtml(
                          s.customer
                        )
                      : ''
                  ) +
                '</small>' +

              '</div>' +

              '<div class="list-amount green">' +
                '+' +
                money(s.amount) +
              '</div>' +

            '</div>'
          );
        }).join("")
      : emptyState(
          "💰",
          "No sales yet",
          "Record your first sale to start tracking revenue."
        );
}

function renderExpenses() {
  const el =
    document.getElementById("expensesList");

  if (!el) return;

  const list =
    data.expenses.slice().sort(function (a, b) {
      return new Date(b.date) -
        new Date(a.date);
    });

  el.innerHTML =
    list.length
      ? list.map(function (e) {
          return (
            '<div class="list-item">' +

              '<div class="list-main">' +

                '<strong>' +
                  escapeHtml(e.description) +
                '</strong>' +

                '<small>' +
                  escapeHtml(
                    formatDate(e.date)
                  ) +
                  ' · ' +
                  escapeHtml(
                    e.payment || "Cash"
                  ) +
                '</small>' +

            '</div>' +

              '<div class="list-amount red">' +
                '-' +
                money(e.amount) +
              '</div>' +

            '</div>'
          );
        }).join("")
      : emptyState(
          "💸",
          "No expenses yet",
          "Record business expenses to track your outflow."
        );
}

function renderStock() {
  const el =
    document.getElementById("stockList");

  if (!el) return;

  el.innerHTML =
    data.stock.length
      ? data.stock.map(function (s) {
          const qty =
            safeNumber(s.quantity);

          const alert =
            safeNumber(s.alert);

          const low =
            qty <= alert;

        return (
            '<div class="list-item">' +

              '<div class="list-main">' +

                '<strong>' +
                  escapeHtml(s.name) +
                '</strong>' +

                '<small>' +
                  'Buy: ' +
                  money(s.buying) +
                  ' · Sell: ' +
                  money(s.selling) +
                '</small>' +

              '</div>' +

          '<div class="list-amount">' +

                '<span class="' +
                  (
                    low
                      ? "stock-low"
                      : "stock-good"
                  ) +
                '">' +

                  qty +
                  ' left' +

                '</span>' +

              '</div>' +

            '</div>'
          );
        }).join("")
      : emptyState(
          "📦",
          "No stock yet",
          "Add products to start managing your inventory."
        );
}

function renderCustomers() {
  const el =
    document.getElementById("customersList");

  if (!el) return;

  el.innerHTML =
    data.customers.length
      ? data.customers.map(function (c, i) {

          const debt =
            safeNumber(c.debt);

        return (
            '<div class="list-item">' +

              '<div class="list-main">' +

                '<strong>' +
                  escapeHtml(c.name) +
                '</strong>' +

                '<small>' +
                  escapeHtml(
                    c.phone || "No phone"
                  ) +

                  (
                    c.notes
                      ? ' · ' +
                        escapeHtml(c.notes)
                      : ''
                  ) +

          '</small>' +

              '</div>' +

              '<div style="text-align:right">' +

                '<div class="list-amount ' +
                  (
                    debt > 0
                      ? "red"
                      : "green"
                  ) +
                '">' +

                  money(debt) +

                '</div>' +

          (
                  debt > 0
                    ? '<button type="button" class="text-button" data-action="payDebt" data-index="' +
                      i +
                      '">Pay</button>'
                    : ''
                ) +

              '</div>' +

            '</div>'
          );

        }).join("")
      : emptyState(
          "👤",
          "No customers yet",
          "Add customers and track Nkongole in one place."
        );
}

function renderInvoices() {
  const el =
    document.getElementById("invoicesList");

  if (!el) return;

  const list =
    data.invoices.slice().sort(function (a, b) {
      return new Date(b.date) -
        new Date(a.date);
    });
  el.innerHTML =
    list.length
      ? list.map(function (inv) {
          return (
            '<div class="list-item">' +

              '<div class="list-main">' +

                '<strong>' +
                  escapeHtml(inv.number) +
                  ' · ' +
                  escapeHtml(inv.customer) +
                '</strong>' +

                '<small>' +
                  escapeHtml(inv.description) +
                  ' · ' +
            escapeHtml(
                    formatDate(inv.date)
                  ) +
                '</small>' +

              '</div>' +

              '<div class="list-amount green">' +
                money(inv.amount) +
              '</div>' +

            '</div>'
          );
        }).join("")
      : emptyState(
          "🧾",
          "No invoices yet",
          "Create invoices for your customers."
        );
}

function renderReports() {
  const summary =
    document.getElementById("reportSummary");

  const details =
    document.getElementById("reportDetails");

  if (!summary || !details) return;

  const sales =
    getSalesTotal();

  const expenses =
    getExpensesTotal();

  const cogs =
    getCostOfGoods();

  const profit=
    getProfit();

  const debt =
    getDebtTotal();

  const stockValue =
    data.stock.reduce(
      function (sum, s) {
        return (
          sum +
          safeNumber(s.quantity) *
          safeNumber(s.buying)
        );
      },
      0
    );

  summary.innerHTML =
    '<div class="report-card">' +
      '<small>Revenue</small>' +
      '<strong>' +
        money(sales) +
      '</strong>' +
    '</div>' +

    '<div class="report-card">' +
      '<small>Expenses</small>' +
      '<strong>' +
        money(expenses) +
      '</strong>' +
    '</div>' +

    '<div class="report-card">' +
      '<small>Cost of Stock Sold</small>' +
      '<strong>' +
        money(cogs) +
      '</strong>' +
    '</div>' +

    '<div class="report-card">' +
      '<small>Profit</small>' +
      '<strong class="report-profit">' +
        money(profit) +
      '</strong>' +
    '</div>';

  details.innerHTML =
    '<div class="report-row">' +
      '<span>Cash available</span>' +
      '<strong>' +
        money(getBalance()) +
      '</strong>' +
    '</div>' +

    '<div class="report-row">' +
      '<span>Outstanding Nkongole</span>' +
      '<strong>' +
        money(debt) +
      '</strong>' +
    '</div>' +

    '<div class="report-row">' +
      '<span>Stock value at buying price</span>' +
      '<strong>' +
        money(stockValue) +
      '</strong>' +
    '</div>' +

    '<div class="report-row">' +
      '<span>Products</span>' +
      '<strong>' +
        data.stock.length +
      '</strong>' +
    '</div>' +

    '<div class="report-row">' +
      '<span>Customers</span>' +
      '<strong>' +
        data.customers.length +
      '</strong>' +
    '</div>';
}

function renderCashFlow() {
  const summary =
    document.getElementById("cashflowSummary");

  const details =
    document.getElementById("cashflowDetails");

  if (!summary || !details) return;

  const inflow =
    getCashReceived();

  const outflow =
    getExpensesTotal();

  const net =
    inflow - outflow;

  summary.innerHTML =
    '<div class="report-card">' +
      '<small>Money In</small>' +
      '<strong>' +
        money(inflow) +
      '</strong>' +
    '</div>' +

    '<div class="report-card">' +
      '<small>Money Out</small>' +
      '<strong>' +
        money(outflow) +
      '</strong>' +
    '</div>' +

    '<div class="report-card">' +
      '<small>Net Cash Flow</small>' +
      '<strong class="report-profit">' +
        money(net) +
      '</strong>' +
    '</div>';

  details.innerHTML =
    '<div class="report-row">' +
      '<span>Cash sales & debt payments</span>' +
      '<strong>' +
        money(inflow) +
      '</strong>' +
    '</div>' +

    '<div class="report-row">' +
      '<span>Expenses paid</span>' +
      '<strong>' +
        money(outflow) +
      '</strong>' +
    '</div>' +

    '<div class="report-row">' +
      '<span>Current cash position</span>' +
      '<strong>' +
        money(net) +
      '</strong>' +
    '</div>' +

    '<div class="report-row">' +
      '<span>Credit still outstanding</span>' +
      '<strong>' +
        money(getDebtTotal()) +
      '</strong>' +
    '</div>';
}

function render() {
  normalizeData();

  renderDashboard();
  renderSales();
  renderExpenses();
  renderStock();
  renderCustomers();
  renderInvoices();
  renderReports();
  renderCashFlow();
}

// ======================
// EVENT WIRING
// ======================

document.addEventListener("DOMContentLoaded", function () {

  startAuthListener();

  const sendBtn =
    document.getElementById("sendOtpBtn");

  const verifyBtn =
    document.getElementById("verifyOtpBtn");

  const backBtn =
    document.getElementById("backToPhone");

  const logoutBtn =
    document.getElementById("logoutBtn");

  const recordForm =
    document.getElementById("recordForm");

  const payDebtForm =
    document.getElementById("payDebtForm");

  if (sendBtn) {
    sendBtn.addEventListener(
      "click",
      sendOtp
    );
  }

  if (verifyBtn) {
    verifyBtn.addEventListener(
      "click",
      verifyOtp
    );
  }

  if (backBtn) {
    backBtn.addEventListener(
      "click",
      function () {

        const step1 =
          document.getElementById("loginStep1");

        const step2 =
          document.getElementById("loginStep2");

        const otp =
          document.getElementById("loginOtp");

        const error =
          document.getElementById("loginError");

        if (step1) {
          step1.style.display = "block";
        }

        if (step2) {
          step2.style.display = "none";
        }

        if (otp) {
          otp.value = "";
        }

        if (error) {
          error.style.display = "none";
        }
      }
    );
  }

  if (logoutBtn) {
    logoutBtn.addEventListener(
      "click",
      function () {

        auth.signOut().catch(
          function (error) {

            console.error(error);

            showToast(
              "Could not log out"
            );
          }
        );
      }
    );
  }

  if (recordForm) {
    recordForm.addEventListener(
      "submit",
      submitForm
    );
  }

  if (payDebtForm) {
    payDebtForm.addEventListener(
      "submit",
      submitPayDebt
    );
  }

  // One click system for all static
  // and dynamically-created buttons.

  document.addEventListener(
    "click",
    function (event) {

      const button =
        event.target.closest(
          "[data-action]"
        );

      if (!button) return;

      const action =
        button.getAttribute(
          "data-action"
        );

      if (action === "showPage") {
        showPage(
          button.getAttribute(
            "data-page"
          )
        );
        return;
      }

      if (action === "openForm") {
        openForm(
          button.getAttribute(
            "data-type"
          )
        );
        return;
      }

      if (action === "payDebt") {
        openPayDebt(
          button.getAttribute(
            "data-index"
          )
        );
        return;
      }

      if (action === "saveSettings") {
        saveSettings();
      }
    }
  );
});
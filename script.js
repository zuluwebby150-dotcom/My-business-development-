// ======================
// ZENTA BUSINESS
// CORE APP SCRIPT
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
let confirmationResult = null;
let currentUser = null;


// ======================
// HELPERS
// ======================

function money(value) {
  return "K " + Number(value || 0).toFixed(2);
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function showToast(message) {
  const toast = document.getElementById("toast");

  if (!toast) {
    alert(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(function () {
    toast.classList.remove("show");
  }, 2500);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeData() {
  data = data || {};

  if (!Array.isArray(data.sales)) data.sales = [];
  if (!Array.isArray(data.expenses)) data.expenses = [];
  if (!Array.isArray(data.stock)) data.stock = [];
  if (!Array.isArray(data.customers)) data.customers = [];
  if (!Array.isArray(data.invoices)) data.invoices = [];

  if (!data.businessName) {
    data.businessName = "My Business";
  }
}


// ======================
// LOCAL DATA
// ======================

function getStorageKey() {
  if (currentUser && currentUser.uid) {
    return BASE_STORAGE_KEY + "_" + currentUser.uid;
  }

  return BASE_STORAGE_KEY;
}

function loadData() {
  try {
    const saved = localStorage.getItem(getStorageKey());

    if (saved) {
      const parsed = JSON.parse(saved);

      data = {
        businessName: parsed.businessName || "My Business",
        sales: Array.isArray(parsed.sales) ? parsed.sales : [],
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
        stock: Array.isArray(parsed.stock) ? parsed.stock : [],
        customers: Array.isArray(parsed.customers)
          ? parsed.customers
          : [],
        invoices: Array.isArray(parsed.invoices)
          ? parsed.invoices
          : []
      };
    }

    normalizeData();
  } catch (error) {
    console.error("Could not load data:", error);

    data = {
      businessName: "My Business",
      sales: [],
      expenses: [],
      stock: [],
      customers: [],
      invoices: []
    };
  }
}

function saveData() {
  normalizeData();

  try {
    localStorage.setItem(
      getStorageKey(),
      JSON.stringify(data)
    );
  } catch (error) {
    console.error("Could not save data:", error);
    showToast("Could not save your data");
  }
}


// ======================
// FIREBASE BUSINESS
// ======================

auth.onAuthStateChanged(async function (user) {
  currentUser = user;

  if (!user) {
    showLogin();
    return;
  }

  await loadOrCreateBusiness(user);
  loadData();
  showApp();
  render();
});

async function loadOrCreateBusiness(user) {
  try {
    const userRef = db.collection("users").doc(user.uid);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      const userData = userSnap.data();

      if (userData.businessId) {
        const businessRef = db
          .collection("businesses")
          .doc(userData.businessId);

        const businessSnap = await businessRef.get();

        if (businessSnap.exists) {
          const businessData = businessSnap.data();

          data.businessName =
            businessData.name || "My Business";

          saveData();
          return;
        }
      }
    }

    const businessRef = db.collection("businesses").doc();

    const now = new Date();
    const trialEnd = new Date();

    trialEnd.setDate(trialEnd.getDate() + 14);

    await businessRef.set({
      name: "My Business",
      ownerId: user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      trialEndsAt: trialEnd,
      plan: "trial",
      planExpiresAt: null
    });

    await userRef.set({
      phone: user.phoneNumber || "",
      businessId: businessRef.id,
      role: "owner",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    data.businessName = "My Business";
    saveData();

    showToast("Welcome! Your 14-day free trial has started.");
  } catch (error) {
    console.error("Business setup error:", error);
    showToast("Business setup failed");
  }
}


// ======================
// LOGIN
// ======================

function showLogin() {
  const loginPage = document.getElementById("loginPage");
  const app = document.getElementById("app");
  const header = document.getElementById("mainHeader");

  if (loginPage) loginPage.style.display = "flex";
  if (app) app.style.display = "none";
  if (header) header.style.display = "none";
}

function showApp() {
  const loginPage = document.getElementById("loginPage");
  const app = document.getElementById("app");
  const header = document.getElementById("mainHeader");

  if (loginPage) loginPage.style.display = "none";
  if (app) app.style.display = "block";
  if (header) header.style.display = "flex";

  updateBusinessHeader();
}

function normalizePhone(phone) {
  phone = String(phone || "").trim();

  if (phone.startsWith("+")) {
    return phone;
  }

  if (phone.startsWith("0")) {
    return "+260" + phone.substring(1);
  }

  if (phone.startsWith("260")) {
    return "+" + phone;
  }

  return "+260" + phone;
}

function setupRecaptcha() {
  if (window.recaptchaVerifier) {
    return window.recaptchaVerifier;
  }

  const container = document.getElementById("recaptcha-container");

  if (!container) {
    throw new Error("reCAPTCHA container not found.");
  }

  window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier(
    "recaptcha-container",
    {
      size: "invisible"
    }
  );

  return window.recaptchaVerifier;
}

async function sendOtp() {
  const phoneInput = document.getElementById("phoneNumber");
  const error = document.getElementById("loginError");

  if (!phoneInput) return;

  const phone = normalizePhone(phoneInput.value);

  if (!phone || phone.length < 10) {
    if (error) {
      error.textContent = "Enter a valid phone number.";
      error.style.display = "block";
    }
    return;
  }

  try {
    const verifier = setupRecaptcha();

    confirmationResult =
      await auth.signInWithPhoneNumber(
        phone,
        verifier
      );

    const step1 = document.getElementById("loginStep1");
    const step2 = document.getElementById("loginStep2");

    if (step1) step1.style.display = "none";
    if (step2) step2.style.display = "block";

    if (error) {
      error.style.display = "none";
    }

    showToast("OTP sent.");
  } catch (err) {
    console.error(err);

    if (window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
      } catch (e) {}

      window.recaptchaVerifier = null;
    }

    if (error) {
      error.textContent =
        err.message || "Could not send OTP.";
      error.style.display = "block";
    }
  }
}

async function verifyOtp() {
  const otpInput = document.getElementById("loginOtp");
  const error = document.getElementById("loginError");

  if (!otpInput) return;

  const code = otpInput.value.trim();

  if (code.length < 6) {
    if (error) {
      error.textContent = "Enter the 6-digit OTP.";
      error.style.display = "block";
    }
    return;
  }

  if (!confirmationResult) {
    if (error) {
      error.textContent =
        "Please request a new OTP first.";
      error.style.display = "block";
    }
    return;
  }

  try {
    await confirmationResult.confirm(code);

    if (error) {
      error.style.display = "none";
    }
  } catch (err) {
    console.error(err);

    if (error) {
      error.textContent =
        err.message || "Invalid OTP.";
      error.style.display = "block";
    }
  }
}


// ======================
// HEADER
// ======================

function updateBusinessHeader() {
  const name = document.getElementById("businessName");
  const greeting = document.getElementById("greeting");

  if (name) {
    name.textContent = data.businessName;
  }

  if (greeting) {
    greeting.textContent = "Welcome";
  }

  const balanceElement =
    document.getElementById("availableBalance");

  if (balanceElement) {
    balanceElement.textContent = money(
      calculateBalance()
    );
  }
}


// ======================
// CALCULATIONS
// ======================

function totalSales() {
  return data.sales.reduce(function (sum, sale) {
    return sum + Number(sale.amount || 0);
  }, 0);
}

function totalExpenses() {
  return data.expenses.reduce(function (sum, expense) {
    return sum + Number(expense.amount || 0);
  }, 0);
}

function totalDebt() {
  return data.customers.reduce(function (sum, customer) {
    return sum + Number(customer.debt || 0);
  }, 0);
}

function calculateBalance() {
  return totalSales() - totalExpenses();
}

function calculateProfit() {
  return totalSales() - totalExpenses();
}

function todaySales() {
  const date = today();

  return data.sales.reduce(function (sum, sale) {
    if (sale.date === date) {
      return sum + Number(sale.amount || 0);
    }

    return sum;
  }, 0);
}

function todayExpenses() {
  const date = today();

  return data.expenses.reduce(function (sum, expense) {
    if (expense.date === date) {
      return sum + Number(expense.amount || 0);
    }

    return sum;
  }, 0);
}

function lowStockCount() {
  return data.stock.filter(function (item) {
    return Number(item.quantity || 0) <=
      Number(item.alert || 0);
  }).length;
}


// ======================
// NAVIGATION
// ======================

function showPage(page) {
  const pages = document.querySelectorAll(".page");

  pages.forEach(function (element) {
    element.style.display = "none";
  });

  const dashboard =
    document.getElementById("dashboard");

  if (dashboard) {
    dashboard.style.display = "none";
  }

  if (page === "dashboard" || !page) {
    if (dashboard) {
      dashboard.style.display = "block";
    }

    renderDashboard();
    return;
  }

  const target =
    document.getElementById(page + "Page");

  if (target) {
    target.style.display = "block";
  }

  if (page === "sales") renderSales();
  if (page === "expenses") renderExpenses();
  if (page === "stock") renderStock();
  if (page === "customers") renderCustomers();
  if (page === "invoices") renderInvoices();
  if (page === "reports") renderReports();
  if (page === "cashflow") renderCashFlow();
  if (page === "settings") renderSettings();
}


// ======================
// DASHBOARD
// ======================

function renderDashboard() {
  updateBusinessHeader();

  const sales = document.getElementById("todaySales");
  const expenses =
    document.getElementById("todayExpenses");
  const debt =
    document.getElementById("totalDebt");
  const lowStock =
    document.getElementById("lowStock");

  if (sales) {
    sales.textContent = money(todaySales());
  }

  if (expenses) {
    expenses.textContent = money(todayExpenses());
  }

  if (debt) {
    debt.textContent = money(totalDebt());
  }

  if (lowStock) {
    lowStock.textContent = lowStockCount();
  }

  const activity =
    document.getElementById("recentActivity");

  if (!activity) return;

  const activities = [];

  data.sales.slice(-5).forEach(function (sale) {
    activities.push({
      type: "Sale",
      description: sale.description || "Sale",
      amount: Number(sale.amount || 0),
      date: sale.date
    });
  });

  data.expenses.slice(-5).forEach(function (expense) {
    activities.push({
      type: "Expense",
      description: expense.description || "Expense",
      amount: Number(expense.amount || 0),
      date: expense.date
    });
  });

  activities.sort(function (a, b) {
    return String(b.date).localeCompare(
      String(a.date)
    );
  });

  if (!activities.length) {
    activity.innerHTML =
      "<p>No recent activity yet.</p>";
    return;
  }

  activity.innerHTML = activities
    .slice(0, 8)
    .map(function (item) {
      return `
        <div class="activity-item">
          <div>
            <strong>${escapeHtml(item.type)}</strong>
            <div>${escapeHtml(item.description)}</div>
            <small>${escapeHtml(item.date || "")}</small>
          </div>
          <strong>${money(item.amount)}</strong>
        </div>
      `;
    })
    .join("");
}


// ======================
// FORMS
// ======================

function openForm(type) {
  currentFormType = type;

  const formPage =
    document.getElementById("formPage");

  const form =
    document.getElementById("recordForm");

  if (!formPage || !form) {
    showToast("Form is not available.");
    return;
  }

  form.reset();

  let title = "Add Record";
  let fields = "";

  if (type === "sale") {
    title = "Record Sale";

    const stockOptions = data.stock
      .map(function (item, index) {
        return `
          <option value="${index}">
            ${escapeHtml(item.name)}
            (${Number(item.quantity || 0)} available)
          </option>
        `;
      })
      .join("");

    const customerOptions = data.customers
      .map(function (customer, index) {
        return `
          <option value="${index}">
            ${escapeHtml(customer.name)}
          </option>
        `;
      })
      .join("");

    fields = `
      <label>Product</label>
      <select id="formProduct">
        <option value="">Select product</option>
        ${stockOptions}
      </select>

      <label>Description</label>
      <input
        id="formDescription"
        type="text"
        placeholder="Description"
        required
      >

      <label>Amount</label>
      <input
        id="formAmount"
        type="number"
        min="0"
        step="0.01"
        placeholder="Amount"
        required
      >

      <label>Quantity</label>
      <input
        id="formQuantity"
        type="number"
        min="1"
        step="1"
        value="1"
        required
      >

      <label>Payment Method</label>
      <select id="formPayment">
        <option value="Cash">Cash</option>
        <option value="MTN MoMo">MTN MoMo</option>
        <option value="Airtel Money">Airtel Money</option>
        <option value="Bank">Bank</option>
        <option value="Credit">Credit</option>
      </select>

      <label>Customer</label>
      <select id="formCustomer">
        <option value="">Walk-in customer</option>
        ${customerOptions}
      </select>
    `;
  }

  if (type === "expense") {
    title = "Record Expense";

    fields = `
      <label>Description</label>
      <input
        id="formDescription"
        type="text"
        placeholder="What did you spend on?"
        required
      >

      <label>Amount</label>
      <input
        id="formAmount"
        type="number"
        min="0"
        step="0.01"
        placeholder="Amount"
        required
      >

      <label>Payment Method</label>
      <select id="formPayment">
        <option value="Cash">Cash</option>
        <option value="MTN MoMo">MTN MoMo</option>
        <option value="Airtel Money">Airtel Money</option>
        <option value="Bank">Bank</option>
      </select>
    `;
  }

  if (type === "stock") {
    title = "Add Stock";

    fields = `
      <label>Product Name</label>
      <input
        id="formProductName"
        type="text"
        placeholder="Product name"
        required
      >

      <label>Quantity</label>
      <input
        id="formQuantity"
        type="number"
        min="0"
        step="1"
        placeholder="Quantity"
        required
      >

      <label>Buying Price</label>
      <input
        id="formBuyingPrice"
        type="number"
        min="0"
        step="0.01"
        placeholder="Buying price"
        required
      >

      <label>Selling Price</label>
      <input
        id="formSellingPrice"
        type="number"
        min="0"
        step="0.01"
        placeholder="Selling price"
        required
      >

      <label>Low Stock Alert</label>
      <input
        id="formAlert"
        type="number"
        min="0"
        step="1"
        value="5"
        required
      >
    `;
  }

  if (type === "customer") {
    title = "Add Customer";

    fields = `
      <label>Customer Name</label>
      <input
        id="formCustomerName"
        type="text"
        placeholder="Customer name"
        required
      >

      <label>Phone</label>
      <input
        id="formCustomerPhone"
        type="text"
        placeholder="Phone number"
      >

      <label>Nkongole / Debt</label>
      <input
        id="formDebt"
        type="number"
        min="0"
        step="0.01"
        value="0"
      >

      <label>Notes</label>
      <textarea
        id="formNotes"
        placeholder="Notes"
      ></textarea>
    `;
  }

  if (type === "invoice") {
    title = "Create Invoice";

    const customerOptions = data.customers
      .map(function (customer, index) {
        return `
          <option value="${index}">
            ${escapeHtml(customer.name)}
          </option>
        `;
      })
      .join("");

    fields = `
      <label>Customer</label>
      <select id="formCustomer">
        <option value="">Select customer</option>
        ${customerOptions}
      </select>

      <label>Customer Phone</label>
      <input
        id="formCustomerPhone"
        type="text"
        placeholder="Phone"
      >

      <label>Description</label>
      <input
        id="formDescription"
        type="text"
        placeholder="Invoice description"
        required
      >

      <label>Amount</label>
      <input
        id="formAmount"
        type="number"
        min="0"
        step="0.01"
        placeholder="Amount"
        required
      >
    `;
  }

  form.innerHTML = `
    <h2>${escapeHtml(title)}</h2>

    ${fields}

    <button type="submit" class="primary-btn">
      Save
    </button>

    <button
      type="button"
      class="secondary-btn"
      data-action="showPage"
      data-page="dashboard"
    >
      Cancel
    </button>
  `;

  showPage("form");
}


// ======================
// SUBMIT FORM
// ======================

function submitForm(event) {
  event.preventDefault();

  const type = currentFormType;

  if (type === "sale") {
    const description =
      document.getElementById("formDescription")?.value.trim();

    const amount =
      Number(
        document.getElementById("formAmount")?.value || 0
      );

    const quantity =
      Number(
        document.getElementById("formQuantity")?.value || 1
      );

    const payment =
      document.getElementById("formPayment")?.value ||
      "Cash";

    const productSelect =
      document.getElementById("formProduct");

    const customerSelect =
      document.getElementById("formCustomer");

    const productIndex =
      productSelect &&
      productSelect.value !== ""
        ? Number(productSelect.value)
        : -1;

    const customerIndex =
      customerSelect &&
      customerSelect.value !== ""
        ? Number(customerSelect.value)
        : -1;

    if (!description || amount <= 0) {
      showToast("Enter sale details.");
      return;
    }

    if (quantity <= 0) {
      showToast("Enter a valid quantity.");
      return;
    }

    if (
      productIndex >= 0 &&
      data.stock[productIndex]
    ) {
      const product = data.stock[productIndex];

      if (
        Number(product.quantity || 0) <
        quantity
      ) {
        showToast("Not enough stock.");
        return;
      }

      product.quantity =
        Number(product.quantity || 0) -
        quantity;
    }

    const customer =
      customerIndex >= 0
        ? data.customers[customerIndex]
        : null;

    data.sales.push({
      id: Date.now(),
      description: description,
      amount: amount,
      quantity: quantity,
      payment: payment,
      customer: customer
        ? customer.name
        : "",
      customerIndex: customerIndex,
      date: today()
    });

    if ( 
      payment === "Credit" &&
      customer
    ) {
      customer.debt =
        Number(customer.debt || 0) +
        amount;
    }

    saveData();
    render();

    showToast("Sale recorded.");
    showPage("dashboard");
    return;
  }

if (type === "expense") {
    const description =
      document.getElementById("formDescription")?.value.trim();

    const amount =
      Number(
        document.getElementById("formAmount")?.value || 0
      );

    const payment =
      document.getElementById("formPayment")?.value ||
      "Cash";

    if (!description || amount <= 0) {
      showToast("Enter expense details.");
      return;
    }

  data.expenses.push({
      id: Date.now(),
      description: description,
      amount: amount,
      payment: payment,
      date: today()
    });

    saveData();
    render();

    showToast("Expense recorded.");
    showPage("dashboard");
    return;
  }

  if (type === "stock") {
    const name =
      document.getElementById("formProductName")?.value.trim();

    const quantity =
      Number(
        document.getElementById("formQuantity")?.value || 0
      );

    const buyingPrice =
      Number(
        document.getElementById("formBuyingPrice")?.value || 0
      );

    const sellingPrice =
      Number(
        document.getElementById("formSellingPrice")?.value || 0
      );

    const alertLevel =
      Number(
        document.getElementById("formAlert")?.value || 0
      );

    if (!name || quantity < 0) {
      showToast("Enter stock details.");
      return;
    }

    const existing =
      data.stock.find(function (item) {
        return String(item.name).toLowerCase() ===
          name.toLowerCase();
      });

    if (existing) {
      existing.quantity =
        Number(existing.quantity || 0) +
        quantity;

      existing.buyingPrice = buyingPrice;
      existing.sellingPrice = sellingPrice;
      existing.alert = alertLevel;
    } else {
      data.stock.push({
        id: Date.now(),
        name: name,
        quantity: quantity,
        buyingPrice: buyingPrice,
        sellingPrice: sellingPrice,
        alert: alertLevel
      });
    }

    saveData();
    render();

    showToast("Stock saved.");
    showPage("dashboard");
    return;
  }


  if (type === "customer") {
    const name =
      document.getElementById("formCustomerName")?.value.trim();

    const phone =
      document.getElementById("formCustomerPhone")?.value.trim();

    const debt =
      Number(
        document.getElementById("formDebt")?.value || 0
      );

    const notes =
      document.getElementById("formNotes")?.value.trim();

    if (!name) {
      showToast("Enter customer name.");
      return;
    }

    data.customers.push({
      id: Date.now(),
      name: name,
      phone: phone,
      debt: debt,
      notes: notes
    });

    saveData();
    render();

    showToast("Customer saved.");
    showPage("dashboard");
    return;
  }

  if (type === "invoice") {
    const customerSelect =
      document.getElementById("formCustomer");

    const customerIndex =
      customerSelect &&
      customerSelect.value !== ""
        ? Number(customerSelect.value)
        : -1;

    const customer =
      customerIndex >= 0
        ? data.customers[customerIndex]
        : null;

    const customerPhone =
      document.getElementById("formCustomerPhone")?.value.trim();

    const description =
      document.getElementById("formDescription")?.value.trim();

    const amount =
      Number(
        document.getElementById("formAmount")?.value || 0
      );

    if (!description || amount <= 0) {
      showToast("Enter invoice details.");
      return;
    }

    const year = new Date().getFullYear();

    const invoiceNumber =
      "INV-" +
      year +
      "-" +
      String(data.invoices.length + 1).padStart(4, "0");

    data.invoices.push({
      id: Date.now(),
      invoiceNumber: invoiceNumber,
      customer: customer
        ? customer.name
        : "",
      phone: customerPhone ||
        (customer ? customer.phone : ""),
      description: description,
      amount: amount,
      date: today()
    });

    saveData();
    render();

    showToast("Invoice created.");
    showPage("dashboard");
  }
}

// ======================
// SALES
// ======================

function renderSales() {
  const container =
    document.getElementById("salesList");

  if (!container) return;

  if (!data.sales.length) {
    container.innerHTML =
      "<p>No sales recorded yet.</p>";
    return;
  }

  container.innerHTML =
    data.sales
      .slice()
      .reverse()
      .map(function (sale) {
        return `
          <div class="list-item">
            <div>
              <strong>
                ${escapeHtml(
                  sale.description || "Sale"
                )}
              </strong>
              <small>
                ${escapeHtml(sale.date || "")}
                ·
                ${escapeHtml(sale.payment || "")}
              </small>
            </div>

            <strong>
              ${money(sale.amount)}
            </strong>
          </div>
        `;
      })
      .join("");
}


// ======================
// EXPENSES
// ======================

function renderExpenses() {
  const container =
    document.getElementById("expensesList");

  if (!container) return;

  if (!data.expenses.length) {
    container.innerHTML =
      "<p>No expenses recorded yet.</p>";
    return;
  }

  container.innerHTML =
    data.expenses
      .slice()
      .reverse()
      .map(function (expense) {
        return `
          <div class="list-item">
            <div>
              <strong>
                ${escapeHtml(
                  expense.description || "Expense"
                )}
              </strong>
              <small>
              ${escapeHtml(expense.date || "")}
                ·
                ${escapeHtml(expense.payment || "")}
              </small>
            </div>

            <strong>
              ${money(expense.amount)}
            </strong>
          </div>
        `;
      })
      .join("");
}

// ======================
// STOCK
// ======================

function renderStock() {
  const container =
    document.getElementById("stockList");

  if (!container) return;

  if (!data.stock.length) {
    container.innerHTML =
      "<p>No stock added yet.</p>";
    return;
  }

  container.innerHTML =
    data.stock
      .map(function (item) {
        const low =
          Number(item.quantity || 0) <=
          Number(item.alert || 0);

        return `
          <div class="list-item">
            <div>
              <strong>
                ${escapeHtml(item.name)}
              </strong>

              <small>
                Qty: ${Number(item.quantity || 0)}
                · Buy: ${money(item.buyingPrice)}
                · Sell: ${money(item.sellingPrice)}
              </small>
              ${
                low
                  ? `<small style="color:#c0392b;font-weight:bold;">
                       Low stock
                     </small>`
                  : ""
              }
            </div>

            <strong>
              ${Number(item.quantity || 0)}
            </strong>
          </div>
        `;
      })
      .join("");
}

// ======================
// CUSTOMERS
// ======================

function renderCustomers() {
  const container =
    document.getElementById("customersList");

  if (!container) return;

  if (!data.customers.length) {
    container.innerHTML =
      "<p>No customers added yet.</p>";
    return;
  }

  container.innerHTML =
    data.customers
      .map(function (customer, index) {
        return `
          <div class="list-item">
            <div>
              <strong>
                ${escapeHtml(customer.name)}
              </strong>

              <small>
                ${escapeHtml(customer.phone || "")}
              </small>
              ${
                Number(customer.debt || 0) > 0
                  ? `<small>
                       Nkongole:
                       ${money(customer.debt)}
                     </small>`
                  : `<small>No outstanding debt</small>`
              }
            </div>
            
            ${
              Number(customer.debt || 0) > 0
                ? `
                  <button
                    class="small-btn"
                    data-action="payDebt"
                    data-index="${index}"
                  >
                    Pay Debt
                  </button>
                `
                : ""
            }
          </div>
        `;
      })
      .join("");
}

// ======================
// DEBT PAYMENT
// ======================

function openPayDebt(index) {
  const customer =
    data.customers[Number(index)];

  if (!customer) {
    showToast("Customer not found.");
    return;
  }

  const page =
    document.getElementById("payDebtPage");

  const form =
    document.getElementById("payDebtForm");

  if (!page || !form) {
    showToast("Debt payment form unavailable.");
    return;
  }

  form.innerHTML = `
    <h2>Pay Nkongole</h2>

    <p>
      Customer:
      <strong>
        ${escapeHtml(customer.name)}
      </strong>
    </p>

    <p>
      Outstanding:
      <strong>
        ${money(customer.debt)}
      </strong>
    </p>

    <input
      type="hidden"
      id="payDebtIndex"
      value="${Number(index)}"
    >

    <label>Amount Paid</label>

    <input
      id="payDebtAmount"
      type="number"
      min="0.01"
      max="${Number(customer.debt || 0)}"
      step="0.01"
      required
      placeholder="Amount"
    >

    <label>Payment Method</label>

    <select id="payDebtMethod">
      <option value="Cash">Cash</option>
      <option value="MTN MoMo">MTN MoMo</option>
      <option value="Airtel Money">Airtel Money</option>
      <option value="Bank">Bank</option>
    </select>

    <button type="submit" class="primary-btn">
      Record Payment
    </button>

    <button
      type="button"
      class="secondary-btn"
      data-action="showPage"
      data-page="customers"
    >
      Cancel
    </button>
  `;

  showPage("payDebt");
}

function submitPayDebt(event) {
  event.preventDefault();

  const index =
    Number(
      document.getElementById("payDebtIndex")?.value
    );

  const amount =
    Number(
      document.getElementById("payDebtAmount")?.value || 0
    );

  const method =
    document.getElementById("payDebtMethod")?.value ||
    "Cash";

  const customer = data.customers[index];

  if (!customer) {
    showToast("Customer not found.");
    return;
  }

  if (amount <= 0) {
    showToast("Enter a valid amount.");
    return;
  }

  if (
    amount >
    Number(customer.debt || 0)
  ) {
    showToast("Amount is greater than the debt.");
    return;
  }

  customer.debt =
    Number(customer.debt || 0) -
    amount;

  data.sales.push({
    id: Date.now(),
    description:
      "Nkongole payment - " +
      customer.name,
    amount: amount,
    quantity: 1,
    payment: method,
    customer: customer.name,
    date: today(),
    debtPayment: true
  });

  saveData();
  render();

  showToast("Debt payment recorded.");
  showPage("customers");
}


// ======================
// INVOICES
// ======================

function renderInvoices() {
  const container =
    document.getElementById("invoicesList");

  if (!container) return;

  if (!data.invoices.length) {
    container.innerHTML =
      "<p>No invoices created yet.</p>";
    return;
  }

  container.innerHTML =
    data.invoices
      .slice()
      .reverse()
      .map(function (invoice) {
        return `
          <div class="list-item">
            <div>
              <strong>
                ${escapeHtml(invoice.invoiceNumber)}
              </strong>

              <small>
                ${escapeHtml(invoice.customer || "Customer")}
              </small>

              <small>
                ${escapeHtml(invoice.description || "")}
              </small>

              <small>
                ${escapeHtml(invoice.date || "")}
              </small>
            </div>

            <strong>
              ${money(invoice.amount)}
            </strong>
          </div>
        `;
      })
      .join("");
}

// ======================
// REPORTS
// ======================

function renderReports() {
  const container =
    document.getElementById("reportsContent");

  if (!container) return;

  const sales = totalSales();
  const expenses = totalExpenses();
  const profit = calculateProfit();

  container.innerHTML = `
    <div class="report-card">
      <span>Total Sales</span>
      <strong>${money(sales)}</strong>
    </div>

    <div class="report-card">
      <span>Total Expenses</span>
      <strong>${money(expenses)}</strong>
    </div>

    <div class="report-card">
      <span>Profit</span>
      <strong>${money(profit)}</strong>
    </div>

    <div class="report-card">
      <span>Outstanding Nkongole</span>
      <strong>${money(totalDebt())}</strong>
    </div>

    <div class="report-card">
      <span>Stock Items</span>
      <strong>${data.stock.length}</strong>
    </div>

    <div class="report-card">
      <span>Low Stock Items</span>
      <strong>${lowStockCount()}</strong>
    </div>
  `;
}

// ======================
// CASH FLOW
// ======================

function renderCashFlow() {
  const container =
    document.getElementById("cashFlowContent");

  if (!container) return;

  const inflow = totalSales();
  const outflow = totalExpenses();
  const net = inflow - outflow;

  container.innerHTML = `
    <div class="report-card">
      <span>Money In</span>
      <strong>${money(inflow)}</strong>
    </div>

    <div class="report-card">
      <span>Money Out</span>
      <strong>${money(outflow)}</strong>
    </div>

    <div class="report-card">
      <span>Net Cash Flow</span>
      <strong>${money(net)}</strong>
    </div>

    <div class="report-card">
      <span>Available Balance</span>
      <strong>${money(calculateBalance())}</strong>
    </div>
  `;
}

// ======================
// SETTINGS
// ======================

function renderSettings() {
  const input =
    document.getElementById("settingsBusinessName");

  if (input) {
    input.value = data.businessName || "";
  }
}

function saveSettings() {
  const input =
    document.getElementById("settingsBusinessName");

  if (!input) return;

  const name = input.value.trim();

  if (!name) {
    showToast("Enter a business name.");
    return;
  }

  data.businessName = name;

  saveData();
  updateBusinessHeader();

  showToast("Business settings saved.");
}

// ======================
// RENDER EVERYTHING
// ======================

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

document.addEventListener(
  "DOMContentLoaded",
  function () {

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

          auth.signOut()
            .catch(function (error) {
              console.error(error);
              showToast("Could not log out");
            });

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


    // Works for buttons created later too.
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
          event.preventDefault();

          showPage(
            button.getAttribute(
              "data-page"
            )
          );

          return;
        }

        if (action === "openForm") {
          event.preventDefault();

          openForm(
            button.getAttribute(
              "data-type"
            )
          );

          return;
        }


        if (action === "payDebt") {
          event.preventDefault();

          openPayDebt(
            button.getAttribute(
              "data-index"
            )
          );

          return;
        }


        if (action === "saveSettings") {
          event.preventDefault();

          saveSettings();

          return;
        }

      }
    );

  }
);

// ===============================
// ZENTA FIX - MATCH INDEX.HTML
// ===============================

function setupRecaptcha() {
  if (window.recaptchaVerifier) {
    return window.recaptchaVerifier;
  }

  window.recaptchaVerifier =
    new firebase.auth.RecaptchaVerifier(
      "recaptcha-container",
      {
        size: "invisible"
      }
    );

  return window.recaptchaVerifier;
}


async function sendOtp() {
  const phoneInput =
    document.getElementById("loginPhone");

  const error =
    document.getElementById("loginError");

  if (!phoneInput) {
    console.error("loginPhone not found");
    return;
  }

  const phone =
    normalizePhone(phoneInput.value);

  if (!phone || phone.length < 10) {
    error.textContent =
      "Please enter a valid phone number.";
    error.style.display = "block";
    return;
  }

  try {
    error.style.display = "none";

    const verifier =
      setupRecaptcha();

    confirmationResult =
      await auth.signInWithPhoneNumber(
        phone,
        verifier
      );

    document.getElementById(
      "loginStep1"
    ).style.display = "none";

    document.getElementById(
      "loginStep2"
    ).style.display = "block";

    showToast("OTP sent. Check your phone.");

  } catch (err) {
    console.error("OTP ERROR:", err);

    error.textContent =
      err.message ||
      "Could not send OTP.";

    error.style.display = "block";

    if (window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
      } catch (e) {}

      window.recaptchaVerifier = null;
    }
  }
}


async function verifyOtp() {
  const otpInput =
    document.getElementById("loginOtp");

  const error =
    document.getElementById("loginError");

  const code =
    otpInput.value.trim();

  if (code.length !== 6) {
    error.textContent =
      "Enter the 6-digit OTP.";
    error.style.display = "block";
    return;
  }

  if (!confirmationResult) {
    error.textContent =
      "Please request an OTP first.";
    error.style.display = "block";
    return;
  }

  try {
    await confirmationResult.confirm(code);

    error.style.display = "none";

  } catch (err) {
    console.error("VERIFY ERROR:", err);

    error.textContent =
      err.message ||
      "Incorrect OTP.";

    error.style.display = "block";
  }
}


// ===============================
// CORRECT APP SHOW/HIDE
// ===============================

function showLogin() {
  const login =
    document.getElementById("login");

  const main =
    document.getElementById("mainContent");

  const header =
    document.getElementById("mainHeader");

  const nav =
    document.getElementById("bottomNav");

  if (login) login.style.display = "block";
  if (main) main.style.display = "none";
  if (header) header.style.display = "none";
  if (nav) nav.style.display = "none";
}


function showApp() {
  const login =
    document.getElementById("login");

  const main =
    document.getElementById("mainContent");

  const header =
    document.getElementById("mainHeader");

  const nav =
    document.getElementById("bottomNav");

  if (login) login.style.display = "none";
  if (main) main.style.display = "block";
  if (header) header.style.display = "block";
  if (nav) nav.style.display = "grid";

  updateBusinessHeader();
}


// ===============================
// CORRECT PAGE NAVIGATION
// ===============================

function showPage(page) {
  document
    .querySelectorAll("#mainContent .page")
    .forEach(function(section) {
      section.style.display = "none";
    });

  const target =
    document.getElementById(page);

  if (target) {
    target.style.display = "block";
  }

  if (page === "dashboard") {
    renderDashboard();
  }

  if (page === "sales") {
    renderSales();
  }

  if (page === "expenses") {
    renderExpenses();
  }

  if (page === "stock") {
    renderStock();
  }

  if (page === "customers") {
    renderCustomers();
  }

  if (page === "invoices") {
    renderInvoices();
  }

  if (page === "reports") {
    renderReports();
  }

  if (page === "cashflow") {
    renderCashFlow();
  }

  if (page === "settings") {
    renderSettings();
  }

  if (page === "formPage") {
    // form already prepared
  }

  if (page === "payDebtPage") {
    // form already prepared
  }
}


// ===============================
// CORRECT HEADER
// ===============================

function updateBusinessHeader() {
  const name =
    document.getElementById("businessName");

  const balance =
    document.getElementById("balance");

  if (name) {
    name.textContent =
      data.businessName || "My Business";
  }

  if (balance) {
    balance.textContent =
      money(calculateBalance());
  }
}


// ===============================
// LOGIN BUTTONS
// ===============================

document.addEventListener(
  "DOMContentLoaded",
  function() {

    const sendButton =
      document.getElementById("sendOtpBtn");

    const verifyButton =
      document.getElementById("verifyOtpBtn");

    const backButton =
      document.getElementById("backToPhone");

    const logoutButton =
      document.getElementById("logoutBtn");

    if (sendButton) {
      sendButton.onclick = sendOtp;
    }

    if (verifyButton) {
      verifyButton.onclick = verifyOtp;
    }

    if (backButton) {
      backButton.onclick = function() {

        document.getElementById(
          "loginStep1"
        ).style.display = "block";

        document.getElementById(
          "loginStep2"
        ).style.display = "none";

        document.getElementById(
          "loginOtp"
        ).value = "";
      };
    }

    if (logoutButton) {
      logoutButton.onclick = function() {
        auth.signOut();
      };
    }
  }
);


// ===============================
// DATA-ACTION BUTTONS
// ===============================

document.addEventListener(
  "click",
  function(event) {

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

      event.preventDefault();

      showPage(
        button.getAttribute(
          "data-page"
        )
      );
    }

    if (action === "openForm") {

      event.preventDefault();

      openForm(
        button.getAttribute(
          "data-type"
        )
      );
    }

    if (action === "payDebt") {

      event.preventDefault();

      openPayDebt(
        button.getAttribute(
          "data-index"
        )
      );
    }

    if (action === "saveSettings") {

      event.preventDefault();

      saveSettings();
    }
  }
);
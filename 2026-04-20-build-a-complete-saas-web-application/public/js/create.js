const form = document.getElementById("invoice-form");
const itemsContainer = document.getElementById("items-container");
const preview = document.getElementById("preview");
const downloadButton = document.getElementById("download-button");
const saveButton = document.getElementById("save-button");
const sendButton = document.getElementById("send-button");
const messageEl = document.getElementById("form-message");
const planBadge = document.getElementById("plan-badge");
const previewStatus = document.getElementById("preview-status");
const upgradeButton = document.getElementById("upgrade-button");
const upgradeModal = document.getElementById("upgrade-modal");
const closeModal = document.getElementById("close-modal");
const logoutButton = document.getElementById("logout-button");
const logoInput = document.getElementById("logo-input");

let currentUser = null;
let editingInvoiceId = new URLSearchParams(window.location.search).get("invoiceId");

function addItemRow(item = {}) {
  const row = document.createElement("div");
  row.className = "grid gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.4fr_0.4fr_0.6fr_auto]";
  row.innerHTML = `
    <input name="item_name" placeholder="Item name" class="rounded-2xl border border-slate-200 bg-white px-4 py-3" value="${item.name || ""}" />
    <input name="item_quantity" type="number" min="1" step="1" placeholder="Qty" class="rounded-2xl border border-slate-200 bg-white px-4 py-3" value="${item.quantity || 1}" />
    <input name="item_price" type="number" min="0" step="0.01" placeholder="Price" class="rounded-2xl border border-slate-200 bg-white px-4 py-3" value="${item.price || 0}" />
    <button type="button" class="remove-item rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">Remove</button>
  `;
  row.querySelector(".remove-item").addEventListener("click", () => {
    row.remove();
    renderPreview();
  });
  row.querySelectorAll("input").forEach((input) => input.addEventListener("input", renderPreview));
  itemsContainer.appendChild(row);
}

function collectFormData() {
  const formData = Object.fromEntries(new FormData(form).entries());
  const items = Array.from(itemsContainer.children).map((row) => ({
    name: row.querySelector('[name="item_name"]').value,
    quantity: Number(row.querySelector('[name="item_quantity"]').value || 0),
    price: Number(row.querySelector('[name="item_price"]').value || 0)
  }));

  return {
    ...formData,
    tax: Number(formData.tax || 0),
    discount: Number(formData.discount || 0),
    items
  };
}

function computeTotals(data) {
  const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const taxAmount = subtotal * (Number(data.tax || 0) / 100);
  const discountAmount = subtotal * (Number(data.discount || 0) / 100);
  const total = Math.max(subtotal + taxAmount - discountAmount, 0);
  return { subtotal, taxAmount, discountAmount, total };
}

function renderPreview() {
  const data = collectFormData();
  const totals = computeTotals(data);
  previewStatus.textContent = data.status === "paid" ? "Paid" : "Draft";
  previewStatus.className = `rounded-full px-4 py-2 text-sm font-medium ${data.status === "paid" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-700"}`;

  preview.innerHTML = `
    <div class="rounded-[1.5rem] border border-white bg-white p-6 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-6">
        <div>
          ${data.business_logo ? `<img src="${data.business_logo}" alt="Business logo" class="mb-4 h-12 w-12 rounded-2xl object-cover" />` : ""}
          <p class="text-xs uppercase tracking-[0.24em] text-slate-400">From</p>
          <h3 class="mt-3 text-2xl font-semibold">${data.business_name || "Your business"}</h3>
          <p class="mt-3 text-sm text-slate-500">${data.business_email || ""}</p>
          <p class="text-sm text-slate-500">${data.business_phone || ""}</p>
          <p class="text-sm text-slate-500 whitespace-pre-line">${data.business_address || ""}</p>
        </div>
        <div class="text-right">
          <p class="text-xs uppercase tracking-[0.24em] text-slate-400">Invoice</p>
          <h3 class="mt-3 text-2xl font-semibold">${data.invoice_number || "INV-XXXX"}</h3>
          <p class="mt-3 text-sm text-slate-500">Issue: ${data.issue_date || "-"}</p>
          <p class="text-sm text-slate-500">Due: ${data.due_date || "-"}</p>
        </div>
      </div>

      <div class="mt-8 grid gap-6 rounded-[1.5rem] bg-slate-50 p-5 md:grid-cols-2">
        <div>
          <p class="text-xs uppercase tracking-[0.24em] text-slate-400">Bill to</p>
          <h4 class="mt-3 text-lg font-semibold">${data.client_name || "Client name"}</h4>
          <p class="mt-2 text-sm text-slate-500">${data.client_email || ""}</p>
          <p class="text-sm text-slate-500 whitespace-pre-line">${data.client_address || ""}</p>
        </div>
        <div class="md:text-right">
          <p class="text-xs uppercase tracking-[0.24em] text-slate-400">Status</p>
          <p class="mt-3 text-lg font-semibold ${data.status === "paid" ? "text-emerald-600" : "text-slate-900"}">${data.status || "unpaid"}</p>
        </div>
      </div>

      <div class="mt-8 overflow-hidden rounded-[1.5rem] border border-slate-200">
        <div class="grid grid-cols-[1.3fr_0.35fr_0.55fr_0.6fr] bg-slate-100 px-4 py-3 text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
          <span>Item</span><span>Qty</span><span>Price</span><span>Total</span>
        </div>
        <div class="divide-y divide-slate-100">
          ${data.items.map((item) => `
            <div class="grid grid-cols-[1.3fr_0.35fr_0.55fr_0.6fr] px-4 py-4 text-sm">
              <span>${item.name || "Line item"}</span>
              <span>${item.quantity || 0}</span>
              <span>${currency(item.price, data.currency)}</span>
              <span>${currency(item.quantity * item.price, data.currency)}</span>
            </div>
          `).join("") || '<div class="px-4 py-6 text-sm text-slate-500">Add invoice items to see your preview.</div>'}
        </div>
      </div>

      <div class="mt-8 ml-auto max-w-sm space-y-3 rounded-[1.5rem] bg-slate-50 p-5">
        <div class="flex justify-between text-sm"><span class="text-slate-500">Subtotal</span><span>${currency(totals.subtotal, data.currency)}</span></div>
        <div class="flex justify-between text-sm"><span class="text-slate-500">Tax</span><span>${currency(totals.taxAmount, data.currency)}</span></div>
        <div class="flex justify-between text-sm"><span class="text-slate-500">Discount</span><span>-${currency(totals.discountAmount, data.currency)}</span></div>
        <div class="flex justify-between border-t border-slate-200 pt-3 text-lg font-semibold"><span>Total</span><span class="text-emerald-600">${currency(totals.total, data.currency)}</span></div>
      </div>

      ${currentUser?.plan === "free" ? '<p class="mt-6 text-center text-xs uppercase tracking-[0.3em] text-blue-300">Created with InvoiceFlow</p>' : ""}
    </div>
  `;
}

function showUpgradeModal() {
  upgradeModal.classList.remove("hidden");
  upgradeModal.classList.add("flex");
}

async function init() {
  currentUser = await redirectIfLoggedOut();
  if (!currentUser) return;

  planBadge.textContent = `Plan: ${currentUser.plan[0].toUpperCase()}${currentUser.plan.slice(1)}`;
  addItemRow({ name: "Service package", quantity: 1, price: 250 });
  addItemRow({ name: "Consultation", quantity: 2, price: 90 });

  const nextNumber = await api("/api/invoices/next-number");
  form.elements.invoice_number.value = nextNumber.invoiceNumber;

  const today = new Date().toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  form.elements.issue_date.value = today;
  form.elements.due_date.value = nextWeek;
  form.elements.business_name.value = currentUser.business_name || "";

  if (editingInvoiceId && currentUser.plan !== "free") {
    const saved = await api(`/api/invoices/${editingInvoiceId}`);
    const invoice = saved.invoice;
    itemsContainer.innerHTML = "";
    invoice.items.forEach(addItemRow);
    Object.entries(invoice).forEach(([key, value]) => {
      if (form.elements[key] && key !== "items") {
        form.elements[key].value = value ?? "";
      }
    });
    saveButton.textContent = "Update Invoice";
  }

  renderPreview();
}

document.getElementById("add-item-button").addEventListener("click", () => addItemRow());
form.addEventListener("input", renderPreview);
downloadButton.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/invoices/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectFormData())
    });

    if (!response.ok) {
      const data = await response.json();
      throw Object.assign(new Error(data.error), { upgradeRequired: data.upgradeRequired });
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${form.elements.invoice_number.value || "invoice"}.pdf`;
    link.click();
    window.URL.revokeObjectURL(url);
    setMessage(messageEl, "PDF downloaded successfully.");
  } catch (error) {
    if (error.upgradeRequired) showUpgradeModal();
    setMessage(messageEl, error.message, true);
  }
});

saveButton.addEventListener("click", async () => {
  if (currentUser.plan === "free") {
    showUpgradeModal();
    return;
  }

  try {
    await api(editingInvoiceId ? `/api/invoices/${editingInvoiceId}` : "/api/invoices", {
      method: editingInvoiceId ? "PUT" : "POST",
      body: JSON.stringify(collectFormData())
    });
    setMessage(messageEl, editingInvoiceId ? "Invoice updated." : "Invoice saved to your dashboard.");
  } catch (error) {
    setMessage(messageEl, error.message, true);
  }
});

sendButton.addEventListener("click", async () => {
  if (currentUser.plan === "free") {
    showUpgradeModal();
    return;
  }

  try {
    await api("/api/invoices/send", {
      method: "POST",
      body: JSON.stringify(collectFormData())
    });
    setMessage(messageEl, "Invoice emailed successfully.");
  } catch (error) {
    setMessage(messageEl, error.message, true);
  }
});

upgradeButton.addEventListener("click", showUpgradeModal);
closeModal.addEventListener("click", () => {
  upgradeModal.classList.add("hidden");
  upgradeModal.classList.remove("flex");
});
document.querySelectorAll(".modal-plan").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      const data = await api("/api/billing/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan: button.dataset.plan })
      });
      window.location.href = data.url;
    } catch (error) {
      setMessage(messageEl, error.message, true);
    }
  });
});

logoutButton.addEventListener("click", logout);
logoInput.addEventListener("change", async () => {
  if (!logoInput.files[0]) return;
  const data = new FormData();
  data.append("logo", logoInput.files[0]);

  try {
    const result = await api("/api/upload/logo", {
      method: "POST",
      body: data
    });
    form.elements.business_logo.value = result.path;
    setMessage(messageEl, "Logo uploaded.");
  } catch (error) {
    setMessage(messageEl, error.message, true);
  }
});

init().catch(() => {
  window.location.href = "/login.html";
});

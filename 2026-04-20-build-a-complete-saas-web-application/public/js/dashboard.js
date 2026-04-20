const tableBody = document.getElementById("invoice-table-body");
const gate = document.getElementById("dashboard-gate");
const content = document.getElementById("dashboard-content");
const manageBillingButton = document.getElementById("manage-billing-button");
const dashboardMessage = document.getElementById("dashboard-message");

function renderInvoices(invoices) {
  tableBody.innerHTML = invoices.map((invoice) => `
    <tr class="border-t border-slate-100">
      <td class="px-6 py-4 font-medium">${invoice.invoice_number}</td>
      <td class="px-6 py-4">${invoice.client_name}</td>
      <td class="px-6 py-4">
        <span class="rounded-full px-3 py-1 text-xs font-medium ${invoice.status === "paid" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}">
          ${invoice.status}
        </span>
      </td>
      <td class="px-6 py-4">${invoice.issue_date}</td>
      <td class="px-6 py-4">${currency(invoice.total, invoice.currency)}</td>
      <td class="px-6 py-4">
        <div class="flex gap-2">
          <button data-action="view" data-id="${invoice.id}" class="rounded-xl border border-slate-200 px-3 py-2">View</button>
          <button data-action="delete" data-id="${invoice.id}" class="rounded-xl border border-slate-200 px-3 py-2">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function loadDashboard() {
  const user = await redirectIfLoggedOut();
  if (!user) return;

  document.getElementById("logout-button").addEventListener("click", logout);
  document.querySelectorAll(".plan-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const data = await api("/api/billing/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan: button.dataset.plan })
      });
      window.location.href = data.url;
    });
  });

  if (user.plan === "free") {
    gate.classList.remove("hidden");
    return;
  }

  content.classList.remove("hidden");
  const data = await api("/api/dashboard/summary");
  document.getElementById("total-invoices").textContent = data.summary.total_invoices || 0;
  document.getElementById("paid-unpaid").textContent = `${data.summary.paid_count || 0} / ${data.summary.unpaid_count || 0}`;
  document.getElementById("revenue").textContent = currency(data.summary.revenue || 0, data.invoices[0]?.currency || "USD");
  renderInvoices(data.invoices);

  tableBody.onclick = async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const { action, id } = button.dataset;

    if (action === "view") {
      window.location.href = `/create.html?invoiceId=${id}`;
    }

    if (action === "delete") {
      await api(`/api/invoices/${id}`, { method: "DELETE" });
      setMessage(dashboardMessage, "Invoice deleted.");
      loadDashboard();
    }
  };

  manageBillingButton.addEventListener("click", async () => {
    try {
      const portal = await api("/api/billing/create-portal-session", { method: "POST" });
      window.location.href = portal.url;
    } catch (error) {
      setMessage(dashboardMessage, error.message, true);
    }
  });
}

loadDashboard().catch((error) => {
  setMessage(dashboardMessage, error.message, true);
});

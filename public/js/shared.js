async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.blob();

  if (!response.ok) {
    const message = data.error || "Request failed.";
    const error = new Error(message);
    error.upgradeRequired = Boolean(data.upgradeRequired);
    throw error;
  }

  return data;
}

function currency(value, code = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code
  }).format(Number(value || 0));
}

function setMessage(element, text, isError = false) {
  if (!element) return;
  element.textContent = text;
  element.className = `mt-4 text-sm ${isError ? "text-red-600" : "text-emerald-600"}`;
}

async function getCurrentUser() {
  const data = await api("/api/auth/me");
  return data.user;
}

async function redirectIfLoggedOut() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = "/login.html";
    return null;
  }
  return user;
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  window.location.href = "/";
}

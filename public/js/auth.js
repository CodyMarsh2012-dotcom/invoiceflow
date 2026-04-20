const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const messageEl = document.getElementById("message");

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = Object.fromEntries(new FormData(loginForm).entries());

    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(formData)
      });
      window.location.href = "/create.html";
    } catch (error) {
      setMessage(messageEl, error.message, true);
    }
  });
}

if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = Object.fromEntries(new FormData(registerForm).entries());

    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(formData)
      });
      window.location.href = "/create.html";
    } catch (error) {
      setMessage(messageEl, error.message, true);
    }
  });
}

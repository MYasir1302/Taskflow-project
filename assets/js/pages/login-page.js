(function () {
  const { auth, seed, ui } = window.TaskFlow;

  function bindPasswordToggle() {
    const passwordInput = document.getElementById("password");
    const toggleButton = document.getElementById("password-toggle");
    const eyeIcon = toggleButton ? toggleButton.querySelector(".password-toggle-icon-eye") : null;
    const eyeOffIcon = toggleButton
      ? toggleButton.querySelector(".password-toggle-icon-eye-off")
      : null;
    if (!passwordInput || !toggleButton) return;

    function syncPasswordToggle() {
      const isVisible = passwordInput.type === "text";
      toggleButton.setAttribute("aria-pressed", String(isVisible));
      toggleButton.setAttribute("aria-label", isVisible ? "Hide password" : "Show password");
      if (eyeIcon) {
        eyeIcon.hidden = !isVisible;
      }
      if (eyeOffIcon) {
        eyeOffIcon.hidden = isVisible;
      }
    }

    syncPasswordToggle();

    toggleButton.addEventListener("click", function () {
      passwordInput.type = passwordInput.type === "password" ? "text" : "password";
      syncPasswordToggle();
    });
  }

  function showLoginError(form, message) {
    const feedback = document.getElementById("login-feedback");
    const errorNode = document.getElementById("login-error");
    if (feedback) {
      feedback.hidden = false;
      feedback.classList.add("is-visible");
    }
    if (errorNode) {
      errorNode.textContent = message;
    }
    if (form) {
      form.classList.add("login-form-error");
      form.querySelectorAll("input").forEach((input) => {
        input.classList.add("is-invalid");
      });
    }
  }

  function clearLoginError(form) {
    const feedback = document.getElementById("login-feedback");
    const errorNode = document.getElementById("login-error");
    if (feedback) {
      feedback.hidden = true;
      feedback.classList.remove("is-visible");
    }
    if (errorNode) {
      errorNode.textContent = "";
    }
    if (form) {
      form.classList.remove("login-form-error");
      form.querySelectorAll("input").forEach((input) => {
        input.classList.remove("is-invalid");
      });
    }
  }

  function bindForm() {
    const form = document.getElementById("login-form");
    if (!form) return;

    form.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", function () {
        clearLoginError(form);
      });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearLoginError(form);
      const formData = new FormData(form);
      const result = auth.login(formData.get("identifier"), formData.get("password"));
      if (!result.success) {
        showLoginError(form, result.message);
        return;
      }
      if (ui && typeof ui.navigateWithLoader === "function") {
        ui.navigateWithLoader("dashboard.html");
        return;
      }
      window.location.href = "dashboard.html";
    });
  }

  seed.ensureSeedData();
  if (!auth.requireGuest()) {
    return;
  }

  bindForm();
  bindPasswordToggle();
})();

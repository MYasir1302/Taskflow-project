(function () {
  const TaskFlow = (window.TaskFlow = window.TaskFlow || {});
  const { clearSession, requestSync, loadDatabase, clearDbCache } = TaskFlow.storage;
  const { canAccessPage } = TaskFlow.permissions;
  const { ensureSeedData } = TaskFlow.seed;

  function getCurrentUser() {
    const response = requestSync("auth/session.php", "GET");
    if (!response.success || !response.user) {
      return null;
    }
    return response.user;
  }

  function login(identifier, password) {
    ensureSeedData();
    const response = requestSync("auth/login.php", "POST", {
      identifier,
      password,
    });

    if (!response.success || !response.user) {
      return {
        success: false,
        message: response.message || "Invalid email or password.",
      };
    }

    clearDbCache();
    loadDatabase();

    return {
      success: true,
      user: response.user,
    };
  }

  function logout() {
    clearSession();
    if (TaskFlow.ui && typeof TaskFlow.ui.navigateWithLoader === "function") {
      TaskFlow.ui.navigateWithLoader("login.html");
      return;
    }
    window.location.href = "login.html";
  }

  function requireGuest() {
    ensureSeedData();
    const user = getCurrentUser();
    if (user) {
      window.location.href = "dashboard.html";
      return false;
    }
    return true;
  }

  function requireAuth(pageName) {
    ensureSeedData();
    const user = getCurrentUser();
    if (!user) {
      window.location.href = "login.html";
      return null;
    }

    if (!TaskFlow.storage.hasDbCache()) {
      loadDatabase();
    }

    if (pageName && !canAccessPage(user, pageName)) {
      window.location.href = "dashboard.html";
      return null;
    }

    return user;
  }

  TaskFlow.auth = {
    getCurrentUser,
    login,
    logout,
    requireGuest,
    requireAuth,
  };
})();

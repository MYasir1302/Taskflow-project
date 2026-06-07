(function () {
  const TaskFlow = (window.TaskFlow = window.TaskFlow || {});
  const { initials, escapeHtml } = TaskFlow.utils;
  const { navigationItems } = TaskFlow.permissions;
  let selectEnhancerStarted = false;
  let pageLoaderBound = false;
  let pendingNavigation = false;
  const pickerInputTypes = ["date", "datetime-local", "month", "time"];
  const PAGE_LOADER_DELAY_MS = 1000;

  function applyShellTheme(activeNav) {
    if (!document.body) return;
    const existingPageClass = Array.from(document.body.classList).find((className) => {
      return className.indexOf("page-") === 0;
    });
    const nextPageClass = activeNav ? `page-${activeNav}` : existingPageClass;

    document.body.classList.remove("app-portfolio", "app-light");
    Array.from(document.body.classList)
      .filter((className) => className.indexOf("page-") === 0)
      .forEach((className) => document.body.classList.remove(className));

    document.body.classList.add("app-portfolio");
    if (nextPageClass) {
      document.body.classList.add(nextPageClass);
    }
  }

  function enhanceSelects(root) {
    (root || document).querySelectorAll("select").forEach((select) => {
      if (select.dataset.selectEnhanced === "true") return;
      const wrapper = document.createElement("div");
      wrapper.className = "select-shell";
      select.parentNode.insertBefore(wrapper, select);
      wrapper.appendChild(select);
      select.dataset.selectEnhanced = "true";
    });
  }

  function enhancePickerInputs(root) {
    const selector = pickerInputTypes.map((type) => `input[type="${type}"]`).join(", ");
    (root || document).querySelectorAll(selector).forEach((input) => {
      if (input.dataset.pickerEnhanced === "true") return;
      const wrapper = document.createElement("div");
      const iconType = input.type === "time" ? "time" : "calendar";
      wrapper.className = `picker-shell picker-shell-${iconType}`;
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      input.dataset.pickerEnhanced = "true";
    });
  }

  function startSelectEnhancer() {
    if (selectEnhancerStarted || !document.body) return;
    selectEnhancerStarted = true;
    enhanceSelects(document);
    enhancePickerInputs(document);
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (
            node.matches &&
            (node.matches("select") ||
              pickerInputTypes.some((type) => node.matches(`input[type="${type}"]`)))
          ) {
            enhanceSelects(node.parentNode || document);
            enhancePickerInputs(node.parentNode || document);
            return;
          }
          enhanceSelects(node);
          enhancePickerInputs(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function ensurePageLoader() {
    if (!document.body) return null;
    let loader = document.getElementById("page-loader");
    if (loader) return loader;
    loader = document.createElement("div");
    loader.id = "page-loader";
    loader.className = "page-loader";
    loader.setAttribute("aria-hidden", "true");
    loader.innerHTML = `<div class="page-loader-spinner" aria-hidden="true"></div>`;
    document.body.appendChild(loader);
    return loader;
  }

  function showPageLoader() {
    const loader = ensurePageLoader();
    if (!loader || !document.body) return;
    document.body.classList.add("is-page-loading");
    loader.classList.add("open");
  }

  function hidePageLoader() {
    const loader = document.getElementById("page-loader");
    if (!loader || !document.body) return;
    document.body.classList.remove("is-page-loading");
    loader.classList.remove("open");
  }

  function navigateWithLoader(url, delayMs) {
    if (!url || pendingNavigation) return;
    pendingNavigation = true;
    showPageLoader();
    window.setTimeout(function () {
      window.location.href = url;
    }, typeof delayMs === "number" ? delayMs : PAGE_LOADER_DELAY_MS);
  }

  function bindPageLoaderNavigation() {
    if (pageLoaderBound || !document.body) return;
    pageLoaderBound = true;
    ensurePageLoader();

    document.addEventListener("click", function (event) {
      if (event.defaultPrevented || pendingNavigation) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest ? event.target.closest("a[href]") : null;
      if (!anchor) return;
      if (anchor.dataset.skipLoader === "true") return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href[0] === "#" || href.indexOf("javascript:") === 0) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;

      event.preventDefault();
      navigateWithLoader(destination.href);
    });
  }

  function renderShell(options) {
    const currentUser = options.currentUser;
    const primaryAction = options.primaryAction;
    const displayName = currentUser.role === "admin" ? "Admin" : currentUser.name;
    const displayAvatar = currentUser.role === "admin" ? "A" : initials(currentUser.name);
    applyShellTheme(options.activeNav);
    const navMarkup = navigationItems(currentUser)
      .map((item) => {
        const activeClass = item.key === options.activeNav ? "active" : "";
        return `
          <li>
            <a class="nav-link ${activeClass}" href="${item.href}">
              <span class="nav-bullet"></span>
              <span class="nav-label">${item.label}</span>
              <span class="nav-trail"></span>
            </a>
          </li>
        `;
      })
      .join("");

    const sidebarQuickCard = "";

    const sidebarOrbital = `
      <div class="sidebar-orbital-wrap" aria-hidden="true">
        <div class="sidebar-orbital">
          <span class="sidebar-orbital-ring ring-outer"></span>
          <span class="sidebar-orbital-ring ring-mid"></span>
          <span class="sidebar-orbital-ring ring-inner"></span>
          <span class="sidebar-orbital-arc arc-a"></span>
          <span class="sidebar-orbital-arc arc-b"></span>
          <span class="sidebar-orbital-arc arc-c"></span>
          <span class="sidebar-orbital-cross cross-h"></span>
          <span class="sidebar-orbital-cross cross-v"></span>
          <span class="sidebar-orbital-pulse pulse-a"></span>
          <span class="sidebar-orbital-pulse pulse-b"></span>
          <span class="sidebar-orbital-core"></span>
        </div>
      </div>
    `;

    const sidebar = document.getElementById("sidebar");
    const topbar = document.getElementById("topbar");
    if (!sidebar || !topbar) return;

    sidebar.innerHTML = `
      <div class="sidebar-head">
        <div class="brand">
          <div class="brand-mark">TF</div>
          <div class="brand-copy">
            <h1>TASKFLOW</h1>
            <p>Smart team management</p>
          </div>
        </div>
        <div class="sidebar-profile">
          <div class="avatar">${displayAvatar}</div>
          <div class="sidebar-profile-copy">
            <strong>${escapeHtml(displayName)}</strong>
            <p>${escapeHtml(currentUser.role === "admin" ? "Administrator workspace" : "Team workspace")}</p>
          </div>
        </div>
      </div>
      <div class="sidebar-workspace">
        <p class="sidebar-section-title">Workspace</p>
        <ul class="nav-list">${navMarkup}</ul>
      </div>

      ${sidebarOrbital}
      ${sidebarQuickCard}
    `;

    topbar.innerHTML = `
      <div class="page-heading">
        <h2>${escapeHtml(options.title || "TASKFLOW")}</h2>
        <p>${escapeHtml(options.subtitle || "Keep projects moving with clarity.")}</p>
      </div>
      <div class="topbar-actions">
        <div class="search-box">
          <input id="global-search" type="search" placeholder="Search projects, tasks, members..." />
        </div>
        ${
          primaryAction
            ? primaryAction.href
              ? `<a class="btn btn-primary topbar-primary-action" href="${escapeHtml(primaryAction.href)}">${escapeHtml(
                  primaryAction.label
                )}</a>`
              : `<button class="btn btn-primary topbar-primary-action" id="${escapeHtml(
                  primaryAction.id || "topbar-primary-action"
                )}" type="button">${escapeHtml(primaryAction.label)}</button>`
            : ""
        }
        <div class="user-pill">
          <div class="avatar">${displayAvatar}</div>
          <div>
            <strong>${escapeHtml(displayName)}</strong>
            <div class="meta-line">${escapeHtml(currentUser.email)}</div>
          </div>
        </div>
        <button class="btn btn-ghost" id="logout-button" type="button">Logout</button>
      </div>
    `;

    const logoutButton = document.getElementById("logout-button");
    if (logoutButton) {
      logoutButton.addEventListener("click", TaskFlow.auth.logout);
    }
  }

  function showToast(message, type) {
    const host = document.getElementById("toast-container");
    if (!host) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type || ""}`.trim();
    toast.textContent = message;
    host.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3200);
  }

  function showError(error, fallbackMessage) {
    const message = TaskFlow.utils
      ? TaskFlow.utils.errorMessage(error, fallbackMessage)
      : fallbackMessage || "Something went wrong.";
    showToast(message, "error");
  }

  function bindGlobalErrorHandlers() {
    if (window.__taskflowGlobalErrorsBound) return;
    window.__taskflowGlobalErrorsBound = true;

    window.addEventListener("unhandledrejection", function (event) {
      const reason = event.reason;
      if (!reason || reason._taskflowHandled) return;
      event.preventDefault();
      reason._taskflowHandled = true;
      showError(reason, "Unable to complete the request.");
      if (TaskFlow.storage && typeof TaskFlow.storage.clearSavingUi === "function") {
        TaskFlow.storage.clearSavingUi();
      } else {
        hidePageLoader();
      }
    });

    window.addEventListener("error", function (event) {
      if (!event.error || event.error._taskflowHandled) return;
      event.error._taskflowHandled = true;
      showError(event.error, "Something went wrong.");
      if (TaskFlow.storage && typeof TaskFlow.storage.clearSavingUi === "function") {
        TaskFlow.storage.clearSavingUi();
      } else {
        hidePageLoader();
      }
    });
  }

  function openModal(html, small) {
    const overlay = document.getElementById("modal-overlay");
    if (!overlay) return;
    overlay.innerHTML = `<div class="modal ${small ? "modal-small" : ""}">${html}</div>`;
    overlay.classList.add("open");
    overlay.addEventListener(
      "click",
      function handleOverlayClick(event) {
        if (event.target === overlay) {
          closeModal();
        }
      },
      { once: true }
    );
  }

  function closeModal() {
    const overlay = document.getElementById("modal-overlay");
    if (!overlay) return;
    overlay.classList.remove("open");
    overlay.innerHTML = "";
  }

  function badgeClass(type, value) {
    const safeValue = String(value || "").replace(/\s+/g, "-").toLowerCase();
    return `badge ${type}-${safeValue}`;
  }

  function renderAvatarGroup(users) {
    if (!users || !users.length) {
      return `<span class="hint">No members</span>`;
    }
    return `
      <div class="avatar-group">
        ${users
          .map(
            (user) =>
              `<div class="avatar" title="${escapeHtml(user.name)}">${initials(user.name)}</div>`
          )
          .join("")}
      </div>
    `;
  }

  function renderEmptyState(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function setFormBusy(form, isBusy, busyLabel) {
    if (!form) return;
    const submitButton = form.querySelector('[type="submit"]');
    if (!submitButton) return;
    if (isBusy) {
      if (!submitButton.dataset.defaultLabel) {
        submitButton.dataset.defaultLabel = submitButton.textContent || "Save";
      }
      submitButton.disabled = true;
      submitButton.textContent = busyLabel || "Saving...";
      form.querySelectorAll("input, select, textarea, button").forEach(function (field) {
        if (field !== submitButton) {
          field.disabled = true;
        }
      });
      return;
    }
    submitButton.disabled = false;
    submitButton.textContent = submitButton.dataset.defaultLabel || submitButton.textContent;
    form.querySelectorAll("input, select, textarea, button").forEach(function (field) {
      field.disabled = false;
    });
  }

  TaskFlow.ui = {
    applyShellTheme,
    renderShell,
    showToast,
    showError,
    showPageLoader,
    hidePageLoader,
    navigateWithLoader,
    openModal,
    closeModal,
    setFormBusy,
    badgeClass,
    renderAvatarGroup,
    renderEmptyState,
  };

  function formsEnsurePromise(value, fallbackMessage) {
    if (value && typeof value.then === "function") {
      return value;
    }
    return Promise.reject(
      new Error(
        fallbackMessage ||
          "Unable to save. Press Ctrl+Shift+R to refresh the page."
      )
    );
  }

  function patchUtilsHelpers() {
    TaskFlow.utils = TaskFlow.utils || {};
    const utilsApi = TaskFlow.utils;
    if (typeof utilsApi.setFormBusy !== "function") {
      utilsApi.setFormBusy = setFormBusy;
    }
    if (typeof utilsApi.ensurePromise !== "function") {
      utilsApi.ensurePromise = formsEnsurePromise;
    }
    if (typeof utilsApi.showError !== "function") {
      utilsApi.showError = showError;
    }
    if (typeof utilsApi.asPromise !== "function") {
      utilsApi.asPromise = function (action) {
        try {
          return Promise.resolve(action());
        } catch (error) {
          return Promise.reject(error);
        }
      };
    }
  }

  patchUtilsHelpers();

  TaskFlow.forms = {
    setFormBusy: function (form, isBusy, busyLabel) {
      patchUtilsHelpers();
      const utilsApi = TaskFlow.utils;
      if (utilsApi && typeof utilsApi.setFormBusy === "function") {
        return utilsApi.setFormBusy(form, isBusy, busyLabel);
      }
      return setFormBusy(form, isBusy, busyLabel);
    },
    ensurePromise: function (value, fallbackMessage) {
      patchUtilsHelpers();
      const utilsApi = TaskFlow.utils;
      if (utilsApi && typeof utilsApi.ensurePromise === "function") {
        return utilsApi.ensurePromise(value, fallbackMessage);
      }
      return formsEnsurePromise(value, fallbackMessage);
    },
    showError: function (error, fallbackMessage) {
      patchUtilsHelpers();
      const utilsApi = TaskFlow.utils;
      if (utilsApi && typeof utilsApi.showError === "function") {
        return utilsApi.showError(error, fallbackMessage);
      }
      return showError(error, fallbackMessage);
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      function () {
        startSelectEnhancer();
        bindPageLoaderNavigation();
        bindGlobalErrorHandlers();
      },
      { once: true }
    );
  } else {
    startSelectEnhancer();
    bindPageLoaderNavigation();
    bindGlobalErrorHandlers();
  }

  if (TaskFlow.events && typeof TaskFlow.events.on === "function") {
    TaskFlow.events.on("preferences:updated", function () {
      applyShellTheme();
    });
  }
})();

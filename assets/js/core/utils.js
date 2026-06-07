(function () {
  const TaskFlow = (window.TaskFlow = window.TaskFlow || {});

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function toDate(value) {
    return value ? new Date(value) : new Date();
  }

  function uid(prefix) {
    return [
      prefix,
      Date.now().toString(36),
      Math.random().toString(36).slice(2, 8),
    ].join("_");
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function formatDate(value) {
    if (!value) return "Not set";
    return toDate(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatDateTime(value) {
    if (!value) return "Not set";
    return toDate(value).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function toInputDate(value) {
    if (!value) return "";
    const date = toDate(value);
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
    ].join("-");
  }

  function initials(name) {
    return String(name || "TF")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((item) => item[0].toUpperCase())
      .join("");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value) || 0, min), max);
  }

  function diffInDays(startValue, endValue) {
    const start = new Date(toInputDate(startValue));
    const end = new Date(toInputDate(endValue));
    const milliseconds = end.getTime() - start.getTime();
    return Math.round(milliseconds / (1000 * 60 * 60 * 24));
  }

  function addDays(value, days) {
    const date = new Date(toInputDate(value));
    date.setDate(date.getDate() + Number(days || 0));
    return toInputDate(date);
  }

  function percent(value) {
    return `${clamp(value, 0, 100)}%`;
  }

  function parseQuery() {
    return new URLSearchParams(window.location.search);
  }

  function getQueryParam(name) {
    return parseQuery().get(name);
  }

  function setQueryParams(params) {
    const search = parseQuery();
    Object.keys(params || {}).forEach((key) => {
      const value = params[key];
      if (value === null || value === undefined || value === "") {
        search.delete(key);
      } else {
        search.set(key, value);
      }
    });
    const newUrl = `${window.location.pathname}?${search.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }

  function currency(value) {
    const amount = Number(value || 0);
    return amount.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
  }

  function asPromise(action) {
    try {
      return Promise.resolve(action());
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function errorMessage(error, fallback) {
    if (!error) return fallback || "Something went wrong.";
    if (typeof error === "string") return error;
    return error.message || fallback || "Something went wrong.";
  }

  function setFormBusy(form, isBusy, busyLabel) {
    const uiApi = window.TaskFlow && window.TaskFlow.ui;
    if (uiApi && typeof uiApi.setFormBusy === "function") {
      uiApi.setFormBusy(form, isBusy, busyLabel);
      return;
    }
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

  function ensurePromise(value, fallbackMessage) {
    if (value && typeof value.then === "function") {
      return value;
    }
    return Promise.reject(
      new Error(fallbackMessage || "Unable to save. Press Ctrl+Shift+R to refresh the page.")
    );
  }

  function showError(error, fallbackMessage) {
    const uiApi = window.TaskFlow && window.TaskFlow.ui;
    const message = errorMessage(error, fallbackMessage);
    if (uiApi && typeof uiApi.showToast === "function") {
      uiApi.showToast(message, "error");
      return;
    }
    window.alert(message);
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  TaskFlow.utils = Object.assign({}, TaskFlow.utils, {
    uid,
    nowIso,
    clone,
    formatDate,
    formatDateTime,
    toInputDate,
    initials,
    escapeHtml,
    clamp,
    diffInDays,
    addDays,
    percent,
    getQueryParam,
    setQueryParams,
    currency,
    downloadJson,
    asPromise,
    errorMessage,
    setFormBusy,
    ensurePromise,
    showError,
  });
})();

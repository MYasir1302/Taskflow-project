(function () {
  const TaskFlow = (window.TaskFlow = window.TaskFlow || {});
  const { clone, nowIso } = TaskFlow.utils;
  const { emit } = TaskFlow.events;

  const STORAGE_KEYS = {
    preferences: "taskflow_preferences",
  };

  const ACTIVITY_LOG_LIMIT = 150;

  let dbCache = null;
  let apiErrorMessage = "";
  let saveQueue = Promise.resolve();

  function createEmptyDb() {
    return {
      meta: {
        version: "1.0.0",
        seeded: false,
        lastUpdated: nowIso(),
      },
      users: [],
      projects: [],
      tasks: [],
      comments: [],
      projectMembers: [],
      activityLogs: [],
    };
  }

  function safeParse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function trimActivityLogs(db) {
    if (!db || !Array.isArray(db.activityLogs)) return;
    if (db.activityLogs.length > ACTIVITY_LOG_LIMIT) {
      db.activityLogs = db.activityLogs.slice(0, ACTIVITY_LOG_LIMIT);
    }
  }

  function getApiPath(path) {
    return `api/${path}`;
  }

  function requestSync(path, method, body) {
    const xhr = new XMLHttpRequest();
    xhr.open(method, getApiPath(path), false);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/json");
    try {
      xhr.send(body ? JSON.stringify(body) : null);
    } catch (error) {
      apiErrorMessage = "Cannot reach PHP backend. Open the project from http://localhost/TaskFlow/";
      return { success: false, message: apiErrorMessage };
    }

    if (!xhr.responseText) {
      return { success: false, message: "Empty response from server." };
    }

    try {
      return JSON.parse(xhr.responseText);
    } catch (error) {
      return { success: false, message: "Invalid response from PHP server." };
    }
  }

  function requestAsync(path, method, body) {
    return fetch(getApiPath(path), {
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    })
      .then(function (response) {
        return response.json();
      })
      .catch(function () {
        return {
          success: false,
          message: "Cannot reach PHP backend. Open the project from http://localhost/TaskFlow/",
        };
      });
  }

  function clearSavingUi() {
    if (document.body) {
      document.body.classList.remove("is-saving-data");
    }
    if (TaskFlow.ui && typeof TaskFlow.ui.hidePageLoader === "function") {
      TaskFlow.ui.hidePageLoader();
    }
  }

  function setSavingState(isSaving) {
    if (!document.body) return;
    if (isSaving) {
      document.body.classList.add("is-saving-data");
      return;
    }
    clearSavingUi();
  }

  function installDatabase() {
    return requestSync("install.php", "GET");
  }

  function loadDatabase() {
    const response = requestSync("data.php", "GET");
    if (response.success && response.data) {
      dbCache = response.data;
      emit("db:updated", dbCache);
      return dbCache;
    }
    if (response.message && response.message.indexOf("Not logged in") === -1) {
      apiErrorMessage = response.message;
    }
    return null;
  }

  function readDb() {
    if (dbCache) {
      return dbCache;
    }
    const loaded = loadDatabase();
    if (loaded) {
      return loaded;
    }
    return createEmptyDb();
  }

  function writeDb(db, options) {
    const nextDb = clone(db);
    trimActivityLogs(nextDb);
    nextDb.meta = nextDb.meta || {};
    nextDb.meta.version = "1.0.0";
    nextDb.meta.lastUpdated = nowIso();

    const payload = { db: nextDb };
    if (options && Array.isArray(options.scope) && options.scope.length) {
      payload.scope = options.scope;
      if (options.syncDeletes) {
        payload.syncDeletes = true;
      }
    }

    setSavingState(true);

    const saveJob = requestAsync("save.php", "POST", payload).then(function (response) {
      if (!response.success || !response.data) {
        throw new Error(response.message || apiErrorMessage || "Unable to save data.");
      }
      dbCache = response.data;
      emit("db:updated", dbCache);
      return dbCache;
    });

    const queuedSave = saveQueue.then(function () {
      return saveJob;
    });

    saveQueue = queuedSave.catch(function () {
      return null;
    });

    return queuedSave.finally(function () {
      clearSavingUi();
    });
  }

  function updateDb(updater, options) {
    let updated;
    try {
      const db = readDb();
      const workingCopy = clone(db);
      updated = updater(workingCopy) || workingCopy;
    } catch (error) {
      return Promise.reject(error);
    }
    return writeDb(updated, options);
  }

  function readSession() {
    const response = requestSync("auth/session.php", "GET");
    if (!response.success || !response.user) {
      return null;
    }
    return {
      userId: response.user.id,
      loginAt: response.loginAt || new Date().toISOString(),
    };
  }

  function writeSession(session) {
    emit("session:updated", session);
  }

  function clearSession() {
    requestSync("auth/logout.php", "POST");
    dbCache = null;
    emit("session:updated", null);
  }

  function readPreferences() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.preferences), {
      boardProjectId: "",
      timelineProjectId: "",
      dashboardSearch: "",
      notificationLookaheadDays: 7,
      dismissedNotificationIds: {},
      themeMode: "dark",
    });
  }

  function writePreferences(preferences) {
    localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify(preferences));
    emit("preferences:updated", preferences);
  }

  function resetDb(nextDb) {
    dbCache = nextDb;
    return writeDb(nextDb);
  }

  function clearDbCache() {
    dbCache = null;
  }

  function hasDbCache() {
    return dbCache !== null;
  }

  TaskFlow.storage = {
    STORAGE_KEYS,
    createEmptyDb,
    installDatabase,
    loadDatabase,
    readDb,
    writeDb,
    updateDb,
    readSession,
    writeSession,
    clearSession,
    readPreferences,
    writePreferences,
    resetDb,
    clearDbCache,
    hasDbCache,
    clearSavingUi,
    requestSync,
    requestAsync,
  };

  if (typeof window !== "undefined" && !window.__taskflowPreferencesSyncBound) {
    window.__taskflowPreferencesSyncBound = true;
    window.addEventListener("storage", function (event) {
      if (event.key === STORAGE_KEYS.preferences) {
        emit(
          "preferences:updated",
          safeParse(event.newValue, {
            boardProjectId: "",
            timelineProjectId: "",
            dashboardSearch: "",
            notificationLookaheadDays: 7,
            dismissedNotificationIds: {},
            themeMode: "dark",
          })
        );
      }
    });
  }
})();


(function () {
  const { auth, ui, managers, storage, events } = window.TaskFlow;
  const utils = window.TaskFlow.utils;
  const currentUser = auth.requireAuth("notifications.html");
  if (!currentUser) return;

  ui.renderShell({
    currentUser,
    activeNav: "notifications",
    title: "Notifications",
    subtitle: "Stay on top of due dates, reviews, and recent updates that need attention.",
  });

  const pageContent = document.getElementById("page-content");
  let currentFilter = "unread";

  function syncCurrentUser() {
    const latestUser = auth.requireAuth("notifications.html");
    if (!latestUser) return null;
    Object.assign(currentUser, latestUser);
    return currentUser;
  }

  function getPreferences() {
    return storage.readPreferences();
  }

  function getDismissedIds() {
    const preferences = getPreferences();
    const bucket = preferences.dismissedNotificationIds || {};
    return bucket[currentUser.id] || [];
  }

  function saveDismissedIds(ids) {
    const preferences = getPreferences();
    const nextBucket = Object.assign({}, preferences.dismissedNotificationIds || {}, {
      [currentUser.id]: ids,
    });
    storage.writePreferences(
      Object.assign({}, preferences, {
        dismissedNotificationIds: nextBucket,
      })
    );
  }

  function buildNotifications() {
    const slice = managers.report.getVisibleDatabaseSlice(currentUser);
    const tasks = managers.task.getVisibleTasks(currentUser);
    const lookaheadDays = Math.max(1, Number(getPreferences().notificationLookaheadDays || 7));
    const today = utils.toInputDate(new Date());
    const items = [];

    tasks.forEach((task) => {
      const project = managers.project.getProjectById(task.projectId);
      const isAssignedToCurrentUser = (task.assignedTo || []).includes(currentUser.id);
      const titlePrefix = project ? `${project.name}: ` : "";
      if (task.status !== "done" && task.dueDate && task.dueDate < today) {
        items.push({
          id: `overdue-${task.id}`,
          tone: "error",
          title: `Overdue task`,
          body: `${titlePrefix}${task.title} is overdue since ${utils.formatDate(task.dueDate)}.`,
          createdAt: task.updatedAt || task.dueDate,
          href: `board.html?projectId=${task.projectId}`,
        });
      }

      if (task.status !== "done" && task.dueDate) {
        const daysLeft = utils.diffInDays(today, task.dueDate);
        if (daysLeft >= 0 && daysLeft <= lookaheadDays) {
          items.push({
            id: `soon-${task.id}`,
            tone: "warning",
            title: `Due soon`,
            body: `${titlePrefix}${task.title} is due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
            createdAt: task.updatedAt || task.dueDate,
            href: `board.html?projectId=${task.projectId}`,
          });
        }
      }

      if (isAssignedToCurrentUser && task.status === "review") {
        items.push({
          id: `review-${task.id}`,
          tone: "info",
          title: `Task waiting in review`,
          body: `${titlePrefix}${task.title} is currently in review.`,
          createdAt: task.updatedAt || task.createdAt,
          href: `board.html?projectId=${task.projectId}`,
        });
      }
    });

    (slice.activityLogs || [])
      .slice()
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .slice(0, 10)
      .forEach((log) => {
        if (log.actorId === currentUser.id) return;
        if (!["comment_added", "comment_replied", "task_updated", "project_members_updated"].includes(log.type)) {
          return;
        }
        const actor = managers.user.getUserById(log.actorId);
        items.push({
          id: `log-${log.id}`,
          tone: "neutral",
          title: actor ? `${actor.name} updated your workspace` : "Workspace updated",
          body: log.message,
          createdAt: log.createdAt,
          href: log.projectId ? `project-details.html?id=${log.projectId}` : "activity.html",
        });
      });

    return items.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  }

  function render() {
    const dismissedIds = new Set(getDismissedIds());
    const notifications = buildNotifications();
    const unreadNotifications = notifications.filter((item) => !dismissedIds.has(item.id));
    const visibleNotifications = currentFilter === "all" ? notifications : unreadNotifications;

    pageContent.innerHTML = `
      <section class="toolbar">
        <div class="toolbar-group">
          <button class="btn ${currentFilter === "unread" ? "btn-primary" : "btn-ghost"}" data-filter="unread" type="button">Unread</button>
          <button class="btn ${currentFilter === "all" ? "btn-primary" : "btn-ghost"}" data-filter="all" type="button">All</button>
        </div>
        <div class="toolbar-group">
          <div class="hint">${unreadNotifications.length} unread</div>
          <button class="btn btn-secondary" id="mark-all-read" type="button">Mark All Read</button>
        </div>
      </section>

      <section class="grid grid-3">
        <article class="card stat-card">
          <div class="stat-meta">Unread Alerts</div>
          <div class="stat-value primary">${unreadNotifications.length}</div>
          <div class="stat-meta">Pending items requiring attention</div>
        </article>
        <article class="card stat-card">
          <div class="stat-meta">Due Soon Window</div>
          <div class="stat-value teal">${Math.max(1, Number(getPreferences().notificationLookaheadDays || 7))}</div>
          <div class="stat-meta">Days used for deadline alerts</div>
        </article>
        <article class="card stat-card">
          <div class="stat-meta">Visible Updates</div>
          <div class="stat-value green">${notifications.length}</div>
          <div class="stat-meta">Generated from your accessible data</div>
        </article>
      </section>

      <section class="card" style="margin-top:20px;">
        <div class="card-header">
          <div>
            <h3>Notification Center</h3>
            <p>Dismiss items you have already reviewed. They stay saved in local storage.</p>
          </div>
        </div>
        <div class="notification-list">
          ${
            visibleNotifications.length
              ? visibleNotifications
                  .map(
                    (item) => `
                      <article class="notification-item ${item.tone}">
                        <div class="split">
                          <div>
                            <strong>${utils.escapeHtml(item.title)}</strong>
                            <div class="meta-line">${utils.formatDateTime(item.createdAt)}</div>
                          </div>
                          <button class="btn btn-ghost" data-dismiss-notification="${item.id}" type="button">Dismiss</button>
                        </div>
                        <p>${utils.escapeHtml(item.body)}</p>
                        <div class="notification-actions">
                          <a class="btn btn-secondary" href="${item.href}">Open</a>
                        </div>
                      </article>
                    `
                  )
                  .join("")
              : ui.renderEmptyState("No notifications for the current filter.")
          }
        </div>
      </section>
    `;

    pageContent.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", function () {
        currentFilter = button.getAttribute("data-filter");
        render();
      });
    });

    const markAllButton = document.getElementById("mark-all-read");
    if (markAllButton) {
      markAllButton.addEventListener("click", function () {
        saveDismissedIds(notifications.map((item) => item.id));
        ui.showToast("All notifications marked as read.", "success");
        render();
      });
    }

    pageContent.querySelectorAll("[data-dismiss-notification]").forEach((button) => {
      button.addEventListener("click", function () {
        const nextIds = Array.from(new Set(getDismissedIds().concat(button.getAttribute("data-dismiss-notification"))));
        saveDismissedIds(nextIds);
        render();
      });
    });
  }

  render();
  events.on("db:updated", function () {
    if (!syncCurrentUser()) return;
    render();
  });
  events.on("preferences:updated", function () {
    render();
  });
  events.on("session:updated", function () {
    syncCurrentUser();
  });
})();

(function () {
  const { auth, ui, managers, events } = window.TaskFlow;
  const utils = window.TaskFlow.utils;
  const currentUser = auth.requireAuth("activity.html");
  if (!currentUser) return;

  ui.renderShell({
    currentUser,
    activeNav: "activity",
    title: "Activity",
    subtitle: "Follow live workspace updates across your visible projects and tasks.",
  });

  const pageContent = document.getElementById("page-content");
  let currentQuery = "";
  let currentType = "all";
  let currentProjectId = "";

  function syncCurrentUser() {
    const latestUser = auth.requireAuth("activity.html");
    if (!latestUser) return null;
    Object.assign(currentUser, latestUser);
    return currentUser;
  }

  function getLogTypeLabel(type) {
    return String(type || "update")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function getActivityLink(log) {
    if (log.taskId && log.projectId) {
      return { href: `board.html?projectId=${log.projectId}`, label: "Open Board" };
    }
    if (log.projectId) {
      return { href: `project-details.html?id=${log.projectId}`, label: "Open Project" };
    }
    return null;
  }

  function getActivityTone(type) {
    if (String(type || "").startsWith("task_")) return "progress";
    if (String(type || "").startsWith("project_")) return "primary";
    if (String(type || "").startsWith("comment_")) return "review";
    if (String(type || "").startsWith("user_")) return "done";
    return "todo";
  }

  function getFilteredLogs() {
    const slice = managers.report.getVisibleDatabaseSlice(currentUser);
    const logs = (slice.activityLogs || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const normalized = String(currentQuery || "").trim().toLowerCase();

    return logs.filter((log) => {
      const actor = managers.user.getUserById(log.actorId);
      const matchesQuery =
        !normalized ||
        String(log.message || "").toLowerCase().includes(normalized) ||
        String(log.type || "").toLowerCase().includes(normalized) ||
        String(actor ? actor.name : "").toLowerCase().includes(normalized);
      const matchesType = currentType === "all" ? true : log.type === currentType;
      const matchesProject = currentProjectId ? log.projectId === currentProjectId : true;
      return matchesQuery && matchesType && matchesProject;
    });
  }

  function render() {
    const projects = managers.project.getVisibleProjects(currentUser);
    if (currentProjectId && !projects.some((project) => project.id === currentProjectId)) {
      currentProjectId = "";
    }
    const logs = getFilteredLogs();
    const taskLogs = logs.filter((log) => String(log.type || "").startsWith("task_")).length;
    const commentLogs = logs.filter((log) => String(log.type || "").startsWith("comment_")).length;
    const projectLogs = logs.filter((log) => String(log.type || "").startsWith("project_")).length;
    const userLogs = logs.filter((log) => String(log.type || "").startsWith("user_")).length;
    const types = Array.from(new Set(logs.map((log) => log.type).filter(Boolean)));
    const topActors = Object.values(
      logs.reduce((accumulator, log) => {
        const actor = managers.user.getUserById(log.actorId);
        const key = actor ? actor.id : "system";
        if (!accumulator[key]) {
          accumulator[key] = {
            id: key,
            name: actor ? actor.name : "System",
            count: 0,
          };
        }
        accumulator[key].count += 1;
        return accumulator;
      }, {})
    )
      .sort((left, right) => right.count - left.count)
      .slice(0, 5);
    const projectSummary = Object.values(
      logs.reduce((accumulator, log) => {
        if (!log.projectId) return accumulator;
        const project = managers.project.getProjectById(log.projectId);
        if (!project) return accumulator;
        if (!accumulator[project.id]) {
          accumulator[project.id] = { id: project.id, name: project.name, count: 0 };
        }
        accumulator[project.id].count += 1;
        return accumulator;
      }, {})
    )
      .sort((left, right) => right.count - left.count)
      .slice(0, 5);

    pageContent.innerHTML = `
      <section class="toolbar">
        <div class="toolbar-group">
          <select id="activity-type-filter">
            <option value="all">All Types</option>
            ${types
              .map(
                (type) => `
                  <option value="${type}" ${type === currentType ? "selected" : ""}>${utils.escapeHtml(
                    getLogTypeLabel(type)
                  )}</option>
                `
              )
              .join("")}
          </select>
          <select id="activity-project-filter">
            <option value="">All Visible Projects</option>
            ${projects
              .map(
                (project) => `
                  <option value="${project.id}" ${project.id === currentProjectId ? "selected" : ""}>
                    ${utils.escapeHtml(project.name)}
                  </option>
                `
              )
              .join("")}
          </select>
        </div>
        <div class="summary-pill">${logs.length} updates visible</div>
      </section>

      <section class="grid grid-4">
        <article class="card stat-card">
          <div class="stat-meta">Project Updates</div>
          <div class="stat-value primary">${projectLogs}</div>
          <div class="stat-meta">Project-level changes in scope</div>
        </article>
        <article class="card stat-card">
          <div class="stat-meta">Task Updates</div>
          <div class="stat-value teal">${taskLogs}</div>
          <div class="stat-meta">Task create, edit, and workflow changes</div>
        </article>
        <article class="card stat-card">
          <div class="stat-meta">Comment Updates</div>
          <div class="stat-value green">${commentLogs}</div>
          <div class="stat-meta">Comments and replies across visible work</div>
        </article>
        <article class="card stat-card">
          <div class="stat-meta">Team Updates</div>
          <div class="stat-value teal">${userLogs}</div>
          <div class="stat-meta">Profile, role, and member changes</div>
        </article>
      </section>

      <section class="page-fit-shell" style="margin-top:20px;">
        <div class="page-fit-main">
          <section class="card">
            <div class="card-header">
              <div>
                <h3>Workspace Feed</h3>
                <p>Search and review everything that changed recently.</p>
              </div>
            </div>
            <div class="activity-feed panel-scroll">
              ${
                logs.length
                  ? logs
                      .map((log) => {
                        const actor = managers.user.getUserById(log.actorId);
                        const link = getActivityLink(log);
                        const project = log.projectId ? managers.project.getProjectById(log.projectId) : null;
                        const toneClass = getActivityTone(log.type);
                        return `
                          <article class="activity-item">
                            <div class="activity-item-top">
                              <div class="activity-item-label">
                                <span class="activity-tone ${toneClass}"></span>
                                <span class="badge">${utils.escapeHtml(getLogTypeLabel(log.type))}</span>
                              </div>
                              <span class="meta-line">${utils.formatDateTime(log.createdAt)}</span>
                            </div>
                            <strong>${utils.escapeHtml(log.message)}</strong>
                            <div class="activity-item-meta">
                              <span>By ${utils.escapeHtml(actor ? actor.name : "System")}</span>
                              ${project ? `<span>${utils.escapeHtml(project.name)}</span>` : ""}
                            </div>
                            ${
                              link
                                ? `<div class="activity-item-actions"><a class="btn btn-ghost" href="${link.href}">${link.label}</a></div>`
                                : ""
                            }
                          </article>
                        `;
                      })
                      .join("")
                  : ui.renderEmptyState("No activity matches the current filters.")
              }
            </div>
          </section>
        </div>

        <aside class="page-fit-side">
          <section class="card">
            <div class="card-header">
              <div>
                <h3>Top Contributors</h3>
                <p>People appearing most often in the filtered feed.</p>
              </div>
            </div>
            <div class="list panel-scroll">
              ${
                topActors.length
                  ? topActors
                      .map(
                        (actor) => `
                          <div class="list-item">
                            <div>
                              <strong>${utils.escapeHtml(actor.name)}</strong>
                              <div class="meta-line">${actor.count} updates in current view</div>
                            </div>
                          </div>
                        `
                      )
                      .join("")
                  : ui.renderEmptyState("No contributors in this filtered feed.")
              }
            </div>
          </section>

          <section class="card">
            <div class="card-header">
              <div>
                <h3>Most Active Projects</h3>
                <p>Projects with the highest update volume right now.</p>
              </div>
            </div>
            <div class="list panel-scroll">
              ${
                projectSummary.length
                  ? projectSummary
                      .map(
                        (project) => `
                          <div class="list-item">
                            <div>
                              <strong>${utils.escapeHtml(project.name)}</strong>
                              <div class="meta-line">${project.count} updates in current view</div>
                            </div>
                            <a class="btn btn-ghost" href="project-details.html?id=${project.id}">Open</a>
                          </div>
                        `
                      )
                      .join("")
                  : ui.renderEmptyState("No project-specific activity in this filtered view.")
              }
            </div>
          </section>
        </aside>
      </section>
    `;

    const topbarSearch = document.getElementById("global-search");
    if (topbarSearch) {
      topbarSearch.value = currentQuery;
      topbarSearch.oninput = function (event) {
        currentQuery = event.target.value;
        render();
      };
    }

    const typeFilter = document.getElementById("activity-type-filter");
    if (typeFilter) {
      typeFilter.onchange = function (event) {
        currentType = event.target.value;
        render();
      };
    }

    const projectFilter = document.getElementById("activity-project-filter");
    if (projectFilter) {
      projectFilter.onchange = function (event) {
        currentProjectId = event.target.value;
        render();
      };
    }
  }

  render();
  events.on("db:updated", function () {
    if (!syncCurrentUser()) return;
    render();
  });
  events.on("session:updated", function () {
    syncCurrentUser();
  });
})();

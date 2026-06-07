(function () {
  const { auth, ui, managers, events } = window.TaskFlow;
  const utils = window.TaskFlow.utils;
  const currentUser = auth.requireAuth("reports.html");
  if (!currentUser) return;

  ui.renderShell({
    currentUser,
    activeNav: "reports",
    title: "Reports",
    subtitle: "Review project performance, workload, and delivery metrics.",
  });

  const pageContent = document.getElementById("page-content");
  let selectedProjectId = "";

  function syncCurrentUser() {
    const latestUser = auth.requireAuth("reports.html");
    if (!latestUser) return null;
    Object.assign(currentUser, latestUser);
    return currentUser;
  }

  function renderStatusRow(label, count, total) {
    const width = total ? Math.round((count / total) * 100) : 0;
    return `
      <div class="report-bar">
        <div class="split">
          <strong>${label}</strong>
          <span>${count}</span>
        </div>
        <div class="report-bar-track">
          <div class="report-bar-fill" style="width:${width}%"></div>
        </div>
      </div>
    `;
  }

  function render() {
    const projects = managers.project.getVisibleProjects(currentUser);
    if (selectedProjectId && !projects.some((project) => project.id === selectedProjectId)) {
      selectedProjectId = "";
    }
    if (!selectedProjectId && projects.length) {
      selectedProjectId = projects[0].id;
    }
    const breakdown = managers.report.getTaskStatusBreakdown(currentUser, selectedProjectId);
    const workload = managers.report.getTeamWorkload(currentUser, selectedProjectId);
    const variance = managers.report.getTimeVariance(currentUser, selectedProjectId);
    const tasks = managers.task.getVisibleTasks(currentUser, selectedProjectId);
    const totalTasks = tasks.length;
    const project = selectedProjectId ? managers.project.getProjectById(selectedProjectId) : null;

    pageContent.innerHTML = `
      <section class="toolbar">
        <div class="toolbar-group">
          <select id="report-project-select">
            ${projects
              .map(
                (item) => `
                  <option value="${item.id}" ${item.id === selectedProjectId ? "selected" : ""}>
                    ${utils.escapeHtml(item.name)}
                  </option>
                `
              )
              .join("")}
          </select>
        </div>
      </section>

      <section class="page-fit-shell">
        <div class="page-fit-main">
          <section class="grid grid-4">
            <article class="card stat-card">
              <div class="stat-meta">Project Progress</div>
              <div class="stat-value primary">${project ? project.progress : 0}%</div>
              <div class="progress"><span style="width:${project ? project.progress : 0}%"></span></div>
            </article>
            <article class="card stat-card">
              <div class="stat-meta">Estimated Hours</div>
              <div class="stat-value teal">${variance.estimated}</div>
              <div class="stat-meta">Planned effort</div>
            </article>
            <article class="card stat-card">
              <div class="stat-meta">Actual Hours</div>
              <div class="stat-value green">${variance.actual}</div>
              <div class="stat-meta">Hours already logged</div>
            </article>
            <article class="card stat-card">
              <div class="stat-meta">Variance</div>
              <div class="stat-value ${variance.difference > 0 ? "red" : "green"}">${variance.difference}</div>
              <div class="stat-meta">Actual minus estimated hours</div>
            </article>
          </section>

          <section class="card">
            <div class="card-header">
              <div>
                <h3>Task Status Distribution</h3>
                <p>Breakdown of task states inside the selected project.</p>
              </div>
            </div>
            <div class="report-stack">
              ${renderStatusRow("To Do", breakdown.todo, totalTasks)}
              ${renderStatusRow("In Progress", breakdown.inProgress, totalTasks)}
              ${renderStatusRow("Review", breakdown.review, totalTasks)}
              ${renderStatusRow("Done", breakdown.done, totalTasks)}
            </div>
          </section>

          <section class="card">
            <div class="card-header">
              <div>
                <h3>Recent Task Health</h3>
                <p>Quick project-level risk view.</p>
              </div>
            </div>
            <div class="list panel-scroll">
              ${tasks
                .slice()
                .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
                .slice(0, 6)
                .map(
                  (task) => `
                    <div class="list-item">
                      <div>
                        <strong>${utils.escapeHtml(task.title)}</strong>
                        <div class="meta-line">Due ${utils.formatDate(task.dueDate)} • ${task.progress}% progress</div>
                      </div>
                      <span class="${ui.badgeClass("status", task.status)}">${task.status.replace("_", " ")}</span>
                    </div>
                  `
                )
                .join("")}
            </div>
          </section>
        </div>

        <aside class="page-fit-side">
          <section class="card">
            <div class="card-header">
              <div>
                <h3>Workload Summary</h3>
                <p>Open tasks and time estimates per team member.</p>
              </div>
            </div>
            <div class="table-scroll">
              <table class="members-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Tasks</th>
                    <th>Open</th>
                    <th>Est.</th>
                    <th>Actual</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    workload.length
                      ? workload
                          .map(
                            (row) => `
                              <tr>
                                <td>${utils.escapeHtml(row.user ? row.user.name : "Unknown")}</td>
                                <td>${row.tasks}</td>
                                <td>${row.openTasks}</td>
                                <td>${row.estimatedHours}</td>
                                <td>${row.actualHours}</td>
                              </tr>
                            `
                          )
                          .join("")
                      : '<tr><td colspan="5">No workload data available.</td></tr>'
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section class="card">
            <div class="card-header">
              <div>
                <h3>Project Summary</h3>
                <p>Snapshot of the selected project.</p>
              </div>
            </div>
            ${
              project
                ? `
                  <div class="grid">
                    <div class="list-item">
                      <div>
                        <strong>${utils.escapeHtml(project.name)}</strong>
                        <div class="meta-line">${utils.escapeHtml(project.description)}</div>
                      </div>
                      <span class="${ui.badgeClass("priority", project.priority)}">${project.priority}</span>
                    </div>
                    <div class="list-item"><strong>Status</strong><span>${managers.project.formatProjectStatusLabel(
                      project.status
                    )}</span></div>
                    <div class="list-item"><strong>Budget</strong><span>${utils.currency(project.budget)}</span></div>
                    <div class="list-item"><strong>Timeline</strong><span>${utils.formatDate(project.startDate)} - ${utils.formatDate(project.endDate)}</span></div>
                  </div>
                `
                : ui.renderEmptyState("Select a project to view report details.")
            }
          </section>
        </aside>
      </section>
    `;

    const select = document.getElementById("report-project-select");
    if (select) {
      select.addEventListener("change", function (event) {
        selectedProjectId = event.target.value;
        render();
      });
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

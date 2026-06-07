(function () {
  const { auth, ui, managers, events } = window.TaskFlow;
  const utils = window.TaskFlow.utils;
  const currentUser = auth.requireAuth("dashboard.html");
  if (!currentUser) return;

  document.body.classList.add("dashboard-page");

  ui.renderShell({
    currentUser,
    activeNav: "dashboard",
    title: "Dashboard",
    subtitle:
      currentUser.role === "admin"
        ? "Monitor all projects, delivery health, and team workload."
        : "Track your assigned tasks, deadlines, and current project progress.",
    primaryAction:
      currentUser.role === "admin"
        ? { label: "+ New Project", id: "topbar-new-project" }
        : { label: "Open Board", href: "board.html" },
  });

  const pageContent = document.getElementById("page-content");
  let currentQuery = "";

  function syncCurrentUser() {
    const latestUser = auth.requireAuth("dashboard.html");
    if (!latestUser) return null;
    Object.assign(currentUser, latestUser);
    return currentUser;
  }

  function getFilteredData(query) {
    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) {
      return {
        projects: managers.project.getVisibleProjects(currentUser),
        tasks: managers.task.getVisibleTasks(currentUser),
      };
    }
    return {
      projects: managers.project.getVisibleProjects(currentUser).filter((project) => {
        return (
          project.name.toLowerCase().includes(normalized) ||
          project.description.toLowerCase().includes(normalized)
        );
      }),
      tasks: managers.task.getVisibleTasks(currentUser).filter((task) => {
        return (
          task.title.toLowerCase().includes(normalized) ||
          task.description.toLowerCase().includes(normalized)
        );
      }),
    };
  }

  function getSelectableUsers() {
    return managers.user.getAllUsers().filter((user) => user.role === "user" && user.status === "active");
  }

  function projectFormHtml() {
    const teamMembers = getSelectableUsers();
    const projectStatuses = managers.project.PROJECT_STATUSES || ["planning", "in_progress", "completed"];
    return `
      <div class="card-header">
        <div>
          <h3>Create Project</h3>
          <p>Set project scope, dates, and team members.</p>
        </div>
        <button class="btn btn-ghost" data-close-modal type="button">Close</button>
      </div>
      <form id="project-form" class="grid">
        <div class="form-grid">
          <div class="form-group">
            <label>Name</label>
            <input name="name" required />
          </div>
          <div class="form-group">
            <label>Status</label>
            <select name="status">
              ${projectStatuses
                .map(
                  (status) =>
                    `<option value="${status}">${managers.project.formatProjectStatusLabel(status)}</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="form-group full">
            <label>Description</label>
            <textarea name="description" required></textarea>
          </div>
          <div class="form-group">
            <label>Priority</label>
            <select name="priority">
              ${["low", "medium", "high"]
                .map((priority) => `<option value="${priority}">${priority}</option>`)
                .join("")}
            </select>
          </div>
          <div class="form-group">
            <label>Budget</label>
            <input name="budget" type="number" min="0" value="0" />
          </div>
          <div class="form-group">
            <label>Start Date</label>
            <input name="startDate" type="date" required />
          </div>
          <div class="form-group">
            <label>End Date</label>
            <input name="endDate" type="date" required />
          </div>
          <div class="form-group full">
            <label>Tags</label>
            <input name="tags" placeholder="design, web, launch" />
          </div>
          <div class="form-group full">
            <label>Assign Team Members</label>
            <div class="grid">
              ${teamMembers
                .map((user) => {
                  return `
                    <label class="member-check-item">
                      <span class="member-check-copy">
                        <strong>${utils.escapeHtml(user.name)}</strong>
                        <span class="hint">${utils.escapeHtml(user.email)}</span>
                      </span>
                      <input type="checkbox" name="memberIds" value="${user.id}" />
                    </label>
                  `;
                })
                .join("")}
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" type="submit">Create Project</button>
          <button class="btn btn-ghost" data-close-modal type="button">Cancel</button>
        </div>
      </form>
    `;
  }

  function openProjectModal() {
    ui.openModal(projectFormHtml());
    bindProjectForm();
  }

  function bindProjectForm() {
    const modal = document.getElementById("modal-overlay");
    if (!modal) return;

    modal.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", ui.closeModal);
    });

    const form = document.getElementById("project-form");
    if (!form) return;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const formData = new FormData(form);
      const payload = {
        name: formData.get("name"),
        description: formData.get("description"),
        status: formData.get("status"),
        priority: formData.get("priority"),
        budget: formData.get("budget"),
        startDate: formData.get("startDate"),
        endDate: formData.get("endDate"),
        tags: formData.get("tags"),
        memberIds: formData.getAll("memberIds"),
      };

      if (payload.endDate < payload.startDate) {
        ui.showToast("End date cannot be earlier than start date.", "error");
        return;
      }

      TaskFlow.forms.setFormBusy(form, true, "Creating...");

      managers.project
        .createProject(payload, currentUser)
        .then(function () {
          ui.closeModal();
          ui.showToast("Project created successfully.", "success");
          render(currentQuery);
        })
        .catch(function (error) {
          ui.showToast(error.message || "Unable to create the project.", "error");
        })
        .finally(function () {
          TaskFlow.forms.setFormBusy(form, false);
          if (TaskFlow.ui && typeof TaskFlow.ui.hidePageLoader === "function") {
            TaskFlow.ui.hidePageLoader();
          }
        });
    });
  }

  function renderInsightRow(label, count, total, toneClass) {
    const width = total ? Math.max(Math.round((count / total) * 100), count ? 8 : 0) : 0;
    return `
      <div class="dashboard-insight-row">
        <div class="split">
          <span class="dashboard-insight-label">
            <span class="completion-dot ${toneClass}"></span>
            ${label}
          </span>
          <strong>${count}</strong>
        </div>
        <div class="dashboard-insight-track">
          <span class="dashboard-insight-fill ${toneClass}" style="width:${width}%"></span>
        </div>
      </div>
    `;
  }

  function render(query) {
    currentQuery = query;
    const stats = managers.report.getDashboardStats(currentUser);
    const visibleSlice = managers.report.getVisibleDatabaseSlice(currentUser);
    const filtered = getFilteredData(query);
    const projects = filtered.projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const tasks = filtered.tasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const visibleProjectIds = new Set(projects.map((project) => project.id));
    const visibleTaskIds = new Set(tasks.map((task) => task.id));
    const recentTasks = tasks.slice(0, 6);
    const recentProjects = projects.slice(0, 3);
    const completedCount = tasks.filter((task) => task.status === "done").length;
    const reviewCount = tasks.filter((task) => task.status === "review").length;
    const inProgressCount = tasks.filter((task) => task.status === "in_progress").length;
    const todoCount = tasks.filter((task) => task.status === "todo").length;
    const completedRate = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
    const planningProjectsCount = projects.filter(
      (project) => managers.project.normalizeProjectStatus(project.status) === "planning"
    ).length;
    const inProgressProjectsCount = projects.filter(
      (project) => managers.project.normalizeProjectStatus(project.status) === "in_progress"
    ).length;
    const doneProjectsCount = projects.filter(
      (project) => managers.project.normalizeProjectStatus(project.status) === "completed"
    ).length;
    const projectCompletionRate = projects.length ? Math.round((doneProjectsCount / projects.length) * 100) : 0;
    const today = utils.toInputDate(new Date());
    const dueSoonCount = tasks.filter((task) => {
      if (task.status === "done" || !task.dueDate || task.dueDate < today) return false;
      return utils.diffInDays(today, task.dueDate) <= 7;
    }).length;
    const totalEstimatedHours = tasks.reduce((sum, task) => sum + Number(task.estimatedHours || 0), 0);
    const totalBudget = projects.reduce((sum, project) => sum + Number(project.budget || 0), 0);
    const discussionNotesCount = visibleSlice.comments
      .filter((comment) => visibleTaskIds.has(comment.taskId))
      .reduce((sum, comment) => sum + 1 + (comment.replies || []).length, 0);
    const activityThisWeekCount = visibleSlice.activityLogs.filter((log) => {
      const logDate = utils.toInputDate(log.createdAt);
      const relatedToVisibleProject = !log.projectId || visibleProjectIds.has(log.projectId);
      const relatedToVisibleTask = !log.taskId || visibleTaskIds.has(log.taskId);
      return relatedToVisibleProject && relatedToVisibleTask && utils.diffInDays(logDate, today) <= 7;
    }).length;
    const nextDeadline = [
      ...tasks
        .filter((task) => task.status !== "done" && task.dueDate && task.dueDate >= today)
        .map((task) => ({ type: "Task", date: task.dueDate })),
      ...projects
        .filter(
          (project) =>
            managers.project.normalizeProjectStatus(project.status) !== "completed" &&
            project.endDate &&
            project.endDate >= today
        )
        .map((project) => ({ type: "Project", date: project.endDate })),
    ].sort((left, right) => new Date(left.date) - new Date(right.date))[0];
    const nextDeadlineValue = nextDeadline
      ? utils.diffInDays(today, nextDeadline.date) === 0
        ? "Today"
        : `${utils.diffInDays(today, nextDeadline.date)}d`
      : "Clear";
    const nextDeadlineMeta = nextDeadline
      ? `${nextDeadline.type} due ${utils.formatDate(nextDeadline.date)}`
      : "No upcoming deadlines scheduled";
    const upcomingOverdue = managers.task.getOverdueTasks(currentUser).slice(0, 5);
    const projectLoad = projects.slice(0, 4).map((project, index) => {
      const projectTasks = tasks.filter((task) => task.projectId === project.id);
      const openTasks = projectTasks.filter((task) => task.status !== "done").length;
      return {
        id: project.id,
        shortName: project.name.split(" ").slice(0, 2).join(" "),
        openTasks,
        totalTasks: projectTasks.length,
        progress: project.progress,
        toneClass: ["progress", "review", "done", "todo"][index % 4],
      };
    });
    const maxOpenTasks = Math.max(1, ...projectLoad.map((item) => item.openTasks));
    const memberLoad = Object.values(
      tasks.reduce((accumulator, task) => {
        (task.assignedTo || []).forEach((userId) => {
          const user = managers.user.getUserById(userId);
          if (!user) return;
          if (!accumulator[userId]) {
            accumulator[userId] = {
              id: userId,
              name: user.name,
              totalTasks: 0,
              openTasks: 0,
              estimatedHours: 0,
            };
          }
          accumulator[userId].totalTasks += 1;
          accumulator[userId].estimatedHours += Number(task.estimatedHours || 0);
          if (task.status !== "done") {
            accumulator[userId].openTasks += 1;
          }
        });
        return accumulator;
      }, {})
    )
      .sort((left, right) => right.openTasks - left.openTasks || right.estimatedHours - left.estimatedHours)
      .slice(0, 4);
    const visibleMemberCount = new Set(
      projects.flatMap((project) => managers.project.getProjectMembers(project.id).map((member) => member.userId))
    ).size;
    const maxMemberOpen = Math.max(1, ...memberLoad.map((item) => item.openTasks), 1);

    pageContent.innerHTML = `
      <section class="dashboard-shell">
        <section class="hero-panel">
          <section class="card dashboard-snapshot-card">
            <div class="card-header">
              <div>
                <h3>${currentUser.role === "admin" ? "Workspace snapshot" : "Your work snapshot"}</h3>
                <p>
                  ${
                    currentUser.role === "admin"
                      ? "Use this dashboard to review delivery risk, active projects, and overall team output."
                      : "Everything here is filtered to the projects and tasks visible in your workspace."
                  }
                </p>
              </div>
              <a class="btn btn-primary" href="projects.html">Open Projects</a>
            </div>
            <div class="dashboard-mini-stats dashboard-mini-stats-expanded">
              <div class="card stat-card">
                <div class="stat-meta">Visible Projects</div>
                <div class="stat-value primary">${projects.length}</div>
                <div class="stat-meta">Projects available in your workspace</div>
              </div>
              <div class="card stat-card">
                <div class="stat-meta">Team Members</div>
                <div class="stat-value primary">${visibleMemberCount}</div>
                <div class="stat-meta">People assigned across visible projects</div>
              </div>
              <div class="card stat-card">
                <div class="stat-meta">Due This Week</div>
                <div class="stat-value green">${dueSoonCount}</div>
                <div class="stat-meta">Tasks closing within the next 7 days</div>
              </div>
              <div class="card stat-card">
                <div class="stat-meta">Overdue</div>
                <div class="stat-value red">${stats.overdueTasks}</div>
                <div class="stat-meta">Need immediate follow-up</div>
              </div>
              <div class="card stat-card">
                <div class="stat-meta">Estimated Hours</div>
                <div class="stat-value teal">${totalEstimatedHours}</div>
                <div class="stat-meta">Planned effort across visible tasks</div>
              </div>
              <div class="card stat-card">
                <div class="stat-meta">Budget Tracked</div>
                <div class="stat-value green">${utils.currency(totalBudget)}</div>
                <div class="stat-meta">Planned budget across visible projects</div>
              </div>
              <div class="card stat-card">
                <div class="stat-meta">Discussion Notes</div>
                <div class="stat-value primary">${discussionNotesCount}</div>
                <div class="stat-meta">Comments and replies across visible tasks</div>
              </div>
              <div class="card stat-card">
                <div class="stat-meta">Activity This Week</div>
                <div class="stat-value teal">${activityThisWeekCount}</div>
                <div class="stat-meta">Recent updates logged in the last 7 days</div>
              </div>
              <div class="card stat-card">
                <div class="stat-meta">Next Deadline</div>
                <div class="stat-value green">${nextDeadlineValue}</div>
                <div class="stat-meta">${nextDeadlineMeta}</div>
              </div>
            </div>
          </section>

          <section class="card dashboard-completion-card">
            <div class="card-header">
              <div>
                <h3>Completion Rate</h3>
                <p>Track completion across both tasks and projects.</p>
              </div>
            </div>
            <div class="dashboard-completion-layout">
              <div class="dashboard-completion-rings">
                <div class="dashboard-metric-panel">
                  <div class="dashboard-metric-block">
                    <div class="metric-ring" style="--value:${completedRate};">
                      <div class="metric-ring-content">
                        <strong>${completedRate}%</strong>
                        <span>Tasks</span>
                      </div>
                    </div>
                    <div class="dashboard-metric-caption">Task Completion</div>
                  </div>
                  <div class="dashboard-completion-stats dashboard-completion-stats-inline">
                    <div class="completion-stat completion-stat-pill">
                      <span class="completion-dot done"></span>
                      <div>
                        <strong>${completedCount}</strong>
                        <span>Done</span>
                      </div>
                    </div>
                    <div class="completion-stat completion-stat-pill">
                      <span class="completion-dot progress"></span>
                      <div>
                        <strong>${inProgressCount}</strong>
                        <span>In Progress</span>
                      </div>
                    </div>
                    <div class="completion-stat completion-stat-pill">
                      <span class="completion-dot review"></span>
                      <div>
                        <strong>${reviewCount}</strong>
                        <span>Review</span>
                      </div>
                    </div>
                    <div class="completion-stat completion-stat-pill">
                      <span class="completion-dot todo"></span>
                      <div>
                        <strong>${todoCount}</strong>
                        <span>To Do</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="dashboard-metric-panel">
                  <div class="dashboard-metric-block">
                    <div class="metric-ring metric-ring-project" style="--value:${projectCompletionRate};">
                      <div class="metric-ring-content">
                        <strong>${projectCompletionRate}%</strong>
                        <span>Projects</span>
                      </div>
                    </div>
                    <div class="dashboard-metric-caption">Project Completion</div>
                  </div>
                  <div class="dashboard-completion-stats dashboard-completion-stats-inline">
                    <div class="completion-stat completion-stat-pill">
                      <span class="completion-dot done"></span>
                      <div>
                        <strong>${doneProjectsCount}</strong>
                        <span>Completed</span>
                      </div>
                    </div>
                    <div class="completion-stat completion-stat-pill">
                      <span class="completion-dot progress"></span>
                      <div>
                        <strong>${inProgressProjectsCount}</strong>
                        <span>In Progress</span>
                      </div>
                    </div>
                    <div class="completion-stat completion-stat-pill">
                      <span class="completion-dot todo"></span>
                      <div>
                        <strong>${planningProjectsCount}</strong>
                        <span>Planning</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="dashboard-completion-summary">
              <div class="dashboard-completion-summary-item">
                <strong>${completedCount} / ${tasks.length}</strong>
                <span>Tasks completed</span>
              </div>
              <div class="dashboard-completion-summary-item">
                <strong>${doneProjectsCount} / ${projects.length}</strong>
                <span>Projects completed</span>
              </div>
            </div>
          </section>
        </section>

        <section class="dashboard-panels-row">
          <section class="card dashboard-list-card">
            <div class="card-header">
              <div>
                <h3>Recent Tasks</h3>
                <p>Closest due dates and active work items.</p>
              </div>
              <a class="btn btn-secondary" href="board.html">Open Board</a>
            </div>
            <div class="list">
              ${
                recentTasks.length
                  ? recentTasks
                      .map((task) => {
                        const project = managers.project.getProjectById(task.projectId);
                        return `
                          <div class="list-item">
                            <div>
                              <strong>${utils.escapeHtml(task.title)}</strong>
                              <div class="meta-line">${utils.escapeHtml(project ? project.name : "Project")} • Due ${utils.formatDate(task.dueDate)}</div>
                            </div>
                            <div>
                              <span class="${ui.badgeClass("status", task.status)}">${task.status.replace("_", " ")}</span>
                            </div>
                          </div>
                        `;
                      })
                      .join("")
                  : ui.renderEmptyState("No tasks found for the current search.")
              }
            </div>
          </section>

          <section class="card dashboard-alerts-card">
            <div class="card-header">
              <div>
                <h3>Deadline Alerts</h3>
                <p>Overdue tasks or items that need quick attention.</p>
              </div>
            </div>
            <div class="list">
              ${
                upcomingOverdue.length
                  ? upcomingOverdue
                      .map((task) => `
                          <div class="list-item">
                            <div>
                              <strong>${utils.escapeHtml(task.title)}</strong>
                              <div class="meta-line">Due ${utils.formatDate(task.dueDate)}</div>
                            </div>
                            <span class="badge priority-high">Overdue</span>
                          </div>
                        `)
                      .join("")
                  : ui.renderEmptyState("No overdue items right now.")
              }
            </div>
          </section>
        </section>

        <section class="dashboard-bottom-row">
          <section class="card dashboard-projects-card">
            <div class="card-header">
              <div>
                <h3>Projects In View</h3>
                <p>Current project health and progress snapshot.</p>
              </div>
            </div>
            <div class="grid">
              ${
                recentProjects.length
                  ? recentProjects
                      .map((project) => {
                        const members = managers.project.getProjectMemberUsers(project.id);
                        return `
                          <div class="project-card card">
                            <div class="split">
                              <div>
                                <strong>${utils.escapeHtml(project.name)}</strong>
                                <div class="meta-line">${utils.escapeHtml(project.description)}</div>
                              </div>
                              <span class="${ui.badgeClass("priority", project.priority)}">${project.priority}</span>
                            </div>
                            <div class="project-meta">
                              <span>Ends ${utils.formatDate(project.endDate)}</span>
                              <span>Progress ${project.progress}%</span>
                            </div>
                            <div class="progress"><span style="width:${project.progress}%"></span></div>
                            ${ui.renderAvatarGroup(members)}
                            <div class="project-actions">
                              <a class="btn btn-secondary" href="project-details.html?id=${project.id}">Details</a>
                              <a class="btn btn-ghost" href="board.html?projectId=${project.id}">Board</a>
                            </div>
                          </div>
                        `;
                      })
                      .join("")
                  : ui.renderEmptyState("No matching projects available.")
              }
            </div>
          </section>

          <section class="card dashboard-insights-card">
            <div class="card-header">
              <div>
                <h3>Workflow Insights</h3>
                <p>Live status mix and open load across visible projects.</p>
              </div>
            </div>
            <div class="dashboard-insight-stack">
              ${renderInsightRow("Done", completedCount, tasks.length, "done")}
              ${renderInsightRow("In Progress", inProgressCount, tasks.length, "progress")}
              ${renderInsightRow("Review", reviewCount, tasks.length, "review")}
              ${renderInsightRow("To Do", todoCount, tasks.length, "todo")}
            </div>
            <div class="dashboard-mini-chart">
              ${
                projectLoad.length
                  ? projectLoad
                      .map((item) => {
                        const height = 36 + Math.round((item.openTasks / maxOpenTasks) * 74);
                        return `
                          <div class="dashboard-mini-chart-item">
                            <div class="dashboard-mini-chart-value">${item.openTasks}</div>
                            <div class="dashboard-mini-chart-bar ${item.toneClass}" style="height:${height}px"></div>
                            <div class="dashboard-mini-chart-label">${utils.escapeHtml(item.shortName)}</div>
                          </div>
                        `;
                      })
                      .join("")
                  : '<div class="empty-state">No project analytics available.</div>'
              }
            </div>
          </section>
        </section>

        <section class="card dashboard-teamload-card">
          <div class="card-header">
            <div>
              <h3>Team Load</h3>
              <p>See who is carrying the most open work right now.</p>
            </div>
          </div>
          <div class="dashboard-team-load">
            ${
              memberLoad.length
                ? memberLoad
                    .map((member, index) => {
                      const width = Math.max(Math.round((member.openTasks / maxMemberOpen) * 100), member.openTasks ? 12 : 0);
                      const toneClass = ["progress", "done", "review", "todo"][index % 4];
                      const badgeClass =
                        toneClass === "progress"
                          ? "status-in-progress"
                          : toneClass === "done"
                          ? "status-done"
                          : toneClass === "review"
                          ? "status-review"
                          : "status-todo";
                      return `
                        <div class="dashboard-team-load-row">
                          <div class="split">
                            <div>
                              <strong>${utils.escapeHtml(member.name)}</strong>
                              <div class="meta-line">${member.totalTasks} total tasks • ${member.estimatedHours}h estimated</div>
                            </div>
                            <span class="badge ${badgeClass}">${member.openTasks} open</span>
                          </div>
                          <div class="dashboard-insight-track">
                            <span class="dashboard-insight-fill ${toneClass}" style="width:${width}%"></span>
                          </div>
                        </div>
                      `;
                    })
                    .join("")
                : ui.renderEmptyState("No team workload data available.")
            }
          </div>
        </section>
      </section>
    `;

    const topbarSearch = document.getElementById("global-search");
    if (topbarSearch) {
      topbarSearch.value = currentQuery;
    }
  }

  render("");

  const searchInput = document.getElementById("global-search");
  if (searchInput) {
    searchInput.addEventListener("input", function (event) {
      render(event.target.value);
    });
  }

  const createButton = document.getElementById("topbar-new-project");
  if (createButton) {
    createButton.addEventListener("click", openProjectModal);
  }

  events.on("db:updated", function () {
    if (!syncCurrentUser()) return;
    render(currentQuery);
  });
  events.on("session:updated", function () {
    syncCurrentUser();
  });
})();

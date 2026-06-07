(function () {
  const { auth, ui, managers, storage, events } = window.TaskFlow;
  const utils = window.TaskFlow.utils;
  const currentUser = auth.requireAuth("timeline.html");
  if (!currentUser) return;

  ui.renderShell({
    currentUser,
    activeNav: "timeline",
    title: "Project Timeline",
    subtitle: "Review delivery windows across all projects or drill into one project timeline.",
  });

  const pageContent = document.getElementById("page-content");
  let selectedProjectId = utils.getQueryParam("projectId") || storage.readPreferences().timelineProjectId || "";
  let zoom = "week";

  function syncCurrentUser() {
    const latestUser = auth.requireAuth("timeline.html");
    if (!latestUser) return null;
    Object.assign(currentUser, latestUser);
    return currentUser;
  }

  function saveTimelinePreference(projectId) {
    const preferences = storage.readPreferences();
    storage.writePreferences(Object.assign({}, preferences, { timelineProjectId: projectId || "" }));
  }

  function dateEditHtml(task) {
    return `
      <div class="card-header">
        <div>
          <h3>Adjust Task Dates</h3>
          <p>Quickly tune the task schedule from the gantt chart.</p>
        </div>
        <button class="btn btn-ghost" data-close-modal type="button">Close</button>
      </div>
      <form id="timeline-edit-form" class="grid">
        <input type="hidden" name="taskId" value="${task.id}" />
        <div class="form-group">
          <label>Start Date</label>
          <input name="startDate" type="date" value="${task.startDate}" required />
        </div>
        <div class="form-group">
          <label>Due Date</label>
          <input name="dueDate" type="date" value="${task.dueDate}" required />
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" type="submit">Save Dates</button>
          <button class="btn btn-ghost" data-close-modal type="button">Cancel</button>
        </div>
      </form>
    `;
  }

  function bindTimelineEdit(taskId) {
    const form = document.getElementById("timeline-edit-form");
    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", ui.closeModal);
    });
    if (!form) return;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const formData = new FormData(form);
      const startDate = formData.get("startDate");
      const dueDate = formData.get("dueDate");
      if (dueDate < startDate) {
        ui.showToast("Due date cannot be earlier than start date.", "error");
        return;
      }
      TaskFlow.forms.setFormBusy(form, true, "Saving...");

      managers.task
        .updateTask(taskId, { startDate, dueDate }, currentUser)
        .then(function () {
          ui.closeModal();
          ui.showToast("Timeline updated.", "success");
          render();
        })
        .catch(function (error) {
          ui.showToast(error.message || "Unable to update timeline dates.", "error");
        })
        .finally(function () {
          TaskFlow.forms.setFormBusy(form, false);
          ui.hidePageLoader();
        });
    });
  }

  function formatStatusLabel(status) {
    return String(status || "").replace(/_/g, " ");
  }

  function getTaskTone(status) {
    if (status === "done") return "done";
    if (status === "review") return "review";
    if (status === "in_progress") return "progress";
    return "todo";
  }

  function clampPercent(value) {
    return Math.max(0, Math.min(value, 100));
  }

  function buildMonthSegments(days) {
    if (!days.length) return [];
    const segments = [];
    days.forEach((day) => {
      const date = new Date(day);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const label = date.toLocaleDateString(undefined, { month: "short" });
      const lastSegment = segments[segments.length - 1];
      if (lastSegment && lastSegment.key === key) {
        lastSegment.count += 1;
        return;
      }
      segments.push({ key, label, count: 1 });
    });
    return segments.map((segment) => {
      return Object.assign(segment, {
        width: (segment.count / days.length) * 100,
      });
    });
  }

  function render() {
    const projects = managers.project.getVisibleProjects(currentUser);
    if (selectedProjectId && !projects.some((project) => project.id === selectedProjectId)) {
      selectedProjectId = "";
      utils.setQueryParams({ projectId: null });
    }

    const project = selectedProjectId ? managers.project.getProjectById(selectedProjectId) : null;
    const projectTasks = managers.task.getVisibleTasks(currentUser, selectedProjectId);
    const gantt = managers.report.generateGanttData(currentUser, selectedProjectId);
    const monthSegments = buildMonthSegments(gantt.days);
    const today = utils.toInputDate(new Date());
    const completedTasks = projectTasks.filter((task) => task.status === "done").length;
    const overdueTasks = projectTasks.filter(
      (task) => task.status !== "done" && task.dueDate && task.dueDate < today
    ).length;
    const dueSoonTasks = projectTasks.filter((task) => {
      if (!task.dueDate || task.status === "done") return false;
      const daysLeft = utils.diffInDays(today, task.dueDate);
      return daysLeft >= 0 && daysLeft <= 7;
    }).length;
    const totalDays = Math.max(gantt.days.length, 1);
    const projectCount = selectedProjectId ? 1 : projects.length;
    const firstRangeDay = gantt.days[0] || "";
    const lastRangeDay = gantt.days[gantt.days.length - 1] || "";
    const showTodayMarker = firstRangeDay && lastRangeDay && today >= firstRangeDay && today <= lastRangeDay;
    const todayIndex = showTodayMarker ? utils.diffInDays(gantt.start, today) : 0;
    const todayLeft = showTodayMarker ? clampPercent((todayIndex / totalDays) * 100) : 0;
    const rowTasks = gantt.tasks
      .slice()
      .sort((left, right) => {
        if (!selectedProjectId) {
          const leftProject = managers.project.getProjectById(left.projectId);
          const rightProject = managers.project.getProjectById(right.projectId);
          const projectCompare = String((leftProject || {}).name || "").localeCompare(
            String((rightProject || {}).name || "")
          );
          if (projectCompare !== 0) return projectCompare;
        }
        return left.offset - right.offset;
      });

    pageContent.innerHTML = `
      <section class="toolbar">
        <div class="toolbar-group">
          <select id="timeline-project">
            <option value="" ${selectedProjectId ? "" : "selected"}>All Visible Projects</option>
            ${projects
              .map(
                (projectOption) => `
                  <option value="${projectOption.id}" ${projectOption.id === selectedProjectId ? "selected" : ""}>
                    ${utils.escapeHtml(projectOption.name)}
                  </option>
                `
              )
              .join("")}
          </select>
          <div class="filters-inline">
            <button class="btn ${zoom === "week" ? "btn-primary" : "btn-ghost"}" data-zoom="week" type="button">Expanded</button>
            <button class="btn ${zoom === "month" ? "btn-primary" : "btn-ghost"}" data-zoom="month" type="button">Compact</button>
          </div>
        </div>
        <div class="summary-pill">${projectTasks.length} tasks across ${projectCount} project${projectCount === 1 ? "" : "s"}</div>
      </section>

      <section class="grid grid-4 timeline-overview">
        <article class="card stat-card">
          <div class="stat-meta">${selectedProjectId ? "Scheduled Tasks" : "Visible Projects"}</div>
          <div class="stat-value primary">${selectedProjectId ? projectTasks.length : projectCount}</div>
          <div class="stat-meta">${
            selectedProjectId
              ? "Tasks inside the selected project timeline"
              : "Projects contributing to the combined timeline"
          }</div>
        </article>
        <article class="card stat-card">
          <div class="stat-meta">Due Soon</div>
          <div class="stat-value teal">${dueSoonTasks}</div>
          <div class="stat-meta">Tasks landing within the next 7 days</div>
        </article>
        <article class="card stat-card">
          <div class="stat-meta">Overdue</div>
          <div class="stat-value ${overdueTasks ? "red" : "green"}">${overdueTasks}</div>
          <div class="stat-meta">Tasks that are behind the planned due date</div>
        </article>
        <article class="card stat-card">
          <div class="stat-meta">Completed</div>
          <div class="stat-value green">${completedTasks}</div>
          <div class="stat-meta">Tasks already closed successfully</div>
        </article>
      </section>

      <section class="card">
        <div class="card-header">
          <div>
            <h3>${selectedProjectId ? "Project Gantt Chart" : "All Projects Gantt Chart"}</h3>
            <p>${
              currentUser.role === "admin"
                ? "Click a gantt bar to edit dates and keep the plan aligned."
                : "Track task windows and delivery progress in a single chart."
            }</p>
          </div>
          <div class="summary-pill">${
            project ? utils.escapeHtml(project.name) : "All Visible Projects"
          } • ${firstRangeDay ? `${utils.formatDate(firstRangeDay)} to ${utils.formatDate(lastRangeDay)}` : "No date range"}</div>
        </div>
        ${
          rowTasks.length
            ? `
              <div class="timeline-shell timeline-gantt-shell">
                <div class="timeline-gantt ${zoom === "month" ? "is-compact" : ""}">
                  <div class="timeline-gantt-head">
                    <div class="timeline-gantt-head-label">Task List</div>
                    <div class="timeline-gantt-scale">
                      ${monthSegments
                        .map(
                          (segment) => `
                            <div class="timeline-gantt-scale-segment" style="width:${segment.width}%">
                              <span>${segment.label}</span>
                            </div>
                          `
                        )
                        .join("")}
                    </div>
                  </div>
                  <div class="timeline-gantt-body">
                    ${rowTasks
                      .map((timelineTask) => {
                        const task = managers.task.getTaskById(timelineTask.id);
                        const relatedProject = managers.project.getProjectById(timelineTask.projectId);
                        const left = clampPercent((timelineTask.offset / totalDays) * 100);
                        const width = clampPercent((timelineTask.length / totalDays) * 100);
                        const tone = getTaskTone(timelineTask.status);
                        const compactLabel = width < 16 || zoom === "month";
                        const metaLine = selectedProjectId
                          ? `Start ${utils.formatDate(task.startDate)} • Due ${utils.formatDate(task.dueDate)}`
                          : `${utils.escapeHtml(relatedProject ? relatedProject.name : "Project")} • ${utils.formatDate(
                              task.startDate
                            )} to ${utils.formatDate(task.dueDate)}`;
                        const barLabel =
                          compactLabel
                            ? `${task.progress}%`
                            : `${task.progress}% complete`;

                        const barAttributes =
                          currentUser.role === "admin"
                            ? `class="timeline-gantt-bar tone-${tone}" style="left:${left}%; width:${width}%" data-timeline-task="${timelineTask.id}" type="button"`
                            : `class="timeline-gantt-bar tone-${tone}" style="left:${left}%; width:${width}%"`;

                        return `
                          <div class="timeline-gantt-row ${zoom === "month" ? "is-compact" : ""}">
                            <div class="timeline-gantt-task">
                              <strong>${utils.escapeHtml(task.title)}</strong>
                              <div class="meta-line">${metaLine}</div>
                              <div class="timeline-gantt-task-badges">
                                <span class="${ui.badgeClass("status", task.status)}">${formatStatusLabel(task.status)}</span>
                                <span class="${ui.badgeClass("priority", task.priority)}">${utils.escapeHtml(
                                    task.priority
                                  )}</span>
                              </div>
                              ${
                                selectedProjectId
                                  ? ""
                                  : `<div class="timeline-gantt-task-tags"><span class="timeline-window-chip">${utils.escapeHtml(
                                      relatedProject ? relatedProject.name : "Project"
                                    )}</span></div>`
                              }
                            </div>
                            <div class="timeline-gantt-track">
                              <div class="timeline-gantt-track-grid">
                                ${monthSegments
                                  .map(
                                    (segment) => `
                                      <span class="timeline-gantt-track-segment" style="width:${segment.width}%"></span>
                                    `
                                  )
                                  .join("")}
                              </div>
                              ${showTodayMarker ? `<span class="timeline-gantt-today" style="left:${todayLeft}%"></span>` : ""}
                              ${
                                currentUser.role === "admin"
                                  ? `<button ${barAttributes} title="${utils.escapeHtml(
                                      `${task.title} • ${formatStatusLabel(task.status)} • ${task.progress}%`
                                    )}"><span>${barLabel}</span></button>`
                                  : `<div ${barAttributes} title="${utils.escapeHtml(
                                      `${task.title} • ${formatStatusLabel(task.status)} • ${task.progress}%`
                                    )}"><span>${barLabel}</span></div>`
                              }
                            </div>
                          </div>
                        `;
                      })
                      .join("")}
                  </div>
                </div>
              </div>
            `
            : ui.renderEmptyState(
                selectedProjectId
                  ? "No tasks available for the selected project."
                  : "No tasks available across visible projects."
              )
        }
      </section>
    `;

    const projectSelect = document.getElementById("timeline-project");
    if (projectSelect) {
      projectSelect.addEventListener("change", function (event) {
        selectedProjectId = event.target.value;
        utils.setQueryParams({ projectId: selectedProjectId || null });
        saveTimelinePreference(selectedProjectId);
        render();
      });
    }

    pageContent.querySelectorAll("[data-zoom]").forEach((button) => {
      button.addEventListener("click", function () {
        zoom = button.getAttribute("data-zoom");
        render();
      });
    });

    if (currentUser.role === "admin") {
      pageContent.querySelectorAll("[data-timeline-task]").forEach((bar) => {
        bar.addEventListener("click", function () {
          const task = managers.task.getTaskById(bar.getAttribute("data-timeline-task"));
          ui.openModal(dateEditHtml(task), true);
          bindTimelineEdit(task.id);
        });
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
  events.on("preferences:updated", function (preferences) {
    if (!utils.getQueryParam("projectId")) {
      selectedProjectId = (preferences && preferences.timelineProjectId) || "";
      render();
    }
  });
})();

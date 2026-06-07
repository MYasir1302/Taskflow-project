(function () {
  const { auth, ui, permissions, managers, events } = window.TaskFlow;
  const utils = window.TaskFlow.utils;
  const currentUser = auth.requireAuth("project-details.html");
  if (!currentUser) return;

  const projectId = utils.getQueryParam("id");
  const pageContent = document.getElementById("page-content");

  function getCurrentProject() {
    return managers.project.getProjectById(projectId);
  }

  function ensureProjectAccess() {
    const project = getCurrentProject();
    const visibleProjectIds = managers.project.getVisibleProjects(currentUser).map((item) => item.id);
    if (!project || !visibleProjectIds.includes(projectId)) {
      window.location.href = "projects.html";
      return null;
    }
    return project;
  }

  function syncCurrentUser() {
    const latestUser = auth.requireAuth("project-details.html");
    if (!latestUser) return null;
    Object.assign(currentUser, latestUser);
    return ensureProjectAccess();
  }

  if (!ensureProjectAccess()) return;

  function getSelectableUsers() {
    return managers.user.getAllUsers().filter((user) => user.role === "user" && user.status === "active");
  }

  function projectEditHtml() {
    const project = ensureProjectAccess();
    if (!project) return "";
    const teamMembers = getSelectableUsers();
    const selectedMembers = managers.project.getProjectMembers(project.id).map((item) => item.userId);
    const projectStatuses = managers.project.PROJECT_STATUSES || ["planning", "in_progress", "completed"];
    return `
      <div class="card-header">
        <div>
          <h3>Edit Project Snapshot</h3>
          <p>Update project summary fields directly from the detail view.</p>
        </div>
        <button class="btn btn-ghost" data-close-modal type="button">Close</button>
      </div>
      <form id="detail-project-form" class="grid">
        <div class="form-grid">
          <div class="form-group">
            <label>Status</label>
            <select name="status">
              ${projectStatuses.map((status) => `<option value="${status}" ${
      project.status === status ? "selected" : ""
    }>${managers.project.formatProjectStatusLabel(status)}</option>`)}
            </select>
          </div>
          <div class="form-group">
            <label>Priority</label>
            <select name="priority">
              ${["low", "medium", "high"].map((priority) => `<option value="${priority}" ${
      project.priority === priority ? "selected" : ""
    }>${priority}</option>`)}
            </select>
          </div>
          <div class="form-group">
            <label>Start Date</label>
            <input name="startDate" type="date" value="${project.startDate}" required />
          </div>
          <div class="form-group">
            <label>End Date</label>
            <input name="endDate" type="date" value="${project.endDate}" required />
          </div>
          <div class="form-group full">
            <label>Description</label>
            <textarea name="description">${utils.escapeHtml(project.description)}</textarea>
          </div>
          <div class="form-group full">
            <label>Assign Team Members</label>
            <div class="grid">
              ${teamMembers
                .map((user) => {
                  const checked = selectedMembers.includes(user.id) ? "checked" : "";
                  return `
                    <label class="member-check-item">
                      <span class="member-check-copy">
                        <strong>${utils.escapeHtml(user.name)}</strong>
                        <span class="hint">${utils.escapeHtml(user.email)}</span>
                      </span>
                      <input type="checkbox" name="memberIds" value="${user.id}" ${checked} />
                    </label>
                  `;
                })
                .join("")}
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" type="submit">Save Project</button>
          <button class="btn btn-ghost" data-close-modal type="button">Cancel</button>
        </div>
      </form>
    `;
  }

  function render() {
    const project = ensureProjectAccess();
    if (!project) return;
    ui.renderShell({
      currentUser,
      activeNav: "projects",
      title: project.name,
      subtitle: "Detailed project snapshot with task, member, and activity context.",
    });
    const members = managers.project.getProjectMemberUsers(project.id);
    const tasks = managers.task
      .getVisibleTasks(currentUser, project.id)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const comments = tasks.flatMap((task) => managers.comment.getCommentsForTask(task.id));
    const stats = managers.project.getProjectStats(project.id);

    pageContent.innerHTML = `
      <section class="page-actions">
        <div class="toolbar-group">
          <a class="btn btn-secondary" href="projects.html">Back to Projects</a>
          <a class="btn btn-ghost" href="board.html?projectId=${project.id}">Open Board</a>
          <a class="btn btn-ghost" href="timeline.html?projectId=${project.id}">View Timeline</a>
        </div>
        ${
          permissions.canManageProjects(currentUser)
            ? '<button class="btn btn-primary" id="edit-project-detail" type="button">Edit Project</button>'
            : ""
        }
      </section>

      <section class="grid grid-4">
        <article class="card stat-card">
          <div class="stat-meta">Progress</div>
          <div class="stat-value primary">${project.progress}%</div>
          <div class="progress"><span style="width:${project.progress}%"></span></div>
        </article>
        <article class="card stat-card">
          <div class="stat-meta">Completed Tasks</div>
          <div class="stat-value green">${stats.completedTasks}</div>
          <div class="stat-meta">Out of ${stats.totalTasks} total tasks</div>
        </article>
        <article class="card stat-card">
          <div class="stat-meta">In Progress</div>
          <div class="stat-value teal">${stats.inProgressTasks}</div>
          <div class="stat-meta">Currently being worked on</div>
        </article>
        <article class="card stat-card">
          <div class="stat-meta">Overdue</div>
          <div class="stat-value red">${stats.overdueTasks}</div>
          <div class="stat-meta">Tasks behind plan</div>
        </article>
      </section>

      <section class="page-fit-shell" style="margin-top:20px;">
        <div class="page-fit-main">
          <article class="card">
            <div class="card-header">
              <div>
                <h3>Project Overview</h3>
                <p>${utils.escapeHtml(project.description)}</p>
              </div>
              <span class="${ui.badgeClass("priority", project.priority)}">${project.priority}</span>
            </div>
            <div class="grid grid-2">
              <div class="card">
                <strong>Status</strong>
                <div class="meta-line">${managers.project.formatProjectStatusLabel(project.status)}</div>
              </div>
              <div class="card">
                <strong>Budget</strong>
                <div class="meta-line">${utils.currency(project.budget)}</div>
              </div>
              <div class="card">
                <strong>Start Date</strong>
                <div class="meta-line">${utils.formatDate(project.startDate)}</div>
              </div>
              <div class="card">
                <strong>End Date</strong>
                <div class="meta-line">${utils.formatDate(project.endDate)}</div>
              </div>
            </div>
            <div style="margin-top:16px;">
              <strong>Tags</strong>
              <div class="project-meta" style="margin-top:10px;">
                ${(project.tags || []).map((tag) => `<span class="chip">${utils.escapeHtml(tag)}</span>`).join("")}
              </div>
            </div>
          </article>

          <article class="card">
            <div class="card-header">
              <div>
                <h3>Task Snapshot</h3>
                <p>Upcoming and active tasks inside this project.</p>
              </div>
            </div>
            <div class="list panel-scroll">
              ${
                tasks.length
                  ? tasks
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
                      .join("")
                  : ui.renderEmptyState("No tasks available for this project yet.")
              }
            </div>
          </article>
        </div>

        <aside class="page-fit-side">
          <article class="card">
            <div class="card-header">
              <div>
                <h3>Team Members</h3>
                <p>Members assigned to this project space.</p>
              </div>
            </div>
            <div class="list panel-scroll">
              ${members
                .map((member) => `
                  <div class="list-item">
                    <div class="media">
                      <div class="avatar">${utils.initials(member.name)}</div>
                      <div class="media-body">
                        <strong>${utils.escapeHtml(member.name)}</strong>
                        <p>${utils.escapeHtml(member.email)}</p>
                      </div>
                    </div>
                    <span class="badge">${member.role}</span>
                  </div>
                `)
                .join("")}
            </div>
          </article>

          <article class="card">
            <div class="card-header">
              <div>
                <h3>Discussion Highlights</h3>
                <p>Recent comments from tasks in this project.</p>
              </div>
            </div>
            <div class="comment-thread panel-scroll">
              ${
                comments.length
                  ? comments
                      .slice(0, 5)
                      .map((comment) => {
                        const author = managers.user.getUserById(comment.authorId);
                        return `
                          <div class="comment">
                            <strong>${utils.escapeHtml(author ? author.name : "Unknown user")}</strong>
                            <div class="meta-line">${utils.formatDateTime(comment.createdAt)}</div>
                            <p>${utils.escapeHtml(comment.content)}</p>
                          </div>
                        `;
                      })
                      .join("")
                  : ui.renderEmptyState("No comments have been added for this project yet.")
              }
            </div>
          </article>
        </aside>
      </section>
    `;

    const editButton = document.getElementById("edit-project-detail");
    if (editButton) {
      editButton.addEventListener("click", function () {
        ui.openModal(projectEditHtml());
        document.querySelectorAll("[data-close-modal]").forEach((button) => {
          button.addEventListener("click", ui.closeModal);
        });
        const form = document.getElementById("detail-project-form");
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          const formData = new FormData(form);
          const payload = {
            status: formData.get("status"),
            priority: formData.get("priority"),
            startDate: formData.get("startDate"),
            endDate: formData.get("endDate"),
            description: formData.get("description"),
            memberIds: formData.getAll("memberIds"),
          };
          if (payload.endDate < payload.startDate) {
            ui.showToast("End date cannot be earlier than start date.", "error");
            return;
          }
          TaskFlow.forms.setFormBusy(form, true, "Saving...");

          managers.project
            .updateProject(project.id, payload, currentUser)
            .then(function () {
              return managers.project.saveProjectMembers(project.id, payload.memberIds, currentUser);
            })
            .then(function () {
              ui.closeModal();
              ui.showToast("Project details updated.", "success");
              render();
            })
            .catch(function (error) {
              ui.showToast(error.message || "Unable to update the project.", "error");
            })
            .finally(function () {
              TaskFlow.forms.setFormBusy(form, false);
              ui.hidePageLoader();
            });
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
})();

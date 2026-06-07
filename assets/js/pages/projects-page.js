(function () {
  const { auth, ui, permissions, managers, events } = window.TaskFlow;
  const utils = window.TaskFlow.utils;
  const currentUser = auth.requireAuth("projects.html");
  if (!currentUser) return;

  ui.renderShell({
    currentUser,
    activeNav: "projects",
    title: "Projects",
    subtitle:
      currentUser.role === "admin"
        ? "Create, update, and organize all project spaces."
        : "Browse only the projects assigned to your account.",
    primaryAction: permissions.canManageProjects(currentUser)
      ? { label: "+ New Project", id: "topbar-new-project" }
      : null,
  });

  const pageContent = document.getElementById("page-content");
  let currentStatus = "all";
  let currentQuery = "";
  let hasAutoOpenedCreate = false;

  function syncCurrentUser() {
    const latestUser = auth.requireAuth("projects.html");
    if (!latestUser) return null;
    Object.assign(currentUser, latestUser);
    return currentUser;
  }

  function getSelectableUsers() {
    return managers.user.getAllUsers().filter((user) => user.role === "user" && user.status === "active");
  }

  function getFilteredProjects() {
    const projects = currentQuery
      ? managers.project.searchProjects(currentQuery, currentUser)
      : managers.project.getVisibleProjects(currentUser);

    return projects.filter((project) => {
      return currentStatus === "all" ? true : project.status === currentStatus;
    });
  }

  function projectFormHtml(project) {
    const teamMembers = getSelectableUsers();
    const selectedMembers = project ? managers.project.getProjectMembers(project.id).map((item) => item.userId) : [];
    const projectStatuses = managers.project.PROJECT_STATUSES || ["planning", "in_progress", "completed"];
    return `
      <div class="card-header">
        <div>
          <h3>${project ? "Edit Project" : "Create Project"}</h3>
          <p>${project ? "Update project details and assigned members." : "Set project scope, dates, and team members."}</p>
        </div>
        <button class="btn btn-ghost" data-close-modal type="button">Close</button>
      </div>
      <form id="project-form" class="grid">
        <input type="hidden" name="projectId" value="${project ? project.id : ""}" />
        <div class="form-grid">
          <div class="form-group">
            <label>Name</label>
            <input name="name" value="${project ? utils.escapeHtml(project.name) : ""}" required />
          </div>
          <div class="form-group">
            <label>Status</label>
            <select name="status">
              ${projectStatuses.map((status) => `<option value="${status}" ${
      project && project.status === status ? "selected" : ""
    }>${managers.project.formatProjectStatusLabel(status)}</option>`)}
            </select>
          </div>
          <div class="form-group full">
            <label>Description</label>
            <textarea name="description" required>${project ? utils.escapeHtml(project.description) : ""}</textarea>
          </div>
          <div class="form-group">
            <label>Priority</label>
            <select name="priority">
              ${["low", "medium", "high"].map((priority) => `<option value="${priority}" ${
      project && project.priority === priority ? "selected" : ""
    }>${priority}</option>`)}
            </select>
          </div>
          <div class="form-group">
            <label>Budget</label>
            <input name="budget" type="number" min="0" value="${project ? project.budget : 0}" />
          </div>
          <div class="form-group">
            <label>Start Date</label>
            <input name="startDate" type="date" value="${project ? project.startDate : ""}" required />
          </div>
          <div class="form-group">
            <label>End Date</label>
            <input name="endDate" type="date" value="${project ? project.endDate : ""}" required />
          </div>
          <div class="form-group full">
            <label>Tags</label>
            <input name="tags" value="${project ? (project.tags || []).join(", ") : ""}" placeholder="design, web, launch" />
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
          <button class="btn btn-primary" type="submit">${project ? "Save Changes" : "Create Project"}</button>
          <button class="btn btn-ghost" data-close-modal type="button">Cancel</button>
        </div>
      </form>
    `;
  }

  function openProjectModal(projectId) {
    const project = projectId ? managers.project.getProjectById(projectId) : null;
    ui.openModal(projectFormHtml(project));
    bindProjectForm();
  }

  function bindProjectForm() {
    const modal = document.getElementById("modal-overlay");
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

      const projectId = formData.get("projectId");
      TaskFlow.forms.setFormBusy(form, true, projectId ? "Saving..." : "Creating...");

      const savePromise = projectId
        ? managers.project
            .updateProject(projectId, payload, currentUser)
            .then(function () {
              return managers.project.saveProjectMembers(projectId, payload.memberIds, currentUser);
            })
        : managers.project.createProject(payload, currentUser);

      savePromise
        .then(function () {
          ui.closeModal();
          ui.showToast(
            projectId ? "Project updated successfully." : "Project created successfully.",
            "success"
          );
          render();
        })
        .catch(function (error) {
          ui.showToast(error.message || "Unable to save the project.", "error");
        })
        .finally(function () {
          TaskFlow.forms.setFormBusy(form, false);
          if (TaskFlow.ui && typeof TaskFlow.ui.hidePageLoader === "function") {
            TaskFlow.ui.hidePageLoader();
          }
        });
    });
  }

  function render() {
    const projects = getFilteredProjects().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    pageContent.innerHTML = `
      <section class="projects-shell">
        <div class="toolbar">
          <div class="toolbar-group">
            <select id="status-filter">
              <option value="all" ${currentStatus === "all" ? "selected" : ""}>All Statuses</option>
              ${managers.project.PROJECT_STATUSES.map((status) => `<option value="${status}" ${
      currentStatus === status ? "selected" : ""
    }>${managers.project.formatProjectStatusLabel(status)}</option>`).join("")}
            </select>
            <input id="project-search" type="search" placeholder="Search projects..." value="${utils.escapeHtml(currentQuery)}" />
          </div>
          <div class="summary-pill">${projects.length} projects visible</div>
        </div>

        <div class="projects-list-scroll">
          <section class="projects-grid">
            ${
              projects.length
                ? projects
                    .map((project) => {
                      const members = managers.project.getProjectMemberUsers(project.id);
                      const stats = managers.project.getProjectStats(project.id);
                      return `
                        <article class="card project-card">
                          <div class="card-header">
                            <div>
                              <h3>${utils.escapeHtml(project.name)}</h3>
                              <p class="project-card-description">${utils.escapeHtml(project.description)}</p>
                            </div>
                            <span class="${ui.badgeClass("priority", project.priority)}">${project.priority}</span>
                          </div>
                          <div class="project-meta">
                            <span class="${ui.badgeClass("status", project.status)}">${managers.project.formatProjectStatusLabel(
                              project.status
                            )}</span>
                            <span>Budget ${utils.currency(project.budget)}</span>
                            <span>End Date ${utils.formatDate(project.endDate)}</span>
                          </div>
                          <div class="progress"><span style="width:${project.progress}%"></span></div>
                          <div class="split">
                            <div class="hint">${project.progress}% complete</div>
                            <div class="hint">${stats.completedTasks}/${stats.totalTasks} tasks done</div>
                          </div>
                          ${ui.renderAvatarGroup(members)}
                          <div class="project-actions">
                            <a class="btn btn-secondary" href="project-details.html?id=${project.id}">Details</a>
                            <a class="btn btn-ghost" href="board.html?projectId=${project.id}">Board</a>
                            ${
                              permissions.canManageProjects(currentUser)
                                ? `
                                  <button class="btn btn-ghost" data-edit-project="${project.id}" type="button">Edit</button>
                                  <button class="btn btn-danger" data-delete-project="${project.id}" type="button">Delete</button>
                                `
                                : ""
                            }
                          </div>
                        </article>
                      `;
                    })
                    .join("")
                : ui.renderEmptyState("No projects match the current filters.")
            }
          </section>
        </div>
      </section>
    `;

    const searchInput = document.getElementById("project-search");
    const statusFilter = document.getElementById("status-filter");
    if (searchInput) {
      searchInput.oninput = function (event) {
        currentQuery = event.target.value;
        render();
      };
    }
    if (statusFilter) {
      statusFilter.onchange = function (event) {
        currentStatus = event.target.value;
        render();
      };
    }

    const topbarSearch = document.getElementById("global-search");
    if (topbarSearch) {
      topbarSearch.value = currentQuery;
      topbarSearch.oninput = function (event) {
        currentQuery = event.target.value;
        render();
      };
    }

    const createButton = document.getElementById("topbar-new-project");
    if (createButton) {
      createButton.onclick = function () {
        openProjectModal("");
      };
    }

    pageContent.querySelectorAll("[data-edit-project]").forEach((button) => {
      button.addEventListener("click", function () {
        openProjectModal(button.getAttribute("data-edit-project"));
      });
    });

    pageContent.querySelectorAll("[data-delete-project]").forEach((button) => {
      button.addEventListener("click", function () {
        const projectId = button.getAttribute("data-delete-project");
        if (window.confirm("Delete this project and all its tasks?")) {
          managers.project
            .deleteProject(projectId, currentUser)
            .then(function () {
              ui.showToast("Project deleted.", "success");
              render();
            })
            .catch(function (error) {
              ui.showToast(error.message || "Unable to delete the project.", "error");
            })
            .finally(function () {
              ui.hidePageLoader();
            });
        }
      });
    });

    if (
      !hasAutoOpenedCreate &&
      permissions.canManageProjects(currentUser) &&
      utils.getQueryParam("action") === "create"
    ) {
      hasAutoOpenedCreate = true;
      utils.setQueryParams({ action: null });
      openProjectModal("");
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

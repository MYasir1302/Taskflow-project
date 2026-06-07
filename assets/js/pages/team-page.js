(function () {
  const { auth, ui, managers, permissions, events } = window.TaskFlow;
  const utils = window.TaskFlow.utils;
  const currentUser = auth.requireAuth("team.html");
  if (!currentUser) return;

  ui.renderShell({
    currentUser,
    activeNav: "team",
    title: "Team Management",
    subtitle: "Manage users, account roles, and workload visibility.",
    primaryAction: { label: "+ Add User", id: "topbar-add-user" },
  });

  const pageContent = document.getElementById("page-content");

  function syncCurrentUser() {
    const latestUser = auth.getCurrentUser();
    if (!latestUser) return null;
    Object.assign(currentUser, latestUser);
    return currentUser;
  }

  function userFormHtml() {
    return `
      <div class="card-header">
        <div>
          <h3>Add Team Member</h3>
          <p>Create a local workspace user for demo and testing.</p>
        </div>
        <button class="btn btn-ghost" data-close-modal type="button">Close</button>
      </div>
      <form id="team-user-form" class="grid">
        <div class="form-group">
          <label>Name</label>
          <input name="name" required />
        </div>
        <div class="form-group">
          <label>Email</label>
          <input name="email" type="email" required />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input name="password" required />
        </div>
        <div class="form-group">
          <label>Role</label>
          <select name="role">
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" type="submit">Create User</button>
          <button class="btn btn-ghost" data-close-modal type="button">Cancel</button>
        </div>
      </form>
    `;
  }

  function bindUserForm() {
    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", ui.closeModal);
    });
    const form = document.getElementById("team-user-form");
    if (!form) return;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const formData = new FormData(form);
      TaskFlow.forms.setFormBusy(form, true, "Creating...");

      TaskFlow.forms.ensurePromise(
          managers.user.createUser(
            {
              name: formData.get("name"),
              email: formData.get("email"),
              password: formData.get("password"),
              role: formData.get("role"),
            },
            currentUser
          ),
          "User save did not start. Refresh the page with Ctrl+Shift+R."
        )
        .then(function () {
          ui.closeModal();
          ui.showToast("User created successfully.", "success");
          render();
        })
        .catch(function (error) {
          TaskFlow.forms.showError(error, "Unable to create the user.");
        })
        .finally(function () {
          TaskFlow.forms.setFormBusy(form, false);
          if (ui.hidePageLoader) ui.hidePageLoader();
        });
    });
  }

  function render() {
    const users = managers.user.getAllUsers();
    const projects = managers.project.getAllProjects();
    const workload = managers.report.getTeamWorkload(currentUser, "");

    pageContent.innerHTML = `
      <section class="grid grid-3">
        <article class="card stat-card">
          <div class="stat-meta">Total Users</div>
          <div class="stat-value primary">${users.length}</div>
          <div class="stat-meta">Accounts available in local workspace</div>
        </article>
        <article class="card stat-card">
          <div class="stat-meta">Admins</div>
          <div class="stat-value teal">${users.filter((user) => user.role === "admin").length}</div>
          <div class="stat-meta">Full-access users</div>
        </article>
        <article class="card stat-card">
          <div class="stat-meta">Active Users</div>
          <div class="stat-value green">${users.filter((user) => user.status === "active").length}</div>
          <div class="stat-meta">Currently allowed to log in</div>
        </article>
      </section>

      <section class="page-fit-shell" style="margin-top:20px;">
        <div class="page-fit-main">
          <section class="card">
            <div class="card-header">
              <div>
                <h3>Team Directory</h3>
                <p>Promote users, disable access, and review workload.</p>
              </div>
            </div>
            <div class="table-scroll">
              <table class="members-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Projects</th>
                    <th>Tasks</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${users
                    .map((user) => {
                      const userProjects = managers.user.getUserProjects(user.id).length;
                      const userTasks = managers.user.getUserTasks(user.id).length;
                      return `
                        <tr>
                          <td>
                            <strong>${utils.escapeHtml(user.name)}</strong>
                            <div class="meta-line">${utils.escapeHtml(user.email)}</div>
                          </td>
                          <td>${user.role}</td>
                          <td>${user.status}</td>
                          <td>${userProjects}</td>
                          <td>${userTasks}</td>
                          <td>
                            ${
                              user.id !== currentUser.id
                                ? `
                                  <button class="btn btn-ghost" data-toggle-role="${user.id}" type="button">
                                    ${user.role === "admin" ? "Make User" : "Make Admin"}
                                  </button>
                                  <button class="btn btn-danger" data-toggle-status="${user.id}" type="button">
                                    ${user.status === "active" ? "Disable" : "Activate"}
                                  </button>
                                `
                                : '<span class="hint">Current account</span>'
                            }
                          </td>
                        </tr>
                      `;
                    })
                    .join("")}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside class="page-fit-side">
          <article class="card">
            <div class="card-header">
              <div>
                <h3>Workload Overview</h3>
                <p>Task load by member across all projects.</p>
              </div>
            </div>
            <div class="list panel-scroll">
              ${workload
                .map(
                  (row) => `
                    <div class="list-item">
                      <div>
                        <strong>${utils.escapeHtml(row.user ? row.user.name : "Unknown")}</strong>
                        <div class="meta-line">${row.tasks} tasks • ${row.openTasks} open • ${row.actualHours}/${row.estimatedHours} hrs</div>
                      </div>
                    </div>
                  `
                )
                .join("")}
            </div>
          </article>

          <article class="card">
            <div class="card-header">
              <div>
                <h3>Project Staffing</h3>
                <p>Current member distribution per project.</p>
              </div>
            </div>
            <div class="list panel-scroll">
              ${projects
                .map((project) => {
                  const members = managers.project.getProjectMemberUsers(project.id);
                  return `
                    <div class="list-item">
                      <div>
                        <strong>${utils.escapeHtml(project.name)}</strong>
                        <div class="meta-line">${members.length} assigned members</div>
                      </div>
                      <div>${ui.renderAvatarGroup(members)}</div>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </article>
        </aside>
      </section>
    `;

    const addButton = document.getElementById("topbar-add-user");
    addButton.addEventListener("click", function () {
      ui.openModal(userFormHtml(), true);
      bindUserForm();
    });

    pageContent.querySelectorAll("[data-toggle-role]").forEach((button) => {
      button.addEventListener("click", function () {
        const user = managers.user.getUserById(button.getAttribute("data-toggle-role"));
        managers.user
          .updateUser(
            user.id,
            {
              role: user.role === "admin" ? "user" : "admin",
            },
            currentUser
          )
          .then(function () {
            ui.showToast("User role updated.", "success");
            render();
          })
          .catch(function (error) {
            ui.showToast(error.message || "Unable to update the user role.", "error");
          })
          .finally(function () {
            ui.hidePageLoader();
          });
      });
    });

    pageContent.querySelectorAll("[data-toggle-status]").forEach((button) => {
      button.addEventListener("click", function () {
        const user = managers.user.getUserById(button.getAttribute("data-toggle-status"));
        managers.user
          .updateUser(
            user.id,
            {
              status: user.status === "active" ? "inactive" : "active",
            },
            currentUser
          )
          .then(function () {
            ui.showToast("User status updated.", "success");
            render();
          })
          .catch(function (error) {
            ui.showToast(error.message || "Unable to update the user status.", "error");
          })
          .finally(function () {
            ui.hidePageLoader();
          });
      });
    });
  }

  if (!permissions.canManageTeam(currentUser)) {
    window.location.href = "dashboard.html";
    return;
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

(function () {
  const { auth, permissions, managers, storage, events } = window.TaskFlow;
  const utils = window.TaskFlow.utils;
  const ui = window.TaskFlow.ui;
  const currentUser = auth.requireAuth("board.html");
  if (!currentUser) return;

  ui.renderShell({
    currentUser,
    activeNav: "board",
    title: "Task Board",
    subtitle:
      currentUser.role === "admin"
        ? "Manage tasks across all project columns."
        : "Update the tasks assigned to you and follow project progress.",
    primaryAction:
      currentUser.role === "admin"
        ? { label: "+ Add Task", id: "topbar-add-task" }
        : { label: "Projects", href: "projects.html" },
  });

  const pageContent = document.getElementById("page-content");
  const statuses = [
    { key: "todo", label: "To Do" },
    { key: "in_progress", label: "In Progress" },
    { key: "review", label: "Review" },
    { key: "done", label: "Done" },
  ];

  let selectedProjectId = utils.getQueryParam("projectId") || storage.readPreferences().boardProjectId || "";

  function syncCurrentUser() {
    const latestUser = auth.getCurrentUser();
    if (!latestUser) return null;
    Object.assign(currentUser, latestUser);
    return currentUser;
  }

  function saveBoardPreference(projectId) {
    const preferences = storage.readPreferences();
    storage.writePreferences(Object.assign({}, preferences, { boardProjectId: projectId || "" }));
  }

  function getVisibleProjects() {
    return managers.project.getVisibleProjects(currentUser);
  }

  function getProjectUsers(projectId) {
    const users = managers.project.getProjectMemberUsers(projectId);
    return users.filter(Boolean);
  }

  function renderTaskCard(task) {
    const assignees = managers.user.getUsersByIds(task.assignedTo || []);
    const project = managers.project.getProjectById(task.projectId);
    return `
      <article
        class="task-card priority-${task.priority}"
        draggable="${permissions.canEditTask(currentUser, task)}"
        data-task-id="${task.id}"
      >
        <h4>${utils.escapeHtml(task.title)}</h4>
        <div class="task-meta">
          <span>${utils.escapeHtml(project ? project.name : "Project")}</span>
          <span>Due ${utils.formatDate(task.dueDate)}</span>
        </div>
        <div class="progress"><span style="width:${task.progress}%"></span></div>
        <div class="task-footer">
          <span class="${ui.badgeClass("priority", task.priority)}">${task.priority}</span>
          ${ui.renderAvatarGroup(assignees)}
        </div>
      </article>
    `;
  }

  function taskFormHtml(task) {
    const editable = task ? permissions.canEditTask(currentUser, task) : true;
    const projectId = task ? task.projectId : selectedProjectId || (getVisibleProjects()[0] || {}).id || "";
    const projectUsers = getProjectUsers(projectId);
    return `
      <div class="card-header">
        <div>
          <h3>${task ? "Task Details" : "Create Task"}</h3>
          <p>${task ? "Update status, timeline, assignment, and discussion." : "Add a new task to the selected project."}</p>
        </div>
        <button class="btn btn-ghost" data-close-modal type="button">Close</button>
      </div>

      <form id="task-form" class="grid">
        <input type="hidden" name="taskId" value="${task ? task.id : ""}" />
        <input type="hidden" name="projectId" value="${projectId}" />
        <div class="form-grid">
          <div class="form-group full">
            <label>Title</label>
            <input name="title" value="${task ? utils.escapeHtml(task.title) : ""}" ${editable ? "" : "disabled"} required />
          </div>
          <div class="form-group full">
            <label>Description</label>
            <textarea name="description" ${editable ? "" : "disabled"}>${task ? utils.escapeHtml(task.description) : ""}</textarea>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select name="status" ${editable ? "" : "disabled"}>
              ${statuses
                .map(
                  (status) => `
                    <option value="${status.key}" ${task && task.status === status.key ? "selected" : ""}>
                      ${status.label}
                    </option>
                  `
                )
                .join("")}
            </select>
          </div>
          <div class="form-group">
            <label>Priority</label>
            <select name="priority" ${editable ? "" : "disabled"}>
              ${["low", "medium", "high"]
                .map(
                  (priority) => `<option value="${priority}" ${
                    task && task.priority === priority ? "selected" : ""
                  }>${priority}</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="form-group">
            <label>Start Date</label>
            <input name="startDate" type="date" value="${task ? task.startDate : utils.toInputDate(new Date())}" ${editable ? "" : "disabled"} required />
          </div>
          <div class="form-group">
            <label>Due Date</label>
            <input name="dueDate" type="date" value="${task ? task.dueDate : utils.toInputDate(new Date())}" ${editable ? "" : "disabled"} required />
          </div>
          <div class="form-group">
            <label>Estimated Hours</label>
            <input name="estimatedHours" type="number" min="0" value="${task ? task.estimatedHours : 0}" ${editable ? "" : "disabled"} />
          </div>
          <div class="form-group">
            <label>Actual Hours</label>
            <input name="actualHours" type="number" min="0" value="${task ? task.actualHours : 0}" ${editable ? "" : "disabled"} />
          </div>
          <div class="form-group full">
            <label>Progress</label>
            <div class="progress-range-row">
              <input
                id="task-progress-range"
                name="progress"
                type="range"
                min="0"
                max="100"
                value="${task ? task.progress : 0}"
                ${editable ? "" : "disabled"}
              />
              <span id="task-progress-value" class="progress-range-value">${task ? task.progress : 0}%</span>
            </div>
            <div class="hint">Move to update completion percentage.</div>
          </div>
          ${
            currentUser.role === "admin"
              ? `
              <div class="form-group full">
                <label>Assign Members</label>
                <div class="grid">
                  ${projectUsers
                    .map((user) => {
                      const checked = task && (task.assignedTo || []).includes(user.id) ? "checked" : "";
                      return `
                        <label class="member-check-item">
                          <span class="member-check-copy">
                            <strong>${utils.escapeHtml(user.name)}</strong>
                          </span>
                          <input type="checkbox" name="assignedTo" value="${user.id}" ${checked} />
                        </label>
                      `;
                    })
                    .join("")}
                </div>
              </div>
            `
              : ""
          }
        </div>
      </form>

      ${
        task
          ? `
            <div class="modal-actions task-modal-actions">
              ${
                editable || !task
                  ? `<button class="btn btn-primary" form="task-form" type="submit">${task ? "Save Task" : "Create Task"}</button>`
                  : ""
              }
              ${
                task && permissions.canDeleteTask(currentUser)
                  ? `<button class="btn btn-danger" data-delete-task="${task.id}" type="button">Delete Task</button>`
                  : ""
              }
              <button class="btn btn-ghost" data-close-modal type="button">Close</button>
            </div>
            <div class="grid grid-2" style="margin-top:20px;">
              <section class="card">
                <div class="card-header">
                  <div>
                    <h4>Subtasks</h4>
                    <p>Break work into smaller trackable items.</p>
                  </div>
                </div>
                <div id="subtask-list">
                  ${
                    (task.subtasks || []).length
                      ? task.subtasks
                          .map(
                            (subtask) => `
                              <label class="subtask-item">
                                <input type="checkbox" data-subtask-id="${subtask.id}" ${
                              subtask.completed ? "checked" : ""
                            } ${editable ? "" : "disabled"} />
                                <span>${utils.escapeHtml(subtask.title)}</span>
                              </label>
                            `
                          )
                          .join("")
                      : '<p class="hint">No subtasks yet.</p>'
                  }
                </div>
                ${
                  editable
                    ? `
                      <form id="subtask-form" class="inline-form" style="margin-top:14px;">
                        <input name="title" placeholder="Add subtask..." required />
                        <button class="btn btn-secondary" type="submit">Add</button>
                      </form>
                    `
                    : ""
                }
              </section>

              <section class="card">
                <div class="card-header">
                  <div>
                    <h4>Comments</h4>
                    <p>Discuss progress and blockers here.</p>
                  </div>
                </div>
                <div class="comment-thread" id="comment-thread">
                  ${renderCommentThread(task)}
                </div>
                ${
                  permissions.canComment(currentUser, task)
                    ? `
                      <form id="comment-form" class="grid" style="margin-top:14px;">
                        <textarea name="content" placeholder="Write a comment..." required></textarea>
                        <button class="btn btn-secondary" type="submit">Add Comment</button>
                      </form>
                    `
                    : '<p class="hint">You can only comment on tasks assigned to you.</p>'
                }
              </section>
            </div>
          `
          : `
            <div class="modal-actions task-modal-actions">
              ${
                editable || !task
                  ? `<button class="btn btn-primary" form="task-form" type="submit">${task ? "Save Task" : "Create Task"}</button>`
                  : ""
              }
              <button class="btn btn-ghost" data-close-modal type="button">Close</button>
            </div>
          `
      }
    `;
  }

  function renderCommentThread(task) {
    const comments = managers.comment.getCommentsForTask(task.id);
    if (!comments.length) {
      return '<div class="empty-state">No comments yet.</div>';
    }
    return comments
      .map((comment) => {
        const author = managers.user.getUserById(comment.authorId);
        return `
          <div class="comment">
            <strong>${utils.escapeHtml(author ? author.name : "Unknown user")}</strong>
            <div class="meta-line">${utils.formatDateTime(comment.createdAt)}</div>
            <p>${utils.escapeHtml(comment.content)}</p>
            <div class="comment-replies">
              ${(comment.replies || [])
                .map((reply) => {
                  const replyAuthor = managers.user.getUserById(reply.authorId);
                  return `
                    <div class="reply">
                      <strong>${utils.escapeHtml(replyAuthor ? replyAuthor.name : "Unknown user")}</strong>
                      <div class="meta-line">${utils.formatDateTime(reply.createdAt)}</div>
                      <div>${utils.escapeHtml(reply.content)}</div>
                    </div>
                  `;
                })
                .join("")}
            </div>
            ${
              permissions.canComment(currentUser, task)
                ? `
                  <form class="inline-form" data-reply-form="${comment.id}" style="margin-top:10px;">
                    <input name="content" placeholder="Reply..." required />
                    <button class="btn btn-ghost" type="submit">Reply</button>
                  </form>
                `
                : ""
            }
          </div>
        `;
      })
      .join("");
  }

  function openTaskModal(taskId) {
    const task = taskId ? managers.task.getTaskById(taskId) : null;
    ui.openModal(taskFormHtml(task));

    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", ui.closeModal);
    });

    const deleteButton = document.querySelector("[data-delete-task]");
    if (deleteButton) {
      deleteButton.addEventListener("click", function () {
        if (window.confirm("Delete this task?")) {
          managers.task
            .deleteTask(deleteButton.getAttribute("data-delete-task"), currentUser)
            .then(function () {
              ui.closeModal();
              ui.showToast("Task deleted.", "success");
              render();
            })
            .catch(function (error) {
              ui.showToast(error.message || "Unable to delete the task.", "error");
            })
            .finally(function () {
              ui.hidePageLoader();
            });
        }
      });
    }

    const progressRange = document.getElementById("task-progress-range");
    const progressValue = document.getElementById("task-progress-value");
    if (progressRange && progressValue) {
      const syncProgressLabel = function () {
        progressValue.textContent = `${progressRange.value}%`;
      };
      progressRange.addEventListener("input", syncProgressLabel);
      syncProgressLabel();
    }

    const form = document.getElementById("task-form");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        const formData = new FormData(form);
        const payload = {
          projectId: formData.get("projectId"),
          title: formData.get("title"),
          description: formData.get("description"),
          status: formData.get("status"),
          priority: formData.get("priority"),
          startDate: formData.get("startDate"),
          dueDate: formData.get("dueDate"),
          estimatedHours: Number(formData.get("estimatedHours")),
          actualHours: Number(formData.get("actualHours")),
          progress: Number(formData.get("progress")),
        };
        if (currentUser.role === "admin") {
          payload.assignedTo = formData.getAll("assignedTo");
        }

        if (payload.dueDate < payload.startDate) {
          ui.showToast("Due date cannot be earlier than start date.", "error");
          return;
        }

        if (!payload.projectId) {
          ui.showToast("Select a project from the board dropdown first.", "error");
          return;
        }

        const existingTaskId = formData.get("taskId");
        TaskFlow.forms.setFormBusy(form, true, existingTaskId ? "Saving..." : "Creating...");

        const saveResult = existingTaskId
          ? managers.task.updateTask(existingTaskId, payload, currentUser)
          : managers.task.createTask(payload, currentUser);

        TaskFlow.forms.ensurePromise(saveResult, "Task save did not start. Refresh the page with Ctrl+Shift+R.")
          .then(function () {
            ui.closeModal();
            ui.showToast(existingTaskId ? "Task updated." : "Task created.", "success");
            render();
          })
          .catch(function (error) {
            ui.showToast(error.message || "Unable to save the task.", "error");
          })
          .finally(function () {
            TaskFlow.forms.setFormBusy(form, false);
            ui.hidePageLoader();
          });
      });
    }

    const subtaskForm = document.getElementById("subtask-form");
    if (subtaskForm && task) {
      subtaskForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const formData = new FormData(subtaskForm);
        managers.task
          .addSubtask(task.id, formData.get("title"), currentUser)
          .then(function () {
            openTaskModal(task.id);
          })
          .catch(function (error) {
            ui.showToast(error.message || "Unable to add the subtask.", "error");
          });
      });
    }

    document.querySelectorAll("[data-subtask-id]").forEach((checkbox) => {
      checkbox.addEventListener("change", function () {
        managers.task
          .toggleSubtask(task.id, checkbox.getAttribute("data-subtask-id"), currentUser)
          .then(function () {
            openTaskModal(task.id);
          })
          .catch(function (error) {
            ui.showToast(error.message || "Unable to update the subtask.", "error");
          });
      });
    });

    const commentForm = document.getElementById("comment-form");
    if (commentForm && task) {
      commentForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const formData = new FormData(commentForm);
        managers.comment
          .addComment(task.id, formData.get("content"), currentUser.id)
          .then(function () {
            openTaskModal(task.id);
          })
          .catch(function (error) {
            ui.showToast(error.message || "Unable to add the comment.", "error");
          });
      });
    }

    document.querySelectorAll("[data-reply-form]").forEach((replyForm) => {
      replyForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const formData = new FormData(replyForm);
        managers.comment
          .addReply(replyForm.getAttribute("data-reply-form"), formData.get("content"), currentUser.id)
          .then(function () {
            openTaskModal(task.id);
          })
          .catch(function (error) {
            ui.showToast(error.message || "Unable to reply to the comment.", "error");
          });
      });
    });
  }

  function render() {
    const projects = getVisibleProjects();
    if (selectedProjectId && !projects.some((project) => project.id === selectedProjectId)) {
      selectedProjectId = "";
      utils.setQueryParams({ projectId: null });
    }
    if (!selectedProjectId && projects.length) {
      selectedProjectId = projects[0].id;
      utils.setQueryParams({ projectId: selectedProjectId });
    }
    const tasks = managers.task.getVisibleTasks(currentUser, selectedProjectId);

    pageContent.innerHTML = `
      <section class="toolbar">
        <div class="toolbar-group">
          <select id="project-selector">
            ${projects
              .map(
                (project) =>
                  `<option value="${project.id}" ${project.id === selectedProjectId ? "selected" : ""}>${utils.escapeHtml(
                    project.name
                  )}</option>`
              )
              .join("")}
          </select>
          <a class="btn btn-ghost" href="timeline.html?projectId=${selectedProjectId || ""}">Open Timeline</a>
        </div>
      </section>

      <section class="kanban">
        ${statuses
          .map((status) => {
            const bucket = tasks.filter((task) => task.status === status.key);
            return `
              <div class="kanban-column" data-status-drop="${status.key}">
                <div class="kanban-header">
                  <strong>${status.label}</strong>
                  <span class="badge">${bucket.length}</span>
                </div>
                <div class="task-list">
                  ${bucket.length ? bucket.map(renderTaskCard).join("") : '<div class="empty-state">No tasks here.</div>'}
                </div>
              </div>
            `;
          })
          .join("")}
      </section>
    `;

    const projectSelector = document.getElementById("project-selector");
    if (projectSelector) {
      projectSelector.addEventListener("change", function (event) {
        selectedProjectId = event.target.value;
        utils.setQueryParams({ projectId: selectedProjectId });
        saveBoardPreference(selectedProjectId);
        render();
      });
    }

    const topbarCreateTaskButton = document.getElementById("topbar-add-task");
    if (topbarCreateTaskButton) {
      topbarCreateTaskButton.addEventListener("click", function () {
        const projects = getVisibleProjects();
        if (!projects.length) {
          ui.showToast("Create a project first, then add tasks.", "error");
          return;
        }
        if (!selectedProjectId) {
          selectedProjectId = projects[0].id;
          saveBoardPreference(selectedProjectId);
        }
        openTaskModal("");
      });
    }

    pageContent.querySelectorAll("[data-task-id]").forEach((card) => {
      card.addEventListener("click", function (event) {
        if (event.target.closest("button")) return;
        openTaskModal(card.getAttribute("data-task-id"));
      });

      card.addEventListener("dragstart", function (event) {
        event.dataTransfer.setData("text/plain", card.getAttribute("data-task-id"));
      });
    });

    pageContent.querySelectorAll("[data-status-drop]").forEach((column) => {
      column.addEventListener("dragover", function (event) {
        event.preventDefault();
        column.classList.add("drag-over");
      });
      column.addEventListener("dragleave", function () {
        column.classList.remove("drag-over");
      });
      column.addEventListener("drop", function (event) {
        event.preventDefault();
        column.classList.remove("drag-over");
        const taskId = event.dataTransfer.getData("text/plain");
        const task = managers.task.getTaskById(taskId);
        if (!task || !permissions.canEditTask(currentUser, task)) {
          ui.showToast("You do not have permission to move this task.", "error");
          return;
        }
        managers.task
          .updateTaskStatus(taskId, column.getAttribute("data-status-drop"), currentUser)
          .then(function () {
            ui.showToast("Task status updated.", "success");
            render();
          })
          .catch(function (error) {
            ui.showToast(error.message || "Unable to update task status.", "error");
          })
          .finally(function () {
            ui.hidePageLoader();
          });
      });
    });
  }

  render();
  events.on("db:updated", function () {
    render();
  });
  events.on("session:updated", function () {
    syncCurrentUser();
  });
  events.on("preferences:updated", function (preferences) {
    if (!utils.getQueryParam("projectId")) {
      selectedProjectId = (preferences && preferences.boardProjectId) || "";
      render();
    }
  });
})();

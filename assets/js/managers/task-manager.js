(function () {
  const TaskFlow = (window.TaskFlow = window.TaskFlow || {});
  const utils = TaskFlow.utils;
  const { uid, nowIso, clamp, toInputDate } = utils;
  const { readDb, updateDb } = TaskFlow.storage;

  function asPromise(action) {
    if (typeof utils.asPromise === "function") {
      return utils.asPromise(action);
    }
    try {
      return Promise.resolve(action());
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function applyProjectProgress(db, projectId) {
    return TaskFlow.managers.project.applyProjectProgress(db, projectId);
  }

  function assertTaskAccess(condition, message) {
    if (!condition) {
      throw new Error(message || "You do not have permission to update this task.");
    }
  }

  function getAllTasks() {
    return readDb().tasks;
  }

  function sanitizeAssignedUsers(db, assignedTo) {
    return Array.from(
      new Set(
        (assignedTo || []).filter((userId) => {
          const user = db.users.find((candidate) => candidate.id === userId);
          return user && user.role !== "admin" && user.status === "active";
        })
      )
    );
  }

  function getTaskById(taskId) {
    return readDb().tasks.find((task) => task.id === taskId) || null;
  }

  function getVisibleTasks(user, projectId) {
    const db = readDb();
    const visibleProjectIds =
      user.role === "admin"
        ? db.projects.map((project) => project.id)
        : db.projectMembers
            .filter((member) => member.userId === user.id)
            .map((member) => member.projectId);

    return db.tasks.filter((task) => {
      const matchesProject = projectId ? task.projectId === projectId : true;
      const allowedTask = user.role === "admin" || visibleProjectIds.includes(task.projectId);
      return matchesProject && allowedTask;
    });
  }

  function createTask(data, currentUser) {
    return asPromise(function () {
      assertTaskAccess(
        TaskFlow.permissions.canAssignTask(currentUser),
        "Only admins can create tasks."
      );
      let task = null;
      return updateDb(
      function (db) {
        const project = db.projects.find((item) => item.id === data.projectId);
        if (!project) {
          throw new Error("The selected project could not be found.");
        }
        task = {
          id: uid("task"),
          projectId: data.projectId,
          title: String(data.title || "").trim(),
          description: String(data.description || "").trim(),
          status: data.status || "todo",
          priority: data.priority || "medium",
          assignedTo: sanitizeAssignedUsers(db, data.assignedTo),
          createdBy: currentUser.id,
          startDate: data.startDate,
          dueDate: data.dueDate,
          estimatedHours: Number(data.estimatedHours || 0),
          actualHours: Number(data.actualHours || 0),
          progress: clamp(data.progress || 0, 0, 100),
          subtasks: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };

        if (task.progress === 100) {
          task.status = "done";
        }

        db.tasks.push(task);
        db.activityLogs.unshift({
          id: uid("activity"),
          type: "task_created",
          actorId: currentUser.id,
          projectId: task.projectId,
          taskId: task.id,
          message: `Created task ${task.title}`,
          createdAt: nowIso(),
        });
        applyProjectProgress(db, task.projectId);
        return db;
      },
      { scope: ["tasks", "projects", "activityLogs"] }
    ).then(function () {
        return task;
      });
    });
  }

  function updateTask(taskId, updates, currentUser) {
    return asPromise(function () {
      const existingTask = getTaskById(taskId);
      assertTaskAccess(existingTask, "The selected task could not be found.");
      assertTaskAccess(
        TaskFlow.permissions.canEditTask(currentUser, existingTask),
        "You do not have permission to update this task."
      );
      let projectId = "";
      return updateDb(
        function (db) {
          const task = db.tasks.find((item) => item.id === taskId);
          if (!task) return db;
          Object.assign(task, updates);
          task.assignedTo = sanitizeAssignedUsers(db, task.assignedTo);
          task.progress = clamp(task.progress || 0, 0, 100);
          if (task.progress === 100) {
            task.status = "done";
          }
          if (task.status === "done" && task.progress < 100) {
            task.progress = 100;
          }
          task.updatedAt = nowIso();
          projectId = task.projectId;
          db.activityLogs.unshift({
            id: uid("activity"),
            type: "task_updated",
            actorId: currentUser.id,
            projectId: task.projectId,
            taskId: task.id,
            message: `Updated task ${task.title}`,
            createdAt: nowIso(),
          });
          applyProjectProgress(db, projectId);
          return db;
        },
        { scope: ["tasks", "projects", "activityLogs"] }
      );
    });
  }

  function deleteTask(taskId, currentUser) {
    return asPromise(function () {
      const task = getTaskById(taskId);
      assertTaskAccess(task, "The selected task could not be found.");
      assertTaskAccess(
        TaskFlow.permissions.canDeleteTask(currentUser),
        "Only admins can delete tasks."
      );
      const projectId = task.projectId;
      return updateDb(
      function (db) {
        db.tasks = db.tasks.filter((item) => item.id !== taskId);
        db.comments = db.comments.filter((comment) => comment.taskId !== taskId);
        db.activityLogs.unshift({
          id: uid("activity"),
          type: "task_deleted",
          actorId: currentUser.id,
          projectId: task.projectId,
          taskId: task.id,
          message: `Deleted task ${task.title}`,
          createdAt: nowIso(),
        });
        applyProjectProgress(db, projectId);
        return db;
      },
      { scope: ["tasks", "comments", "projects", "activityLogs"], syncDeletes: true }
      );
    });
  }

  function updateTaskStatus(taskId, status, currentUser) {
    const statusProgressMap = {
      todo: 0,
      in_progress: 50,
      review: 85,
      done: 100,
    };
    return updateTask(taskId, { status, progress: statusProgressMap[status] || 0 }, currentUser);
  }

  function addSubtask(taskId, title, currentUser) {
    return asPromise(function () {
      const taskRecord = getTaskById(taskId);
      assertTaskAccess(taskRecord, "The selected task could not be found.");
      assertTaskAccess(
        TaskFlow.permissions.canEditTask(currentUser, taskRecord),
        "You do not have permission to update this task."
      );
      return updateDb(
        function (db) {
          const task = db.tasks.find((item) => item.id === taskId);
          if (!task) return db;
          task.subtasks = task.subtasks || [];
          task.subtasks.push({
            id: uid("subtask"),
            title: title.trim(),
            completed: false,
          });
          task.updatedAt = nowIso();
          db.activityLogs.unshift({
            id: uid("activity"),
            type: "subtask_added",
            actorId: currentUser.id,
            projectId: task.projectId,
            taskId: task.id,
            message: `Added subtask to ${task.title}`,
            createdAt: nowIso(),
          });
          return db;
        },
        { scope: ["tasks", "activityLogs"] }
      );
    });
  }

  function toggleSubtask(taskId, subtaskId, currentUser) {
    return asPromise(function () {
      const taskRecord = getTaskById(taskId);
      assertTaskAccess(taskRecord, "The selected task could not be found.");
      assertTaskAccess(
        TaskFlow.permissions.canEditTask(currentUser, taskRecord),
        "You do not have permission to update this task."
      );
      return updateDb(
      function (db) {
        const task = db.tasks.find((item) => item.id === taskId);
        if (!task) return db;
        const subtask = (task.subtasks || []).find((item) => item.id === subtaskId);
        if (!subtask) return db;
        subtask.completed = !subtask.completed;
        task.updatedAt = nowIso();
        db.activityLogs.unshift({
          id: uid("activity"),
          type: "subtask_toggled",
          actorId: currentUser.id,
          projectId: task.projectId,
          taskId: task.id,
          message: `Updated subtask on ${task.title}`,
          createdAt: nowIso(),
        });
        return db;
      },
      { scope: ["tasks", "activityLogs"] }
      );
    });
  }

  function getOverdueTasks(user) {
    const today = toInputDate(new Date());
    return getVisibleTasks(user).filter(
      (task) => task.status !== "done" && task.dueDate && task.dueDate < today
    );
  }

  function getTasksByUser(userId) {
    return readDb().tasks.filter((task) => (task.assignedTo || []).includes(userId));
  }

  TaskFlow.managers = TaskFlow.managers || {};
  TaskFlow.managers.task = {
    getAllTasks,
    getTaskById,
    getVisibleTasks,
    createTask,
    updateTask,
    deleteTask,
    updateTaskStatus,
    addSubtask,
    toggleSubtask,
    getOverdueTasks,
    getTasksByUser,
  };
})();

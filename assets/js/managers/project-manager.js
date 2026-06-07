(function () {
  const TaskFlow = (window.TaskFlow = window.TaskFlow || {});
  const { uid, nowIso, clone, asPromise } = TaskFlow.utils;
  const { readDb, updateDb } = TaskFlow.storage;
  const PROJECT_STATUSES = ["planning", "in_progress", "completed"];

  function normalizeProjectStatus(status) {
    const normalized = String(status || "")
      .trim()
      .toLowerCase();
    if (normalized === "todo") return "planning";
    if (normalized === "review") return "in_progress";
    if (normalized === "done") return "completed";
    return PROJECT_STATUSES.includes(normalized) ? normalized : "planning";
  }

  function formatProjectStatusLabel(status) {
    const normalized = normalizeProjectStatus(status);
    if (normalized === "planning") return "Planning";
    if (normalized === "in_progress") return "In Progress";
    return "Completed";
  }

  function normalizeProjectRecord(project) {
    if (!project) return null;
    const nextProject = clone(project);
    nextProject.status = normalizeProjectStatus(project.status);
    return nextProject;
  }

  function assertProjectManager(currentUser, message) {
    if (!TaskFlow.permissions.canManageProjects(currentUser)) {
      throw new Error(message || "You do not have permission to manage projects.");
    }
  }

  function getAllProjects() {
    return readDb().projects.map(normalizeProjectRecord);
  }

  function getProjectById(projectId) {
    return normalizeProjectRecord(readDb().projects.find((project) => project.id === projectId) || null);
  }

  function getProjectMembers(projectId) {
    const db = readDb();
    return db.projectMembers.filter((item) => {
      if (item.projectId !== projectId) return false;
      const user = db.users.find((candidate) => candidate.id === item.userId);
      return user && user.role !== "admin" && user.status === "active";
    });
  }

  function getProjectMemberUsers(projectId) {
    const db = readDb();
    const members = getProjectMembers(projectId);
    return members
      .map((member) => db.users.find((user) => user.id === member.userId))
      .filter(Boolean);
  }

  function getVisibleProjects(user) {
    const db = readDb();
    if (user.role === "admin") {
      return clone(db.projects).map(normalizeProjectRecord);
    }
    const allowedProjectIds = db.projectMembers
      .filter((member) => member.userId === user.id)
      .map((member) => member.projectId);
    return db.projects
      .filter((project) => allowedProjectIds.includes(project.id))
      .map(normalizeProjectRecord);
  }

  function searchProjects(query, user) {
    const normalized = String(query || "").trim().toLowerCase();
    return getVisibleProjects(user).filter((project) => {
      return (
        project.name.toLowerCase().includes(normalized) ||
        project.description.toLowerCase().includes(normalized) ||
        (project.tags || []).join(" ").toLowerCase().includes(normalized)
      );
    });
  }

  function createProject(data, currentUser) {
    return asPromise(function () {
      assertProjectManager(currentUser, "Only admins can create projects.");
      const nextProject = {
      id: uid("proj"),
      name: data.name.trim(),
      description: data.description.trim(),
      status: normalizeProjectStatus(data.status || "planning"),
      priority: data.priority || "medium",
      ownerId: currentUser.id,
      startDate: data.startDate,
      endDate: data.endDate,
      progress: 0,
      budget: Number(data.budget || 0),
      tags: String(data.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    return updateDb(
      (db) => {
      const selectedIds = Array.from(
        new Set(
          (data.memberIds || []).filter((userId) => {
            const user = db.users.find((candidate) => candidate.id === userId);
            return user && user.role !== "admin" && user.status === "active";
          })
        )
      );
      db.projects.push(nextProject);
      selectedIds.forEach((userId) => {
        db.projectMembers.push({
          id: uid("member"),
          projectId: nextProject.id,
          userId,
          projectRole: "member",
          permissions: ["task_update", "comment"],
          joinedAt: nowIso(),
        });
      });
      db.activityLogs.unshift({
        id: uid("activity"),
        type: "project_created",
        actorId: currentUser.id,
        projectId: nextProject.id,
        message: `Created project ${nextProject.name}`,
        createdAt: nowIso(),
      });
      return db;
    },
      { scope: ["projects", "projectMembers", "activityLogs"] }
    ).then(function () {
        return nextProject;
      });
    });
  }

  function updateProject(projectId, updates, currentUser) {
    return asPromise(function () {
      assertProjectManager(currentUser, "Only admins can update projects.");
      return updateDb((db) => {
      const project = db.projects.find((item) => item.id === projectId);
      if (!project) return db;
      project.name = String(updates.name !== undefined ? updates.name : project.name).trim();
      project.description = String(
        updates.description !== undefined ? updates.description : project.description
      ).trim();
      project.status = normalizeProjectStatus(updates.status !== undefined ? updates.status : project.status);
      project.priority = updates.priority || project.priority;
      project.budget = Number(updates.budget !== undefined ? updates.budget : project.budget || 0);
      project.startDate = updates.startDate || project.startDate;
      project.endDate = updates.endDate || project.endDate;
      project.tags = Array.isArray(updates.tags)
        ? updates.tags
        : String(updates.tags !== undefined ? updates.tags : project.tags || "")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean);
      project.updatedAt = nowIso();
      db.activityLogs.unshift({
        id: uid("activity"),
        type: "project_updated",
        actorId: currentUser.id,
        projectId: project.id,
        message: `Updated project ${project.name}`,
        createdAt: nowIso(),
      });
      return db;
    }, { scope: ["projects", "activityLogs"] });
    });
  }

  function saveProjectMembers(projectId, memberIds, currentUser) {
    return asPromise(function () {
      assertProjectManager(currentUser, "Only admins can update project members.");
      return updateDb((db) => {
      const project = db.projects.find((item) => item.id === projectId);
      if (!project) return db;
      const existingIds = db.projectMembers
        .filter((member) => member.projectId === projectId)
        .map((member) => member.userId);
      db.projectMembers = db.projectMembers.filter((member) => {
        return member.projectId !== projectId;
      });
      const uniqueIds = Array.from(
        new Set(
          (memberIds || []).filter((userId) => {
            const user = db.users.find((candidate) => candidate.id === userId);
            return user && user.role !== "admin" && user.status === "active";
          })
        )
      );
      const removedIds = existingIds.filter((userId) => !uniqueIds.includes(userId));
      uniqueIds.forEach((userId) => {
        const exists = db.projectMembers.some(
          (member) => member.projectId === projectId && member.userId === userId
        );
        if (!exists) {
          db.projectMembers.push({
            id: uid("member"),
            projectId,
            userId,
            projectRole: "member",
            permissions: ["task_update", "comment"],
            joinedAt: nowIso(),
          });
        }
      });
      if (removedIds.length) {
        db.tasks.forEach((task) => {
          if (task.projectId !== projectId) return;
          task.assignedTo = (task.assignedTo || []).filter((userId) => !removedIds.includes(userId));
        });
      }
      db.activityLogs.unshift({
        id: uid("activity"),
        type: "project_members_updated",
        actorId: currentUser.id,
        projectId,
        message: `Updated project members for ${project.name}`,
        createdAt: nowIso(),
      });
      return db;
    }, { scope: ["projectMembers", "tasks", "activityLogs"], syncDeletes: true });
    });
  }

  function deleteProject(projectId, currentUser) {
    return asPromise(function () {
      assertProjectManager(currentUser, "Only admins can delete projects.");
      return updateDb((db) => {
      const project = db.projects.find((item) => item.id === projectId);
      if (!project) return db;
      db.projects = db.projects.filter((project) => project.id !== projectId);
      const taskIds = db.tasks.filter((task) => task.projectId === projectId).map((task) => task.id);
      db.tasks = db.tasks.filter((task) => task.projectId !== projectId);
      db.comments = db.comments.filter((comment) => !taskIds.includes(comment.taskId));
      db.projectMembers = db.projectMembers.filter((member) => member.projectId !== projectId);
      db.activityLogs.unshift({
        id: uid("activity"),
        type: "project_deleted",
        actorId: currentUser.id,
        projectId,
        message: `Deleted project ${project.name}`,
        createdAt: nowIso(),
      });
      return db;
    }, {
      scope: ["projects", "tasks", "comments", "projectMembers", "activityLogs"],
      syncDeletes: true,
    });
    });
  }

  function applyProjectProgress(db, projectId) {
    const projectTasks = db.tasks.filter((task) => task.projectId === projectId);
    const progress = projectTasks.length
      ? Math.round(
          projectTasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / projectTasks.length
        )
      : 0;
    const project = db.projects.find((item) => item.id === projectId);
    if (project) {
      project.progress = progress;
      project.updatedAt = nowIso();
      if (progress === 100) {
        project.status = "completed";
      }
    }
    return progress;
  }

  function refreshProjectProgress(projectId) {
    return updateDb(
      function (db) {
        applyProjectProgress(db, projectId);
        return db;
      },
      { scope: ["projects"] }
    );
  }

  function getProjectStats(projectId) {
    const tasks = readDb().tasks.filter((task) => task.projectId === projectId);
    return {
      totalTasks: tasks.length,
      completedTasks: tasks.filter((task) => task.status === "done").length,
      inProgressTasks: tasks.filter((task) => task.status === "in_progress").length,
      overdueTasks: tasks.filter(
        (task) => task.status !== "done" && task.dueDate < TaskFlow.utils.toInputDate(new Date())
      ).length,
    };
  }

  TaskFlow.managers = TaskFlow.managers || {};
  TaskFlow.managers.project = {
    getAllProjects,
    getProjectById,
    getProjectMembers,
    getProjectMemberUsers,
    getVisibleProjects,
    searchProjects,
    createProject,
    updateProject,
    saveProjectMembers,
    deleteProject,
    refreshProjectProgress,
    applyProjectProgress,
    getProjectStats,
    PROJECT_STATUSES,
    normalizeProjectStatus,
    formatProjectStatusLabel,
  };
})();

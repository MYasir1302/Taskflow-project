(function () {
  const TaskFlow = (window.TaskFlow = window.TaskFlow || {});
  const { readDb } = TaskFlow.storage;
  const { toInputDate, diffInDays } = TaskFlow.utils;

  function resolveScope(arg1, arg2) {
    if (arg1 && typeof arg1 === "object" && arg1.id) {
      return { user: arg1, projectId: arg2 || "" };
    }
    return { user: null, projectId: arg1 || "" };
  }

  function getVisibleProjectIds(user, db) {
    if (!user || user.role === "admin") {
      return db.projects.map((project) => project.id);
    }
    return db.projectMembers
      .filter((member) => member.userId === user.id)
      .map((member) => member.projectId);
  }

  function getScopedTasks(user, projectId) {
    if (user) {
      return TaskFlow.managers.task.getVisibleTasks(user, projectId);
    }
    return readDb().tasks.filter((task) => !projectId || task.projectId === projectId);
  }

  function getVisibleDatabaseSlice(user) {
    const db = readDb();
    if (user.role === "admin") return db;

    const projectIds = getVisibleProjectIds(user, db);
    const tasks = getScopedTasks(user, "");
    const taskIds = tasks.map((task) => task.id);
    const comments = db.comments.filter((comment) => taskIds.includes(comment.taskId));
    const activityLogs = db.activityLogs.filter((log) => {
      return (
        log.actorId === user.id ||
        (log.projectId && projectIds.includes(log.projectId)) ||
        (log.taskId && taskIds.includes(log.taskId))
      );
    });
    const visibleUserIds = new Set([user.id]);
    db.projectMembers.forEach((member) => {
      if (projectIds.includes(member.projectId)) {
        visibleUserIds.add(member.userId);
      }
    });
    tasks.forEach((task) => {
      (task.assignedTo || []).forEach((userId) => visibleUserIds.add(userId));
      if (task.createdBy) visibleUserIds.add(task.createdBy);
    });
    comments.forEach((comment) => {
      visibleUserIds.add(comment.authorId);
      (comment.replies || []).forEach((reply) => visibleUserIds.add(reply.authorId));
    });
    activityLogs.forEach((log) => {
      if (log.actorId) visibleUserIds.add(log.actorId);
    });

    return {
      users: db.users.filter((member) => visibleUserIds.has(member.id)),
      projects: db.projects.filter((project) => projectIds.includes(project.id)),
      tasks,
      comments,
      projectMembers: db.projectMembers.filter((member) => projectIds.includes(member.projectId)),
      activityLogs,
    };
  }

  function getDashboardStats(user) {
    const db = getVisibleDatabaseSlice(user);
    const today = toInputDate(new Date());
    return {
      totalProjects: db.projects.length,
      activeTasks: db.tasks.filter((task) => task.status !== "done").length,
      completedTasks: db.tasks.filter((task) => task.status === "done").length,
      overdueTasks: db.tasks.filter((task) => task.status !== "done" && task.dueDate < today).length,
    };
  }

  function getTaskStatusBreakdown(arg1, arg2) {
    const { user, projectId } = resolveScope(arg1, arg2);
    const tasks = getScopedTasks(user, projectId);
    return {
      todo: tasks.filter((task) => task.status === "todo").length,
      inProgress: tasks.filter((task) => task.status === "in_progress").length,
      review: tasks.filter((task) => task.status === "review").length,
      done: tasks.filter((task) => task.status === "done").length,
    };
  }

  function getTeamWorkload(arg1, arg2) {
    const { user, projectId } = resolveScope(arg1, arg2);
    const db = readDb();
    const tasks = getScopedTasks(user, projectId);
    const workloads = {};
    tasks.forEach((task) => {
      (task.assignedTo || []).forEach((userId) => {
        if (!workloads[userId]) {
          workloads[userId] = {
            user: db.users.find((item) => item.id === userId),
            tasks: 0,
            openTasks: 0,
            estimatedHours: 0,
            actualHours: 0,
          };
        }
        workloads[userId].tasks += 1;
        workloads[userId].estimatedHours += Number(task.estimatedHours || 0);
        workloads[userId].actualHours += Number(task.actualHours || 0);
        if (task.status !== "done") {
          workloads[userId].openTasks += 1;
        }
      });
    });
    return Object.values(workloads);
  }

  function getTimeVariance(arg1, arg2) {
    const { user, projectId } = resolveScope(arg1, arg2);
    const tasks = getScopedTasks(user, projectId);
    const estimated = tasks.reduce((sum, task) => sum + Number(task.estimatedHours || 0), 0);
    const actual = tasks.reduce((sum, task) => sum + Number(task.actualHours || 0), 0);
    return {
      estimated,
      actual,
      difference: actual - estimated,
    };
  }

  function generateGanttData(arg1, arg2) {
    const { user, projectId } = resolveScope(arg1, arg2);
    const tasks = getScopedTasks(user, projectId)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    if (!tasks.length) {
      return {
        start: toInputDate(new Date()),
        days: [],
        tasks: [],
      };
    }

    const sortedDates = tasks
      .flatMap((task) => [task.startDate, task.dueDate])
      .filter(Boolean)
      .sort();
    const timelineStart = sortedDates[0];
    const timelineEnd = sortedDates[sortedDates.length - 1];
    const totalDays = Math.max(diffInDays(timelineStart, timelineEnd) + 1, 14);
    const days = Array.from({ length: totalDays }).map((_, index) => {
      return TaskFlow.utils.addDays(timelineStart, index);
    });

    return {
      start: timelineStart,
      days,
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        projectId: task.projectId,
        status: task.status,
        progress: task.progress,
        offset: Math.max(diffInDays(timelineStart, task.startDate), 0),
        length: Math.max(diffInDays(task.startDate, task.dueDate) + 1, 1),
      })),
    };
  }

  TaskFlow.managers = TaskFlow.managers || {};
  TaskFlow.managers.report = {
    getVisibleDatabaseSlice,
    getDashboardStats,
    getTaskStatusBreakdown,
    getTeamWorkload,
    getTimeVariance,
    generateGanttData,
  };
})();

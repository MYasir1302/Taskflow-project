(function () {
  const TaskFlow = (window.TaskFlow = window.TaskFlow || {});

  const PAGE_ACCESS = {
    admin: [
      "dashboard.html",
      "projects.html",
      "project-details.html",
      "board.html",
      "timeline.html",
      "activity.html",
      "notifications.html",
      "reports.html",
      "team.html",
      "settings.html",
    ],
    user: [
      "dashboard.html",
      "projects.html",
      "project-details.html",
      "board.html",
      "timeline.html",
      "activity.html",
      "notifications.html",
      "settings.html",
    ],
  };

  function getRole(user) {
    return user && user.role === "admin" ? "admin" : "user";
  }

  function canAccessPage(user, pageName) {
    const role = getRole(user);
    return (PAGE_ACCESS[role] || []).includes(pageName);
  }

  function canManageProjects(user) {
    return getRole(user) === "admin";
  }

  function canManageTeam(user) {
    return getRole(user) === "admin";
  }

  function canViewReports(user) {
    return getRole(user) === "admin";
  }

  function canAssignTask(user) {
    return getRole(user) === "admin";
  }

  function canDeleteTask(user) {
    return getRole(user) === "admin";
  }

  function isProjectMember(user, projectId) {
    if (!user || !projectId) return false;
    if (getRole(user) === "admin") return true;
    const storage = TaskFlow.storage;
    if (!storage || typeof storage.readDb !== "function") return false;
    const db = storage.readDb();
    return db.projectMembers.some((member) => {
      if (member.projectId !== projectId || member.userId !== user.id) return false;
      const memberUser = db.users.find((candidate) => candidate.id === member.userId);
      return Boolean(memberUser && memberUser.status === "active" && memberUser.role !== "admin");
    });
  }

  function canEditTask(user, task) {
    if (!user || !task) return false;
    if (getRole(user) === "admin") return true;
    return isProjectMember(user, task.projectId) && Array.isArray(task.assignedTo) && task.assignedTo.includes(user.id);
  }

  function canComment(user, task) {
    if (!user || !task) return false;
    if (getRole(user) === "admin") return true;
    return isProjectMember(user, task.projectId) && Array.isArray(task.assignedTo) && task.assignedTo.includes(user.id);
  }

  function navigationItems(user) {
    const items = [
      { key: "dashboard", label: "Dashboard", href: "dashboard.html" },
      { key: "team", label: "Team", href: "team.html" },
      { key: "projects", label: "Projects", href: "projects.html" },
      { key: "board", label: "Task Board", href: "board.html" },
      { key: "timeline", label: "Timeline", href: "timeline.html" },
      { key: "activity", label: "Activity", href: "activity.html" },
      { key: "notifications", label: "Notifications", href: "notifications.html" },
      { key: "reports", label: "Reports", href: "reports.html" },
      { key: "settings", label: "Settings", href: "settings.html" },
    ];
    return items.filter((item) => canAccessPage(user, item.href));
  }

  TaskFlow.permissions = {
    PAGE_ACCESS,
    canAccessPage,
    canManageProjects,
    canManageTeam,
    canViewReports,
    canAssignTask,
    canDeleteTask,
    isProjectMember,
    canEditTask,
    canComment,
    navigationItems,
  };
})();

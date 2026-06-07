(function () {
  const TaskFlow = (window.TaskFlow = window.TaskFlow || {});
  const { uid, nowIso, initials, asPromise } = TaskFlow.utils;
  const { readDb, updateDb } = TaskFlow.storage;

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function assertTeamManager(currentUser, message) {
    if (!TaskFlow.permissions.canManageTeam(currentUser)) {
      throw new Error(message || "You do not have permission to manage users.");
    }
  }

  function assertOwnAccount(userId, currentUser, message) {
    if (!currentUser || currentUser.id !== userId) {
      throw new Error(message || "You can only update your own account.");
    }
  }

  function ensureEmailAvailable(db, email, userId) {
    const normalizedEmail = normalizeEmail(email);
    const existing = db.users.find((user) => user.email === normalizedEmail && user.id !== userId);
    if (existing) {
      throw new Error("This email is already being used by another account.");
    }
    return normalizedEmail;
  }

  function getAllUsers() {
    return readDb().users;
  }

  function getUserById(userId) {
    return readDb().users.find((user) => user.id === userId) || null;
  }

  function getUsersByIds(ids) {
    return (ids || []).map(getUserById).filter(Boolean);
  }

  function getVisibleUsers(user) {
    if (user.role === "admin") return getAllUsers();
    return [user];
  }

  function createUser(data, currentUser) {
    return asPromise(function () {
      assertTeamManager(currentUser, "Only admins can create users.");
      const user = {
        id: uid("user"),
        name: data.name.trim(),
        email: normalizeEmail(data.email),
        password: data.password.trim(),
        role: data.role || "user",
        avatar: initials(data.name),
        status: "active",
        createdAt: nowIso(),
      };
      return updateDb(
        function (db) {
          user.email = ensureEmailAvailable(db, user.email, "");
          db.users.push(user);
          db.activityLogs.unshift({
            id: uid("activity"),
            type: "user_created",
            actorId: currentUser.id,
            message: `Created user ${user.name}`,
            createdAt: nowIso(),
          });
          return db;
        },
        { scope: ["users", "activityLogs"] }
      ).then(function () {
        return user;
      });
    });
  }

  function updateUser(userId, updates, currentUser) {
    return asPromise(function () {
      assertTeamManager(currentUser, "Only admins can update users.");
      return updateDb(
      function (db) {
        const user = db.users.find((item) => item.id === userId);
        if (!user) return db;
        if (updates.email !== undefined) {
          updates.email = ensureEmailAvailable(db, updates.email, user.id);
        }
        Object.assign(user, updates);
        if (updates.name !== undefined) {
          user.avatar = initials(user.name);
        }
        const shouldRemoveFromAssignments = user.role === "admin" || user.status !== "active";
        if (shouldRemoveFromAssignments) {
          db.projectMembers = db.projectMembers.filter((member) => member.userId !== user.id);
          db.tasks.forEach((task) => {
            task.assignedTo = (task.assignedTo || []).filter((assignedId) => assignedId !== user.id);
          });
        }
        db.activityLogs.unshift({
          id: uid("activity"),
          type: "user_updated",
          actorId: currentUser.id,
          message: `Updated user ${user.name}`,
          createdAt: nowIso(),
        });
        return db;
      },
      { scope: ["users", "projectMembers", "tasks", "activityLogs"], syncDeletes: true }
      );
    });
  }

  function updateOwnProfile(userId, updates, currentUser) {
    return asPromise(function () {
      assertOwnAccount(userId, currentUser, "You can only update your own profile.");
      return updateDb(
      function (db) {
        const user = db.users.find((item) => item.id === userId);
        if (!user) return db;
        if (updates.email !== undefined) {
          user.email = ensureEmailAvailable(db, updates.email, user.id);
        }
        if (updates.name !== undefined) {
          user.name = String(updates.name).trim();
          user.avatar = initials(user.name);
        }
        db.activityLogs.unshift({
          id: uid("activity"),
          type: "profile_updated",
          actorId: currentUser.id,
          message: `Updated profile for ${user.name}`,
          createdAt: nowIso(),
        });
        return db;
      },
      { scope: ["users", "activityLogs"] }
      );
    });
  }

  function updateOwnPassword(userId, currentPassword, nextPassword, currentUser) {
    return asPromise(function () {
      assertOwnAccount(userId, currentUser, "You can only update your own password.");
      return updateDb(
      function (db) {
        const user = db.users.find((item) => item.id === userId);
        if (!user) return db;
        if (user.password !== String(currentPassword || "").trim()) {
          throw new Error("Current password is incorrect.");
        }
        user.password = String(nextPassword || "").trim();
        db.activityLogs.unshift({
          id: uid("activity"),
          type: "password_updated",
          actorId: currentUser.id,
          message: `Updated password for ${user.name}`,
          createdAt: nowIso(),
        });
        return db;
      },
      { scope: ["users", "activityLogs"] }
      );
    });
  }

  function getUserProjectIds(userId) {
    return readDb()
      .projectMembers.filter((member) => member.userId === userId)
      .map((member) => member.projectId);
  }

  function getUserProjects(userId) {
    const projectIds = getUserProjectIds(userId);
    return readDb().projects.filter((project) => projectIds.includes(project.id));
  }

  function getUserTasks(userId) {
    return readDb().tasks.filter((task) => (task.assignedTo || []).includes(userId));
  }

  TaskFlow.managers = TaskFlow.managers || {};
  TaskFlow.managers.user = {
    getAllUsers,
    getUserById,
    getUsersByIds,
    getVisibleUsers,
    createUser,
    updateUser,
    updateOwnProfile,
    updateOwnPassword,
    getUserProjects,
    getUserTasks,
  };
})();

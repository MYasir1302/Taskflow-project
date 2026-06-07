(function () {
  const TaskFlow = (window.TaskFlow = window.TaskFlow || {});
  const { uid, nowIso, asPromise } = TaskFlow.utils;
  const { readDb, updateDb } = TaskFlow.storage;

  function parseMentions(content) {
    const matches = String(content || "").match(/@([a-zA-Z0-9._-]+)/g) || [];
    return matches.map((item) => item.replace("@", ""));
  }

  function getCommentsForTask(taskId) {
    return readDb().comments.filter((comment) => comment.taskId === taskId);
  }

  function addComment(taskId, content, authorId) {
    return asPromise(function () {
      const db = readDb();
      const user = db.users.find((item) => item.id === authorId);
      const task = db.tasks.find((item) => item.id === taskId);
      if (!user || !task) {
        throw new Error("The selected task could not be found.");
      }
      if (!TaskFlow.permissions.canComment(user, task)) {
        throw new Error("You do not have permission to comment on this task.");
      }
      const comment = {
        id: uid("comment"),
        taskId,
        authorId,
        content: content.trim(),
        mentions: parseMentions(content),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        replies: [],
      };
      return updateDb(
        function (db) {
          db.comments.unshift(comment);
          db.activityLogs.unshift({
            id: uid("activity"),
            type: "comment_added",
            actorId: authorId,
            projectId: task.projectId,
            taskId: task.id,
            message: `Added a comment on ${task.title}`,
            createdAt: nowIso(),
          });
          return db;
        },
        { scope: ["comments", "activityLogs"] }
      ).then(function () {
        return comment;
      });
    });
  }

  function addReply(commentId, content, authorId) {
    return asPromise(function () {
      const db = readDb();
      const user = db.users.find((item) => item.id === authorId);
      const commentRecord = db.comments.find((item) => item.id === commentId);
      const task = commentRecord ? db.tasks.find((item) => item.id === commentRecord.taskId) : null;
      if (!user || !commentRecord || !task) {
        throw new Error("The selected comment could not be found.");
      }
      if (!TaskFlow.permissions.canComment(user, task)) {
        throw new Error("You do not have permission to reply on this task.");
      }
      return updateDb(
        function (db) {
          const comment = db.comments.find((item) => item.id === commentId);
          if (!comment) return db;
          comment.replies.push({
            id: uid("reply"),
            authorId,
            content: content.trim(),
            createdAt: nowIso(),
          });
          comment.updatedAt = nowIso();
          db.activityLogs.unshift({
            id: uid("activity"),
            type: "comment_replied",
            actorId: authorId,
            projectId: task.projectId,
            taskId: task.id,
            message: `Replied to a comment on ${task.title}`,
            createdAt: nowIso(),
          });
          return db;
        },
        { scope: ["comments", "activityLogs"] }
      );
    });
  }

  TaskFlow.managers = TaskFlow.managers || {};
  TaskFlow.managers.comment = {
    parseMentions,
    getCommentsForTask,
    addComment,
    addReply,
  };
})();

<?php
require_once __DIR__ . '/config.php';

function json_response($payload, $statusCode = 200)
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

function read_json_body()
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function require_login()
{
    if (empty($_SESSION['user_id'])) {
        json_response(['success' => false, 'message' => 'Not logged in.'], 401);
    }
    return $_SESSION['user_id'];
}

function get_session_user($conn)
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    $userId = mysqli_real_escape_string($conn, $_SESSION['user_id']);
    $result = mysqli_query($conn, "SELECT * FROM users WHERE id = '$userId' AND status = 'active' LIMIT 1");
    if (!$result || !mysqli_num_rows($result)) {
        return null;
    }
    return mysqli_fetch_assoc($result);
}

function map_user_row($row)
{
  return [
    'id' => $row['id'],
    'name' => $row['name'],
    'email' => $row['email'],
    'password' => $row['password'],
    'role' => $row['role'],
    'avatar' => $row['avatar'],
    'status' => $row['status'],
    'createdAt' => date('c', strtotime($row['created_at'])),
  ];
}

function decode_json_field($value, $fallback = [])
{
    if (!$value) {
        return $fallback;
    }
    $decoded = json_decode($value, true);
    return is_array($decoded) ? $decoded : $fallback;
}

function encode_json_field($value)
{
    return json_encode($value ?: []);
}

function get_visible_project_ids($conn, $user)
{
    if ($user['role'] === 'admin') {
        $ids = [];
        $result = mysqli_query($conn, 'SELECT id FROM projects');
        while ($row = mysqli_fetch_assoc($result)) {
            $ids[] = $row['id'];
        }
        return $ids;
    }

    $userId = mysqli_real_escape_string($conn, $user['id']);
    $ids = [];
    $result = mysqli_query(
        $conn,
        "SELECT project_id FROM project_members WHERE user_id = '$userId'"
    );
    while ($row = mysqli_fetch_assoc($result)) {
        $ids[] = $row['project_id'];
    }
    return $ids;
}

function load_database($conn, $user)
{
    $projectIds = get_visible_project_ids($conn, $user);
    $projectFilter = '';
    if ($user['role'] !== 'admin') {
        if (!count($projectIds)) {
            $projectFilter = " WHERE 1 = 0";
        } else {
            $escaped = array_map(function ($id) use ($conn) {
                return "'" . mysqli_real_escape_string($conn, $id) . "'";
            }, $projectIds);
            $projectFilter = ' WHERE id IN (' . implode(',', $escaped) . ')';
        }
    }

    $users = [];
    if ($user['role'] === 'admin') {
        $result = mysqli_query($conn, 'SELECT * FROM users ORDER BY created_at ASC');
    } else {
        $userId = mysqli_real_escape_string($conn, $user['id']);
        $result = mysqli_query(
            $conn,
            "SELECT DISTINCT u.* FROM users u
             WHERE u.id = '$userId'
             OR u.id IN (
               SELECT pm2.user_id
               FROM project_members pm1
               INNER JOIN project_members pm2 ON pm1.project_id = pm2.project_id
               WHERE pm1.user_id = '$userId'
             )
             ORDER BY u.created_at ASC"
        );
    }
    while ($row = mysqli_fetch_assoc($result)) {
        $users[] = map_user_row($row);
    }

    $projects = [];
    $result = mysqli_query($conn, "SELECT * FROM projects$projectFilter ORDER BY updated_at DESC");
    while ($row = mysqli_fetch_assoc($result)) {
        $projects[] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'status' => $row['status'],
            'priority' => $row['priority'],
            'ownerId' => $row['owner_id'],
            'startDate' => $row['start_date'],
            'endDate' => $row['end_date'],
            'progress' => (int) $row['progress'],
            'budget' => (float) $row['budget'],
            'tags' => decode_json_field($row['tags'], []),
            'createdAt' => date('c', strtotime($row['created_at'])),
            'updatedAt' => date('c', strtotime($row['updated_at'])),
        ];
    }

    $projectMembers = [];
    $memberFilter = $user['role'] === 'admin'
        ? ''
        : (count($projectIds)
            ? " WHERE project_id IN ('" . implode("','", array_map(function ($id) use ($conn) {
                return mysqli_real_escape_string($conn, $id);
            }, $projectIds)) . "')"
            : ' WHERE 1 = 0');
    $result = mysqli_query($conn, "SELECT * FROM project_members$memberFilter");
    while ($row = mysqli_fetch_assoc($result)) {
        $projectMembers[] = [
            'id' => $row['id'],
            'projectId' => $row['project_id'],
            'userId' => $row['user_id'],
            'projectRole' => $row['project_role'],
            'permissions' => decode_json_field($row['permissions'], []),
            'joinedAt' => date('c', strtotime($row['joined_at'])),
        ];
    }

    $tasks = [];
    $taskFilter = $user['role'] === 'admin'
        ? ''
        : (count($projectIds)
            ? " WHERE project_id IN ('" . implode("','", array_map(function ($id) use ($conn) {
                return mysqli_real_escape_string($conn, $id);
            }, $projectIds)) . "')"
            : ' WHERE 1 = 0');
    $result = mysqli_query($conn, "SELECT * FROM tasks$taskFilter ORDER BY updated_at DESC");
    $taskIds = [];
    while ($row = mysqli_fetch_assoc($result)) {
        $taskIds[] = $row['id'];
        $tasks[$row['id']] = [
            'id' => $row['id'],
            'projectId' => $row['project_id'],
            'title' => $row['title'],
            'description' => $row['description'],
            'status' => $row['status'],
            'priority' => $row['priority'],
            'assignedTo' => [],
            'createdBy' => $row['created_by'],
            'startDate' => $row['start_date'],
            'dueDate' => $row['due_date'],
            'estimatedHours' => (int) $row['estimated_hours'],
            'actualHours' => (int) $row['actual_hours'],
            'progress' => (int) $row['progress'],
            'subtasks' => decode_json_field($row['subtasks'], []),
            'createdAt' => date('c', strtotime($row['created_at'])),
            'updatedAt' => date('c', strtotime($row['updated_at'])),
        ];
    }

    if (count($taskIds)) {
        $escapedTaskIds = implode(',', array_map(function ($id) use ($conn) {
            return "'" . mysqli_real_escape_string($conn, $id) . "'";
        }, $taskIds));
        $assigneeResult = mysqli_query(
            $conn,
            "SELECT task_id, user_id FROM task_assignees WHERE task_id IN ($escapedTaskIds)"
        );
        while ($row = mysqli_fetch_assoc($assigneeResult)) {
            if (isset($tasks[$row['task_id']])) {
                $tasks[$row['task_id']]['assignedTo'][] = $row['user_id'];
            }
        }
    }
    $tasks = array_values($tasks);

    $comments = [];
    $commentFilter = count($taskIds)
        ? " WHERE task_id IN ('" . implode("','", array_map(function ($id) use ($conn) {
            return mysqli_real_escape_string($conn, $id);
        }, $taskIds)) . "')"
        : ' WHERE 1 = 0';
    $result = mysqli_query($conn, "SELECT * FROM comments$commentFilter ORDER BY created_at DESC");
    $commentIds = [];
    while ($row = mysqli_fetch_assoc($result)) {
        $commentIds[] = $row['id'];
        $comments[$row['id']] = [
            'id' => $row['id'],
            'taskId' => $row['task_id'],
            'authorId' => $row['author_id'],
            'content' => $row['content'],
            'mentions' => decode_json_field($row['mentions'], []),
            'createdAt' => date('c', strtotime($row['created_at'])),
            'updatedAt' => date('c', strtotime($row['updated_at'])),
            'replies' => [],
        ];
    }

    if (count($commentIds)) {
        $escapedCommentIds = implode(',', array_map(function ($id) use ($conn) {
            return "'" . mysqli_real_escape_string($conn, $id) . "'";
        }, $commentIds));
        $replyResult = mysqli_query(
            $conn,
            "SELECT * FROM comment_replies WHERE comment_id IN ($escapedCommentIds) ORDER BY created_at ASC"
        );
        while ($row = mysqli_fetch_assoc($replyResult)) {
            if (isset($comments[$row['comment_id']])) {
                $comments[$row['comment_id']]['replies'][] = [
                    'id' => $row['id'],
                    'authorId' => $row['author_id'],
                    'content' => $row['content'],
                    'createdAt' => date('c', strtotime($row['created_at'])),
                ];
            }
        }
    }
    $comments = array_values($comments);

    $activityLogs = [];
    $activityFilter = $user['role'] === 'admin'
        ? ''
        : " WHERE actor_id = '" . mysqli_real_escape_string($conn, $user['id']) . "' OR project_id IN (" . (count($projectIds)
            ? "'" . implode("','", array_map(function ($id) use ($conn) {
                return mysqli_real_escape_string($conn, $id);
            }, $projectIds)) . "'"
            : "''") . ')';
    $result = mysqli_query($conn, "SELECT * FROM activity_logs$activityFilter ORDER BY created_at DESC LIMIT 200");
    while ($row = mysqli_fetch_assoc($result)) {
        $activityLogs[] = [
            'id' => $row['id'],
            'type' => $row['type'],
            'actorId' => $row['actor_id'],
            'projectId' => $row['project_id'],
            'taskId' => $row['task_id'],
            'message' => $row['message'],
            'createdAt' => date('c', strtotime($row['created_at'])),
        ];
    }

    return [
        'meta' => [
            'version' => '1.0.0',
            'seeded' => true,
            'lastUpdated' => date('c'),
        ],
        'users' => $users,
        'projects' => $projects,
        'tasks' => $tasks,
        'comments' => $comments,
        'projectMembers' => $projectMembers,
        'activityLogs' => $activityLogs,
    ];
}

function upsert_user($conn, $user)
{
    $id = mysqli_real_escape_string($conn, $user['id']);
    $name = mysqli_real_escape_string($conn, $user['name']);
    $email = mysqli_real_escape_string($conn, $user['email']);
    $password = mysqli_real_escape_string($conn, $user['password']);
    $role = mysqli_real_escape_string($conn, $user['role']);
    $avatar = mysqli_real_escape_string($conn, $user['avatar']);
    $status = mysqli_real_escape_string($conn, $user['status']);
    $createdAt = mysqli_real_escape_string($conn, date('Y-m-d H:i:s', strtotime($user['createdAt'] ?? 'now')));

    mysqli_query(
        $conn,
        "INSERT INTO users (id, name, email, password, role, avatar, status, created_at)
         VALUES ('$id', '$name', '$email', '$password', '$role', '$avatar', '$status', '$createdAt')
         ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         email = VALUES(email),
         password = VALUES(password),
         role = VALUES(role),
         avatar = VALUES(avatar),
         status = VALUES(status)"
    );
}

function upsert_project($conn, $project)
{
    $id = mysqli_real_escape_string($conn, $project['id']);
    $name = mysqli_real_escape_string($conn, $project['name']);
    $description = mysqli_real_escape_string($conn, $project['description'] ?? '');
    $status = mysqli_real_escape_string($conn, $project['status'] ?? 'planning');
    $priority = mysqli_real_escape_string($conn, $project['priority'] ?? 'medium');
    $ownerId = mysqli_real_escape_string($conn, $project['ownerId'] ?? '');
    $startDate = mysqli_real_escape_string($conn, $project['startDate'] ?? '');
    $endDate = mysqli_real_escape_string($conn, $project['endDate'] ?? '');
    $progress = (int) ($project['progress'] ?? 0);
    $budget = (float) ($project['budget'] ?? 0);
    $tags = mysqli_real_escape_string($conn, encode_json_field($project['tags'] ?? []));
    $createdAt = mysqli_real_escape_string($conn, date('Y-m-d H:i:s', strtotime($project['createdAt'] ?? 'now')));
    $updatedAt = mysqli_real_escape_string($conn, date('Y-m-d H:i:s', strtotime($project['updatedAt'] ?? 'now')));

    mysqli_query(
        $conn,
        "INSERT INTO projects (id, name, description, status, priority, owner_id, start_date, end_date, progress, budget, tags, created_at, updated_at)
         VALUES ('$id', '$name', '$description', '$status', '$priority', '$ownerId', '$startDate', '$endDate', $progress, $budget, '$tags', '$createdAt', '$updatedAt')
         ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         description = VALUES(description),
         status = VALUES(status),
         priority = VALUES(priority),
         owner_id = VALUES(owner_id),
         start_date = VALUES(start_date),
         end_date = VALUES(end_date),
         progress = VALUES(progress),
         budget = VALUES(budget),
         tags = VALUES(tags),
         updated_at = VALUES(updated_at)"
    );
}

function upsert_project_member($conn, $member)
{
    $id = mysqli_real_escape_string($conn, $member['id']);
    $projectId = mysqli_real_escape_string($conn, $member['projectId']);
    $userId = mysqli_real_escape_string($conn, $member['userId']);
    $projectRole = mysqli_real_escape_string($conn, $member['projectRole'] ?? 'member');
    $permissions = mysqli_real_escape_string($conn, encode_json_field($member['permissions'] ?? []));
    $joinedAt = mysqli_real_escape_string($conn, date('Y-m-d H:i:s', strtotime($member['joinedAt'] ?? 'now')));

    mysqli_query(
        $conn,
        "INSERT INTO project_members (id, project_id, user_id, project_role, permissions, joined_at)
         VALUES ('$id', '$projectId', '$userId', '$projectRole', '$permissions', '$joinedAt')
         ON DUPLICATE KEY UPDATE
         project_id = VALUES(project_id),
         user_id = VALUES(user_id),
         project_role = VALUES(project_role),
         permissions = VALUES(permissions)"
    );
}

function upsert_task($conn, $task)
{
    $id = mysqli_real_escape_string($conn, $task['id']);
    $projectId = mysqli_real_escape_string($conn, $task['projectId']);
    $title = mysqli_real_escape_string($conn, $task['title']);
    $description = mysqli_real_escape_string($conn, $task['description'] ?? '');
    $status = mysqli_real_escape_string($conn, $task['status'] ?? 'todo');
    $priority = mysqli_real_escape_string($conn, $task['priority'] ?? 'medium');
    $startDate = mysqli_real_escape_string($conn, $task['startDate'] ?? '');
    $dueDate = mysqli_real_escape_string($conn, $task['dueDate'] ?? '');
    $estimatedHours = (int) ($task['estimatedHours'] ?? 0);
    $actualHours = (int) ($task['actualHours'] ?? 0);
    $progress = (int) ($task['progress'] ?? 0);
    $createdBy = mysqli_real_escape_string($conn, $task['createdBy'] ?? '');
    $subtasks = mysqli_real_escape_string($conn, encode_json_field($task['subtasks'] ?? []));
    $createdAt = mysqli_real_escape_string($conn, date('Y-m-d H:i:s', strtotime($task['createdAt'] ?? 'now')));
    $updatedAt = mysqli_real_escape_string($conn, date('Y-m-d H:i:s', strtotime($task['updatedAt'] ?? 'now')));

    mysqli_query(
        $conn,
        "INSERT INTO tasks (id, project_id, title, description, status, priority, start_date, due_date, estimated_hours, actual_hours, progress, created_by, subtasks, created_at, updated_at)
         VALUES ('$id', '$projectId', '$title', '$description', '$status', '$priority', '$startDate', '$dueDate', $estimatedHours, $actualHours, $progress, '$createdBy', '$subtasks', '$createdAt', '$updatedAt')
         ON DUPLICATE KEY UPDATE
         project_id = VALUES(project_id),
         title = VALUES(title),
         description = VALUES(description),
         status = VALUES(status),
         priority = VALUES(priority),
         start_date = VALUES(start_date),
         due_date = VALUES(due_date),
         estimated_hours = VALUES(estimated_hours),
         actual_hours = VALUES(actual_hours),
         progress = VALUES(progress),
         created_by = VALUES(created_by),
         subtasks = VALUES(subtasks),
         updated_at = VALUES(updated_at)"
    );

    mysqli_query($conn, "DELETE FROM task_assignees WHERE task_id = '$id'");
    foreach (($task['assignedTo'] ?? []) as $userId) {
        $escapedUserId = mysqli_real_escape_string($conn, $userId);
        mysqli_query(
            $conn,
            "INSERT IGNORE INTO task_assignees (task_id, user_id) VALUES ('$id', '$escapedUserId')"
        );
    }
}

function upsert_comment($conn, $comment)
{
    $id = mysqli_real_escape_string($conn, $comment['id']);
    $taskId = mysqli_real_escape_string($conn, $comment['taskId']);
    $authorId = mysqli_real_escape_string($conn, $comment['authorId']);
    $content = mysqli_real_escape_string($conn, $comment['content'] ?? '');
    $mentions = mysqli_real_escape_string($conn, encode_json_field($comment['mentions'] ?? []));
    $createdAt = mysqli_real_escape_string($conn, date('Y-m-d H:i:s', strtotime($comment['createdAt'] ?? 'now')));
    $updatedAt = mysqli_real_escape_string($conn, date('Y-m-d H:i:s', strtotime($comment['updatedAt'] ?? 'now')));

    mysqli_query(
        $conn,
        "INSERT INTO comments (id, task_id, author_id, content, mentions, created_at, updated_at)
         VALUES ('$id', '$taskId', '$authorId', '$content', '$mentions', '$createdAt', '$updatedAt')
         ON DUPLICATE KEY UPDATE
         task_id = VALUES(task_id),
         author_id = VALUES(author_id),
         content = VALUES(content),
         mentions = VALUES(mentions),
         updated_at = VALUES(updated_at)"
    );

    mysqli_query($conn, "DELETE FROM comment_replies WHERE comment_id = '$id'");
    foreach (($comment['replies'] ?? []) as $reply) {
        $replyId = mysqli_real_escape_string($conn, $reply['id']);
        $replyAuthor = mysqli_real_escape_string($conn, $reply['authorId']);
        $replyContent = mysqli_real_escape_string($conn, $reply['content'] ?? '');
        $replyCreatedAt = mysqli_real_escape_string($conn, date('Y-m-d H:i:s', strtotime($reply['createdAt'] ?? 'now')));
        mysqli_query(
            $conn,
            "INSERT INTO comment_replies (id, comment_id, author_id, content, created_at)
             VALUES ('$replyId', '$id', '$replyAuthor', '$replyContent', '$replyCreatedAt')
             ON DUPLICATE KEY UPDATE
             author_id = VALUES(author_id),
             content = VALUES(content)"
        );
    }
}

function upsert_activity($conn, $log)
{
    $id = mysqli_real_escape_string($conn, $log['id']);
    $type = mysqli_real_escape_string($conn, $log['type']);
    $actorId = mysqli_real_escape_string($conn, $log['actorId'] ?? '');
    $projectId = mysqli_real_escape_string($conn, $log['projectId'] ?? '');
    $taskId = mysqli_real_escape_string($conn, $log['taskId'] ?? '');
    $message = mysqli_real_escape_string($conn, $log['message'] ?? '');
    $createdAt = mysqli_real_escape_string($conn, date('Y-m-d H:i:s', strtotime($log['createdAt'] ?? 'now')));

    mysqli_query(
        $conn,
        "INSERT INTO activity_logs (id, type, actor_id, project_id, task_id, message, created_at)
         VALUES ('$id', '$type', '$actorId', '$projectId', '$taskId', '$message', '$createdAt')
         ON DUPLICATE KEY UPDATE
         type = VALUES(type),
         actor_id = VALUES(actor_id),
         project_id = VALUES(project_id),
         task_id = VALUES(task_id),
         message = VALUES(message)"
    );
}

function delete_missing_ids($conn, $table, $column, $ids, $extraWhere = '')
{
    if (!count($ids)) {
        mysqli_query($conn, "DELETE FROM $table $extraWhere");
        return;
    }
    $escaped = implode(',', array_map(function ($id) use ($conn) {
        return "'" . mysqli_real_escape_string($conn, $id) . "'";
    }, $ids));
    $where = "$column NOT IN ($escaped)";
    if ($extraWhere) {
        $where = "$extraWhere AND $where";
    } else {
        $where = "WHERE $where";
    }
    mysqli_query($conn, "DELETE FROM $table $where");
}

function save_database_admin_scoped($conn, $db, array $scopes, $withDeletes = false)
{
    $allowed = array_flip($scopes);

    if (isset($allowed['users'])) {
        foreach (($db['users'] ?? []) as $user) {
            upsert_user($conn, $user);
        }
        if ($withDeletes) {
            delete_missing_ids($conn, 'users', 'id', array_column($db['users'] ?? [], 'id'));
        }
    }

    if (isset($allowed['projects'])) {
        foreach (($db['projects'] ?? []) as $project) {
            upsert_project($conn, $project);
        }
        if ($withDeletes) {
            delete_missing_ids($conn, 'projects', 'id', array_column($db['projects'] ?? [], 'id'));
        }
    }

    if (isset($allowed['projectMembers'])) {
        foreach (($db['projectMembers'] ?? []) as $member) {
            upsert_project_member($conn, $member);
        }
        if ($withDeletes) {
            delete_missing_ids($conn, 'project_members', 'id', array_column($db['projectMembers'] ?? [], 'id'));
        }
    }

    if (isset($allowed['tasks'])) {
        foreach (($db['tasks'] ?? []) as $task) {
            upsert_task($conn, $task);
        }
        if ($withDeletes) {
            delete_missing_ids($conn, 'tasks', 'id', array_column($db['tasks'] ?? [], 'id'));
        }
    }

    if (isset($allowed['comments'])) {
        foreach (($db['comments'] ?? []) as $comment) {
            upsert_comment($conn, $comment);
        }
        if ($withDeletes) {
            delete_missing_ids($conn, 'comments', 'id', array_column($db['comments'] ?? [], 'id'));
        }
    }

    if (isset($allowed['activityLogs'])) {
        foreach (($db['activityLogs'] ?? []) as $log) {
            upsert_activity($conn, $log);
        }
        if ($withDeletes) {
            delete_missing_ids($conn, 'activity_logs', 'id', array_column($db['activityLogs'] ?? [], 'id'));
        }
    }
}

function save_database_admin($conn, $db)
{
    foreach (($db['users'] ?? []) as $user) {
        upsert_user($conn, $user);
    }
    delete_missing_ids($conn, 'users', 'id', array_column($db['users'] ?? [], 'id'));

    foreach (($db['projects'] ?? []) as $project) {
        upsert_project($conn, $project);
    }
    delete_missing_ids($conn, 'projects', 'id', array_column($db['projects'] ?? [], 'id'));

    foreach (($db['projectMembers'] ?? []) as $member) {
        upsert_project_member($conn, $member);
    }
    delete_missing_ids($conn, 'project_members', 'id', array_column($db['projectMembers'] ?? [], 'id'));

    foreach (($db['tasks'] ?? []) as $task) {
        upsert_task($conn, $task);
    }
    delete_missing_ids($conn, 'tasks', 'id', array_column($db['tasks'] ?? [], 'id'));

    foreach (($db['comments'] ?? []) as $comment) {
        upsert_comment($conn, $comment);
    }
    delete_missing_ids($conn, 'comments', 'id', array_column($db['comments'] ?? [], 'id'));

    foreach (($db['activityLogs'] ?? []) as $log) {
        upsert_activity($conn, $log);
    }
    delete_missing_ids($conn, 'activity_logs', 'id', array_column($db['activityLogs'] ?? [], 'id'));
}

function save_database_user($conn, $db, $user)
{
  foreach (($db['tasks'] ?? []) as $task) {
    upsert_task($conn, $task);
  }

  foreach (($db['comments'] ?? []) as $comment) {
    upsert_comment($conn, $comment);
  }

  foreach (($db['activityLogs'] ?? []) as $log) {
    upsert_activity($conn, $log);
  }

  $userRow = null;
  foreach (($db['users'] ?? []) as $item) {
    if ($item['id'] === $user['id']) {
      $userRow = $item;
      break;
    }
  }
  if ($userRow) {
    upsert_user($conn, $userRow);
  }
}

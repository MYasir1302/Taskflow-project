<?php
require_once __DIR__ . '/helpers.php';

$userRow = get_session_user($conn);
if (!$userRow) {
    json_response(['success' => false, 'message' => 'Not logged in.'], 401);
}

$body = read_json_body();
$db = $body['db'] ?? null;
$scope = $body['scope'] ?? null;

if (!$db || !is_array($db)) {
    json_response(['success' => false, 'message' => 'Invalid database payload.']);
}

mysqli_begin_transaction($conn);

try {
    if ($userRow['role'] === 'admin') {
        if (is_array($scope) && count($scope)) {
            $withDeletes = !empty($body['syncDeletes']);
            save_database_admin_scoped($conn, $db, $scope, $withDeletes);
        } else {
            save_database_admin($conn, $db);
        }
    } else {
        save_database_user($conn, $db, $userRow);
    }
    mysqli_commit($conn);
} catch (Throwable $error) {
    mysqli_rollback($conn);
    json_response(['success' => false, 'message' => 'Unable to save changes to the database.']);
}

json_response(['success' => true, 'data' => $db]);

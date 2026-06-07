<?php
require_once __DIR__ . '/helpers.php';

$userRow = get_session_user($conn);
if (!$userRow) {
    json_response(['success' => false, 'message' => 'Not logged in.'], 401);
}

$db = load_database($conn, $userRow);
json_response(['success' => true, 'data' => $db]);

<?php
require_once __DIR__ . '/../helpers.php';

$user = get_session_user($conn);
if (!$user) {
    json_response(['success' => false, 'user' => null]);
}

json_response([
    'success' => true,
    'user' => map_user_row($user),
    'loginAt' => $_SESSION['login_at'] ?? null,
]);

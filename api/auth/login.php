<?php
require_once __DIR__ . '/../helpers.php';

$body = read_json_body();
$identifier = strtolower(trim($body['identifier'] ?? ($_POST['identifier'] ?? '')));
$password = trim($body['password'] ?? ($_POST['password'] ?? ''));

if ($identifier === '' || $password === '') {
    json_response(['success' => false, 'message' => 'Email and password are required.']);
}

$identifierEscaped = mysqli_real_escape_string($conn, $identifier);
$passwordEscaped = mysqli_real_escape_string($conn, $password);

$result = mysqli_query(
    $conn,
    "SELECT * FROM users
     WHERE status = 'active'
     AND (LOWER(email) = '$identifierEscaped' OR LOWER(name) = '$identifierEscaped')
     AND password = '$passwordEscaped'
     LIMIT 1"
);

if (!$result || !mysqli_num_rows($result)) {
    json_response(['success' => false, 'message' => 'Invalid email or password.']);
}

$user = map_user_row(mysqli_fetch_assoc($result));
$_SESSION['user_id'] = $user['id'];
$_SESSION['login_at'] = date('c');

json_response([
    'success' => true,
    'user' => $user,
]);

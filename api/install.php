<?php
require_once __DIR__ . '/helpers.php';

$result = mysqli_query($conn, "SELECT COUNT(*) AS total FROM users");
$row = mysqli_fetch_assoc($result);
$hasUsers = (int) ($row['total'] ?? 0) > 0;

if (!$hasUsers) {
    mysqli_query(
        $conn,
        "INSERT INTO users (id, name, email, password, role, avatar, status, created_at)
         VALUES ('user_admin', 'Admin', 'admin@gmail.com', 'admin123', 'admin', 'A', 'active', NOW())"
    );
}

json_response([
    'success' => true,
    'seeded' => true,
    'hasUsers' => true,
]);

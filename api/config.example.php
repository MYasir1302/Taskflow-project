<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

// Copy this file to config.php and fill in your database credentials
$DB_HOST = 'localhost';
$DB_USER = 'your_db_user';
$DB_PASS = 'your_db_password';
$DB_NAME = 'taskflow';

$conn = mysqli_connect($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);

if (!$conn) {
    echo json_encode([
        'success' => false,
        'message' => 'Database connection failed. Start MySQL and import database/taskflow.sql',
    ]);
    exit;
}

mysqli_set_charset($conn, 'utf8mb4');

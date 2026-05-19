<?php
// === KONFIGURASI KEAMANAN DASAR (RESTRIKSI AKSES) ===
$allowed_origins_env = getenv('CORS_ALLOWED_ORIGINS') ?: '';
$allowed_origins = $allowed_origins_env ? explode(',', $allowed_origins_env) : [
    // === DOMAIN PRODUKSI NETLIFY ===
    'https://ekatalog2.netlify.app',

    // === DOMAIN RAILWAY ===
    'https://e-katalog-production.railway.app',

    // === DOMAIN DEVELOPMENT (Lokal) ===
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
    'http://localhost:8000'
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

// Jika tidak ada origin (misal ditembak langsung via CURL/Postman tanpa origin header)
// atau Origin terdaftar di whitelist, kita izinkan.
if ($origin === '' || in_array($origin, $allowed_origins)) {
    if ($origin !== '') {
        header("Access-Control-Allow-Origin: $origin");
    }
} else {
    // Jika Origin dari website antah berantah, TOLAK langsung di level CORS
    http_response_code(403);
    echo json_encode(['error' => 'CORS Policy: Akses dari domain ini ditolak.']);
    exit();
}

header('Content-Type: application/json');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Api-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Token Rahasia API
define('API_SECRET_KEY', getenv('API_SECRET_KEY') ?: 'ekatalog-secure-token-123');
$apiKey = $_SERVER['HTTP_X_API_KEY'] ?? $_GET['api_key'] ?? $_POST['api_key'] ?? '';

if ($apiKey !== API_SECRET_KEY) {
    http_response_code(401);
    echo json_encode(['error' => 'Akses ditolak: API Key tidak valid.']);
    exit();
}
// ===================================================

function createConnection() {
    $dbHost = getenv('DB_HOST') ?: 'localhost';
    $dbName = getenv('DB_NAME') ?: 'e_katalog';
    $dbUser = getenv('DB_USER') ?: 'root';
    $dbPass = getenv('DB_PASS') ?: '';
    $dbCharset = getenv('DB_CHARSET') ?: 'utf8mb4';

    $dsn = "mysql:host=$dbHost;dbname=$dbName;charset=$dbCharset";

    try {
        $db = new PDO($dsn, $dbUser, $dbPass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        return $db;
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Connection failed: ' . $e->getMessage()]);
        exit();
    }
}

function handleFileUpload($fieldName) {
    require_once __DIR__ . '/file_upload_railway.php';
    return handleFileUploadRailway($fieldName);
}

// Legacy function for backward compatibility
function handleFileUploadLocal($fieldName) {
    if (!isset($_FILES[$fieldName]) || $_FILES[$fieldName]['error'] !== UPLOAD_ERR_OK) {
        return null;
    }

    $allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    $fileType = mime_content_type($_FILES[$fieldName]['tmp_name']);
    if (!in_array($fileType, $allowedTypes)) {
        return null;
    }

    $uploadDir = __DIR__ . '/uploads';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $extension = pathinfo($_FILES[$fieldName]['name'], PATHINFO_EXTENSION);
    $filename = uniqid('img_', true) . '.' . $extension;
    $destination = $uploadDir . '/' . $filename;

    if (move_uploaded_file($_FILES[$fieldName]['tmp_name'], $destination)) {
        return $filename;
    }

    return null;
}

function fetchKategori($db) {
    try {
        $stmt = $db->query("SELECT * FROM tb_kategori ORDER BY id_kategori ASC");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        return ['error' => $e->getMessage()];
    }
}

function fetchProduk($db) {
    require_once __DIR__ . '/image_url_resolver.php';
    
    try {
        $stmt = $db->query("SELECT p.id_produk, p.nama_produk, p.harga, p.stok, p.deskripsi, p.gambar, k.id_kategori AS kategori_id, k.jenis_kategori FROM tb_produk p LEFT JOIN tb_produk_kategori pk ON p.id_produk = pk.id_produk LEFT JOIN tb_kategori k ON pk.id_kategori = k.id_categoria ORDER BY p.id_produk DESC");
        $produkList = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Format image URLs for all products
        return array_map('formatProdukWithImageUrl', $produkList);
    } catch (Exception $e) {
        return ['error' => $e->getMessage()];
    }
}

function fetchProdukById($db, $id) {
    require_once __DIR__ . '/image_url_resolver.php';
    
    try {
        $sql = "SELECT p.id_produk, p.nama_produk, p.harga, p.stok, p.deskripsi, p.gambar, k.id_kategori AS kategori_id, k.jenis_kategori FROM tb_produk p LEFT JOIN tb_produk_kategori pk ON p.id_produk = pk.id_produk LEFT JOIN tb_kategori k ON pk.id_kategori = k.id_kategori WHERE p.id_produk = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute([$id]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$result) {
            return ['error' => 'Produk tidak ditemukan'];
        }
        // Format image URL
        return formatProdukWithImageUrl($result);
    } catch (Exception $e) {
        return ['error' => $e->getMessage()];
    }
}

function validateProdukData($db, $data) {
    $errors = [];

    if (empty($data['nama_produk'])) {
        $errors[] = 'Nama produk harus diisi';
    }

    if (!isset($data['harga']) || $data['harga'] === '') {
        $errors[] = 'Harga harus diisi';
    } elseif (!is_numeric($data['harga'])) {
        $errors[] = 'Harga harus berupa angka';
    } elseif (floatval($data['harga']) < 0) {
        $errors[] = 'Harga tidak boleh bernilai negatif';
    }

    if (!isset($data['stok']) || $data['stok'] === '') {
        $errors[] = 'Stok harus diisi';
    } elseif (!is_numeric($data['stok']) || intval($data['stok']) != $data['stok']) {
        $errors[] = 'Stok harus berupa bilangan bulat';
    } elseif (intval($data['stok']) < 0) {
        $errors[] = 'Stok tidak boleh bernilai negatif';
    }

    if (!isset($data['kategori_id']) || $data['kategori_id'] === '') {
        $errors[] = 'Kategori harus dipilih';
    } elseif (!ctype_digit(strval($data['kategori_id']))) {
        $errors[] = 'Kategori tidak valid';
    } else {
        $stmtCheck = $db->prepare("SELECT COUNT(*) FROM tb_kategori WHERE id_kategori = ?");
        $stmtCheck->execute([intval($data['kategori_id'])]);
        if ($stmtCheck->fetchColumn() == 0) {
            $errors[] = 'Kategori tidak ditemukan';
        }
    }

    return $errors;
}

function addProduk($db, $data) {
    $errors = validateProdukData($db, $data);
    if (!empty($errors)) {
        http_response_code(400);
        return ['error' => implode('. ', $errors)];
    }

    try {
        $db->beginTransaction();

        $gambar = handleFileUpload('gambar');
        $stmt = $db->prepare("INSERT INTO tb_produk (nama_produk, harga, stok, deskripsi, gambar) VALUES (?, ?, ?, ?, ?)");
        $deskripsi = $data['deskripsi'] ?? '';
        $stmt->execute([
            trim($data['nama_produk']),
            floatval($data['harga']),
            intval($data['stok']),
            $deskripsi,
            $gambar
        ]);

        $produkId = $db->lastInsertId();
        $kategoriId = intval($data['kategori_id']);

        $stmtRelation = $db->prepare("INSERT INTO tb_produk_kategori (id_produk, id_kategori) VALUES (?, ?)");
        $stmtRelation->execute([$produkId, $kategoriId]);

        $db->commit();
        return ['success' => true, 'message' => 'Produk berhasil ditambahkan', 'id' => $produkId];
    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(500);
        return ['error' => 'Error: ' . $e->getMessage()];
    }
}

function updateProduk($db, $id, $data) {
    $errors = validateProdukData($db, $data);
    if (!empty($errors)) {
        http_response_code(400);
        return ['error' => implode('. ', $errors)];
    }

    try {
        $db->beginTransaction();

        $currentStmt = $db->prepare("SELECT gambar FROM tb_produk WHERE id_produk = ?");
        $currentStmt->execute([$id]);
        $currentRow = $currentStmt->fetch(PDO::FETCH_ASSOC);
        if (!$currentRow) {
            throw new Exception('Produk tidak ditemukan');
        }
        $currentImage = $currentRow['gambar'] ?? null;

        $uploadedImage = handleFileUpload('gambar');
        $gambar = $uploadedImage ?: $currentImage;

        // Debug logging
        error_log("Update Produk ID: $id | Current Image: " . ($currentImage ?? 'NULL') . " | Uploaded: " . ($uploadedImage ?? 'NULL') . " | Final: " . ($gambar ?? 'NULL'));

        $stmt = $db->prepare("UPDATE tb_produk SET nama_produk = ?, harga = ?, stok = ?, deskripsi = ?, gambar = ? WHERE id_produk = ?");
        $deskripsi = $data['deskripsi'] ?? '';
        $stmt->execute([
            trim($data['nama_produk']),
            floatval($data['harga']),
            intval($data['stok']),
            $deskripsi,
            $gambar,
            $id
        ]);

        if ($uploadedImage && $currentImage) {
            $oldFile = __DIR__ . '/uploads/' . $currentImage;
            if (file_exists($oldFile)) {
                @unlink($oldFile);
            }
        }

        $kategoriId = intval($data['kategori_id']);
        $stmtDelete = $db->prepare("DELETE FROM tb_produk_kategori WHERE id_produk = ?");
        $stmtDelete->execute([$id]);

        $stmtRelation = $db->prepare("INSERT INTO tb_produk_kategori (id_produk, id_kategori) VALUES (?, ?)");
        $stmtRelation->execute([$id, $kategoriId]);

        $db->commit();
        return ['success' => true, 'message' => 'Produk berhasil diupdate'];
    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(500);
        return ['error' => 'Error: ' . $e->getMessage()];
    }
}

function deleteProduk($db, $id) {
    try {
        $currentStmt = $db->prepare("SELECT gambar FROM tb_produk WHERE id_produk = ?");
        $currentStmt->execute([$id]);
        $currentRow = $currentStmt->fetch(PDO::FETCH_ASSOC);
        $currentImage = $currentRow['gambar'] ?? null;

        $stmtRelation = $db->prepare("DELETE FROM tb_produk_kategori WHERE id_produk = ?");
        $stmtRelation->execute([$id]);

        $stmt = $db->prepare("DELETE FROM tb_produk WHERE id_produk = ?");
        $stmt->execute([$id]);

        if ($currentImage) {
            $oldFile = __DIR__ . '/uploads/' . $currentImage;
            if (file_exists($oldFile)) {
                @unlink($oldFile);
            }
        }

        return ['success' => true, 'message' => 'Produk berhasil dihapus'];
    } catch (Exception $e) {
        http_response_code(500);
        return ['error' => 'Error: ' . $e->getMessage()];
    }
}

$db = createConnection();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method === 'GET') {
    switch ($action) {
        case 'fetchKategori':
            echo json_encode(fetchKategori($db));
            break;
        case 'fetchProduk':
            echo json_encode(fetchProduk($db));
            break;
        case 'fetchProdukById':
            $id = $_GET['id'] ?? null;
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'Missing product ID']);
                break;
            }
            echo json_encode(fetchProdukById($db, $id));
            break;
        case 'getImage':
            $tempId = $_GET['tempId'] ?? null;
            if ($tempId) {
                require_once __DIR__ . '/file_upload_railway.php';
                serveTempImage($tempId);
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'Missing tempId']);
            }
            break;
        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid action']);
            break;
    }
} else if ($method === 'POST') {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (strpos($contentType, 'multipart/form-data') !== false) {
        $input = $_POST;
    } else {
        $input = json_decode(file_get_contents('php://input'), true);
    }

    if ($action === 'addProduk') {
        echo json_encode(addProduk($db, $input));
    } else if ($action === 'updateProduk') {
        $id = $_GET['id'] ?? $input['id'] ?? $_POST['id'] ?? null;
        if ($id) {
            echo json_encode(updateProduk($db, $id, $input));
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'Missing product ID for update']);
        }
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action for POST']);
    }
} else if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $_GET['id'] ?? $input['id'] ?? null;
    if ($action === 'updateProduk' && $id) {
        echo json_encode(updateProduk($db, $id, $input));
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action for PUT or missing ID']);
    }
} else if ($method === 'DELETE') {
    $id = $_GET['id'] ?? null;
    if ($action === 'deleteProduk' && $id) {
        echo json_encode(deleteProduk($db, $id));
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action for DELETE or missing ID']);
    }
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}

<?php
/**
 * EasyLink FService Control Panel - Multi-Machine
 * Usage: php -S localhost:9090 index.php
 */

// --- DB Config ---------------------------------------------------------------
$DB_HOST = getenv('DB_HOST') ?: 'localhost';
$DB_PORT = getenv('DB_PORT') ?: '3306';
$DB_USER = getenv('DB_USER') ?: 'root';
$DB_PASS = getenv('DB_PASS') ?: '';
$DB_NAME = getenv('DB_NAME') ?: 'demo_easylinksdk';
$TIMEOUT = 120;

function get_pdo(): PDO {
    global $DB_HOST, $DB_PORT, $DB_USER, $DB_PASS, $DB_NAME;
    static $pdo = null;
    if ($pdo) return $pdo;
    $pdo = new PDO(
        "mysql:host={$DB_HOST};port={$DB_PORT};dbname={$DB_NAME};charset=utf8mb4",
        $DB_USER, $DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    return $pdo;
}

// --- Machine config from DB --------------------------------------------------
function get_machines(bool $activeOnly = true): array {
    $pdo = get_pdo();
    $sql = "SELECT * FROM tb_device_config" . ($activeOnly ? " WHERE is_active=1" : "") . " ORDER BY label";
    return $pdo->query($sql)->fetchAll();
}

function get_machine(int $id): ?array {
    $pdo = get_pdo();
    $stmt = $pdo->prepare("SELECT * FROM tb_device_config WHERE id=?");
    $stmt->execute([$id]);
    return $stmt->fetch() ?: null;
}

function get_machine_by_sn(string $sn): ?array {
    $pdo = get_pdo();
    $stmt = $pdo->prepare("SELECT * FROM tb_device_config WHERE sn=?");
    $stmt->execute([$sn]);
    return $stmt->fetch() ?: null;
}

// --- Bridge helper -----------------------------------------------------------
function bridge_post(array $machine, string $path, array $fields = []): array {
    global $TIMEOUT;
    $baseUrl = "http://{$machine['bridge_host']}:{$machine['bridge_port']}";
    $fields['sn'] = $machine['sn'];
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $baseUrl . $path,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($fields),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $TIMEOUT,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($resp === false) return ['ok' => false, 'error' => $err, 'http' => $code];
    $json = json_decode($resp, true);
    if (!is_array($json)) return ['ok' => false, 'error' => 'Non-JSON response', 'raw' => substr($resp,0,500), 'http' => $code];
    return ['ok' => true, 'data' => $json, 'http' => $code];
}

// --- Sync functions ----------------------------------------------------------
function sync_users_to_db(array $machine): array {
    $isSession = true; $total = 0; $errors = [];
    try {
        $pdo = get_pdo();
        $stmt = $pdo->prepare("INSERT INTO tb_user (pin,nama,pwd,rfid,privilege) VALUES (:pin,:nama,:pwd,:rfid,:priv) ON DUPLICATE KEY UPDATE nama=VALUES(nama),pwd=VALUES(pwd),rfid=VALUES(rfid),privilege=VALUES(privilege)");
        while ($isSession) {
            $r = bridge_post($machine, '/user/all/paging', ['limit' => 100]);
            if (!$r['ok'] || empty($r['data']['Result'])) { $errors[] = $r['error'] ?? 'Result false'; break; }
            foreach (($r['data']['Data'] ?? []) as $row) {
                $stmt->execute([':pin'=>$row['PIN']??'',':nama'=>$row['Name']??'',':pwd'=>$row['Password']??'',':rfid'=>$row['RFID']??'0',':priv'=>(int)($row['Privilege']??0)]);
                $total++;
            }
            $isSession = !empty($r['data']['IsSession']);
        }
        $pdo->prepare("UPDATE tb_device_config SET last_sync_users=?, last_sync_at=NOW() WHERE id=?")->execute([$total, $machine['id']]);
    } catch (\Exception $e) { $errors[] = $e->getMessage(); }
    return ['ok' => empty($errors), 'synced' => $total, 'errors' => $errors];
}

function sync_scanlogs_to_db(array $machine, bool $full = false): array {
    $endpoint = $full ? '/scanlog/all/paging' : '/scanlog/new';
    $isSession = true; $total = 0; $errors = [];
    try {
        $pdo = get_pdo();
        $stmt = $pdo->prepare("INSERT IGNORE INTO tb_scanlog (sn,scan_date,pin,verifymode,iomode,workcode) VALUES (:sn,:sd,:pin,:vm,:io,:wc)");
        while ($isSession) {
            $r = bridge_post($machine, $endpoint, ['limit' => 100]);
            if (!$r['ok'] || empty($r['data']['Result'])) { $errors[] = $r['error'] ?? 'Result false'; break; }
            foreach (($r['data']['Data'] ?? []) as $row) {
                $stmt->execute([':sn'=>$row['SN']??$machine['sn'],':sd'=>$row['ScanDate']??'',':pin'=>$row['PIN']??'',':vm'=>(int)($row['VerifyMode']??0),':io'=>(int)($row['IOMode']??0),':wc'=>$row['WorkCode']??'0']);
                $total++;
            }
            $isSession = !empty($r['data']['IsSession']);
        }
        $pdo->prepare("UPDATE tb_device_config SET last_sync_scanlogs=?, last_sync_at=NOW() WHERE id=?")->execute([$total, $machine['id']]);
    } catch (\Exception $e) { $errors[] = $e->getMessage(); }
    return ['ok' => empty($errors), 'synced' => $total, 'errors' => $errors];
}

function get_db_stats(): array {
    try {
        $pdo = get_pdo();
        $users = $pdo->query("SELECT COUNT(*) FROM tb_user")->fetchColumn();
        $scanlogs = $pdo->query("SELECT COUNT(*) FROM tb_scanlog")->fetchColumn();
        $latest = $pdo->query("SELECT MAX(scan_date) FROM tb_scanlog")->fetchColumn();
        return ['ok'=>true,'users'=>(int)$users,'scanlogs'=>(int)$scanlogs,'latest_scan'=>$latest];
    } catch (\Exception $e) { return ['ok'=>false,'error'=>$e->getMessage()]; }
}

// --- Machine Config CRUD -----------------------------------------------------
function save_machine(array $data): array {
    $pdo = get_pdo();
    $required = ['label','sn','bridge_host','bridge_port'];
    foreach ($required as $f) { if (empty($data[$f])) return ['ok'=>false,'error'=>"Missing field: $f"]; }
    try {
        if (!empty($data['id'])) {
            $stmt = $pdo->prepare("UPDATE tb_device_config SET label=?,sn=?,bridge_host=?,bridge_port=?,device_ip=?,device_port=?,model=?,is_active=?,updated_at=NOW() WHERE id=?");
            $stmt->execute([$data['label'],$data['sn'],$data['bridge_host'],(int)$data['bridge_port'],$data['device_ip']??null,$data['device_port']??null,$data['model']??null,(int)($data['is_active']??1),$data['id']]);
            return ['ok'=>true,'id'=>(int)$data['id'],'action'=>'updated'];
        } else {
            $stmt = $pdo->prepare("INSERT INTO tb_device_config (label,sn,bridge_host,bridge_port,device_ip,device_port,model,is_active) VALUES (?,?,?,?,?,?,?,?)");
            $stmt->execute([$data['label'],$data['sn'],$data['bridge_host'],(int)$data['bridge_port'],$data['device_ip']??null,$data['device_port']??null,$data['model']??null,(int)($data['is_active']??1)]);
            return ['ok'=>true,'id'=>(int)$pdo->lastInsertId(),'action'=>'created'];
        }
    } catch (\Exception $e) { return ['ok'=>false,'error'=>$e->getMessage()]; }
}

function delete_machine(int $id): array {
    try {
        $pdo = get_pdo();
        $pdo->prepare("DELETE FROM tb_device_config WHERE id=?")->execute([$id]);
        return ['ok'=>true];
    } catch (\Exception $e) { return ['ok'=>false,'error'=>$e->getMessage()]; }
}

// --- API Router --------------------------------------------------------------
if (isset($_GET['action'])) {
    header('Content-Type: application/json; charset=utf-8');
    $action = $_GET['action'];
    $machineId = intval($_GET['machine'] ?? 0);
    $machine = $machineId ? get_machine($machineId) : null;
    $result = [];

    // Actions that need a machine
    $needsMachine = ['dev_info','dev_settime','dev_init','dev_deladmin','scanlog_new','scanlog_all','scanlog_del','user_all','user_set','user_del','user_delall','log_del','sync_users','sync_scanlogs'];

    if (in_array($action, $needsMachine) && !$machine) {
        // Fallback: use first active machine
        $machines = get_machines();
        $machine = $machines[0] ?? null;
        if (!$machine) { echo json_encode(['ok'=>false,'error'=>'No active machine configured']); exit; }
    }

    switch ($action) {
        case 'dev_info':
            $result = bridge_post($machine, '/dev/info');
            break;
        case 'dev_settime':
            $result = bridge_post($machine, '/dev/settime');
            break;
        case 'dev_init':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $result = bridge_post($machine, '/dev/init');
            break;
        case 'dev_deladmin':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $result = bridge_post($machine, '/dev/deladmin');
            break;
        case 'scanlog_new':
            $result = bridge_post($machine, '/scanlog/new');
            break;
        case 'scanlog_all':
            $limit = intval($_GET['limit'] ?? 100);
            $result = bridge_post($machine, '/scanlog/all/paging', ['limit' => $limit]);
            break;
        case 'scanlog_del':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $result = bridge_post($machine, '/scanlog/del');
            break;
        case 'user_all':
            $limit = intval($_GET['limit'] ?? 100);
            $result = bridge_post($machine, '/user/all/paging', ['limit' => $limit]);
            break;
        case 'user_set':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $body = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $result = bridge_post($machine, '/user/set', ['pin'=>$body['pin']??'','nama'=>$body['nama']??'','pwd'=>$body['pwd']??'','rfid'=>$body['rfid']??'0','priv'=>$body['priv']??'0','tmp'=>$body['tmp']??'']);
            break;
        case 'user_del':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $body = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $result = bridge_post($machine, '/user/del', ['pin' => $body['pin'] ?? '']);
            break;
        case 'user_delall':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $result = bridge_post($machine, '/user/delall');
            break;
        case 'log_del':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $result = bridge_post($machine, '/log/del');
            break;
        case 'sync_users':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $result = sync_users_to_db($machine);
            break;
        case 'sync_scanlogs':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $full = !empty($_GET['full']);
            $result = sync_scanlogs_to_db($machine, $full);
            break;
        case 'db_stats':
            $result = get_db_stats();
            break;
        case 'machines_list':
            $result = ['ok'=>true,'machines'=>get_machines(false)];
            break;
        case 'machine_save':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $body = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $result = save_machine($body);
            break;
        case 'machine_delete':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $body = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $result = delete_machine(intval($body['id'] ?? 0));
            break;
        case 'machine_test':
            if (!$machine) { $result = ['ok'=>false,'error'=>'Machine not found']; break; }
            $result = bridge_post($machine, '/dev/info');
            break;
        default:
            $result = ['ok' => false, 'error' => 'Unknown action'];
    }
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// --- HTML Landing Page -------------------------------------------------------
$machines = get_machines(false);
$defaultMachine = get_machines(true)[0] ?? null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EasyLink Control Panel</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:1.5rem}
h1{font-size:1.5rem;margin-bottom:.25rem;color:#38bdf8}
.subtitle{color:#64748b;font-size:.85rem;margin-bottom:1rem}
.machine-select{margin-bottom:1.25rem;display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
.machine-select select{background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:.5rem;padding:.5rem .75rem;font-size:.85rem}
.machine-select .badge{font-size:.7rem;padding:.25rem .5rem;border-radius:.25rem;background:#166534;color:#bbf7d0}
.machine-select .badge.off{background:#7f1d1d;color:#fecaca}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:1.25rem}
.card{background:#1e293b;border:1px solid #334155;border-radius:.75rem;padding:1.25rem}
.card h2{font-size:1rem;margin-bottom:.75rem;color:#f1f5f9;display:flex;align-items:center;gap:.5rem}
.card h2 .dot{width:8px;height:8px;border-radius:50%;background:#22c55e}
.card h2 .dot.danger{background:#ef4444}
.card h2 .dot.config{background:#f59e0b}
.btn{display:inline-flex;align-items:center;gap:.4rem;padding:.5rem 1rem;border:none;border-radius:.5rem;font-size:.8rem;font-weight:600;cursor:pointer;transition:all .15s}
.btn-primary{background:#0ea5e9;color:#fff}.btn-primary:hover{background:#0284c7}
.btn-success{background:#22c55e;color:#fff}.btn-success:hover{background:#16a34a}
.btn-warning{background:#f59e0b;color:#000}.btn-warning:hover{background:#d97706}
.btn-danger{background:#ef4444;color:#fff}.btn-danger:hover{background:#dc2626}
.btn-ghost{background:transparent;color:#94a3b8;border:1px solid #475569}.btn-ghost:hover{background:#334155}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-sm{padding:.35rem .65rem;font-size:.72rem}
.actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.75rem}
.result{margin-top:.75rem;background:#0f172a;border:1px solid #334155;border-radius:.5rem;padding:.75rem;font-family:'Fira Code',monospace;font-size:.72rem;max-height:280px;overflow:auto;white-space:pre-wrap;word-break:break-all;display:none}
.result.show{display:block}
.danger-zone{border-color:#7f1d1d}
.danger-zone h2{color:#fca5a5}
.stats{display:flex;gap:1.5rem;margin:.75rem 0;flex-wrap:wrap}
.stat{text-align:center}.stat .val{font-size:1.4rem;font-weight:700;color:#38bdf8}.stat .lbl{font-size:.68rem;color:#64748b;text-transform:uppercase}
.form-row{display:flex;gap:.5rem;margin-bottom:.5rem;flex-wrap:wrap}
.form-row label{font-size:.75rem;color:#94a3b8;min-width:80px;padding-top:.4rem}
.form-row input,.form-row select{flex:1;min-width:120px;padding:.4rem .6rem;border-radius:.375rem;border:1px solid #475569;background:#0f172a;color:#e2e8f0;font-size:.8rem}
.form-row input[type=checkbox]{flex:none;width:auto}
.machine-list{margin-top:.75rem}
.machine-item{display:flex;align-items:center;justify-content:space-between;padding:.5rem .75rem;border:1px solid #334155;border-radius:.5rem;margin-bottom:.4rem;font-size:.8rem}
.machine-item .info{display:flex;flex-direction:column;gap:.15rem}
.machine-item .name{font-weight:600;color:#f1f5f9}
.machine-item .meta{font-size:.7rem;color:#64748b}
.machine-item .btns{display:flex;gap:.35rem}
.confirm-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:100;align-items:center;justify-content:center}
.confirm-overlay.show{display:flex}
.confirm-box{background:#1e293b;border:1px solid #7f1d1d;border-radius:.75rem;padding:1.5rem;max-width:420px;width:90%}
.confirm-box h3{color:#fca5a5;margin-bottom:.75rem}
.confirm-box p{color:#94a3b8;font-size:.85rem;margin-bottom:1rem}
.confirm-box input{width:100%;padding:.5rem;border-radius:.375rem;border:1px solid #475569;background:#0f172a;color:#e2e8f0;margin-bottom:1rem;font-size:.85rem}
.confirm-box .btns{display:flex;gap:.5rem;justify-content:flex-end}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:90;align-items:center;justify-content:center}
.modal-overlay.show{display:flex}
.modal-box{background:#1e293b;border:1px solid #334155;border-radius:.75rem;padding:1.5rem;max-width:500px;width:90%}
.modal-box h3{color:#38bdf8;margin-bottom:1rem}
.toast{position:fixed;top:1rem;right:1rem;padding:.75rem 1.25rem;border-radius:.5rem;font-size:.85rem;font-weight:600;z-index:200;animation:fadeIn .2s}
.toast-ok{background:#166534;color:#bbf7d0;border:1px solid #22c55e}
.toast-err{background:#7f1d1d;color:#fecaca;border:1px solid #ef4444}
@keyframes fadeIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
</style>
</head>
<body>
<h1>EasyLink Control Panel</h1>
<p class="subtitle">Multi-Machine Management | Database: <?= htmlspecialchars($DB_NAME) ?></p>

<!-- Machine Selector -->
<div class="machine-select">
  <label style="font-size:.8rem;color:#94a3b8">Active Machine:</label>
  <select id="machineSelect" onchange="switchMachine()">
    <?php foreach ($machines as $m): ?>
    <option value="<?= $m['id'] ?>" <?= ($defaultMachine && $m['id']==$defaultMachine['id'])?'selected':'' ?>>
      <?= htmlspecialchars($m['label']) ?> (<?= htmlspecialchars($m['sn']) ?>)
    </option>
    <?php endforeach; ?>
    <?php if (empty($machines)): ?><option value="">No machines configured</option><?php endif; ?>
  </select>
  <?php if ($defaultMachine): ?>
  <span class="badge"><?= $defaultMachine['bridge_host'] ?>:<?= $defaultMachine['bridge_port'] ?></span>
  <?php endif; ?>
  <button class="btn btn-ghost btn-sm" onclick="openMachineConfig()">Manage Machines</button>
</div>

<div class="grid">

<!-- Device Info -->
<div class="card">
  <h2><span class="dot"></span> Device Info</h2>
  <div class="stats" id="devStats">
    <div class="stat"><div class="val" id="statUsers">-</div><div class="lbl">Users</div></div>
    <div class="stat"><div class="val" id="statFP">-</div><div class="lbl">Fingerprints</div></div>
    <div class="stat"><div class="val" id="statScans">-</div><div class="lbl">All Scans</div></div>
    <div class="stat"><div class="val" id="statNew">-</div><div class="lbl">New Scans</div></div>
  </div>
  <p style="font-size:.75rem;color:#64748b" id="devTime">Device Time: -</p>
  <div class="actions">
    <button class="btn btn-primary" onclick="doAction('dev_info')">Refresh Info</button>
    <button class="btn btn-success" onclick="doAction('dev_settime')">Sync Time</button>
  </div>
  <div class="result" id="res_dev_info"></div>
</div>

<!-- Database Sync -->
<div class="card">
  <h2><span class="dot"></span> Database Sync</h2>
  <div class="stats" id="dbStats">
    <div class="stat"><div class="val" id="dbUsers">-</div><div class="lbl">DB Users</div></div>
    <div class="stat"><div class="val" id="dbScanlogs">-</div><div class="lbl">DB Scanlogs</div></div>
  </div>
  <p style="font-size:.75rem;color:#64748b" id="dbLatest">Latest: -</p>
  <div class="actions">
    <button class="btn btn-primary" onclick="doAction('db_stats')">Refresh Stats</button>
    <button class="btn btn-success" onclick="doPost('sync_users')">Sync Users</button>
    <button class="btn btn-success" onclick="doPost('sync_scanlogs')">Sync New Scanlogs</button>
    <button class="btn btn-warning" onclick="doPost('sync_scanlogs','full=1')">Sync ALL Scanlogs</button>
  </div>
  <div class="result" id="res_sync"></div>
</div>

<!-- Users -->
<div class="card">
  <h2><span class="dot"></span> Machine Users</h2>
  <div class="actions">
    <button class="btn btn-primary" onclick="doAction('user_all','limit=100')">Get All Users</button>
  </div>
  <div class="result" id="res_user_all"></div>
</div>

<!-- Scanlogs -->
<div class="card">
  <h2><span class="dot"></span> Scan Logs</h2>
  <div class="actions">
    <button class="btn btn-primary" onclick="doAction('scanlog_new')">Get New Scanlogs</button>
    <button class="btn btn-warning" onclick="doAction('scanlog_all','limit=50')">Get All (50)</button>
  </div>
  <div class="result" id="res_scanlog"></div>
</div>

<!-- Machine Config -->
<div class="card">
  <h2><span class="dot config"></span> Machine Config</h2>
  <div class="machine-list" id="machineList">Loading...</div>
  <div class="actions">
    <button class="btn btn-success" onclick="openMachineForm()">+ Add Machine</button>
  </div>
</div>

<!-- Danger Zone -->
<div class="card danger-zone">
  <h2><span class="dot danger"></span> Danger Zone</h2>
  <p style="font-size:.75rem;color:#fca5a5;margin-bottom:.75rem">Destructive actions. Cannot be undone.</p>
  <div class="actions">
    <button class="btn btn-danger" onclick="confirmDanger('dev_init','INITIALIZE MACHINE','Factory-reset the device. All data on machine will be lost.')">Init Machine</button>
    <button class="btn btn-danger" onclick="confirmDanger('dev_deladmin','DELETE ADMIN','Remove admin privileges from device.')">Delete Admin</button>
    <button class="btn btn-danger" onclick="confirmDanger('user_delall','DELETE ALL USERS','Remove ALL users from the machine.')">Delete All Users</button>
    <button class="btn btn-danger" onclick="confirmDanger('scanlog_del','DELETE ALL SCANLOGS','Remove ALL scan logs from the machine.')">Delete Scanlogs</button>
    <button class="btn btn-danger" onclick="confirmDanger('log_del','DELETE DEVICE LOG','Remove device operation log.')">Delete Device Log</button>
  </div>
  <div class="result" id="res_danger"></div>
</div>

</div>

<!-- Confirm Modal -->
<div class="confirm-overlay" id="confirmOverlay">
  <div class="confirm-box">
    <h3 id="confirmTitle">Confirm</h3>
    <p id="confirmMsg">Are you sure?</p>
    <p style="font-size:.75rem;color:#fca5a5">Type <strong id="confirmPhrase">CONFIRM</strong> to proceed:</p>
    <input type="text" id="confirmInput" autocomplete="off">
    <div class="btns">
      <button class="btn btn-primary" onclick="closeConfirm()">Cancel</button>
      <button class="btn btn-danger" id="confirmBtn" onclick="execDanger()" disabled>Execute</button>
    </div>
  </div>
</div>

<!-- Machine Form Modal -->
<div class="modal-overlay" id="machineModal">
  <div class="modal-box">
    <h3 id="machineFormTitle">Add Machine</h3>
    <input type="hidden" id="mf_id">
    <div class="form-row"><label>Label</label><input id="mf_label" placeholder="e.g. Lobby Machine"></div>
    <div class="form-row"><label>Serial (SN)</label><input id="mf_sn" placeholder="e.g. Fio66208021230737"></div>
    <div class="form-row"><label>Bridge Host</label><input id="mf_bridge_host" value="localhost"></div>
    <div class="form-row"><label>Bridge Port</label><input id="mf_bridge_port" type="number" value="8090"></div>
    <div class="form-row"><label>Device IP</label><input id="mf_device_ip" placeholder="e.g. 192.168.1.200"></div>
    <div class="form-row"><label>Device Port</label><input id="mf_device_port" type="number" placeholder="e.g. 5005"></div>
    <div class="form-row"><label>Model</label><input id="mf_model" placeholder="e.g. Revo WFV-208BNC"></div>
    <div class="form-row"><label>Active</label><input id="mf_active" type="checkbox" checked></div>
    <div class="actions" style="justify-content:flex-end;margin-top:1rem">
      <button class="btn btn-ghost" onclick="closeMachineForm()">Cancel</button>
      <button class="btn btn-success" onclick="saveMachine()">Save</button>
    </div>
  </div>
</div>

<script>
let currentMachine = <?= json_encode($defaultMachine['id'] ?? 0) ?>;
let pendingDanger = null;

function mid() { return currentMachine; }
function mq() { return 'machine=' + mid(); }

function toast(msg, ok) {
  const t = document.createElement('div');
  t.className = 'toast ' + (ok ? 'toast-ok' : 'toast-err');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function switchMachine() {
  currentMachine = document.getElementById('machineSelect').value;
  doAction('dev_info');
}

async function doAction(action, extra) {
  const url = '?action=' + action + '&' + mq() + (extra ? '&' + extra : '');
  try {
    const r = await fetch(url);
    const j = await r.json();
    handleResult(action, j);
  } catch(e) { toast('Request failed: ' + e.message, false); }
}

async function doPost(action, extra) {
  const url = '?action=' + action + '&' + mq() + (extra ? '&' + extra : '');
  try {
    const r = await fetch(url, {method:'POST'});
    const j = await r.json();
    handleResult(action, j);
  } catch(e) { toast('Request failed: ' + e.message, false); }
}

async function doPostJson(action, body) {
  const url = '?action=' + action + '&' + mq();
  try {
    const r = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return await r.json();
  } catch(e) { toast('Request failed: ' + e.message, false); return {ok:false}; }
}

function handleResult(action, j) {
  if (action === 'dev_info' && j.ok && j.data && j.data.DEVINFO) {
    const d = j.data.DEVINFO;
    document.getElementById('statUsers').textContent = d.User || '-';
    document.getElementById('statFP').textContent = d.FP || '-';
    document.getElementById('statScans').textContent = d['All Presensi'] || '-';
    document.getElementById('statNew').textContent = d['New Presensi'] || '-';
    document.getElementById('devTime').textContent = 'Device Time: ' + (d.Jam || '-');
    showResult('res_dev_info', j);
    toast('Device info loaded', true);
  } else if (action === 'dev_settime') {
    showResult('res_dev_info', j);
    toast(j.ok && j.data && j.data.Result ? 'Time synced' : 'Time sync failed', j.ok && j.data && j.data.Result);
  } else if (action === 'db_stats' && j.ok) {
    document.getElementById('dbUsers').textContent = j.users ?? '-';
    document.getElementById('dbScanlogs').textContent = j.scanlogs ?? '-';
    document.getElementById('dbLatest').textContent = 'Latest: ' + (j.latest_scan || '-');
    toast('DB stats loaded', true);
  } else if (action.startsWith('sync_')) {
    showResult('res_sync', j);
    toast(j.ok ? 'Synced ' + (j.synced||0) + ' rows' : 'Sync error: ' + (j.errors||[]).join(', '), j.ok);
    doAction('db_stats');
  } else if (action.startsWith('user_') && action !== 'user_delall') {
    showResult('res_user_all', j);
    const count = j.ok && j.data && j.data.Data ? j.data.Data.length : 0;
    toast('Users: ' + count + ' rows', j.ok);
  } else if (action.startsWith('scanlog_') && action !== 'scanlog_del') {
    showResult('res_scanlog', j);
    const count = j.ok && j.data && j.data.Data ? j.data.Data.length : 0;
    toast('Scanlogs: ' + count + ' rows', j.ok);
  } else if (['dev_init','dev_deladmin','user_delall','scanlog_del','log_del'].includes(action)) {
    showResult('res_danger', j);
    toast(j.ok && j.data && j.data.Result ? 'Done' : 'Failed or no response', j.ok && j.data && j.data.Result);
  } else {
    toast(j.ok ? 'OK' : (j.error || 'Error'), j.ok);
  }
}

function showResult(id, data) {
  const el = document.getElementById(id);
  el.textContent = JSON.stringify(data, null, 2);
  el.classList.add('show');
}

// --- Danger confirm ---
function confirmDanger(action, title, msg) {
  pendingDanger = action;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  const phrase = action.toUpperCase().replace(/_/g,' ');
  document.getElementById('confirmPhrase').textContent = phrase;
  document.getElementById('confirmInput').value = '';
  document.getElementById('confirmBtn').disabled = true;
  document.getElementById('confirmOverlay').classList.add('show');
  document.getElementById('confirmInput').focus();
  document.getElementById('confirmInput').oninput = function() {
    document.getElementById('confirmBtn').disabled = this.value !== phrase;
  };
}
function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('show'); pendingDanger = null; }
async function execDanger() { if (!pendingDanger) return; const a = pendingDanger; closeConfirm(); await doPost(a); }

// --- Machine Config ---
async function loadMachines() {
  const r = await fetch('?action=machines_list');
  const j = await r.json();
  if (!j.ok) return;
  const list = document.getElementById('machineList');
  if (!j.machines.length) { list.innerHTML = '<p style="font-size:.8rem;color:#64748b">No machines configured.</p>'; return; }
  list.innerHTML = j.machines.map(m => `
    <div class="machine-item">
      <div class="info">
        <span class="name">${esc(m.label)} <span class="badge ${m.is_active?'':'off'}">${m.is_active?'Active':'Inactive'}</span></span>
        <span class="meta">SN: ${esc(m.sn)} | Bridge: ${esc(m.bridge_host)}:${m.bridge_port} | Last sync: ${m.last_sync_at||'never'}</span>
      </div>
      <div class="btns">
        <button class="btn btn-primary btn-sm" onclick="testMachine(${m.id})">Test</button>
        <button class="btn btn-ghost btn-sm" onclick="editMachine(${m.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMachine(${m.id},'${esc(m.label)}')">Del</button>
      </div>
    </div>
  `).join('');
  // Also update selector
  const sel = document.getElementById('machineSelect');
  sel.innerHTML = j.machines.filter(m=>m.is_active).map(m => `<option value="${m.id}" ${m.id==currentMachine?'selected':''}>${esc(m.label)} (${esc(m.sn)})</option>`).join('');
}

function esc(s) { const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }

function openMachineConfig() { loadMachines(); }
function openMachineForm(data) {
  document.getElementById('machineFormTitle').textContent = data ? 'Edit Machine' : 'Add Machine';
  document.getElementById('mf_id').value = data?.id || '';
  document.getElementById('mf_label').value = data?.label || '';
  document.getElementById('mf_sn').value = data?.sn || '';
  document.getElementById('mf_bridge_host').value = data?.bridge_host || 'localhost';
  document.getElementById('mf_bridge_port').value = data?.bridge_port || 8090;
  document.getElementById('mf_device_ip').value = data?.device_ip || '';
  document.getElementById('mf_device_port').value = data?.device_port || '';
  document.getElementById('mf_model').value = data?.model || '';
  document.getElementById('mf_active').checked = data ? !!data.is_active : true;
  document.getElementById('machineModal').classList.add('show');
}
function closeMachineForm() { document.getElementById('machineModal').classList.remove('show'); }

async function saveMachine() {
  const body = {
    id: document.getElementById('mf_id').value || undefined,
    label: document.getElementById('mf_label').value,
    sn: document.getElementById('mf_sn').value,
    bridge_host: document.getElementById('mf_bridge_host').value,
    bridge_port: document.getElementById('mf_bridge_port').value,
    device_ip: document.getElementById('mf_device_ip').value || null,
    device_port: document.getElementById('mf_device_port').value || null,
    model: document.getElementById('mf_model').value || null,
    is_active: document.getElementById('mf_active').checked ? 1 : 0,
  };
  const j = await doPostJson('machine_save', body);
  if (j.ok) { toast('Machine saved', true); closeMachineForm(); loadMachines(); }
  else { toast('Error: ' + (j.error||'unknown'), false); }
}

async function editMachine(id) {
  const r = await fetch('?action=machines_list');
  const j = await r.json();
  const m = (j.machines||[]).find(x=>x.id==id);
  if (m) openMachineForm(m);
}

async function testMachine(id) {
  const r = await fetch('?action=machine_test&machine='+id);
  const j = await r.json();
  if (j.ok && j.data && j.data.Result) toast('Machine OK - ' + (j.data.DEVINFO?.Jam||''), true);
  else toast('Machine test failed', false);
}

async function deleteMachine(id, label) {
  if (!confirm('Delete machine "'+label+'"? This only removes config, not device data.')) return;
  const j = await doPostJson('machine_delete', {id});
  if (j.ok) { toast('Deleted', true); loadMachines(); }
  else { toast('Error: '+(j.error||''), false); }
}

// --- Init ---
window.addEventListener('DOMContentLoaded', () => {
  doAction('dev_info');
  doAction('db_stats');
  loadMachines();
});
</script>
</body>
</html>

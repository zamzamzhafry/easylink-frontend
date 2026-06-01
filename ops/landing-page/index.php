<?php
declare(strict_types=1);

$configPath = __DIR__ . DIRECTORY_SEPARATOR . 'apps.json';
$apps = [];

if (is_file($configPath)) {
    $decoded = json_decode((string) file_get_contents($configPath), true);
    if (is_array($decoded)) {
        $apps = $decoded;
    }
}

$rawHost = $_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_ADDR'] ?? 'localhost');
$host = preg_replace('/:\\d+$/', '', $rawHost) ?: $rawHost;
$serverIp = $_SERVER['SERVER_ADDR'] ?? gethostbyname(gethostname());
$hostname = gethostname() ?: php_uname('n');
$now = date('Y-m-d H:i:s T');
$uptime = trim((string) @shell_exec('uptime -p 2>/dev/null'));
if ($uptime === '') {
    $uptime = 'Unavailable';
}

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function app_href(array $app, string $host): string
{
    $href = (string) ($app['href'] ?? '#');
    return str_replace('{{host}}', $host, $href);
}

function tcp_status(array $app): array
{
    $targetHost = (string) ($app['status_host'] ?? '');
    $targetPort = (int) ($app['status_port'] ?? 0);

    if ($targetHost === '' || $targetPort <= 0) {
        return ['label' => 'Offline', 'class' => 'down', 'detail' => 'No probe defined'];
    }

    $errno = 0;
    $errstr = '';
    $socket = @fsockopen($targetHost, $targetPort, $errno, $errstr, 0.8);
    if (is_resource($socket)) {
        fclose($socket);
        return ['label' => 'Online', 'class' => 'up', 'detail' => $targetHost . ':' . $targetPort];
    }

    return ['label' => 'Offline', 'class' => 'down', 'detail' => $targetHost . ':' . $targetPort];
}

function app_icon(string $icon): string
{
    if ($icon === 'document') {
        return '<svg class="app-icon-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M18 8h20l12 12v36H18z"/><path d="M38 8v14h14"/><path d="M25 32h22M25 40h22M25 48h14"/></svg>';
    }

    return '<svg class="app-icon-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M20 32c0-7 5-12 12-12s12 5 12 12"/><path d="M16 27c2-9 8-15 16-15s14 6 16 15"/><path d="M24 35c0-5 3-8 8-8s8 3 8 8c0 10-4 14-4 18"/><path d="M32 35c0 8-2 12-6 18"/><path d="M18 43c3-1 5-4 5-8"/><path d="M42 44c2-2 3-5 3-9"/></svg>';
}

$totalApps = count($apps);
$onlineApps = 0;
foreach ($apps as $app) {
    if (tcp_status($app)['class'] === 'up') {
        $onlineApps++;
    }
}
?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RSSU Server · App Directory</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="page-shell">
    <section class="hero-panel" aria-labelledby="page-title">
      <div class="section-kicker"><span>01</span><span>Private server index</span></div>
      <div class="hero-grid">
        <div class="hero-copy">
          <p class="meta-strip">RSSU internal network · Apache/PHP hub · Port 80 entry</p>
          <h1 id="page-title">RSSU Server <span>App Directory</span></h1>
          <p class="hero-lede">Single private front door for operational tools hosted on this Linux VM. App cards are generated from <code>apps.json</code> and checked with TCP probes before display.</p>
        </div>
        <aside class="hero-ledger" aria-label="Server summary">
          <div class="ledger-row"><span class="ledger-label">Server IP</span><strong><?php echo e($serverIp); ?></strong></div>
          <div class="ledger-row"><span class="ledger-label">Network scope</span><strong>LAN + VPN only</strong></div>
          <div class="ledger-row"><span class="ledger-label">Current time</span><strong><?php echo e($now); ?></strong></div>
          <div class="ledger-row"><span class="ledger-label">Hostname</span><strong><?php echo e($hostname); ?></strong></div>
        </aside>
      </div>
    </section>

    <section class="directory-section" aria-labelledby="directory-title">
      <div class="section-heading">
        <div>
          <div class="section-kicker"><span>02</span><span>Registered applications</span></div>
          <h2 id="directory-title">Live routes on this machine</h2>
        </div>
        <div class="directory-stats" aria-label="Application status summary">
          <span class="stat-pill"><?php echo e((string) $onlineApps); ?> online</span>
          <span class="stat-pill"><?php echo e((string) $totalApps); ?> registered</span>
        </div>
      </div>

      <div class="app-grid">
        <?php foreach ($apps as $index => $app): ?>
          <?php
            $status = tcp_status($app);
            $name = (string) ($app['name'] ?? 'Unnamed app');
            $description = (string) ($app['description'] ?? 'No description provided.');
            $badge = (string) ($app['badge'] ?? 'App');
            $audience = (string) ($app['audience'] ?? 'Internal users');
            $notes = (string) ($app['notes'] ?? 'No runtime notes');
            $slug = (string) ($app['slug'] ?? 'app');
            $icon = (string) ($app['icon'] ?? 'fingerprint');
            $href = app_href($app, $host);
          ?>
          <article class="app-card" data-status="<?php echo e($status['class']); ?>">
            <div class="card-index"><?php echo e(str_pad((string) ($index + 1), 2, '0', STR_PAD_LEFT)); ?></div>
            <div class="card-topline">
              <span class="app-badge"><?php echo e($badge); ?></span>
              <span class="status-chip <?php echo e($status['class']); ?>"><span class="status-dot"></span><?php echo e($status['label']); ?></span>
            </div>
            <div class="app-icon"><?php echo app_icon($icon); ?></div>
            <h3><?php echo e($name); ?></h3>
            <p><?php echo e($description); ?></p>
            <dl class="app-meta">
              <div><dt>Audience</dt><dd><?php echo e($audience); ?></dd></div>
              <div><dt>Stack</dt><dd><?php echo e($notes); ?></dd></div>
              <div><dt>Probe</dt><dd><?php echo e($status['detail']); ?></dd></div>
            </dl>
            <a class="app-link" href="<?php echo e($href); ?>" aria-label="Open <?php echo e($name); ?>">
              <span>Open <?php echo e($slug); ?></span>
              <span aria-hidden="true">↗</span>
            </a>
          </article>
        <?php endforeach; ?>
      </div>
    </section>

    <section class="ops-section" aria-labelledby="ops-title">
      <div class="section-kicker"><span>03</span><span>Operations note</span></div>
      <div class="ops-panel">
        <h2 id="ops-title">Config-driven hub. No public surface.</h2>
        <p>Update app cards in <code>apps.json</code>. Keep access restricted at network edge; this page intentionally adds no application-level authentication.</p>
        <div class="ops-strip">
          <span class="stat-pill">Source: ops/landing-page</span>
          <span class="stat-pill">Health: fsockopen TCP probe</span>
          <span class="stat-pill">Scope: LAN + VPN only</span>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <span>Config-driven · Add apps via apps.json</span>
    <span>Server uptime: <?php echo e($uptime); ?></span>
  </footer>
</body>
</html>

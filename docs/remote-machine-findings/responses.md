> Get-Content .\ops\fservice-sync\web\index.php -TotalCount 15

<?php
/**
 * EasyLink FService Control Panel - Multi-Machine
 * Usage: php -S localhost:9090 index.php
 */

// --- DB Config ---------------------------------------------------------------
$DB_HOST = getenv('DB_HOST') ?: '127.0.0.1';
$DB_PORT = getenv('DB_PORT') ?: '3306';
$DB_USER = getenv('DB_USER') ?: 'root';
$DB_PASS = getenv('DB_PASS') ?: '';
$DB_NAME = getenv('DB_NAME') ?: 'demo_easylinksdk';
$TIMEOUT = 120;

function get_pdo(): PDO {
PS C:\Users\USER\Music\easylink-frontend> Get-Content .\ops\fservice-sync\run.bat -TotalCount 20
@echo off
title EasyLink Control Panel
echo ============================================
echo   EasyLink FService + Control Panel
echo ============================================
echo.

:: Config
set FSERVICE_DIR=%~dp0..\fservice-bundle
set PHP_PORT=9090
set FSERVICE_HOST=localhost
set FSERVICE_PORT=8090
set FSERVICE_SN=Fio66208021230737
set DB_HOST=127.0.0.1
set DB_PORT=3306
set DB_USER=root
set DB_PASS=
set DB_NAME=demo_easylink

:: Find PHP
PS C:\Users\USER\Music\easylink-frontend> Get-Content .\ops\fservice-sync\sync.php -TotalCount 40
<?php
/**
 * EasyLink FService -> MySQL Sync Script
 *
 * Pulls users and scanlogs from FService HTTP bridge and upserts
 * into demo_easylinksdk database tables.
 *
 * Usage:
 *   php sync.php                  # pull new scanlogs + users
 *   php sync.php --users-only     # pull users only
 *   php sync.php --scanlogs-only  # pull scanlogs only
 *   php sync.php --full           # pull ALL scanlogs (not just new)
 *
 * Environment (or edit constants below):
 *   FSERVICE_HOST    - bridge IP (default: localhost)
 *   FSERVICE_PORT    - bridge port (default: 8090)
 *   FSERVICE_SN      - device serial (default: Fio66208021230737)
 *   DB_HOST          - MySQL host (default: localhost)
 *   DB_PORT          - MySQL port (default: 3306)
 *   DB_USER          - MySQL user (default: root)
 *   DB_PASS          - MySQL password (default: empty)
 *   DB_NAME          - MySQL database (default: demo_easylinksdk)
 */

// --- Configuration -----------------------------------------------------------

define('FSERVICE_HOST', getenv('FSERVICE_HOST') ?: 'localhost');
define('FSERVICE_PORT', getenv('FSERVICE_PORT') ?: '8090');
define('FSERVICE_SN',   getenv('FSERVICE_SN')   ?: 'Fio66208021230737');

define('DB_HOST', getenv('DB_HOST') ?: '127.0.0.1');
define('DB_PORT', getenv('DB_PORT') ?: '3306');
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') ?: '');
define('DB_NAME', getenv('DB_NAME') ?: 'demo_easylinksdk');

define('PAGING_LIMIT', 100);
define('REQUEST_TIMEOUT', 120); // seconds

// --- Helpers -----------------------------------------------------------------
PS C:\Users\USER\Music\easylink-frontend> mysql -h 127.0.0.1 -P 3306 -u root -e "SHOW DATABASES LIKE 'demo_easylinksdk';"
mysql : The term 'mysql' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path
was included, verify that the path is correct and try again.
At line:1 char:1
+ mysql -h 127.0.0.1 -P 3306 -u root -e "SHOW DATABASES LIKE 'demo_easy ...
+ ~~~~~
    + CategoryInfo          : ObjectNotFound: (mysql:String) [], CommandNotFoundException
    + FullyQualifiedErrorId : CommandNotFoundException

PS C:\Users\USER\Music\easylink-frontend> mysql -h 127.0.0.1 -P 3306 -u root demo_easylinksdk -e "SHOW TABLES;"
mysql : The term 'mysql' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path
was included, verify that the path is correct and try again.
At line:1 char:1
+ mysql -h 127.0.0.1 -P 3306 -u root demo_easylinksdk -e "SHOW TABLES;"
+ ~~~~~
    + CategoryInfo          : ObjectNotFound: (mysql:String) [], CommandNotFoundException
    + FullyQualifiedErrorId : CommandNotFoundException

PS C:\Users\USER\Music\easylink-frontend> tasklist /FI "PID eq <PID_FROM_3306>"
>> netstat -ano | findstr :3306
ERROR: The search filter cannot be recognized.
  TCP    0.0.0.0:3306           0.0.0.0:0              LISTENING       11176
  TCP    0.0.0.0:33060          0.0.0.0:0              LISTENING       11176
  TCP    127.0.0.1:3306         127.0.0.1:10732        TIME_WAIT       0
  TCP    127.0.0.1:3306         127.0.0.1:10733        TIME_WAIT       0
  TCP    127.0.0.1:10735        127.0.0.1:3306         TIME_WAIT       0
  TCP    127.0.0.1:10737        127.0.0.1:3306         TIME_WAIT       0
  TCP    127.0.0.1:10738        127.0.0.1:3306         TIME_WAIT       0
  TCP    [::]:3306              [::]:0                 LISTENING       11176
  TCP    [::]:33060             [::]:0                 LISTENING       11176




  
C:\laragon\www
λ mysql -h 127.0.0.1 -P 3306 -u root -e "SHOW DATABASES LIKE 'demo_easylinksdk';"
+-----------------------------+
| Database (demo_easylinksdk) |
+-----------------------------+
| demo_easylinksdk            |
+-----------------------------+

C:\laragon\www
λ mysql -h 127.0.0.1 -P 3306 -u root demo_easylinksdk -e "SHOW TABLES;"
+----------------------------+
| Tables_in_demo_easylinksdk |
+----------------------------+
| tb_device_config           |
| tb_scanlog                 |
| tb_user                    |
+----------------------------+

C:\laragon\www
λ php -r "$pdo=new PDO('mysql:host=127.0.0.1;port=3306;dbname=demo_easylinksdk;charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]); echo 'DB OK', PHP_EOL;"
DB OK

C:\laragon\www

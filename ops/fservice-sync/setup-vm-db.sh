#!/bin/bash
# Run this on 192.168.1.129 (Ubuntu VM) as root or sudo
# Creates MySQL user for Windows machine to push sync data

echo "=== EasyLink DB Setup on VM ==="

# Create database if not exists
mysql -u root -e "CREATE DATABASE IF NOT EXISTS demo_easylinksdk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Create sync user with remote access (allow from any LAN host)
mysql -u root -e "
CREATE USER IF NOT EXISTS 'easylink_sync'@'%' IDENTIFIED BY 'EasyLink2026!';
GRANT ALL PRIVILEGES ON demo_easylinksdk.* TO 'easylink_sync'@'%';
FLUSH PRIVILEGES;
"

# Create tables
mysql -u root demo_easylinksdk -e "
CREATE TABLE IF NOT EXISTS tb_user (
    pin VARCHAR(20) NOT NULL PRIMARY KEY,
    nama VARCHAR(100) DEFAULT '',
    pwd VARCHAR(100) DEFAULT '',
    rfid VARCHAR(50) DEFAULT '0',
    privilege INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tb_scanlog (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sn VARCHAR(50) DEFAULT '',
    scan_date VARCHAR(30) NOT NULL,
    pin VARCHAR(20) NOT NULL,
    verifymode INT DEFAULT 0,
    iomode INT DEFAULT 0,
    workcode VARCHAR(10) DEFAULT '0',
    UNIQUE KEY uq_scan (sn, scan_date, pin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tb_device_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    sn VARCHAR(50) NOT NULL UNIQUE,
    bridge_host VARCHAR(100) NOT NULL DEFAULT 'localhost',
    bridge_port INT NOT NULL DEFAULT 8090,
    device_ip VARCHAR(45) DEFAULT NULL,
    device_port INT DEFAULT NULL,
    model VARCHAR(100) DEFAULT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    last_sync_at DATETIME DEFAULT NULL,
    last_sync_users INT DEFAULT 0,
    last_sync_scanlogs INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO tb_device_config (label, sn, bridge_host, bridge_port, device_ip, device_port, model)
VALUES ('Mesin Utama', 'Fio66208021230737', 'localhost', 8090, '192.168.1.200', 5005, 'Revo WFV-208BNC');
"

# Ensure MySQL listens on all interfaces (not just 127.0.0.1)
echo ""
echo "=== Checking MySQL bind-address ==="
BIND=$(grep -r "bind-address" /etc/mysql/ 2>/dev/null | grep -v "#")
echo "$BIND"
echo ""
echo "If bind-address = 127.0.0.1, change to 0.0.0.0:"
echo "  sudo sed -i 's/bind-address.*=.*127.0.0.1/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf"
echo "  sudo systemctl restart mysql"
echo ""

# Verify
echo "=== Verification ==="
mysql -u root -e "SELECT user, host FROM mysql.user WHERE user='easylink_sync';"
mysql -u root -e "SHOW DATABASES LIKE 'demo_easylinksdk';"
mysql -u root demo_easylinksdk -e "SHOW TABLES;"

echo ""
echo "=== Done ==="
echo "Windows machine can now connect to 192.168.1.129:3306"
echo "  User: easylink_sync"
echo "  Pass: EasyLink2026!"
echo "  DB:   demo_easylinksdk"

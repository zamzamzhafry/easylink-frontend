Tentu, ini adalah draf dokumentasi Markdown (`.md`) yang disusun secara komprehensif. Dokumen ini dirancang khusus dengan instruksi ("System Prompts") yang sangat jelas agar AI Agent (seperti agen _backend engineer_) dapat langsung memahami cara mentranslasikan skrip PowerShell `Ultimate v4.0` ke dalam arsitektur REST API dan skema database SQL.

Silakan salin kode di bawah ini dan simpan sebagai `agent-api-migration-docs.md`.

---

````markdown
# EasyLink SDK Migration Guide: API & SQL Integration (Agentic Reference)

## 🎯 Objective

Panduan ini ditujukan bagi AI Agent (Backend Engineer / Database Architect) untuk memigrasikan logika operasional dari skrip PowerShell `EasyLink ULTIMATE v4.0` ke dalam sistem _Backend REST API_ yang terpusat dan _SQL Database_.

Sistem ini akan bertindak sebagai _middleware_ antara Aplikasi Web (Next.js/React) dan Perangkat Mesin Absensi (FService/EasyLink).

---

## 🗄️ 1. Database Schema Design (SQL)

AI Agent harus mengimplementasikan skema relasional berikut. Gunakan mekanisme **UPSERT** (`ON DUPLICATE KEY UPDATE` atau `ON CONFLICT DO UPDATE`) untuk mencegah duplikasi data saat proses sinkronisasi.

### Table: `Devices`

Menyimpan informasi mesin yang terdaftar.

```sql
CREATE TABLE Devices (
    id SERIAL PRIMARY KEY,
    serial_number VARCHAR(50) UNIQUE NOT NULL,
    base_url VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    last_sync_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'offline',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
````

### Table: `Users` (Employees)

Menyimpan data pengguna hasil sinkronisasi dari `/user/all/paging` atau yang akan di-push via `/user/set`.

```sql
CREATE TABLE Users (
    id SERIAL PRIMARY KEY,
    device_sn VARCHAR(50) REFERENCES Devices(serial_number),
    pin VARCHAR(50) NOT NULL,
    name VARCHAR(100),
    rfid VARCHAR(50),
    password VARCHAR(50),
    privilege INT DEFAULT 0, -- 0=User, 14=Admin
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_sn, pin) -- Cegah duplikasi user di mesin yang sama
);
```

### Table: `Scanlogs` (Attendance Records)

Menyimpan riwayat log absensi. Sangat penting untuk melakukan validasi _unique_ berdasarkan kombinasi Mesin, PIN, dan Waktu Scan.

```sql
CREATE TABLE Scanlogs (
    id BIGSERIAL PRIMARY KEY,
    device_sn VARCHAR(50) REFERENCES Devices(serial_number),
    pin VARCHAR(50) NOT NULL,
    scan_date TIMESTAMP NOT NULL,
    verify_mode INT,
    io_mode INT,
    work_code VARCHAR(50),
    is_gps BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_sn, pin, scan_date) -- Kunci Upsert untuk Incremental Sync
);
```

### Table: `SyncJobs` (Background Task Tracking)

Digunakan untuk melacak status _Safe Paging_ agar UI/Frontend bisa menampilkan _Progress Bar_.

```sql
CREATE TABLE SyncJobs (
    id UUID PRIMARY KEY,
    device_sn VARCHAR(50) REFERENCES Devices(serial_number),
    job_type VARCHAR(50), -- 'SYNC_USERS', 'SYNC_SCANLOG_ALL', 'SYNC_SCANLOG_NEW'
    status VARCHAR(20), -- 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'
    total_pages INT DEFAULT 0,
    current_page INT DEFAULT 0,
    records_processed INT DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);
```

---

## 🚀 2. API Endpoints Implementation Strategy

AI Agent harus membuat _controller_ dan _service_ yang melakukan HTTP POST ke IP Mesin Absensi (mirip `Invoke-EasyLink`), lalu mem-parsing JSON `Data` dan menyimpannya ke Database SQL.

### A. Device Management

- **`GET /api/devices/{sn}/info`**
  - **Action:** Call `POST {BaseUrl}/dev/info`.
  - **Logic:** Kembalikan response JSON asli ke frontend dan update status `Devices.status = 'online'`.
- **`POST /api/devices/{sn}/sync-time`**
  - **Action:** Call `POST {BaseUrl}/dev/settime`. Setel waktu perangkat agar sama dengan waktu server.

### B. User Management (Safe Paging Sync)

- **`POST /api/users/sync`** (Background Job / Long Polling)
  - **Action:** Translate fungsi `Get-UserAll-Safe` dari skrip PowerShell.
  - **Agent Logic:** 1. Buat record di `SyncJobs`. 2. Loop panggil `POST {BaseUrl}/user/all/paging` dengan `body="sn={sn}&limit=50"`. 3. Setiap kali menerima 1 page, lakukan **Bulk Upsert** ke tabel `Users`. 4. Tambahkan _delay_ 500ms - 800ms antar request untuk mencegah mesin _hang_ (HTTP 408). 5. Berhenti jika `Data.Count < limit` atau `Result == false`. Update `SyncJobs` ke 'COMPLETED'.

- **`POST /api/users/push`**
  - **Action:** Translate fungsi `Set-User`.
  - **Logic:** Call `POST {BaseUrl}/user/set` dengan parameter `pin`, `nama`, `pwd`, `rfid`, `priv`. Jika sukses di mesin, jalankan `INSERT/UPDATE` ke database `Users`.

### C. Scanlog Management (Attendance Sync)

- **`POST /api/scanlog/sync/new`** (Incremental Fetch - Ideal untuk Cron Job)
  - **Action:** Translate `Get-ScanlogNew`.
  - **Logic:** 1. Query ke database: `SELECT MAX(scan_date) FROM Scanlogs WHERE device_sn = ?`. Jadikan nilai ini sebagai parameter `from`. 2. Call `POST {BaseUrl}/scanlog/new?sn={sn}&limit=100&from={from}&to={now}`. 3. Parsing array `Data`, lakukan _Bulk Upsert_ ke tabel `Scanlogs`.

- **`POST /api/scanlog/sync/all`** (Full Fetch - Safe Paging)
  - **Action:** Sama seperti User Sync, gunakan _looping_ page untuk `/scanlog/all/paging`. Jangan lupa simpan tiap page langsung ke DB untuk menghemat memory server (menghindari OOM - Out of Memory).

### D. Danger Zone (Device Operations)

- **`DELETE /api/devices/{sn}/users/{pin}`** -> Call `/user/del`
- **`DELETE /api/devices/{sn}/scanlogs`** -> Call `/scanlog/del`
- **`POST /api/devices/{sn}/init`** -> Call `/dev/init` (Factory Reset)
- _Note untuk Agent:_ Tambahkan _Role-Based Access Control_ (RBAC) di endpoint ini. Hanya SuperAdmin yang boleh mengeksekusinya.

---

## 🛠️ 3. Critical Rules for AI Agent (Must Read)

1.  **Form-UrlEncoded ONLY:** Mesin absensi ini **TIDAK** menerima `application/json`. Semua request HTTP POST ke mesin (terutama payload body) harus menggunakan `Content-Type: application/x-www-form-urlencoded` (misal: `sn=Fio123&limit=50`).
2.  **Query String vs Body:** Perhatikan bahwa endpoint `/scanlog/new` memerlukan parameter `from` dan `to` di **URL Query String**, sedangkan parameter `sn` tetap dikirim melalui **Body**.
3.  **Timeout Protection:** Perangkat absensi IoT memiliki komputasi yang lambat. Set HTTP Request timeout dari Backend ke Perangkat minimal **60 detik** (bahkan hingga 200 detik untuk paging yang besar).
4.  **Graceful Degradation:** Jika mesin offline (Timeout / Connection Refused), backend tidak boleh _crash_. Kembalikan status HTTP 503 (Service Unavailable) atau 504 (Gateway Timeout) dengan JSON error message yang rapi.
5.  **Data Type Mapping:** \* Waktu dari perangkat menggunakan format string `YYYY-MM-DD HH:mm:ss`. Konversi secara eksplisit ke tipe data `TIMESTAMP` (`Date` object di JS/TS) sebelum memasukkan ke SQL.

```

Dokumen di atas akan memberikan konteks yang sangat akurat bagi AI (baik itu Cursor, GitHub Copilot, ChatGPT, dll) untuk langsung membuat kode (misalnya menggunakan Node.js/Express/Next.js dengan Prisma/TypeORM) berdasarkan pengalaman operasional yang ada di skrip PowerShell Anda.
```

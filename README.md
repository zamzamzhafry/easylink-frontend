# EasyLink Absensi — Next.js Frontend

Attendance management UI for the EasyLink biometric SDK (finger / face / palm).

## Requirements
- Node.js 18+
- XAMPP running on localhost:3306 (MySQL/MariaDB, root, no password)
- Database: `demo_easylinksdk` already exists with EasyLink SDK tables

## Setup

### 1. Run the SQL migration
Open phpMyAdmin → select `demo_easylinksdk` → import or paste `migration.sql`.
This adds 6 new tables (shift types, groups, schedule, notes).

### 2. Install dependencies
```bash
npm install
```

### 3. Start development server
```bash
npm run dev
```
Open http://localhost:3000

## Pages
| Route | Description |
|---|---|
| `/` | Dashboard — stat cards + recent scans |
| `/employees` | Link tb_karyawan names to tb_user device accounts |
| `/attendance` | Scan log with date range, anomaly alerts, notes editor |
| `/groups` | Create groups and assign employees |
| `/schedule` | Weekly shift calendar with bulk group assignment + CSV export |

## Shift Rules (pre-seeded in migration.sql)
| Shift | In | Out | Notes |
|---|---|---|---|
| Pagi | 07:00 | 14:00 | |
| Siang | 14:00 | 21:00 | |
| Malam | 21:00 | 07:00 | next day flag |
| Middle | 09:00 | 16:00 | |
| Libur | — | — | no scan required |
| Cuti | — | — | paid leave, 7h counted |
| Non-shift | — | — | no time rule enforced |

Late = scan in more than 15 min after scheduled start.  
Early leave = scan out more than 15 min before scheduled end.

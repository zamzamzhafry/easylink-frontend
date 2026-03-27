## SDK -> Backend curl testing chain (current)

Reference source of truth for endpoint behavior: `docs/learning/easylink SDK user guide.txt`.

1. Validate SDK endpoint directly (`/dev/info`, `/dev/settime`, `/dev/init`, `/scanlog/new`, `/scanlog/all/paging`, `/user/all/paging`).
2. Trigger backend worker API:
   - Machine actions queue: `POST /api/machine` with `{ "action": "info|time|sync_time|pull_users|initialize_machine", "async": true }`
   - Scanlog ingestion queue: `POST /api/scanlog/sync` with source `windows-sdk`
3. Poll job/batch status:
   - Machine job: `GET /api/machine?job_id=<JOB_ID>`
   - Scanlog batch: `GET /api/scanlog/sync?batch_id=<BATCH_ID>`
4. Append observed raw responses in this file.

---

curl -sS -m 30 -X POST "http://192.168.1.111:8090/scanlog/new?sn=Fio66208021230737&from=2026-03-20%2000:00:00&to=2026-03-27%2023:59:59&limit=100" -H "Content-Type: application/x-www-form-urlencoded"
{"Result":false,"message_code":0,"message":"No data"}

curl -sS -m 30 -X POST "http://192.168.1.111:8090/scanlog/all/paging?sn=Fio66208021230737&limit=100&page=1&from=2026-03-20%2000:00:00&to=2026-03-27%2023:59:59" -H "Content-Type: application/x-www-form-urlencoded"
it crashed the sdk, and curl rto

curl -sS -m 30 -X POST "http://192.168.1.111:8090/scanlog/all/paging?sn=Fio66208021230737&limit=100&from=2026-03-20%2000:00:00&to=2026-03-27%2023:59:59" "Content-Type: application/x-www-form-urlencoded"
its rto and might download the full scanlog. curl has responsed for rto. curl: (28) Operation timed out after 30015 milliseconds with 0 bytes received
curl: (3) URL rejected: Malformed input to a URL function

Invoke-RestMethod -Method Post -Uri "http://192.168.1.111:8090/scanlog/new?sn=Fio66208021230737&from=2026-03-20 00:00:00&to=2026-03-27 23:59:59&limit=100" -ContentType "application/x-www-form-urlencoded"
$body = @{
source = "windows-sdk"
mode = "new"
from = "2026-03-20 00:00:00"
to = "2026-03-27 23:59:59"
limit = 100
page = 1
max_pages = 3
async = $true
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://192.168.1.111:3001/api/scanlog/sync" -WebSession $session -ContentType "application/json" -Body $body
Invoke-RestMethod: A connection attempt failed because the connected party did not properly respond after a period of time, or established connection failed because connected host has failed to respond.

in the sdk log : download data scan terbaru dari mesin
Menunggu ...
GetProductData OK
Mempersiapkan proses download scanlog...
Bekerja...
None of data array
Download scanlog dari mesin "Revo WFV-208BNC", "0" record selesai

curl -sS -m 30 -X POST "http://192.168.1.111:8090/scanlog/new?sn=Fio66208021230737&limit=100" -H "Content-Type: application/x-www-form-urlencoded"
{"Result":false,"message_code":0,"message":"No data"}

curl -sS -m 30 -X POST "http://192.168.1.111:3001/api/scanlog/sync" \
 -H "Content-Type: application/json" \
 -b "easylink_session=<YOUR_SESSION_COOKIE>" \
 -d '{"source":"windows-sdk","mode":"all","from":"2026-03-01 00:00:00","to":"2026-03-27 23:59:59","limit":100,"page":1,"max_pages":5,"async":true}'

curl -sS -m 30 -X POST "http://192.168.1.111:3001/api/scanlog/sync" -H "Content-Type: application/json" -b "easylink_session=<YOUR_SESSION_COOKIE>" -d '{"source":"windows-sdk","mode":"all","from":"2026-03-01 00:00:00","to":"2026-03-27 23:59:59","limit":100,"page":1,"max_pages":5,"async":true}'

rto response from curl

curl -sS -b "easylink_session=<YOUR_SESSION_COOKIE>" "http://192.168.1.111:3001/api/scanlog/sync?batch_id=<BATCH_ID>"
no response from curl

i found the docs of easylink finally

Download Scanlog
Prosedur berikut ini digunakan untuk melakukan download data scanlog / data presensi dari mesin absensi.
terdapat 2 prosedur untuk download scanlog yaitu :
a. Download semua scanlog (With Pagination)
Download semua scan log (with pagination) adalah mendownload semua data scan yang ada di
mesin secara bertahap sesuai nilai limit paging yang diisikan, misalkan nilai paging diisi 100, maka
Easylink akan mendownlaod per 100 data scan secara bertahap sampai semua data scan di mesin
berhasil terdownload, hal ini bertujuan untuk menghindari gagal download data scan besar. Untuk
download semua scanlog cukup melakukan request http ke IP server yang menjalankan
FService.exe dengan rincian sebagai berikut :
URL : IP:Port/scanlog/all/paging
Method : POST
Content-Type : application/x-www-form-urlencoded
Parameter :
 sn
Setelah itu, server akan mengirim return sebagai berikut :
Return yang didapatkan yaitu dalam bentuk string JSON.

 Request Sukses : Result = true
Contoh :
{"Result":true,"Data":[{"SN":"6530150200047","ScanDate":"2016-02-11
13:13:21","PIN":"2","VerifyMode":0,"IOMode":0,"WorkCode":0},{"SN":"6530150200047","ScanDa
te":"2016-02-11
13:13:31","PIN":"2","VerifyMode":2,"IOMode":0,"WorkCode":0},{"SN":"6530150200047","ScanDa
te":"2016-02-15
09:57:32","PIN":"1","VerifyMode":1,"IOMode":0,"WorkCode":0},{"SN":"6530150200047","ScanDa
te":"2016-02-15
09:57:36","PIN":"2","VerifyMode":2,"IOMode":0,"WorkCode":0},{"SN":"6530150200047","ScanDa
te":"2016-02-15
09:57:39","PIN":"1","VerifyMode":2,"IOMode":0,"WorkCode":0},{"SN":"6530150200047","ScanDa
te":"2016-02-15
09:57:45","PIN":"1","VerifyMode":0,"IOMode":0,"WorkCode":0},{"SN":"6530150200047","ScanDa
te":"2016-02-15 09:57:48","PIN":"2","VerifyMode":0,"IOMode":0,"WorkCode":0}]}
 Request gagal : Result = false
Contoh :
{"Result":false}

b. Download scanlog terbaru
Sedangkan download scanlog terbaru saja yaitu hanya mendownload data scan log terbaru yang
belum terdownload di Easylink SDK.
Untuk download scanlog terbaru cukup melakukan request http ke IP server yang menjalankan
FService.exe dengan rincian sebagai berikut :
URL : IP:Port/scanlog/new
Method : POST
Content-Type : application/x-www-form-urlencoded
Parameter :
 sn
Setelah itu, server akan mengirim return sebagai berikut :
Return yang didapatkan yaitu dalam bentuk string JSON.
 Request Sukses : Result = true
Contoh :
{"Result":true,"Data":[{"SN":"6530150200047","ScanDate":"2016-02-11
13:13:21","PIN":"2","VerifyMode":0,"IOMode":0,"WorkCode":0},{"SN":"6530150200047","ScanDa
te":"2016-02-11
13:13:31","PIN":"2","VerifyMode":2,"IOMode":0,"WorkCode":0},{"SN":"6530150200047","ScanDa
te":"2016-02-15
09:57:32","PIN":"1","VerifyMode":1,"IOMode":0,"WorkCode":0},{"SN":"6530150200047","ScanDa
te":"2016-02-15
09:57:36","PIN":"2","VerifyMode":2,"IOMode":0,"WorkCode":0},{"SN":"6530150200047","ScanDa
te":"2016-02-15
09:57:39","PIN":"1","VerifyMode":2,"IOMode":0,"WorkCode":0},{"SN":"6530150200047","ScanDa
te":"2016-02-15
09:57:45","PIN":"1","VerifyMode":0,"IOMode":0,"WorkCode":0},{"SN":"6530150200047","ScanDa
te":"2016-02-15 09:57:48","PIN":"2","VerifyMode":0,"IOMode":0,"WorkCode":0}]}
 Request gagal : Result = false
Contoh :
{"Result":false}

Dev notes
oh i found the sdk pdf guides. it consist of sample codes which are from C# D7 1 2 3 PHP , PHP v7, v2 and PHP 8 VB.NET and VB6. i remember old days to tinkering with the php version. the c# has.form files. could be contain the curl request, and still the old vendor has VB app which date selector and fetching per employee user to the date range. might still superior because not hitting the sdk. reference to the Docs/response_testing.md to saw the curl request. and i put the snipplets of the pdf docs and the reponse expected like alos the errors. it returned to json. while the sample app provided render into a MS access DB. might be the selector date of my old senior vendor only convert into the safe shift table. so lets stick with raw json

curl -sS -m 40 -X POST "http://192.168.1.111:8090/dev/info?sn=Fio66208021230737" -H "Content-Type: application/x-www-form-urlencoded"

{"Result":true,"DEVINFO":{"Jam":"27/03/2026 03:17:04","Admin":"1","User":"133","FP":"132","Face":"134","Vein":"134","CARD":"0","PWD":"0","All Operasional":"0","All Presensi":"55598","New Operasional":"0","New Presensi":"0"}}

curl -sS -m 90 -X POST "http://192.168.1.111:8090/scanlog/new?sn=Fio66208021230737" -H "Content-Type: application/x-www-form-urlencoded"
{"Result":false,"message_code":0,"message":"No data"}

curl -sS -m 120 -X POST "http://192.168.1.111:8090/scanlog/all/paging?sn=Fio66208021230737" -H "Content-Type: application/x-www-form-urlencoded"

{"IsSession":true,"Result":true,"Data":[]}

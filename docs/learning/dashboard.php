<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/admin-lte@3.1/dist/css/adminlte.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="hold-transition sidebar-mini layout-fixed">
  <div class="wrapper">
    <nav class="main-header navbar navbar-expand navbar-white navbar-light">
      <ul class="navbar-nav">
        <li class="nav-item d-none d-sm-inline-block">
          <!-- <a href="#" class="nav-link">Home</a> -->
        </li>
      </ul>
    </nav>
    
    <aside class="main-sidebar sidebar-dark-primary elevation-4">
      <a href="#" class="brand-link">
        <span class="brand-text font-weight-light">Absensi RS SIAGA UTAMA</span>
      </a>
      <div class="sidebar ">
        <nav class="mt-2">
          <ul class="nav nav-pills nav-sidebar flex-column" role="menu">
            <li class="nav-item">
              <a href="#" class="nav-link active">
                <i class="nav-icon fas fa-tachometer-alt"></i>
                <p>Laporan Karyawan</p>
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </aside>
    
    <div class="content-wrapper">
      <div class="content-header">
        <div class="container-fluid">
          <div class="row mb-2">
            <div class="col-sm-6">
              <h1 class="m-0">Laporan Absensi Karyawan</h1>
              <h3 class="m-0">Bulan Maret 2025</h3>
            </div>
          </div>
        </div>
      </div>
      
      <section class="content">
        <div class="container-fluid">
          <div class="row">
            <div class="col-md-3">
              <div class="card">
                <div class="card-body text-center">
                  <img src="../images/default_foto.jpg" alt="Default Foto" class="img-fluid rounded">
                  <h3 class="mt-3">Yoga Kurniawan</h3>
                    <table class="table table-bordered mt-3">
                    <tbody>
                      <tr>
                      <th>Nama</th>
                      <td>Yoga Kurniawan</td>
                      </tr>
                      <tr>
                      <th>Jabatan</th>
                      <td>Staff Security</td>
                      </tr>
                      <tr>
                      <th>Departemen</th>
                      <td>Unit Keamanan</td>
                      </tr>
                      <tr>
                      <th>Akhir Kontrak</th>
                      <td>26 Juli 2025</td>
                      </tr>
                      <tr>
                      <th>Kontrak Kerja</th>
                      <td>Outsourcing</td>
                      </tr>
                    </tbody>
                    </table>
                </div>
              </div>
            </div>
            
            <div class="col-md-9">
              <div class="row">
                <div class="col-md-6">
                  <div class="card">
                    <div class="card-body">
                      <canvas id="pieChart1"></canvas>
                    </div>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="card">
                    <div class="card-body">
                      <canvas id="pieChart2"></canvas>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="row mt-4">
                <div class="col-md-12">
                  <div class="card">
                    <div class="card-body">
                      <canvas id="lineChart"></canvas>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
  
  <script src="https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@4.5.2/dist/js/bootstrap.bundle.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/admin-lte@3.1/dist/js/adminlte.min.js"></script>
  <script>
    var ctxPie1 = document.getElementById('pieChart1').getContext('2d');
    new Chart(ctxPie1, { type: 'pie', data: { labels: ['Shift Pagi', 'Shift Siang', 'Shift Malam','Libur'], datasets: [{ data: [12, 8, 4, 3], backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56','#FFB384'] }] } });
    var ctxPie2 = document.getElementById('pieChart2').getContext('2d');
    new Chart(ctxPie2, { type: 'pie', data: { labels: ['Tepat Waktu', 'Terlambat', 'Izin Cuti'], datasets: [{ data: [10, 1, 2], backgroundColor: ['rgb(136, 203, 28)', '#36A2EB', '#FFCE56'] }] } });
    
    var ctxLine = document.getElementById('lineChart').getContext('2d');
    new Chart(ctxLine, { 
      type: 'line', 
      data: { 
      labels: ['2023-01-01', '2023-01-02', '2023-01-03', '2023-01-04', '2023-01-05', '2023-01-06', '2023-01-07', '2023-01-08', '2023-01-09', '2023-01-10', '2023-01-11', '2023-01-12', '2023-01-13', '2023-01-14', '2023-01-15'], 
      datasets: [
        { 
        label: 'Jam Masuk', 
        data: [6.75, 7.00, 6.83, 7.10, 6.90, 7.05, 6.95, 7.00, 6.80, 7.15, 6.85, 7.00, 6.90, 7.05, 6.95], 
        borderColor: '#FF6384', 
        fill: false 
        }, 
        // { 
        // label: 'Jam Pulang', 
        // data: [14.17, 14.25, 14.08, 14.30, 14.20, 14.15, 14.10, 14.25, 14.05, 14.35, 14.10, 14.20, 14.15, 14.25, 14.10], 
        // borderColor: '#36A2EB', 
        // fill: false 
        // }
      ] 
      } 
    });
  </script>
</body>
</html>

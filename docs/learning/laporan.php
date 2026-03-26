<?php
// Include the database connection file
include '../koneksidb.php';

// Handle form submission
if (isset($_POST['submit'])) {
  $startDate = $_POST['start_date'];
  $endDate = $_POST['end_date'];

  if (!empty($startDate) && !empty($endDate)) {
    $sqltemplate = mysqli_query($conn, "
      SELECT k.nama, s.scan_date 
      FROM tb_karyawan k
      LEFT JOIN tb_scanlog s ON k.pin = s.pin AND s.scan_date BETWEEN '$startDate' AND '$endDate'
      ORDER BY k.nama, s.scan_date
    ");

    // Check if the query was successful
    if (!$sqltemplate) {
      die("Error fetching data: " . mysqli_error($conn));
    }

    // Group scan logs by name and date
    $scanLogs = [];
    while ($row = mysqli_fetch_assoc($sqltemplate)) {
      $name = $row['nama'];
      $date = date('Y-m-d', strtotime($row['scan_date']));
      $time = date('H:i', strtotime($row['scan_date']));
      $scanLogs[$name][$date][] = $time;
    }
    } else {
    echo "<p style='color:red;'>Please select a start date and end date.</p>";
    }
  }
  ?>

  <form method="post" action="">
    <label for="start_date">Start Date:</label>
    <input type="date" name="start_date" id="start_date" required>
    
    <label for="end_date">End Date:</label>
    <input type="date" name="end_date" id="end_date" required>
    
    <button type="submit" name="submit">Submit</button>
    
    <button type="button" onclick="setDateRange('week')">This Week</button>
    <button type="button" onclick="setDateRange('month')">This Month</button>
  </form>

  <script>
  function setDateRange(range) {
    const today = new Date();
    let startDate, endDate;

    if (range === 'week') {
    const firstDayOfWeek = today.getDate() - today.getDay();
    startDate = new Date(today.setDate(firstDayOfWeek));
    endDate = new Date(today.setDate(firstDayOfWeek + 6));
    } else if (range === 'month') {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    }

    document.getElementById('start_date').value = startDate.toISOString().split('T')[0];
    document.getElementById('end_date').value = endDate.toISOString().split('T')[0];
  }
  </script>

  <?php if (isset($scanLogs) && !empty($scanLogs)) { ?>
    <h3>Scan Logs from <?php echo $startDate; ?> to <?php echo $endDate; ?></h3>
    <table id="scanLogsTable" class="display nowrap" style="width:100%">
    <thead>
      <tr>
      <th>Name</th>
      <?php
      $period = new DatePeriod(
        new DateTime($startDate),
        new DateInterval('P1D'),
        (new DateTime($endDate))->modify('+1 day')
      );
      foreach ($period as $date) {
        echo "<th>" . $date->format('d (D)') . "</th>";
      }
      ?>
      </tr>
    </thead>
    <tbody>
      <?php foreach ($scanLogs as $name => $dates) { ?>
      <tr>
        <td><?php echo $name; ?></td>
        <?php foreach ($period as $date) { ?>
        <td>
          <?php
          $dateStr = $date->format('Y-m-d');
          if (isset($dates[$dateStr])) {
          echo implode(' | ', $dates[$dateStr]);
          } else {
          echo '-';
          }
          ?>
        </td>
        <?php } ?>
      </tr>
      <?php } ?>
    </tbody>
    </table>

    <!-- Include jQuery and DataTables JS and CSS files -->
    <link rel="stylesheet" type="text/css" href="https://cdn.datatables.net/1.11.3/css/jquery.dataTables.css">
    <link rel="stylesheet" type="text/css" href="https://cdn.datatables.net/responsive/2.2.9/css/responsive.dataTables.min.css">
    <script type="text/javascript" charset="utf8" src="https://code.jquery.com/jquery-3.5.1.js"></script>
    <script type="text/javascript" charset="utf8" src="https://cdn.datatables.net/1.11.3/js/jquery.dataTables.js"></script>
    <script type="text/javascript" charset="utf8" src="https://cdn.datatables.net/responsive/2.2.9/js/dataTables.responsive.min.js"></script>

    <script>
    $(document).ready(function() {
      $('#scanLogsTable').DataTable({
      "scrollX": true,
      "scrollY": "400px",
      "paging": true,
      "responsive": true
      });
    });
    </script>
  <?php } ?>

<?php
// Include the database connection file
include '../koneksidb.php';

// Fetch data from the tb_karyawan table
$sqldev = mysqli_query($conn, "SELECT * FROM tb_karyawan");

// Check if the query was successful
if (!$sqldev) {
  die("Error fetching data: " . mysqli_error($conn));
}

// Handle form submission
if (isset($_POST['submit'])) {
  $idUser = $_POST['karyawan'];
  if (!empty($idUser)) {
    $sqltemplate = mysqli_query($conn, "SELECT * FROM tb_scanlog WHERE pin = $idUser ORDER BY scan_date");

    // Check if the query was successful
    if (!$sqltemplate) {
      die("Error fetching data: " . mysqli_error($conn));
    }

    // Group scan logs by date
    $scanLogs = [];
    while ($row = mysqli_fetch_assoc($sqltemplate)) {
      $date = date('Y-m-d', strtotime($row['scan_date']));
      $scanLogs[$date][] = $row;
    }
  } else {
    echo "<p style='color:red;'>Please select a karyawan.</p>";
  }
}
?>

<form method="post" action="">
  <label for="karyawan">Select Karyawan:</label>
  <select name="karyawan" id="karyawan">
    <?php while ($row = mysqli_fetch_assoc($sqldev)) { ?>
      <option value="<?php echo $row['pin']; ?>"><?php echo $row['nama']; ?></option>
    <?php } ?>
  </select>
  <button type="submit" name="submit">Submit</button>
</form>

<?php if (isset($scanLogs) && !empty($scanLogs)) { ?>
  <h3>Selected Karyawan: 
    <?php 
      $karyawan = mysqli_fetch_assoc(mysqli_query($conn, "SELECT nama FROM tb_karyawan WHERE pin = $idUser"));
      echo $karyawan['nama']; 
    ?>
  </h3>
  <table class="table table-condensed">
    <tr>
      <th>Scan Date</th>
      <th>Verify Mode</th>
      <!-- Add other columns as needed -->
    </tr>
    <?php foreach ($scanLogs as $date => $logs) { ?>
      <tr>
      <td><?php echo $date . " (" . strftime('%A', strtotime($date)) . ")"; ?></td>
      <td>
      <?php 
      foreach ($logs as $log) {
        echo date('H:i:s', strtotime($log['scan_date'])) . " | "; // Add scan time
        echo $log['verifymode'];
        if ($log['verifymode'] == 1) {
        echo " | finger print";
        } elseif ($log['verifymode'] == 20) {
        echo " | face recognition";
        } elseif ($log['verifymode'] == 30) {
        echo " | vein scan";
        } else {
        echo " | unknown";
        }
        echo "<br>";
      }
      ?>
      </td>
      <!-- Add other columns as needed -->
      </tr>
    <?php } ?>
  </table>
<?php } ?>
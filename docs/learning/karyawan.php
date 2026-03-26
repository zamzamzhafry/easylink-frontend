<?php
// Include the database connection file
include '../koneksidb.php';

// Pagination settings
$limit = 10; // Number of entries to show in a page.
if (isset($_GET["page"])) {
	$page  = $_GET["page"];
} else {
	$page = 1;
};
$start_from = ($page - 1) * $limit;

// Fetch data from the tb_karyawan table with pagination
$sqldev = mysqli_query($conn, "SELECT * FROM tb_karyawan LIMIT $start_from, $limit");

// Fetch data from the tb_user table
$sqluser = mysqli_query($conn, "SELECT pin, nama FROM tb_user");

// Check if the query was successful
if (!$sqldev) {
	die("Error fetching data: " . mysqli_error($conn));
}

if (!$sqluser) {
	die("Error fetching user data: " . mysqli_error($conn));
}
?>

<h3>Data Karyawan</h3>
<table class="table table-hover">
	<thead>
		<tr>
			<th>Nama</th>
			<th>Awal Kontrak</th>
			<th>Akhir Kontrak</th>
			<th>PIN - Nama</th>
		</tr>
	</thead>
	<tbody>
		<?php
		// Loop through the result set and display data in the table
		while ($row = mysqli_fetch_assoc($sqldev)) {
			echo "<tr>";
			echo "<td>" . htmlspecialchars($row['nama']) . "</td>";
			echo "<td>" . htmlspecialchars($row['awal_kontrak']) . "</td>";
			echo "<td>" . htmlspecialchars($row['akhir_kontrak']) . "</td>";
			// Find the corresponding user data
			$user_pin_nama = '';
			mysqli_data_seek($sqluser, 0); // Reset the pointer for the user query result
			while ($user = mysqli_fetch_assoc($sqluser)) {
				if ($user['pin'] == $row['pin']) {
					$user_pin_nama = htmlspecialchars($user['pin']) . " - " . htmlspecialchars($user['nama']);
					break;
				}
			}
			echo "<td>" . $user_pin_nama . "</td>";
			echo "</tr>";
		}
		?>
	</tbody>
</table>

<?php
// Pagination
$result_db = mysqli_query($conn, "SELECT COUNT(id) FROM tb_karyawan");
$row_db = mysqli_fetch_row($result_db);
$total_records = $row_db[0];
$total_pages = ceil($total_records / $limit);
$pagLink = "<nav><ul class='pagination'>";
for ($i = 1; $i <= $total_pages; $i++) {
	$pagLink .= "<li class='page-item'><a class='page-link' href='index.php?m=content&p=karyawan&page=" . $i . "'>" . $i . "</a></li>";
}
echo $pagLink . "</ul></nav>";
?>

</body>
</html>

<?php
// Close the database connection
mysqli_close($conn);
?>

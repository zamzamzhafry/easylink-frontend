/**
 * Excel Export Utilities for EasyLink Absensi Reports
 * Uses ExcelJS with styling, multi-sheet, auto-filter, and conditional formatting
 */

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('id-ID', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  });
}

function formatTimestamp() {
  return new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function applyHeaderStyle(worksheet, rowNumber) {
  const headerRow = worksheet.getRow(rowNumber);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF3B82F6' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 20;
}

function autoFitColumns(worksheet) {
  worksheet.columns.forEach(column => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: false }, cell => {
      const cellValue = cell.value ? cell.value.toString() : '';
      maxLength = Math.max(maxLength, cellValue.length);
    });
    column.width = Math.min(Math.max(maxLength + 2, 10), 50);
  });
}

function addAutoFilter(worksheet, rowNumber, columnCount) {
  worksheet.autoFilter = {
    from: { row: rowNumber, column: 1 },
    to: { row: rowNumber, column: columnCount }
  };
}

function downloadWorkbook(workbook, filename) {
  workbook.xlsx.writeBuffer().then(buffer => {
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
  });
}

/**
 * Export Analytics Report to Excel
 * @param {Object} data - Analytics data with metrics, bradfordFactors, departmentBreakdown, weeklyTrend, checkInDistribution
 * @param {Object} filters - Filter parameters (from, to, group)
 */
export async function exportAnalyticsExcel(data, filters = {}) {
  try {
    if (typeof window === 'undefined') {
      throw new Error('Excel export must run in browser environment');
    }

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'EasyLink Absensi';
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['EasyLink Absensi - Analytics Report']);
    summarySheet.addRow([`Period: ${formatDate(filters.from)} - ${formatDate(filters.to)}`]);
    summarySheet.addRow([`Generated: ${formatTimestamp()}`]);
    summarySheet.addRow([]);

    if (data.metrics) {
      const metrics = data.metrics;
      summarySheet.addRow(['Metric', 'Value']);
      applyHeaderStyle(summarySheet, 5);
      
      summarySheet.addRow(['Attendance Rate', metrics.attendanceRate / 100]);
      summarySheet.addRow(['Punctuality Index', metrics.punctualityIndex / 100]);
      summarySheet.addRow(['Avg Late Minutes', metrics.avgLateMinutes]);
      summarySheet.addRow(['Total Overtime (hours)', metrics.totalOvertime]);

      summarySheet.getColumn(2).numFmt = '0.0%';
      summarySheet.getCell('B6').numFmt = '0.0%';
      summarySheet.getCell('B7').numFmt = '0.0%';
      summarySheet.getCell('B8').numFmt = '0';
      summarySheet.getCell('B9').numFmt = '0.0';
    }

    autoFitColumns(summarySheet);

    if (data.bradfordFactors && data.bradfordFactors.length > 0) {
      const bradfordSheet = workbook.addWorksheet('Bradford Factor');
      bradfordSheet.addRow(['Employee', 'Group', 'Frequency', 'Total Days', 'Bradford Score']);
      applyHeaderStyle(bradfordSheet, 1);

      data.bradfordFactors.forEach(row => {
        bradfordSheet.addRow([
          row.nama || '-',
          row.group || '-',
          row.frequency,
          row.totalDays,
          row.bradfordScore
        ]);
      });

      addAutoFilter(bradfordSheet, 1, 5);
      autoFitColumns(bradfordSheet);

      bradfordSheet.getColumn(5).eachCell({ includeEmpty: false }, (cell, rowNumber) => {
        if (rowNumber > 1 && cell.value > 500) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFECACA' }
          };
        }
      });
    }

    if (data.departmentBreakdown && data.departmentBreakdown.length > 0) {
      const deptSheet = workbook.addWorksheet('Department');
      deptSheet.addRow(['Group', 'Employees', 'Present Days', 'Late Days', 'Absent Days', 'Attendance Rate']);
      applyHeaderStyle(deptSheet, 1);

      data.departmentBreakdown.forEach(row => {
        deptSheet.addRow([
          row.group_name || '-',
          row.totalEmployees,
          row.presentDays,
          row.lateDays,
          row.absentDays,
          row.attendanceRate / 100
        ]);
      });

      addAutoFilter(deptSheet, 1, 6);
      deptSheet.getColumn(6).numFmt = '0.0%';
      autoFitColumns(deptSheet);

      deptSheet.getColumn(6).eachCell({ includeEmpty: false }, (cell, rowNumber) => {
        if (rowNumber > 1) {
          if (cell.value >= 0.95) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFD1FAE5' }
            };
          } else if (cell.value < 0.80) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFECACA' }
            };
          }
        }
      });
    }

    if (data.weeklyTrend && data.weeklyTrend.length > 0) {
      const trendSheet = workbook.addWorksheet('Weekly Trend');
      trendSheet.addRow(['Week', 'Attendance %', 'Punctuality %', 'Late %']);
      applyHeaderStyle(trendSheet, 1);

      data.weeklyTrend.forEach(row => {
        trendSheet.addRow([
          row.week || '-',
          row.attendanceRate / 100,
          row.punctualityRate / 100,
          row.lateRate / 100
        ]);
      });

      addAutoFilter(trendSheet, 1, 4);
      trendSheet.getColumn(2).numFmt = '0.0%';
      trendSheet.getColumn(3).numFmt = '0.0%';
      trendSheet.getColumn(4).numFmt = '0.0%';
      autoFitColumns(trendSheet);
    }

    if (data.checkInDistribution && data.checkInDistribution.length > 0) {
      const distSheet = workbook.addWorksheet('Check-in Distribution');
      distSheet.addRow(['Hour', 'Count']);
      applyHeaderStyle(distSheet, 1);

      data.checkInDistribution.forEach(row => {
        distSheet.addRow([
          row.hour || '-',
          row.count
        ]);
      });

      addAutoFilter(distSheet, 1, 2);
      autoFitColumns(distSheet);
    }

    const filename = `analytics_${filters.from || 'all'}_${filters.to || 'all'}.xlsx`;
    downloadWorkbook(workbook, filename);

  } catch (error) {
    console.error('Excel export failed:', error);
    throw new Error(`Failed to export Excel: ${error.message}`);
  }
}

/**
 * Export Performance Report to Excel
 * @param {Object} data - Performance data with summary and daily arrays
 * @param {Object} filters - Filter parameters (from, to, group)
 */
export async function exportPerformanceExcel(data, filters = {}) {
  try {
    if (typeof window === 'undefined') {
      throw new Error('Excel export must run in browser environment');
    }

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'EasyLink Absensi';
    workbook.created = new Date();

    if (data.summary && data.summary.length > 0) {
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.addRow(['EasyLink Absensi - Performance Report']);
      summarySheet.addRow([`Period: ${formatDate(filters.from)} - ${formatDate(filters.to)}`]);
      summarySheet.addRow([`Generated: ${formatTimestamp()}`]);
      summarySheet.addRow([]);

      summarySheet.addRow(['Employee', 'PIN', 'Group', 'Total Days', 'On Time', 'Late', 'Early Leave', 'Anomaly', 'Late Rate']);
      applyHeaderStyle(summarySheet, 5);

      data.summary.forEach(row => {
        summarySheet.addRow([
          row.nama || '-',
          row.pin || '-',
          row.group || '-',
          row.total_days,
          row.on_time_days,
          row.late_days,
          row.early_days,
          row.anomaly_days,
          row.late_rate / 100
        ]);
      });

      addAutoFilter(summarySheet, 5, 9);
      summarySheet.getColumn(9).numFmt = '0.0%';
      autoFitColumns(summarySheet);

      summarySheet.getColumn(9).eachCell({ includeEmpty: false }, (cell, rowNumber) => {
        if (rowNumber > 5) {
          if (cell.value > 0.20) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFECACA' }
            };
          } else if (cell.value === 0) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFD1FAE5' }
            };
          }
        }
      });
    }

    if (data.daily && data.daily.length > 0) {
      const dailySheet = workbook.addWorksheet('Daily');
      dailySheet.addRow(['Date', 'On Time', 'Late', 'Early Leave', 'Anomaly', 'Total']);
      applyHeaderStyle(dailySheet, 1);

      data.daily.forEach(row => {
        dailySheet.addRow([
          formatDate(row.tanggal),
          row.on_time,
          row.late,
          row.early,
          row.anomaly,
          row.total
        ]);
      });

      addAutoFilter(dailySheet, 1, 6);
      autoFitColumns(dailySheet);
    }

    const filename = `performance_${filters.from || 'all'}_${filters.to || 'all'}.xlsx`;
    downloadWorkbook(workbook, filename);

  } catch (error) {
    console.error('Excel export failed:', error);
    throw new Error(`Failed to export Excel: ${error.message}`);
  }
}

/**
 * Export Attendance Report to Excel
 * @param {Object} data - Report data with series (pie, bar) and drilldown rows
 * @param {Object} filters - Filter parameters (from, to, group)
 */
export async function exportReportExcel(data, filters = {}) {
  try {
    if (typeof window === 'undefined') {
      throw new Error('Excel export must run in browser environment');
    }

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'EasyLink Absensi';
    workbook.created = new Date();

    if (data.series && data.series.pie && data.series.pie.length > 0) {
      const overviewSheet = workbook.addWorksheet('Overview');
      overviewSheet.addRow(['EasyLink Absensi - Attendance Report']);
      overviewSheet.addRow([`Period: ${formatDate(filters.from)} - ${formatDate(filters.to)}`]);
      overviewSheet.addRow([`Generated: ${formatTimestamp()}`]);
      overviewSheet.addRow([]);

      overviewSheet.addRow(['Status', 'Count', 'Percentage']);
      applyHeaderStyle(overviewSheet, 5);

      const total = data.series.pie.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

      data.series.pie.forEach(item => {
        overviewSheet.addRow([
          item.name || '-',
          item.value,
          total > 0 ? item.value / total : 0
        ]);
      });

      overviewSheet.getColumn(3).numFmt = '0.0%';
      autoFitColumns(overviewSheet);
    }

    if (data.series && data.series.bar && data.series.bar.categories && data.series.bar.series) {
      const groupSheet = workbook.addWorksheet('By Group');
      const categories = data.series.bar.categories;
      const series = data.series.bar.series;

      const headerRow = ['Group'];
      series.forEach(s => headerRow.push(s.name));
      groupSheet.addRow(headerRow);
      applyHeaderStyle(groupSheet, 1);

      categories.forEach((category, idx) => {
        const row = [category];
        series.forEach(s => {
          row.push(s.data[idx] || 0);
        });
        groupSheet.addRow(row);
      });

      addAutoFilter(groupSheet, 1, headerRow.length);
      autoFitColumns(groupSheet);
    }

    if (data.drilldown && data.drilldown.rows && data.drilldown.rows.length > 0) {
      const drilldownSheet = workbook.addWorksheet('Drilldown');
      drilldownSheet.addRow(['Employee', 'Date', 'Shift', 'Scheduled In', 'Scheduled Out', 'Actual In', 'Actual Out', 'Scan Count', 'Worked Minutes']);
      applyHeaderStyle(drilldownSheet, 1);

      data.drilldown.rows.forEach(row => {
        drilldownSheet.addRow([
          row.nama || '-',
          formatDate(row.scan_date),
          row.nama_shift || '-',
          row.scheduled_in || '-',
          row.scheduled_out || '-',
          row.actual_in || '-',
          row.actual_out || '-',
          row.scan_count,
          row.worked_minutes
        ]);
      });

      addAutoFilter(drilldownSheet, 1, 9);
      autoFitColumns(drilldownSheet);
    }

    const filename = `report_${filters.from || 'all'}_${filters.to || 'all'}.xlsx`;
    downloadWorkbook(workbook, filename);

  } catch (error) {
    console.error('Excel export failed:', error);
    throw new Error(`Failed to export Excel: ${error.message}`);
  }
}

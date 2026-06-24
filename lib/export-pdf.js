/**
 * PDF Export Utilities for EasyLink Absensi Reports
 * Uses jsPDF + jspdf-autotable with dynamic imports for code splitting
 */

import { formatDateDisplay } from './format-date.js';

const formatDate = formatDateDisplay;

// Helper: Format timestamp
function formatTimestamp() {
  return new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Helper: Format percentage
function formatPercent(value) {
  if (value == null || isNaN(value)) return '0.0%';
  return `${Number(value).toFixed(1)}%`;
}

// Helper: Format number
function formatNumber(value) {
  if (value == null || isNaN(value)) return '0';
  return Number(value).toLocaleString('id-ID');
}

// Helper: Add page numbers
function addPageNumbers(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }
}

// Helper: Add header section
function addHeader(doc, title, filters) {
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text(`EasyLink Absensi - ${title}`, 14, 15);
  
  doc.setFontSize(9);
  doc.setTextColor(100);
  let yPos = 22;
  
  if (filters.from && filters.to) {
    doc.text(`Period: ${formatDate(filters.from)} - ${formatDate(filters.to)}`, 14, yPos);
    yPos += 5;
  }
  
  if (filters.group && filters.group !== 'all') {
    doc.text(`Group: ${filters.group}`, 14, yPos);
    yPos += 5;
  }
  
  doc.text(`Generated: ${formatTimestamp()}`, 14, yPos);
  
  return yPos + 8; // Return next available Y position
}

/**
 * Export Analytics Report to PDF
 * @param {Object} data - Analytics data with metrics, bradfordFactors, departmentBreakdown, weeklyTrend, checkInDistribution
 * @param {Object} filters - Filter parameters (from, to, group)
 */
export async function exportAnalyticsPDF(data, filters = {}) {
  try {
    if (typeof window === 'undefined') {
      throw new Error('PDF export must run in browser environment');
    }

    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    let yPos = addHeader(doc, 'Analytics Report', filters);

    // Summary Metrics
    if (data.metrics) {
      const metrics = data.metrics;
      doc.autoTable({
        startY: yPos,
        head: [['Metric', 'Value']],
        body: [
          ['Attendance Rate', formatPercent(metrics.attendanceRate)],
          ['Punctuality Index', formatPercent(metrics.punctualityIndex)],
          ['Avg Late Minutes', formatNumber(metrics.avgLateMinutes)],
          ['Total Overtime (hours)', formatNumber(metrics.totalOvertime)]
        ],
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: 'bold' } }
      });
      yPos = doc.lastAutoTable.finalY + 10;
    }

    // Bradford Factor Table
    if (data.bradfordFactors && data.bradfordFactors.length > 0) {
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text('Bradford Factor Analysis', 14, yPos);
      yPos += 5;

      doc.autoTable({
        startY: yPos,
        head: [['Employee', 'Group', 'Frequency', 'Total Days', 'Bradford Score']],
        body: data.bradfordFactors.map(row => [
          row.nama || '-',
          row.group || '-',
          formatNumber(row.frequency),
          formatNumber(row.totalDays),
          formatNumber(row.bradfordScore)
        ]),
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 247, 250] }
      });
      yPos = doc.lastAutoTable.finalY + 10;
    }

    // Department Breakdown
    if (data.departmentBreakdown && data.departmentBreakdown.length > 0) {
      if (yPos > 160) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text('Department Breakdown', 14, yPos);
      yPos += 5;

      doc.autoTable({
        startY: yPos,
        head: [['Group', 'Employees', 'Present', 'Late', 'Absent', 'Attendance Rate']],
        body: data.departmentBreakdown.map(row => [
          row.group_name || '-',
          formatNumber(row.totalEmployees),
          formatNumber(row.presentDays),
          formatNumber(row.lateDays),
          formatNumber(row.absentDays),
          formatPercent(row.attendanceRate)
        ]),
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 247, 250] }
      });
      yPos = doc.lastAutoTable.finalY + 10;
    }

    // Weekly Trend
    if (data.weeklyTrend && data.weeklyTrend.length > 0) {
      if (yPos > 160) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text('Weekly Trend', 14, yPos);
      yPos += 5;

      doc.autoTable({
        startY: yPos,
        head: [['Week', 'Attendance %', 'Punctuality %', 'Late %']],
        body: data.weeklyTrend.map(row => [
          row.week || '-',
          formatPercent(row.attendanceRate),
          formatPercent(row.punctualityRate),
          formatPercent(row.lateRate)
        ]),
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 247, 250] }
      });
    }

    // Check-in Distribution
    if (data.checkInDistribution && data.checkInDistribution.length > 0) {
      doc.addPage();
      yPos = 20;

      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text('Check-in Time Distribution', 14, yPos);
      yPos += 5;

      doc.autoTable({
        startY: yPos,
        head: [['Hour', 'Count']],
        body: data.checkInDistribution.map(row => [
          row.hour || '-',
          formatNumber(row.count)
        ]),
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 247, 250] }
      });
    }

    addPageNumbers(doc);

    const filename = `analytics_${filters.from || 'all'}_${filters.to || 'all'}.pdf`;
    doc.save(filename);

  } catch (error) {
    console.error('PDF export failed:', error);
    throw new Error(`Failed to export PDF: ${error.message}`);
  }
}

/**
 * Export Performance Report to PDF
 * @param {Object} data - Performance data with summary and daily arrays
 * @param {Object} filters - Filter parameters (from, to, group)
 */
export async function exportPerformancePDF(data, filters = {}) {
  try {
    if (typeof window === 'undefined') {
      throw new Error('PDF export must run in browser environment');
    }

    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    let yPos = addHeader(doc, 'Performance Report', filters);

    // Summary Statistics
    if (data.summary && data.summary.length > 0) {
      const totals = data.summary.reduce((acc, row) => ({
        total_days: acc.total_days + (Number(row.total_days) || 0),
        on_time_days: acc.on_time_days + (Number(row.on_time_days) || 0),
        late_days: acc.late_days + (Number(row.late_days) || 0),
        early_days: acc.early_days + (Number(row.early_days) || 0),
        anomaly_days: acc.anomaly_days + (Number(row.anomaly_days) || 0)
      }), { total_days: 0, on_time_days: 0, late_days: 0, early_days: 0, anomaly_days: 0 });

      doc.autoTable({
        startY: yPos,
        head: [['Metric', 'Value']],
        body: [
          ['Total Days', formatNumber(totals.total_days)],
          ['On Time', formatNumber(totals.on_time_days)],
          ['Late', formatNumber(totals.late_days)],
          ['Early Leave', formatNumber(totals.early_days)],
          ['Anomaly', formatNumber(totals.anomaly_days)]
        ],
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: 'bold' } }
      });
      yPos = doc.lastAutoTable.finalY + 10;
    }

    // Employee Performance Detail
    if (data.summary && data.summary.length > 0) {
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text('Employee Performance', 14, yPos);
      yPos += 5;

      doc.autoTable({
        startY: yPos,
        head: [['Employee', 'PIN', 'Group', 'Total', 'On Time', 'Late', 'Early', 'Anomaly', 'Late %']],
        body: data.summary.map(row => [
          row.nama || '-',
          row.pin || '-',
          row.group || '-',
          formatNumber(row.total_days),
          formatNumber(row.on_time_days),
          formatNumber(row.late_days),
          formatNumber(row.early_days),
          formatNumber(row.anomaly_days),
          formatPercent(row.late_rate)
        ]),
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 7 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 15 },
          2: { cellWidth: 25 }
        }
      });
    }

    // Daily Breakdown
    if (data.daily && data.daily.length > 0) {
      doc.addPage();
      yPos = 20;

      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text('Daily Breakdown', 14, yPos);
      yPos += 5;

      doc.autoTable({
        startY: yPos,
        head: [['Date', 'On Time', 'Late', 'Early Leave', 'Anomaly', 'Total']],
        body: data.daily.map(row => [
          formatDate(row.tanggal),
          formatNumber(row.on_time),
          formatNumber(row.late),
          formatNumber(row.early),
          formatNumber(row.anomaly),
          formatNumber(row.total)
        ]),
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 247, 250] }
      });
    }

    addPageNumbers(doc);

    const filename = `performance_${filters.from || 'all'}_${filters.to || 'all'}.pdf`;
    doc.save(filename);

  } catch (error) {
    console.error('PDF export failed:', error);
    throw new Error(`Failed to export PDF: ${error.message}`);
  }
}

/**
 * Export Attendance Report to PDF
 * @param {Object} data - Report data with series (pie, bar) and drilldown rows
 * @param {Object} filters - Filter parameters (from, to, group)
 */
export async function exportReportPDF(data, filters = {}) {
  try {
    if (typeof window === 'undefined') {
      throw new Error('PDF export must run in browser environment');
    }

    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    let yPos = addHeader(doc, 'Attendance Report', filters);

    // Status Summary (from pie chart data)
    if (data.series && data.series.pie && data.series.pie.length > 0) {
      const total = data.series.pie.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

      doc.autoTable({
        startY: yPos,
        head: [['Status', 'Count', 'Percentage']],
        body: data.series.pie.map(item => [
          item.name || '-',
          formatNumber(item.value),
          formatPercent(total > 0 ? (item.value / total) * 100 : 0)
        ]),
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9 }
      });
      yPos = doc.lastAutoTable.finalY + 10;
    }

    // Drilldown Detail
    if (data.drilldown && data.drilldown.rows && data.drilldown.rows.length > 0) {
      if (yPos > 160) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text('Attendance Detail', 14, yPos);
      yPos += 5;

      doc.autoTable({
        startY: yPos,
        head: [['Employee', 'Date', 'Shift', 'Scheduled In', 'Scheduled Out', 'Actual In', 'Actual Out', 'Scans', 'Worked (min)']],
        body: data.drilldown.rows.map(row => [
          row.nama || '-',
          formatDate(row.scan_date),
          row.nama_shift || '-',
          row.scheduled_in || '-',
          row.scheduled_out || '-',
          row.actual_in || '-',
          row.actual_out || '-',
          formatNumber(row.scan_count),
          formatNumber(row.worked_minutes)
        ]),
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 7 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 22 },
          2: { cellWidth: 20 }
        }
      });
    }

    addPageNumbers(doc);

    const filename = `report_${filters.from || 'all'}_${filters.to || 'all'}.pdf`;
    doc.save(filename);

  } catch (error) {
    console.error('PDF export failed:', error);
    throw new Error(`Failed to export PDF: ${error.message}`);
  }
}

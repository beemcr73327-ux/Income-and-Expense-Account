// ==============================================================================
// Google Apps Script (v4 - อัปเดตล่าสุดสำหรับ Sync, UpdateRow และ DeleteRow)
// ==============================================================================

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. ดึงข้อมูลจากชีต "วางแผนรายรับ รายจ่าย"
    var budgetSheet = ss.getSheetByName("วางแผนรายรับ รายจ่าย");
    var budgetData = [];
    if (budgetSheet) {
      budgetData = budgetSheet.getRange("A1:BR100").getValues();
    }
    
    // 2. ดึงข้อมูลเงื่อนไขจากชีต "DailyA/B" (A2:C100)
    var dailyAbSheet = ss.getSheetByName("DailyA/B");
    var dailyAbData = [];
    if (dailyAbSheet) {
      dailyAbData = dailyAbSheet.getRange("A2:C100").getValues();
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      data: budgetData,
      daily_ab: dailyAbData
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    
    // ดึงปีจากวันที่ของรายการ หรือปีปัจจุบัน
    var targetYear = new Date().getFullYear().toString();
    if (payload.date) {
      var dateParts = String(payload.date).split('-');
      if (dateParts.length === 3) targetYear = dateParts[0];
    } else if (payload.old_date) {
      var oldParts = String(payload.old_date).split('-');
      if (oldParts.length === 3) targetYear = oldParts[0];
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(targetYear);
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("2026");
    }

    // --------------------------------------------------------------------------
    // CASE 1: ลบรายการเดิม (action === 'deleteRow')
    // --------------------------------------------------------------------------
    if (payload.action === 'deleteRow') {
      var searchCol = 4; // D (รายรับ)
      var numCols = 4;
      if (payload.type === 'รายจ่าย') { searchCol = 10; numCols = 4; } // J (รายจ่าย)
      if (payload.type === 'เงินออม/ลงทุน' || payload.type === 'saving') { searchCol = 16; numCols = 6; } // P (ออม)

      var foundRow = findRowInSheet(sheet, searchCol, payload.date, payload.category, payload.amount);
      if (foundRow !== -1) {
        // เคลียร์ค่าในบล็อกเซลล์นั้นออกให้เป็นค่าว่าง (เพื่อให้ทั้งเว็บแอปและ Google Sheet ลบออกตรงกัน)
        sheet.getRange(foundRow, searchCol, 1, numCols).clearContent();
        return ContentService.createTextOutput(JSON.stringify({ success: true, deletedRow: foundRow }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Row not found in sheet, DB deleted" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // --------------------------------------------------------------------------
    // CASE 2: แก้ไขรายการเดิม (action === 'updateRow')
    // --------------------------------------------------------------------------
    if (payload.action === 'updateRow') {
      var searchCol = 4;
      if (payload.old_type === 'รายจ่าย') searchCol = 10;
      if (payload.old_type === 'เงินออม/ลงทุน' || payload.old_type === 'saving') searchCol = 16;

      var foundRow = findRowInSheet(sheet, searchCol, payload.old_date, payload.old_category, payload.old_amount);

      // ถ้าไม่เจอตาม old_date ให้ลองค้นตาม old_category และ old_amount เผื่อฟอร์แมตวันที่ต่างกัน
      if (foundRow === -1) {
        foundRow = findRowFallback(sheet, searchCol, payload.old_category, payload.old_amount);
      }

      if (foundRow !== -1) {
        // อัปเดตทับบรรทัดเดิมด้วยข้อมูลใหม่
        if (payload.type === 'รายรับ') {
          sheet.getRange(foundRow, 4, 1, 4).setValues([[payload.date, payload.category, payload.amount, payload.note || ""]]);
        } else if (payload.type === 'รายจ่าย') {
          sheet.getRange(foundRow, 10, 1, 4).setValues([[payload.date, payload.category, payload.amount, payload.note || ""]]);
        } else if (payload.type === 'เงินออม/ลงทุน' || payload.type === 'saving') {
          sheet.getRange(foundRow, 16, 1, 6).setValues([
            [payload.date, payload.category, payload.amount, payload.saving_type || "", payload.saving_group || "", payload.note || ""]
          ]);
        }
        return ContentService.createTextOutput(JSON.stringify({ success: true, updatedRow: foundRow }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // --------------------------------------------------------------------------
    // CASE 3: เพิ่มรายการใหม่ปกติ (appendRow)
    // --------------------------------------------------------------------------
    if (payload.type === 'รายรับ') {
      var lastRow = getLastRowInCol(sheet, 4); 
      var targetRow = Math.max(17, lastRow + 1);
      sheet.getRange(targetRow, 4, 1, 4).setValues([[payload.date, payload.category, payload.amount, payload.note || ""]]);
      
    } else if (payload.type === 'รายจ่าย') {
      var lastRow = getLastRowInCol(sheet, 10); 
      var targetRow = Math.max(17, lastRow + 1);
      sheet.getRange(targetRow, 10, 1, 4).setValues([[payload.date, payload.category, payload.amount, payload.note || ""]]);
      
    } else if (payload.type === 'เงินออม/ลงทุน' || payload.type === 'saving') {
      var lastRow = getLastRowInCol(sheet, 16); 
      var targetRow = Math.max(17, lastRow + 1);
      sheet.getRange(targetRow, 16, 1, 6).setValues([
        [payload.date, payload.category, payload.amount, payload.saving_type || "", payload.saving_group || "", payload.note || ""]
      ]);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// --------------------------------------------------------------------------
// HELPER FUNCTIONS
// --------------------------------------------------------------------------

function formatCellDate(cellVal) {
  if (!cellVal) return "";
  if (cellVal instanceof Date) {
    var yyyy = cellVal.getFullYear();
    var mm = String(cellVal.getMonth() + 1).padStart(2, '0');
    var dd = String(cellVal.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }
  var str = String(cellVal).trim();
  if (str.match(/^\d{4}-\d{2}-\d{2}/)) {
    return str.substring(0, 10);
  }
  if (str.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
    var parts = str.split('/');
    var dd = parts[0].padStart(2, '0');
    var mm = parts[1].padStart(2, '0');
    var yyyy = parts[2];
    return yyyy + '-' + mm + '-' + dd;
  }
  return str;
}

function findRowInSheet(sheet, searchCol, targetDate, targetCat, targetAmount) {
  var lastRow = getLastRowInCol(sheet, searchCol);
  var formattedTargetDate = formatCellDate(targetDate);
  var trimmedTargetCat = String(targetCat || "").trim().toLowerCase();
  var numTargetAmount = Number(targetAmount || 0);

  for (var r = 17; r <= lastRow; r++) {
    var rowVals = sheet.getRange(r, searchCol, 1, 3).getValues()[0];
    var cellDate = formatCellDate(rowVals[0]);
    var cellCat = String(rowVals[1] || "").trim().toLowerCase();
    var cellAmount = Number(rowVals[2] || 0);

    if (cellDate === formattedTargetDate &&
        cellCat === trimmedTargetCat &&
        Math.abs(cellAmount - numTargetAmount) < 0.01) {
      return r;
    }
  }
  return -1;
}

function findRowFallback(sheet, searchCol, targetCat, targetAmount) {
  var lastRow = getLastRowInCol(sheet, searchCol);
  var trimmedTargetCat = String(targetCat || "").trim().toLowerCase();
  var numTargetAmount = Number(targetAmount || 0);

  for (var r = 17; r <= lastRow; r++) {
    var rowVals = sheet.getRange(r, searchCol, 1, 3).getValues()[0];
    var cellCat = String(rowVals[1] || "").trim().toLowerCase();
    var cellAmount = Number(rowVals[2] || 0);

    if (cellCat === trimmedTargetCat && Math.abs(cellAmount - numTargetAmount) < 0.01) {
      return r;
    }
  }
  return -1;
}

function getLastRowInCol(sheet, colIndex) {
  var values = sheet.getRange(1, colIndex, sheet.getMaxRows(), 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (values[i][0] != "") {
      return i + 1;
    }
  }
  return 16;
}

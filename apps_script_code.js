// ==============================================================================
// Google Apps Script (v3 - อัปเดตล่าสุดสำหรับ DailyA/B และการแก้ไขข้อมูล)
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
    var currentYear = new Date().getFullYear().toString();
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(currentYear);
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("2026");
    }

    // กรณีแก้ไขรายการแถวเดิม (action === 'updateRow')
    if (payload.action === 'updateRow') {
      var searchCol = 4; // ค่าเริ่มต้น D (รายรับ)
      if (payload.old_type === 'รายจ่าย') searchCol = 10; // J (รายจ่าย)
      if (payload.old_type === 'เงินออม/ลงทุน' || payload.old_type === 'saving') searchCol = 16; // P (ออม)

      var lastRow = getLastRowInCol(sheet, searchCol);
      var foundRow = -1;

      // วนลูปหาแถวเดิมจาก วันที่ + หมวดหมู่ + จำนวนเงินเดิม
      for (var r = 17; r <= lastRow; r++) {
        var rowVal = sheet.getRange(r, searchCol, 1, 3).getValues()[0]; // date, cat, amount
        var rDate = rowVal[0];
        var rCat = rowVal[1];
        var rAmount = rowVal[2];

        // แปลงวันที่ให้อยู่ในฟอร์ม string
        if (rDate instanceof Date) {
          var yyyy = rDate.getFullYear();
          var mm = String(rDate.getMonth() + 1).padStart(2, '0');
          var dd = String(rDate.getDate()).padStart(2, '0');
          rDate = yyyy + '-' + mm + '-' + dd;
        }

        if (String(rDate) === String(payload.old_date) && 
            String(rCat) === String(payload.old_category) && 
            Number(rAmount) === Number(payload.old_amount)) {
          foundRow = r;
          break;
        }
      }

      if (foundRow !== -1) {
        // อัปเดตทับบรรทัดเดิมที่เจอ
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

    // กรณีเพิ่มรายการใหม่ปกติ (appendRow)
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

function getLastRowInCol(sheet, colIndex) {
  var values = sheet.getRange(1, colIndex, sheet.getMaxRows(), 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (values[i][0] != "") {
      return i + 1;
    }
  }
  return 16;
}

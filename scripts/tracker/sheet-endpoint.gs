/**
 * SponsorX tracker — the Sheet's own endpoint (Google Apps Script).
 *
 * Paste into the published Sheet: Extensions → Apps Script. Deployed as a web
 * app, it lets the GitHub Action write tracker changes WITHOUT a service-account
 * key (the organisation policy disables those). Every request must carry the
 * shared secret stored in Script Properties as TRACKER_SECRET; anything else
 * is refused. It can only read a column, write cells and append rows on this
 * one spreadsheet.
 */
function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out({ error: "bad json" }); }
  var secret = PropertiesService.getScriptProperties().getProperty("TRACKER_SECRET");
  if (!secret || body.secret !== secret) return out({ error: "unauthorized" });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = body.tab ? ss.getSheetByName(body.tab) : null;
  if (body.op !== "update" && !sheet) return out({ error: "no tab " + body.tab });

  if (body.op === "column") {
    var last = Math.max(sheet.getLastRow(), 1);
    var col = sheet.getRange(body.letter + "1:" + body.letter + last).getDisplayValues();
    return out({ values: col.map(function (r) { return r[0]; }) });
  }
  if (body.op === "update") {
    (body.data || []).forEach(function (d) {
      // range like 'Phase 1'!I5
      var m = d.range.match(/^'(.+)'!([A-Z]+\d+)$/);
      if (m) ss.getSheetByName(m[1]).getRange(m[2]).setValue(d.values[0][0]);
    });
    return out({ updated: (body.data || []).length });
  }
  if (body.op === "append") {
    (body.rows || []).forEach(function (r) { sheet.appendRow(r); });
    return out({ appended: (body.rows || []).length });
  }
  return out({ error: "unknown op" });
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

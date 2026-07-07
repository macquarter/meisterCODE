/**
 * MAISON MEISTER 백엔드 — Google Apps Script (설치 자동화 버전)
 *
 * 이 스크립트는 첫 요청 때 스스로 준비를 끝냅니다:
 *  - 구글 드라이브에 "메종 마이스터 운영" 스프레드시트를 자동 생성
 *  - "초대코드", "예약" 탭과 헤더, 샘플 코드까지 자동 구성
 *
 * 사람이 할 일은 붙여넣기 → 배포 → 권한 허용, 이 세 가지뿐입니다. (README.md 참고)
 */

// 예약 알림을 받을 이메일. 비워두면 이 스크립트 소유자(나)의 이메일로 발송됩니다.
var NOTIFY_EMAIL = "";

var SS_NAME = "메종 마이스터 운영";
var CODE_SHEET = "초대코드";
var BOOKING_SHEET = "예약";

/** 운영 스프레드시트 확보 — 없으면 만들고, 탭·헤더가 없으면 채운다 */
function getSS_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("SHEET_ID");
  var ss = null;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(SS_NAME);
    props.setProperty("SHEET_ID", ss.getId());
  }

  if (!ss.getSheetByName(CODE_SHEET)) {
    var codes = ss.insertSheet(CODE_SHEET);
    codes.appendRow(["코드", "고객명", "상태", "만료일", "사용횟수", "마지막 사용"]);
    codes.appendRow(["MEISTER-VIP01", "샘플 고객", "활성", "2027-12-31", 0, ""]);
    codes.setFrozenRows(1);
  }
  if (!ss.getSheetByName(BOOKING_SHEET)) {
    var book = ss.insertSheet(BOOKING_SHEET);
    book.appendRow(["접수시각", "고객명", "초대코드", "작품", "서비스", "희망 날짜", "시간", "인원", "연락처", "요청사항"]);
    book.setFrozenRows(1);
  }
  /* 새 문서에 딸려온 빈 기본 시트 제거 */
  var first = ss.getSheets()[0];
  if (ss.getSheets().length > 2 && first.getName() !== CODE_SHEET &&
      first.getName() !== BOOKING_SHEET && first.getLastRow() === 0) {
    ss.deleteSheet(first);
  }
  return ss;
}

/** 웹 앱 진입점 — 사이트에서 오는 모든 요청 처리 */
function doPost(e) {
  var out = { ok: false, error: "잘못된 요청입니다." };
  try {
    var req = JSON.parse(e.postData.contents);
    if (req.action === "validate") out = validateCode(req);
    else if (req.action === "booking") out = saveBooking(req);
  } catch (err) {
    out = { ok: false, error: "요청 처리 중 오류가 발생했습니다." };
  }
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 배포 URL을 브라우저로 열면 상태 확인 + 최초 설치가 실행됩니다.
 * (배포 직후 한 번 열어보면 운영 시트 주소까지 알려줍니다)
 */
function doGet() {
  var ss = getSS_();
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true,
      service: "MAISON MEISTER API",
      sheet: ss.getUrl()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 초대 코드 검증: 존재 + 상태 "활성" + 만료일 이내 → 사용횟수 기록 */
function validateCode(req) {
  var code = String(req.code || "").trim().toUpperCase();
  if (!code) return { ok: false, error: "초대 코드를 입력해 주세요." };

  var sheet = getSS_().getSheetByName(CODE_SHEET);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toUpperCase() !== code) continue;

    if (String(rows[i][2]).trim() !== "활성") {
      return { ok: false, error: "사용이 중지된 초대 코드입니다." };
    }
    var exp = rows[i][3];
    if (exp) {
      var expDate = (exp instanceof Date) ? exp : new Date(String(exp));
      if (!isNaN(expDate.getTime())) {
        var endOfDay = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate(), 23, 59, 59);
        if (new Date() > endOfDay) return { ok: false, error: "만료된 초대 코드입니다." };
      }
    }
    sheet.getRange(i + 1, 5).setValue(Number(rows[i][4] || 0) + 1);
    sheet.getRange(i + 1, 6).setValue(new Date());
    return { ok: true, customer: String(rows[i][1] || "") };
  }
  return { ok: false, error: "초대 코드가 올바르지 않습니다." };
}

/** 예약 저장: "예약" 시트에 한 줄 추가 + 알림 이메일 발송 */
function saveBooking(req) {
  if (!String(req.phone || "").trim()) return { ok: false, error: "연락처를 입력해 주세요." };
  if (!req.date || !req.time) return { ok: false, error: "날짜와 시간을 선택해 주세요." };

  var ss = getSS_();
  var sheet = ss.getSheetByName(BOOKING_SHEET);

  sheet.appendRow([
    new Date(),
    req.name || "",
    req.code || "",
    req.product || "",
    req.serviceLabel || req.service || "",
    req.date,
    req.time,
    req.guests || "",
    "'" + req.phone, // 맨 앞 0 보존
    req.memo || ""
  ]);

  var to = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  try {
    MailApp.sendEmail(
      to,
      "[메종 마이스터] 새 컨시어지 예약 — " + (req.product || ""),
      "새 컨시어지 예약이 접수되었습니다.\n\n" +
      "■ 작품      : " + (req.product || "-") + "\n" +
      "■ 서비스    : " + (req.serviceLabel || req.service || "-") + "\n" +
      "■ 희망 일시 : " + req.date + " " + req.time + "\n" +
      "■ 인원      : " + (req.guests || "-") + "명\n" +
      "■ 고객      : " + (req.name || "-") + " / " + req.phone + "\n" +
      "■ 초대코드  : " + (req.code || "-") + "\n" +
      "■ 요청사항  : " + (req.memo || "-") + "\n\n" +
      "전체 예약 목록: " + ss.getUrl()
    );
  } catch (e) {
    // 메일 발송 실패해도 예약 자체는 시트에 저장되었으므로 성공 처리
  }
  return { ok: true };
}

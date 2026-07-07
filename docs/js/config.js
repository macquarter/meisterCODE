/**
 * 사이트 ↔ 백엔드 연결 설정
 *
 * API_URL: Google Apps Script 웹 앱 배포 URL (backend/apps-script/README.md 참고)
 *  - 비워두면 데모 모드로 동작: 공용 초대 코드 "MEISTER", 예약은 브라우저에만 저장
 *  - URL을 넣으면: 구글 시트의 고객별 초대 코드 검증 + 예약이 시트에 쌓이고 이메일 발송
 */
window.MEISTER_CONFIG = {
  API_URL: ""
};

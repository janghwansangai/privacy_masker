// 앱의 기본 설정값들을 중앙에서 관리하는 파일입니다.
// 향후 GitHub Releases API와 연동하여 동적으로 업데이트할 수 있습니다.

export const APP_CONFIG = {
  name: "문서 개인정보 마스킹 도구",
  description: "100% 오프라인으로 작동하는 안전한 개인정보 비식별화 솔루션",
  currentVersion: "v1.0.0",
  windowsDownloadUrl: "./downloads/pdf_masker.exe", // Windows 다운로드 링크
  macDownloadUrl: "./downloads/pdf_masker.dmg", // Mac 다운로드 링크
  features: [
    {
      title: "100% 오프라인 작동",
      description: "네트워크 연결 없이 기기 내에서 처리되어 데이터 유출 원천 차단",
    },
    {
      title: "규칙 기반 엔진 (No AI)",
      description: "AI를 사용하지 않고 명확한 정규식과 규칙을 사용하여 신뢰성 보장",
    },
    {
      title: "진짜 삭제 (Redaction)",
      description: "단순히 검은 박스로 덮는 것이 아니라 문서 내부의 텍스트 데이터 자체를 영구 소거",
    },
    {
      title: "다양한 포맷 지원",
      description: "PDF뿐만 아니라 Word(.docx), Excel(.xlsx) 파일까지 일괄 처리 가능",
    }
  ],
  githubRepo: "https://github.com/USERNAME/REPO", // 실제 주소로 변경 필요
};

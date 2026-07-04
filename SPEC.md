# 문서 개인정보 마스킹 도구 — 기술 명세서

> 이 문서의 목적: (1) 추가 개발(AS) 요청 시 맥락 파악, (2) 이 문서만 보고 동일한
> 프로그램을 처음부터 다시 작성할 수 있을 정도의 상세 스펙 제공.
> `PLAN.md`는 시간순 개발 일지이고, 이 문서는 **주제별로 재구성한 최종 스펙**입니다.
> 최신 소스 코드가 항상 우선이며, 이 문서와 코드가 다르면 코드가 맞습니다.

---

## 0. 한 줄 요약

PDF·워드(.docx)·엑셀(.xlsx) 문서에서 개인정보(주민번호·전화번호·이름·주소 등 14종)를
정규식 기반 규칙 엔진으로 탐지하여, 텍스트 데이터 자체를 삭제(redaction)하거나
지정한 문구로 치환한 뒤 새 파일로 저장하는 **완전 오프라인 Windows 데스크톱 프로그램**.
GUI(tkinter)와 CLI 두 가지 실행 방식을 제공하며, PyInstaller로 단일 exe 배포.

---

## 1. 핵심 설계 원칙 (변경 불가한 제약)

| 원칙 | 구현 방법 |
|---|---|
| **완전 오프라인** | 문서 처리 경로에 네트워크 코드 전혀 없음. 유일한 예외는 사용자가 명시적으로 동의한 "OCR 자동 설치"(설치 파일 다운로드만, 문서 내용 전송 없음) |
| **AI 미사용** | 정규식 + 문맥 규칙 기반. 머신러닝/LLM 호출 없음. 화면·설명서·양식 파일에 이 사실을 명시 |
| **개인정보 비저장** | 탐지된 개인정보 원문을 로그·파일에 기록하지 않음. 화면 리포트는 `mask_value()`로 마스킹된 값만 표시 (예: `900**********7`) |
| **진짜 삭제(redaction)** | 검은 박스로 "덮기"가 아니라 PyMuPDF `apply_redactions()`로 PDF 내부 텍스트 스트림 자체를 제거. 워드/엑셀은 셀/문단 텍스트를 직접 치환. 복사·검색·추출로 복구 불가 |
| **원본 불변** | 원본 파일은 절대 수정하지 않고 항상 새 파일(`_masked` 접미사)로 저장 |
| **저장 실패 방지** | 잔존 발견 시 파일을 삭제하지 않고 자동 재가공 → 안 되면 `(잔존주의)` 표시 후 저장 (v5 이후) |

---

## 2. 파일 구성

```
pdf_privacy_masker.py       핵심 엔진: 탐지 규칙, PDF 처리, OCR, CLI 진입점 (단독 실행 가능)
pdf_privacy_masker_gui.py   GUI (tkinter): 화면, 스레드, 단어 목록 연동, OCR 자동설치
office_masker.py            워드(.docx)·엑셀(.xlsx) 처리 (pdf_privacy_masker.detect() 재사용)
wordstore.py                사용자 단어 목록(항상 가림/제외/대체) 저장·가져오기·내보내기
build_windows.bat           Windows exe 빌드 스크립트 (PyInstaller)
requirements.txt            pymupdf, pytesseract, pillow, python-docx, openpyxl
PLAN.md                     개발 일지 (시간순, 참고용)
SPEC.md                     이 문서 (주제별 최종 스펙)
```

**의존 관계**: `pdf_privacy_masker_gui.py` → `pdf_privacy_masker.py` + `office_masker.py` +
`wordstore.py`. `office_masker.py` → `pdf_privacy_masker.detect/HIGH/TEACHER_HINTS`만 참조.
`pdf_privacy_masker.py`는 다른 모듈에 의존하지 않음(단, CLI 실행 시 `wordstore`를 지연 import).

**설치 라이브러리**: `pymupdf`(PDF 엔진, `import fitz`), `pytesseract`+`pillow`(OCR, 선택),
`python-docx`(워드), `openpyxl`(엑셀). OCR은 Tesseract 실행파일이 시스템에 별도 설치되어야 함
(파이썬 패키지는 바인딩일 뿐).

---

## 3. 개인정보 탐지 엔진 (`pdf_privacy_masker.py`)

### 3.1 신뢰도 체계

`HIGH`("확실") / `MEDIUM`("추정") 2단계.
- **자동 처리 모드(mode)**: `ask`(기본, 추정만 확인) / `auto`(추정도 모두 가림) / `safe`(확실만, 안 물어봄)
- 같은 그룹(같은 페이지·유형·정규화값) 안에 HIGH가 하나라도 있으면 그룹 전체를 HIGH로 승격

### 3.2 규칙 엔진 구조

```python
class Rule:
    kind: str          # "주민등록번호", "성명" 등
    rx: re.Pattern
    confidence: HIGH|MEDIUM
    group: int          # 실제로 가릴 캡처 그룹 (라벨은 남기고 값만)
    validate: callable  # (match) -> HIGH|MEDIUM|None(무시)  — 없으면 confidence 그대로

RULES = build_rules()   # 모듈 로드 시 1회 생성, 순서 = 탐지 순서
```

`detect(page_no, text, extra_finds, ocr_mode)`가 전체 규칙을 텍스트에 순차 적용하고,
겹치는 매치는 **우선순위 정렬 후 첫 매치만 채택**(뒤에 나온 겹침은 버림):

```python
found.sort(key=lambda f: (not f.forced, PRIORITY.get(f.kind, 99), f.start, -(f.end-f.start)))
```
- `forced`(사용자 지정 단어 목록에서 온 매치)가 항상 최우선
- 그다음 `PRIORITY` 딕셔너리 순서(작을수록 우선):
  `주민등록번호(0) < 휴대전화(1) < 일반전화(2) < 카드번호(3) < 계좌번호(4) < 여권번호(5)
  < 이메일(6) < 운전면허번호(7) < 생년월일(8) < 성별(9) < 성명(10) < 주소(11)
  < 학교(12) < 학년반(13) < 사진(14) < 사용자지정(15)`

`ALL_KINDS = [k for k in PRIORITY if k != "사용자지정"]` — GUI 체크박스·CLI `--types`의 선택 대상(14종).

### 3.3 유형별 정규식 (핵심 — 재구현 시 그대로 사용)

```python
LABEL_SEP = r"\s*[:：]?\s*"     # 라벨 뒤 콜론/공백 허용
REGIONS = "서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청북도|충청남도|충북|충남|전라북도|전라남도|전북|전남|경상북도|경상남도|경북|경남|제주"
```

| 유형 | 패턴(요지) | 확신도 | 특이 검증 |
|---|---|---|---|
| 주민등록번호 | `\d{6}\s?[-–]\s?[1-8]\d{6}` | HIGH | `_valid_rrn_date()`: 앞 6자리 MM(1-12)/DD(1-31) 검사, 비정상이면 MEDIUM으로 강등 |
| 주민등록번호(구분자없음) | `(?<!\d)\d{6}[1-8]\d{6}(?!\d)` | MEDIUM | 동일 날짜검증 |
| 휴대전화 | `01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}` | HIGH | — |
| 일반전화(구분자O) | `0(2\|[3-6][1-5])[-.\s)]\s?\d{3,4}[-.\s]?\d{4}` | HIGH | — |
| 일반전화(구분자無) | `0(2\|[3-6][1-5])\d{7,8}` | MEDIUM | — |
| 이메일 | `[\w.+-]+@[\w-]+\.[\w.-]+` | HIGH | — |
| 여권번호(라벨) | `여\s*권\s*번\s*호` + 값 `[A-Z]\d{8}` 또는 `[A-Z]\d{3}[A-Z]\d{4}` | HIGH | — |
| 여권번호(패턴만) | `[MSRODG]\d{8}` 등 | MEDIUM | — |
| 계좌번호(라벨) | `(계좌번?호?\|통장번호\|입금계좌\|환불계좌)` + 은행명? + 숫자 8-18자리 | HIGH | — |
| 계좌번호(패턴만) | `\d{2,6}-\d{2,6}-\d{2,8}(-\d{1,6})?` | MEDIUM | `acct_check`: 숫자만 추출해 10-14자리일 때만 채택 |
| 카드번호 | `\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}` | MEDIUM | — |
| 운전면허번호 | `\d{2}-\d{2}-\d{6}-\d{2}` | MEDIUM | — |
| 성명(라벨) | `(성명\|이름\|성함\|신청인\|보호자\|대표자\|담당자\|작성자\|수취인\|예금주\|계약자\|피보험자)` + 한글 2~4자 | HIGH | `labeled_name`: 값이 "확인/변경/조회/입력/기재/작성/서명/날인/동의/없음/해당/본인/동일/생략/첨부/필수"면 무시 |
| 성명(호칭) | `[가-힣]{2,3}(?:님\|씨\|귀하)` | MEDIUM | `honorific_name`: 성씨 목록(§3.4) 시작 + NOT_NAMES 제외 |
| 성명(단독, §5 참고) | `(?<![가-힣])[가-힣]{3}(?![가-힣])` | MEDIUM | `bare_name` — 상세 §3.4·§5 |
| 성별 | `성별` + `(남성\|여성\|남자\|여자\|남\|여\|M\|F)` | HIGH | — |
| 생년월일(라벨) | `(생년월일\|생일\|출생일\|출생연월일\|출생)` + 날짜(`YYYY.MM.DD`/`YY.MM.DD`, 구분자 `.\-/년월일`) | HIGH | — |
| 학교(라벨) | `(학교명\|출신학교\|소속\|재학중인학교)` + `[가-힣0-9]{1,12}(초등학교\|중학교\|고등학교\|대학교\|대학\|유치원)` | HIGH | — |
| 학교(패턴만) | `[가-힣]{1,10}(초등학교\|중학교\|고등학교\|유치원)` | MEDIUM | — |
| 학년반 | `\d{1,2}학년\d{1,2}반(\d{1,2}번)?` | HIGH | — |
| 학년반(학년만) | `\d{1,2}학년`(뒤에 반 없을 때) | MEDIUM | — |
| 학년반(라벨-값) | `(반\|번호\|학년)\s*[:：]?\s*(\d{1,3})` | MEDIUM | 표 하단 양식 대응 |
| 주소(라벨) | `(주소\|자택\|거주지\|소재지\|주거지)` + 주소본문 | HIGH | — |
| 주소(패턴만) | 주소본문 단독 | MEDIUM | — |

**주소본문 정규식** (동·호수·아파트명·괄호 상세까지 전부 포함하는 것이 핵심):
```python
addr_body = (
    r"(?:" + REGIONS + r")(?:특별시|광역시|특별자치시|특별자치도|도|시)?"
    r"(?:\s*[가-힣0-9]{1,10}(?:시|군|구|읍|면|동|리|로|길|가|대로))+"
    r"[\s,]*[0-9\-]*(?:번지|번길)?"
    r"(?:[\s,]+[가-힣A-Za-z0-9\-]{2,20}(?=\s*\d))?"           # 아파트/건물명(뒤에 숫자 나올 때만)
    r"(?:[\s,]*\d+(?:\s*-\s*\d+)*\s*(?:번지|번길|동|층|호)?)*"  # 123, 609-401, 101동 1502호
    r"(?:\s*\([가-힣A-Za-z0-9,\s.\-·]{1,40}\))?"               # (충무공동, ...) 괄호 상세
)
```

### 3.4 이름 탐지 오탐 방지 — 여러 겹 필터

```python
SURNAMES = "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반라왕금옥육인맹제모탁국여진어은편용예"

NOT_NAMES = {"회원","고객","선생","사장","부장","과장","대리","팀장","이사","사용자","관리자",
             "어르신","학부모","보호자","여러분","당신","담당자","책임자","신청자","구매자","판매자",
             "이메일","전화기","한국어","수업일","특기사","자율활","체험활","예금주","신청인","예금액","잔액"}

GEO_SUFFIX = "시군구읍면동리로길도"                    # 끝 글자가 지명 접미사면 제외
DOC_SUFFIX = "서처소청료비록표항칙액층란값칸님"          # 끝 글자가 문서 용어면 제외
JOSA_SUFFIX = "에를을은는가함됨감와의할며"               # 끝 글자가 조사/어미면 제외 (v7, 사용자 지정 필터)
COMMON_PREFIX2 = {"주소","성명","전화","번호","학생","교사","학교","학년","담임","주민","여권",
                  "계좌","사진","성별","이름","서명","날짜","금액","합계","비고","성적","출석","결석","지각"}
```

`bare_name(m)` 검증 함수(라벨 없는 단독 3글자 이름 후보에 전부 적용, `and` 조건 중 하나라도
걸리면 `None` 반환 = 이름 아님으로 판정):
1. `name in NOT_NAMES` 또는 `name[1:] in NOT_NAMES` (예: "담임선생님"의 "임선생" 차단)
2. `name[0] not in SURNAMES` (첫 글자가 상위 성씨가 아니면 제외)
3. `name[-1] in GEO_SUFFIX` (지명 접미사)
4. `name[-1] in DOC_SUFFIX` (문서 용어 접미사)
5. `name[-1] in JOSA_SUFFIX` (조사/어미 — "성적에", "우수함" 등 오탐 대량 차단, **사용자 요청 규칙**)
6. `name[:2] in COMMON_PREFIX2` (앞 2글자가 일반 명사)

`honorific_name(m)` (OOO님/씨/귀하 형태)은 1·2번만 적용.

### 3.5 표(테이블) 열 인식 — `table_findings(page, kinds)`

라벨이 값 옆이 아니라 **표 헤더 행**에 있는 양식(생활기록부 등) 대응. PyMuPDF `page.find_tables()`로
표 구조를 인식 → 헤더 텍스트로 유형 판정 → 그 열의 모든 값 셀을 HIGH로 채택.

```python
TABLE_HEADER_CONTAINS = [   # 부분 일치, 위에서부터 먼저 매치되는 것 채택
    ("주민등록번호","주민등록번호"), ("담임성명","성명"), ("생년월일","생년월일"),
    ("전화번호","휴대전화"), ("휴대전화","휴대전화"), ("연락처","휴대전화"),
    ("학교명","학교"), ("보호자","성명"), ("담임","성명"), ("성명","성명"),
    ("이름","성명"), ("성별","성별"), ("주소","주소"),
]
TABLE_HEADER_EXACT = {"반":"학년반", "번호":"학년반", "학년":"학년반", "학교":"학교"}  # 짧은 헤더는 완전 일치만
```
셀 좌표는 `Rect + (1.2,1.2,-1.2,-1.2)`로 살짝 안쪽으로 줄여 표 테두리 선이 함께 지워지지 않게 함.
스캔 페이지(OCR 대상)는 표 인식을 적용하지 않음(`if pno not in ocr_pages`).

### 3.6 사진 영역 인식 — `photo_findings(page, kinds)`

`page.get_image_info()`로 이미지 bbox 수집. 조건: 가로·세로 30px 이상, **페이지 면적의 55% 이하**
(전면 스캔 배경 이미지 제외). 확신도 MEDIUM(질문 대상). 결과값 표시는 `[사진 WxH]` 형태.

### 3.7 OCR 서브시스템 (스캔본 지원)

- `setup_tesseract()`: `TESSERACT_CMD` 환경변수 → `shutil.which` → Windows/macOS/Linux 기본 설치
  경로 순으로 tesseract 실행파일 탐색. 한국어(`kor`) 언어팩 없으면 경고만 출력(계속 진행).
- `ocr_page_words(page, dpi=300, psm=6)`:
  - 렌더 크기 안전장치: `zoom = min(dpi/72, 4500/max(width,height))` (초대형 페이지 메모리 보호)
  - `pytesseract.image_to_data(lang="kor+eng", config=f"--psm {psm}")`
  - **음절 병합**: 같은 줄(block/par/line 동일)에서 간격이 `0.33 * 높이` 미만인 조각은 하나로 합침
    (한글 OCR이 "김 철 수"처럼 음절 단위로 쪼개는 문제 보정)
- `scan_document`에서 텍스트 없는 페이지는 **psm 6과 4 두 가지 레이아웃 모드로 이중 스캔**하여 누락 최소화
- `compact_korean(text)`: 한글-한글 사이의 공백만 제거한 텍스트 + 인덱스 매핑 반환. 나이스(NICE) 등
  **내장 텍스트도 글자 단위로 조각나는 시스템 PDF**를 위해 이 보정 탐지를 **모든 페이지**(OCR 여부 무관)에 적용
  (`detect(..., ocr_mode=True)`를 항상 True로 호출).

---

## 4. 처리 파이프라인 (핵심 함수 흐름)

```
scan_document()           문서 전체 스캔 → [(Finding, [(멤버,words,offsets),...]), ...], ocr_pages, unreadable_pages
   ↓
approve_findings()        mode(ask/auto/safe) + ask_cb 콜백으로 승인 여부 결정 → approved, skipped, n_high
   ↓
sweep_approved_values()   승인된 값과 "동일한 문자열"을 문서 전체 재수색 (조사 결합 잔여 출현 처리)
   ↓
assign_name_aliases()     [선택] 가명화 켰으면 성명 → 학생N/교사N 매핑 부여
   ↓
apply_verify_save()       마스킹 적용 → 문서 내 재검사 → 잔존시 자동 재가공(최대 3회) → 저장 → 최종 검증
```

### 4.1 `scan_document(doc, extra_finds, ocr_ready, dpi, log, progress, kinds, exclude)`

페이지 단위로 순회하며 각 페이지 처리를 **개별 try/except로 격리**(한 페이지 실패가 전체 실패로
번지지 않음, `except Exception as e: unreadable_pages+=1; log(...)`).

같은 (페이지, 유형, 정규화값) 조합은 `groups` 딕셔너리로 묶어 하나의 대표 Finding + 멤버 리스트로 관리
(OCR 이중 스캔이나 표+본문 중복 탐지 시 승인/거부를 한 번만 물으면 되도록).

`kinds`(가릴 유형 집합, None=전체)와 `exclude`(가리지 않을 단어, 정규화된 문자열 집합)를 이 단계에서
바로 필터링. `extra_finds`는 문자열 또는 `(단어, 유형, 대체어|None)` 튜플 리스트 — 사용자 단어 목록.

### 4.2 `ask_user(finding, decisions)` — CLI 대화형 확인

- 성명(`성명`)은 **유형 전체 일괄 승인 없이 단어별로 개별 확인** (오탐 방지, v7):
  `decisions[("성명", 정규화값)]`로 기억. 프롬프트: `y(예)/n(아니오)`만.
- 그 외 유형은 `y/n/a(같은 유형 모두 예)/s(같은 유형 모두 아니오)` 지원.

### 4.3 `sweep_approved_values(doc, approved, progress)` — 동일 값 재수색 (v4/v5로 성능·정확도 개선)

**문제**: "홍길동"을 가려도 "홍길동입니다"처럼 조사가 붙은 형태나, 나이스 PDF처럼 글자가
조각난("현 승 민") 형태는 단어 경계 탐지가 놓침. 검증(§4.5)에서 이게 "잔존"으로 잡힘.

**해결 알고리즘** (v5에서 성능 재작성 — 100페이지 5,166건 기준 3분34초 → 8초):
1. 승인된 모든 그룹에서 이미 가려질 사각형을 **페이지별 지도**(`covered: {page: [Rect]}`)로 1회 계산
2. 같은 정규화값은 **한 번만 수색 대상에 등록** (`seen` set으로 중복 제거) — 단, 한글 1자/숫자 4자
   미만은 일반 단어와 겹칠 위험이 커서 제외
3. 페이지마다 텍스트를 **1회만 추출**하고, 그 페이지 텍스트에서 값이 발견될 때만 좌표 검색 수행
4. 조각난 텍스트 대응: 원문 텍스트 검색 + `compact_korean()` 압축본 검색(인덱스 역매핑) **두 가지 방식** 병행
5. 이미 가려질 위치와 겹치면 건너뛰어 중복 방지

### 4.4 `apply_masks(doc, approved, korean_font, progress)` — 실제 마스킹 적용

각 Finding 멤버의 좌표에 `page.add_redact_annot(rect, fill=...)`:
- `replacement`가 없으면(검은칸 모드): `fill=(0,0,0)` 검은색
- `replacement`가 있으면(가명화/대체 모드): `fill=(1,1,1)` 흰색 + 삽입할 텍스트를 `inserts` 딕셔너리에 등록
  (여러 조각으로 나뉜 경우 **첫 조각에만** 삽입, `_merge_insert()`로 같은 자리 중복 삽입 방지)

페이지별로 `apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)` 호출 — **텍스트뿐 아니라
해당 영역의 이미지 픽셀도 소거**(스캔본 대응). 이 호출 **이후에** `_insert_fitted()`로 대체 텍스트를
새로 그려 넣음(원본이 완전히 지워진 뒤에 그려야 겹치지 않음).

`_insert_fitted(page, rect, text, fontfile)`: 사각형 높이의 75%를 시작 폰트 크기로 하여 5pt까지
줄여가며 `insert_textbox(..., align=TEXT_ALIGN_CENTER)`가 성공할 때까지 시도.

### 4.5 `apply_verify_save()` — 저장 + 자동 재가공 + 검증 (v5의 핵심, 저장 실패 문제의 최종 해법)

```python
def apply_verify_save(doc, approved, out_path, korean_font, ocr_pages, ocr_ready, dpi, log, progress):
    apply_masks(...)
    for attempt in range(3):                          # 최대 3회 자동 재시도
        leftovers = verify_doc(doc, approved, ...)     # 문서 "내부"에서 재검사 (아직 저장 전)
        if not leftovers: break
        retry = [(f, []) for f in {잔존 Finding 중복제거}]
        added = sweep_approved_values(doc, retry)      # 잔존 값만 다시 재수색
        if not added: break                            # 더 못 찾으면 포기 → 경고 저장으로
        apply_masks(doc, retry, korean_font)
        # retry 멤버를 원 그룹에 합쳐서 다음 루프의 verify_doc이 인식하게 함
    final_leftovers = verify_doc(doc, approved, ...)
    if final_leftovers:
        out_path = base + "(잔존주의)" + ext            # 삭제하지 않고 경고 표시만
    out_path = unique_path(out_path)                    # 동일 파일명 있으면 (1),(2)... 번호
    save_masked(doc, out_path)                          # 메타데이터 제거 후 저장
    return len(final_leftovers), out_path
```

`verify_doc(vdoc, approved, ocr_pages, ocr_ready, dpi, log)`: 각 승인 그룹이 걸쳐 있는 페이지만
재추출(`page_words_and_text`, 스캔 페이지는 재OCR)하여 원본 값이 남아 있는지 검사.
**세 가지 매칭 방식**을 OR로 결합:
1. 원문 그대로 포함 여부 (한글 2자↑ / 숫자 4자↑만 유효, 표의 "11" 같은 짧은 수 오탐 방지)
2. 공백 제거본 포함 여부 (OCR 띄어쓰기 오차 대응)
3. 숫자만 추출 후 **구분자만 허용하는 정규식**으로 재확인 —
   `r"(?<!\d)" + r"[\s\-–.()/]{0,3}".join(map(re.escape, digits)) + r"(?!\d)"`
   (v5에서 추가: 페이지의 서로 다른 숫자들이 우연히 이어져 전화번호와 일치하는 **오탐**을
   앞뒤 숫자 배제로 차단)

### 4.6 파일명 충돌 방지 — `unique_path(path)`

```python
def unique_path(path):
    if not os.path.exists(path): return path
    base, ext = os.path.splitext(path)
    for i in range(1, 1000):
        cand = f"{base}({i}){ext}"
        if not os.path.exists(cand): return cand
    return path
```
`apply_verify_save`(PDF), GUI의 워드/엑셀 저장 경로, "가릴 항목 0건" 경로, `(잔존주의)` 저장
경로 **전부**에 적용되어 어떤 경우에도 기존 파일을 덮어쓰지 않음(v8).

---

## 5. 가명화(대체) 시스템

### 5.1 `assign_name_aliases(approved)` — PDF용

승인된 "성명" 그룹 중 `replacement`가 아직 없는 것에 한해:
- 정규화된 값(공백 제거)이 이미 매핑에 있으면 재사용, 없으면 새 번호 부여
- 역할 판정: 그룹 멤버들의 문맥(`context`)에 `TEACHER_HINTS = ("담임","교사","선생","지도")` 중
  하나라도 있으면 "교사", 아니면 "학생"
- `f"{역할}{순번}"` (예: "학생1", "교사1") — 매핑은 **함수 지역 변수**로만 존재, 파일에도 저장 안 됨
- 사용자 지정 대체(`f.replacement`가 이미 있는 경우, 즉 단어 목록의 "단어 대체")는 **덮어쓰지 않음** (존중)

### 5.2 사용자 단어 목록과의 관계 (§6)

`extra_finds`에 `(단어, "사용자지정", 대체어)` 튜플로 전달되면 `detect()`에서 `Finding.forced=True`,
`Finding.replacement=대체어`로 생성되어 **자연 탐지보다 항상 우선**(§3.2 정렬 규칙).
가명화(`--alias`)와 사용자 지정 대체가 같은 파일에 공존 가능 — 사용자 지정이 있는 이름은 그 대체어를
쓰고, 없는 나머지 이름만 학생N/교사N으로 자동 부여.

### 5.3 한글 폰트 탐색 — `find_korean_font()`

```python
for p in (r"C:\Windows\Fonts\malgun.ttf", r"C:\Windows\Fonts\gulim.ttc",
          "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
          "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
          "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"):
    if os.path.isfile(p): return p
return None
```
못 찾으면 가명화/대체를 포기하고 검은칸 방식으로 자동 전환(경고 로그).

---

## 6. 사용자 단어 목록 시스템 (`wordstore.py`)

### 6.1 저장 위치·형식

```python
LISTS = ("force", "exclude", "replace")   # 항상 가림 / 가리지 않음 / 대체

def _config_dir():
    Windows: %LOCALAPPDATA%\pdf_masker
    macOS:   ~/Library/Application Support/pdf_masker
    Linux:   $XDG_CONFIG_HOME 또는 ~/.config/pdf_masker
# 실제 파일: {config_dir}/wordlist.json
```
JSON 구조: `{"force": [{"word":..., "source":..., "kind":?}], "exclude": [...], "replace": [{"word":..., "to":..., "source":...}]}`.
저장은 임시파일에 쓴 뒤 `os.replace()`로 원자적 교체(쓰기 중 손상 방지).

### 6.2 3개 목록의 관계

- **같은 단어(공백 제거 후 비교, `norm()`)는 한 목록에만 존재** — `add()` 시 다른 목록에서 자동 제거
  후 새 목록에 추가(충돌 시 자동 이동)
- 우선순위(적용 시): **가리지 않음(exclude) > 대체(replace) > 항상 가림(force)** — 단, 실제로는
  세 목록이 겹치지 않으므로(상호 배타) 이 우선순위는 "같은 단어를 다시 등록할 때 어디로 갈지"의
  개념적 순서
- `force_items()` → `[(단어, 유형)]`, `replace_map()` → `{원래단어: 바꿀단어}` (엔진에 전달할 형태로 가공)
- `source` 필드: `"직접 추가"` / `"질문 응답"`(이름 확인 창에서 자동 등록) / `"파일 가져오기"` — GUI
  목록창에 `(출처)` 형태로 표시

### 6.3 파일 가져오기/내보내기

- **인코딩 자동 인식**: `utf-8-sig` → `cp949` → `euc-kr` 순으로 시도(메모장 ANSI 저장 대응)
- **형식**:
  - `.txt`: 한 줄 = 단어 하나(`#` 시작 줄은 주석 무시). 대체 목록은 `원래=바꿀` 또는
    `원래->바꿀` 또는 `원래→바꿀` 파싱 (`_parse_pair`, 구분자 우선순위: `=` → `->` → `→` → 탭 → 쉼표)
  - `.csv`: 1열 원래 단어, 2열 바꿀 단어(대체 목록만 사용)
  - `.xlsx`: 모든 시트 순회, 1열/2열
- `import_file()` 반환: `(추가 건수, 건너뛴 건수)` — 중복이거나 형식 오류(대체인데 값 없음)면 skip
- `export_file()`: `.txt`(기본, `원래=바꿀` 형식) 또는 `.csv`

---

## 7. 워드·엑셀 처리 (`office_masker.py`)

PDF와 달리 **텍스트 자체를 치환**(검은칸 개념 없음). `SUPPORTED_EXTS = (".docx", ".xlsx")`.

### 7.1 치환 문구 규칙

- 유형이 "성명"이고 가명화 켜짐 → `Aliaser.alias_for(value, context)`로 학생N/교사N
- 그 외(또는 가명화 꺼짐) → `f"[{kind} 가림]"` (예: `[주민등록번호 가림]`)
- 사용자 지정 대체어가 있으면 그것을 최우선 사용

### 7.2 `OfficeJob` 클래스 — 파일 하나 처리 상태

`mask_text(text, where)`가 핵심: **1) 사용자 지정(force_list) 단어를 먼저 전부 찾아 entries에 등록
→ 2) 자동 탐지(detect()) 결과 중 사용자 지정과 겹치지 않는 것만 추가(mode에 따라 자동승인/질문)
→ 3) entries를 뒤에서부터(`sort by -start`) 치환**(앞쪽 인덱스가 안 밀리도록).

`sweep_text(text)`: PDF의 `sweep_approved_values`에 대응하는 **문단/셀 내부 재수색** —
이번 파일에서 이미 치환된 원본값(`self.removed` 딕셔너리)과 동일한 문자열이 텍스트에 남아 있으면
길이 긴 것부터(`sorted(..., key=lambda kv: -len(kv[0]))`) 추가 치환.

### 7.3 워드(.docx) — `process_docx()`

- 순회 대상: 본문 + 모든 표의 모든 셀(재귀, 셀 안에 중첩 표 가능) + 머리글/바닥글 (`_docx_paragraphs()`)
- **1차 패스**(전체 컨테이너에 `mask_text`) → **2차 패스**(전체 컨테이너에 `sweep_text`, 조사 결합 대응)
- 문단 재작성(`rewrite`): 첫 run에 전체 새 텍스트를 넣고 나머지 run은 비움
  (→ **부작용**: 치환된 문단은 서식이 첫 부분 기준으로 통일됨, 설명서에 명시)
- 문서 속성(`core_properties`)의 `author`/`last_modified_by`/`comments` 제거
- 저장 후 **재검사**: 결과 파일을 다시 열어 `job.removed`의 모든 원본값이 전체 텍스트에 있는지 확인
  → `leftover` 건수 반환

### 7.4 엑셀(.xlsx) — `process_xlsx()`

- 모든 시트의 모든 셀 순회(`iter_rows()`)
- **문자열 셀**: `=`로 시작(수식)하면 **건드리지 않음**(파손 방지) — 그 외엔 `mask_text` 적용
- **숫자 셀**: 정수/실수를 문자열로 변환해 검사. 길이 9~10자리이고 `1`로 시작하면 앞에 `0`을 붙여
  검사(엑셀이 전화번호 앞자리 0을 날리는 문제 보정: `01012345678` → 셀엔 `1012345678`로 저장됨)
- 1차(`process_cells(job.mask_text)`) → 2차(`process_cells(sweep_text)`) 동일 순서
- `wb.properties.creator`/`lastModifiedBy` 제거
- 재검사: `read_only=True`로 재오픈해 전체 셀 값을 문자열로 이어붙여 `job.removed` 잔존 확인

### 7.5 반환값 (공통)

`{"masked": 총치환건수, "stats": Counter(유형별건수), "leftover": 잔존건수, "alias_counters": {"학생":N,"교사":N}}`

### 7.6 한글(.hwp/.hwpx) — 미지원

형식이 비공개(hwp) 또는 파싱이 복잡(hwpx)하여 직접 처리하지 않음. GUI에서 원본 폴더에 `.hwp`가
있으면 개수를 세어 "한글 프로그램에서 PDF로 저장 후 처리하세요" 안내만 표시(`find_hwp()`).

---

## 8. GUI (`pdf_privacy_masker_gui.py`)

### 8.1 전체 구조

- `tkinter` + `ttk`, PyInstaller `--windowed` 빌드이므로 `sys.stdout/stderr`가 `None`일 수 있어
  모듈 로드 시 `io.StringIO()`로 대체(그렇지 않으면 print에서 크래시).
- **상단 메뉴바**(`tk.Menu`, 유일한 화면 전환 UI) 3항목: `문서 변환` / `단어 관리` / `사용 방법`
- 내부적으로 `ttk.Notebook` 2탭을 쓰되 **탭 표시줄 자체는 숨김**(`style.layout("NoTabs.TNotebook.Tab", [])`)
  — 메뉴바 클릭 시 `self.nb.select(0 또는 1)`로 전환. (v8: 메뉴바+탭 이중 표시 버그 수정)
- 창 크기 `760x780`, 최소 `680x640`. Windows에서는 `ttk.Style().theme_use("vista")` 시도.

### 8.2 "문서 변환" 탭 — 위에서 아래 순서

1. 제목 + AI 미사용 안내 문구
2. **1단계**: 원본 폴더 선택(`filedialog.askdirectory`) → `find_pdfs()`로 대상 문서 개수 즉시 표시,
   `find_hwp()`로 미지원 한글 파일 개수도 안내
3. **2단계**: 저장 폴더 선택
4. **가릴 정보 종류**: `ALL_KINDS`(14종) 체크박스를 4열 그리드로 배치, 기본 전체 선택.
   [전체 선택]/[전체 해제] 버튼
5. **3단계**: 라디오버튼 3개(`ask`/`auto`/`safe`) + 가명화 체크박스(`이름을 검은칸 대신
   '학생1·교사1' 번호로 대체`) + [▶ 변환 시작]/[중지] 버튼
6. 진행 막대(`ttk.Progressbar`) + 상태 텍스트(`status_var`)
7. 진행 기록 로그 박스(`tk.Text`, 스크롤 가능, 실패 원인이 여기 표시됨)
8. 하단: OCR 상태 표시 + [사용 방법 안내]/[결과 폴더 열기]/[OCR 자동 설치]/[수동 설치 페이지] 버튼
9. 저작권 표기(`ⓒ 2026 hwansang.kr`)

### 8.3 "단어 관리" 탭

`WORD_SECTIONS = [("force", "1) 항상 가릴 단어...", False), ("exclude", "2) 가리지 않을 단어...", False),
("replace", "3) 단어 대체...", True)]` — 세 번째만 "→ 바꿀단어" 입력칸(`has_to=True`) 있음.

각 구역(`ttk.LabelFrame`)마다: 단어 입력칸(+대체칸) + [추가] + [선택 삭제] + **[전체 삭제]**(v8, 확인
후 일괄삭제) + [파일에서 가져오기] + [파일로 내보내기] 버튼, 그 아래 `tk.Listbox`(항목: `단어 (→ 대체어)
(출처)` 형식, 스크롤 가능).

상단에 **[가이드 양식 내려받기]** 버튼(v7) — `TEMPLATES` 딕셔너리(3개 .txt, 주석+예시+AI미사용 안내
포함)를 사용자가 고른 폴더에 저장, 완료 후 폴더 열기 제안.

### 8.4 확인 창(팝업) — 공통 인프라

`_open_ask_window(title, size)`: 항상 **직전 창과 같은 위치**에 뜨도록 `self._ask_geo`(마지막 위치
문자열 `"+x+y"`)를 기억해 재사용(v7, 마우스 이동 최소화). 최초 위치는 메인 창 기준 `+80+120` 오프셋.
`grab_set()` + `focus_force()`로 모달 + 키보드 포커스 확보.

**① 일반 확인 창**(`_show_ask_dialog`, 성명 외 유형): 유형/페이지/문맥 표시 + "같은 종류는 모두"
체크박스 + 단축키 `1`=예 `2`=아니오 `Enter`=예 `Esc`=아니오.

**② 이름 확인 창**(`_show_name_dialog`, 성명 전용, v7에서 대폭 개선):
- 문구: `'{값}' — 사람 이름이 맞습니까?`
- "이 단어 기억하기"(기본 켬) 체크 → 답변 시 `wordstore`에 자동 등록(예→force, 아니오→exclude)
- 버튼 4개: `예(1)` / `아니오(2)` / **`이후 이름 질문 전부 가리기(3)`** / **`이후 이름 질문 전부
  건너뛰기(4)`** — 뒤 2개는 `UiRequest.bulk_all`에 True/False를 설정해 **이번 변환 전체에 즉시 적용**
  (단어 목록엔 저장 안 됨, 세션 한정) — 사용자가 "1000번 넘게 질문" 문제를 호소해 추가된 탈출구
- 단축키: `1/2/3/4` 숫자 + `y/Y`=예 `n/N`=아니오 + `Enter`=예 `Esc`=아니오

**③ OCR 설치 확인 창**(`_show_ocr_dialog`): 스캔본을 만났는데 OCR 미설치 시 1회만 등장.
[자동 설치]/[수동 설치 페이지 열기]/[건너뛰기].

### 8.5 스레드/통신 모델

작업(`batch_process`)은 **백그라운드 스레드**에서 실행, GUI 스레드는 `queue.Queue`를 100ms
간격(`root.after(100, self._poll)`)으로 폴링. 메시지 태그: `log`/`progress`/`ask`/`ask_ocr`/
`install_done`/`done`.

확인 창이 필요하면 워커 스레드가 `UiRequest`(내부에 `threading.Event`)를 큐에 넣고
`req.event.wait()`로 블로킹 대기 → GUI 스레드가 큐에서 꺼내 팝업을 띄우고, 사용자가 답하면
`req.answer` 설정 후 `req.event.set()` → 워커 스레드가 깨어나 계속 진행.

`ask_cb(finding, decisions)` 내부에서 성명은 별도 캐시 3단계로 확인 최소화:
1. `force_keys`(이번 실행에 적용되는 단어 목록의 force 항목) → 즉시 True
2. `self.word_answers`(이번 GUI 세션에서 이미 답한 단어) → 캐시된 답
3. `name_bulk["answer"]`(팝업의 "이후 전부" 버튼으로 설정된 세션 한정 값) → 즉시 적용
4. 그래도 없으면 팝업 큐잉

### 8.6 `batch_process()` — 폴더 일괄 처리 (순수 함수, GUI 비의존 → 단위 테스트 가능)

파일 확장자로 라우팅: `.docx`/`.xlsx` → `office_masker.process_office()`,
그 외(PDF) → `scan_document → approve_findings → sweep_approved_values → assign_name_aliases
→ apply_verify_save` 파이프라인.

각 파일 처리 전:
- 파일명에 `_masked`가 있으면 "이미 처리된 결과물로 보입니다" 안내(오처리 방지)
- `doc.needs_pass`(암호 PDF)면 즉시 실패 처리, 명확한 원인 로그
- 페이지 수·파일 크기(MB) 로그

스캔본인데 OCR 미설치면 **일괄 처리 전체에서 1회만**(`asked_install` 플래그) 설치 제안 →
설치되면 그 파일을 처음부터 재스캔.

실패 원인 진단(`if not findings:`): 전체 페이지 인식 불가 / 가릴 유형 미선택 / 패턴 미발견 3가지로
구분해 로그에 명시(사용자가 "0건" 원인을 못 찾던 문제의 해결책).

반환 요약: `{"done", "masked", "failed"(오류), "warned"((잔존주의) 파일), "ocr_needed"(OCR 필요
파일), "ocr_ready_after", "cancelled"}`.

### 8.7 같은 폴더(원본=저장) 처리 — `start()` 내부

원본 폴더와 저장 폴더가 같으면:
1. 대상 파일 목록에서 **`_masked`가 포함된 파일을 자동 제외**(이전 결과물 재처리·무한루프 방지)
2. 모든 파일이 이전 결과물이면 경고 후 중단
3. 확인창에 "같은 이름 있으면 (1),(2)... 번호 붙음" + "이전 결과물 N개 제외" 안내
4. 사용자가 계속 진행 선택 시 `unique_path()`가 실제 충돌을 방지(§4.6)

### 8.8 OCR 자동 설치 — `auto_install_ocr(log)`

Windows 전용(그 외 OS는 안내 페이지만 열고 macOS는 `brew install` 명령 로그 출력):
1. `winget install -e --id UB-Mannheim.TesseractOCR --silent ...` 실행(최대 900초 타임아웃)
2. 설치 후 `setup_tesseract()` 재확인
3. 한국어 데이터 없으면 `_ensure_korean_data()`가
   `https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/kor.traineddata`를
   `urllib.request.urlretrieve`로 다운로드 — **1순위: Tesseract 설치 폴더의 tessdata**,
   권한 부족(`PermissionError`)이면 **2순위: `%LOCALAPPDATA%\pdf_masker\tessdata`**로 우회하고
   `eng.traineddata`/`osd.traineddata`도 함께 복사 후 `TESSDATA_PREFIX` 환경변수 설정
4. winget 없으면(`FileNotFoundError`) 수동 설치 페이지(`OCR_URL`)를 브라우저로 열고 중단

### 8.9 완료 처리 — `_finish(summary)`

우선순위: `failed`(실패 파일 있음, 원인은 로그 참조) > `warned`((잔존주의) 파일 있음, 재처리 안내)
> `ocr_needed`(OCR 필요) > 정상 완료(결과 폴더 열기 제안 다이얼로그).

---

## 9. CLI 레퍼런스 (`pdf_privacy_masker.py` 단독 실행)

```
python pdf_privacy_masker.py 입력.pdf [옵션]

위치 인자:
  input                    입력 PDF 경로

옵션:
  -o, --output PATH        출력 경로 (기본: 입력명_masked.pdf)
  --auto                   추정 항목도 묻지 않고 모두 마스킹 (--safe와 배타)
  --safe                   확실한 항목만 마스킹, 묻지 않음 (--auto와 배타)
  --dry-run                탐지 결과만 출력, 저장 안 함
  --find STR               추가로 가릴 문자열 (반복 가능)
  --no-ocr                 스캔 페이지 OCR 비활성화
  --dpi N                  OCR 해상도 (기본 300)
  --types A,B,C            가릴 유형 제한 (기본 전체 14종, ALL_KINDS 중 선택)
  --alias                  성명을 학생1·교사1 번호로 대체 (검은칸 대신)
  --force-word STR         항상 가릴 단어 추가 (반복 가능)
  --exclude-word STR       가리지 않을 단어 추가 (반복 가능)
  --replace "원래=바꿀"     단어 대체 (반복 가능)
  --no-wordlist            저장된 단어 목록(wordstore) 미적용
```

저장된 단어 목록(`WordStore()`)은 `--no-wordlist`가 없으면 **자동으로 병합**되어 CLI 실행에도 적용됨.
종료 코드: 잔존 있으면 `sys.exit(1)`, 탐지 0건이면 `return`(0), 정상 완료 0.

---

## 10. 빌드 및 배포

### 10.1 개발 환경 (macOS, 이 저장소 개발 시 사용)

```bash
python3 -m venv .venv && .venv/bin/pip install pymupdf pytesseract pillow python-docx openpyxl
brew install tesseract tesseract-lang   # 한국어 포함 OCR (선택)
```

### 10.2 Windows exe 빌드 (`build_windows.bat`)

PyInstaller는 크로스 컴파일 불가 → **반드시 Windows PC에서** 실행:
```batch
py -3 -m venv build_env
build_env\Scripts\pip install -r requirements.txt pyinstaller
build_env\Scripts\pyinstaller --onefile --windowed --name pdf_masker pdf_privacy_masker_gui.py
build_env\Scripts\pyinstaller --onefile --console --name pdf_privacy_masker pdf_privacy_masker.py
```
결과: `dist\pdf_masker.exe`(GUI, 권장) / `dist\pdf_privacy_masker.exe`(CLI). 각각 단독 배포 가능
(대상 PC에 Python 불필요). 스캔본 지원이 필요하면 대상 PC에 Tesseract만 별도 설치.

PowerShell에서 실행 시 `.\build_windows.bat` 형태 필요(실행 정책), 배치파일은 **한글을 쓰지 않고
전부 영어**로 작성(cp949/UTF-8 인코딩 충돌로 한글이 깨지는 문제를 원천 차단하기 위한 결정).

---

## 11. 알려진 한계

1. **스캔본 화질 의존**: OCR 인식률에 의존하므로 저화질 스캔본은 탐지 누락 가능 → 결과 파일
   육안 확인 권장(설명서에도 명시).
2. **한글(.hwp/.hwpx) 미지원**: PDF로 변환 후 처리해야 함.
3. **워드 서식 통일**: 치환된 문단은 첫 런(run)의 서식으로 통일됨(부분 볼드/색상 등 소실 가능).
4. **엑셀 수식 미검사**: `=`로 시작하는 셀은 그대로 둠(파손 방지가 우선이므로 수식 안의 문자열
   리터럴에 개인정보가 있어도 못 잡음 — 극히 드문 케이스로 간주).
5. **이름 탐지는 완벽하지 않음**: 어미 필터(§3.4)로 오탐을 크게 줄였으나 여전히 확률적 규칙이므로
   드물게 오탐/누락 가능 — 그래서 단어 목록(§6)으로 사용자가 보정하는 구조.
6. **성씨 목록 기반**: `SURNAMES`에 없는 희귀 성씨는 "단독 이름 후보" 규칙에서 탐지 안 됨(라벨
   기반·표 기반 탐지는 성씨 무관하게 동작하므로 이 경우는 보조 규칙의 한계).

---

## 12. 개발 이력 요약 (요청 → 구현, 맥락 참고용)

시간순 상세는 `PLAN.md` 참고. 버전 태그는 코드 주석과 대응.

| 버전 | 트리거가 된 사용자 요청 | 핵심 구현 |
|---|---|---|
| v1 | PDF 개인정보 오프라인 마스킹 프로그램 최초 요청 | 정규식 규칙 엔진, redaction, CLI, 자체 검증 |
| v1.5 | Windows exe화, 이미지 스캔본 지원 | PyInstaller 빌드, Tesseract OCR 통합 |
| v2 | GUI 요청(폴더 선택·진행바·OCR 안내·초보자 가이드) | tkinter GUI 최초 버전 |
| v3 | 이름 대신 "학생1·교사1"로 대체, 다른 문서 형식(엑셀·워드·한글) | 가명화 시스템, docx/xlsx 지원 검토 |
| v4 | 대용량 PDF 보호, 실패 원인 표시, OCR 자동 설치, 유형 선택 UI | office_masker.py 신설, sweep 최초 구현, OCR 자동설치 |
| v5 | "검증 실패, 파일 삭제" 반복 발생 → 자동 재가공 요청 | apply_verify_save 재설계(삭제 대신 재시도+경고저장), sweep 성능 재작성, 나이스 조각글자 대응 |
| v6 | 이름 오탐 시 확인 필요, 강제 가림/제외 단어, 단어 대체, 메뉴 분리 | wordstore.py 신설, 상단메뉴+탭, 이름 개별확인 |
| v7 | 가이드 양식 다운로드, AI미사용 명시, 이름 질문 단축키/고정위치, 어미 필터, 질문 폭주 시 전부패스 | JOSA_SUFFIX 필터, 질문창 개선, 양식 다운로드, 이후전부 버튼 |
| v8 | 메뉴바 중복, 단어 일괄삭제, 양식 버튼 위치, 파일명 충돌, 같은폴더 오류 | 탭바 숨김, 전체삭제 버튼, unique_path(), 같은폴더 안전장치 |

---

## 13. 재구현 시 체크리스트

이 문서만으로 처음부터 다시 만든다면 다음 순서를 권장:

1. `pdf_privacy_masker.py`의 §3(탐지 규칙) + §4.1~4.4(스캔→승인→재수색→적용)까지 먼저 구현,
   CLI(§9)로 텍스트 PDF 동작 확인
2. §3.7(OCR) 추가, 스캔 PDF 동작 확인
3. §4.5(자동 재가공+검증+저장) 추가 — **이 부분이 없으면 잔존 시 파일이 그냥 삭제되어 사용자가
   가장 크게 불만을 가졌던 지점**이므로 우선순위 높음
4. §5(가명화) + §6(단어 목록, wordstore.py) 추가
5. §7(office_masker.py) 추가 — `detect()`를 그대로 재사용하는 것이 핵심(규칙 중복 방지)
6. §8(GUI) — 특히 §8.5(스레드 통신), §8.4(확인창 3종+단축키+고정위치)를 먼저 만들고 나머지 화면
   요소를 채워나가는 순서 권장
7. §4.6(unique_path) + §8.7(같은 폴더 처리)은 마지막에 추가해도 되지만 **실사용 전 필수**
   (없으면 재실행 시 덮어쓰기/무한 재처리 위험)

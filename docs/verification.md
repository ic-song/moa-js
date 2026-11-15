# 0.2.0 검증 기록

기준일: 2026-11-15. Moa 자체 구현을 검증한 기록이며 RealGrid 실행본과의 전체 API·동작 일치 인증은 아닙니다. 기능별 차이는 [비교표](realgrid-comparison.md)에 있습니다.

## 기능 검사

| 검사 | 결과 |
| --- | --- |
| Node 단위 검사 | 24개 통과. 셀·구조 트랜잭션, Undo/Redo, 검증 원자성, 숫자 변환, 필터·다중 정렬, 그룹 합계, 트리 정합성, XLSX 값·헤더·오류·수식 캐시 검사 |
| 기본 브라우저 | 14개 흐름 통과. 드래그·Shift 선택·실제 Ctrl+C/V·Delete·Undo/Redo·직접 편집·검색/정렬 좌표·CSV·오프라인 실행 |
| 고급 브라우저 | 16개 흐름 통과. Excel HTML/TSV, 빈 표 자동 행 확장·Ctrl+Y, 행 CRUD, 필터 AND/OR, 다중 정렬, 너비·고정, 그룹·소계, 트리 자손 삭제, 병합, XLSX 교체/복원·오류·비동기 경합, 읽기 전용·초기화 정리, 실제 Excel 데이터, 오프라인 모드 |
| 실제 Excel 입력 | Microsoft Excel 16.0 COM에서 테스트 XLSX를 생성하고 B2:G3을 복사. 그 실제 HTML/TSV를 Chromium 클립보드에 재현해 Ctrl+V 수행. 파일 자체도 가져오기 검사 |
| 실제 Excel 출력 | 그리드가 내보낸 일반 파일과 2×2 병합 파일을 Microsoft Excel에서 읽기 전용으로 열어 행 수·코드·이름·수량·병합 범위·가려진 셀 값 확인 |
| 폐쇄망 | file://와 browser offline 모드에서 기본 편집·Undo, XLSX 내보내기, 그룹·트리 실행. HTTP 요청 0건, JS 예외 0건 |
| 배포 형식 | 브라우저 script 실행, ESM import와 CommonJS require; XLSX 선택 의존성 로컬 동봉 |
| 패키지 | 런타임 다운로드 없음. 선택 모듈의 원본 배너·Apache-2.0 LICENSE·고지문·SHA256SUMS 포함 |
| 카탈로그 | 후보 170개. 초기 구현 45 / 일부 구현 13 / 계획 112. 이는 기능·품질 요구·별도 확장 후보를 합친 수이며 완성도 백분율이 아님 |

로컬 개발 검증 환경은 Node 24.15.0, Playwright 1.66.0-alpha-1794252756000, Chromium 158.0.8127.18입니다. CI는 Node 22에서 단위 검사·빌드·카탈로그와 배포물 일치 검사를 수행합니다. 브라우저와 Excel 검사는 로컬 실행 결과입니다.

## 재현

외부 패키지 설치 없이 Node만으로:

```sh
npm run check
```

Playwright·Chromium이 준비된 개발 환경에서 한 터미널은 `node scripts/serve.mjs`, 다른 터미널은 다음을 실행합니다.

```sh
node scripts/browser-check.mjs
node scripts/browser-advanced-check.mjs
```

Windows의 Microsoft Excel이 준비되어 있고 실행 정책상 허용되는 STA 세션에서 `scripts/capture-excel-fixture.ps1`을 실행하면 자체 예제 데이터로 `output/excel-fixture/`를 만듭니다. 한글 소스는 UTF-8로 읽습니다. 이 스크립트는 별도 숨김 Excel 인스턴스를 생성하고, 기존 클립보드를 메모리에 보관했다가 복원합니다. 기존 사용자 워크북을 열거나 저장하지 않습니다. 브라우저 고급 검사를 다시 실행하면 이 실제 Excel fixture도 검사합니다. `scripts/verify-excel-export.ps1`은 브라우저 검사로 생성한 두 XLSX를 새 Excel에서 읽기 전용으로 열어 확인합니다.

실제 Excel→브라우저를 수동으로 전환하며 직접 Ctrl+C/V를 누르는 전체 데스크톱 조작을 수행했다는 뜻은 아닙니다. 검사는 Excel에서 실제로 복사한 HTML/TSV의 브라우저 재현, Excel 생성 XLSX 가져오기, Moa 생성 XLSX의 Excel 열기를 구분해 기록합니다.

## 시각·접근성: DEGRADED

필터·다단 그룹/소계·트리·병합·고정 열의 데스크톱 원본 캡처와 모바일 기본·필터·트리 대표 화면을 검토했습니다. 46개 반응형 캡처와 320~2560px의 38개 너비 스캔에서 문서 가로 넘침·브라우저 오류는 없었습니다. 원본은 로컬 `.codex/design/reviews/`에 보관합니다. 모든 캡처와 모든 원본 슬라이스의 수동 검토, 스크린리더·한글 IME 실기기 검사는 완료하지 않았으므로 전체 시각/접근성 게이트 통과로 표시하지 않습니다.

표는 작은 화면에서 내부 가로 스크롤을 사용합니다. 헤더의 말줄임은 전체 접근성 이름과 title을 유지하며, 화면 밖 헤더 버튼은 내부 스크롤로 접근합니다. 캡처 도구의 Windows 링크 경로 진입점·RGB PNG 처리는 무시되는 output 폴더의 도구 복사본에서만 조정했습니다. 설치 스킬은 변경하지 않았습니다.

## 남은 범위

- RealGrid 실행본과의 버전·설정별 대조 시험, 기존 API 교체 호환성.
- 한글 IME 실기기·macOS 단축키·다른 브라우저 엔진·모바일 실기기·NVDA/VoiceOver와 전체 대비 검사.
- 대량 데이터·가상 스크롤·페이징·메모리 성능. 구조 이력은 행 스냅샷을 보관합니다.
- 자동 같은 값 병합·병합 그룹, 오른쪽/행 고정, 트리 지연 로드·이동, 고급 렌더러·엑셀 스타일·보호·수식 엔진.
- 서버·DB 저장. 현재 데이터는 메모리에서 관리하고 호스트 콜백으로 저장 기능을 연결합니다.

검증 산출물은 `output/playwright/`, `output/excel-fixture/`, `.codex/design/reviews/`에 보관하며 공개 Git에는 올리지 않습니다. 공개 저장소에는 재현 스크립트와 이 요약을 포함합니다.

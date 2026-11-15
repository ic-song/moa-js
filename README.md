# Moa JS

**폐쇄망에서도 가져다 쓰는 업무용 JavaScript 도구함.** 첫 모듈은 엑셀 방식으로 조작하는 데이터 그리드입니다. 이름은 현재 가칭입니다.

코어는 외부 런타임 의존성·CDN·웹폰트·온라인 인증·텔레메트리 없이 실행합니다. XLSX 파일 기능에는 로컬 동봉한 SheetJS Community Edition을 선택적으로 사용합니다. 프레임워크와 분리된 JS·CSS 파일을 제공하며 Moa 자체 코드는 상업적 사용과 수정·재배포가 가능한 MIT 라이선스입니다. 동봉 라이브러리는 [별도 Apache-2.0 라이선스](packages/grid/THIRD_PARTY_NOTICES.md)를 유지합니다.

현재 **0.4.0**으로 Excel 다운로드 범위 선택과 가상 스크롤·무한 스크롤·페이징 전환을 제공합니다. A1 수식·그룹/트리·공개 API 일부 이행 계층도 포함합니다. RealGrid 공식 기능을 참고해 자체 구현하며 원본 코드·리소스를 포함하지 않습니다. RealGrid 전체 기능·API와의 호환성을 보장하지 않습니다. npm에는 아직 등록하지 않았습니다.

## 0.4.0에 추가한 기능

- **엑셀 다운로드**: 현재 페이지/불러온 행·검색정렬 결과·전체 데이터·선택 영역을 XLSX로 저장
- **표시 방식 선택**: 가상 스크롤 / 무한 스크롤 / 페이징을 툴바와 API로 전환
- **무한 스크롤**: 로컬 데이터를 하단에서 추가 표시, 더보기 버튼·종료 상태
- **페이징**: 행 수·처음/이전/다음/마지막·페이지 번호 이동, 검색/정렬 후 초기화
- 데이터·수식·Undo/Redo를 유지하며 전환. [사용 API와 범위](docs/data-modes.md)

## 0.3.0에 추가한 기능

- 행·열 가상 스크롤: 10만 행·200열 시나리오와 화면 밖 범위 조작 검증
- opt-in A1 수식: 참조·범위·13개 함수·계산 오류·Undo/Redo·XLSX 원문 보존
- `MoaRealGrid.LocalDataProvider`·`GridView` 공개 API 일부 이행과 공유 데이터/이력
- IME 조합 중 입력 DOM 유지·Enter/Tab 처리, 외부 데이터 변경 시 오래된 편집 방지
- [확장 예제](examples/advanced/index.html), [확장 API](docs/grid-advanced.md), [이행 지원표](docs/realgrid-api-subset.md)

## 앞서 추가한 Excel·고급 기능

- Excel 셀의 HTML+TSV 복사·붙여넣기: 쉼표 숫자·소수·한글·셀 내부 탭·줄바꿈
- 일반 모드에서 빈 표·마지막 행 이후 붙여넣기의 자동 행 확장과 한 번의 Undo/Redo
- 행 추가·선택 행 삭제·파일 교체 이력, AND/OR 조건 필터와 다중 컬럼 정렬
- 왼쪽 열 고정, 마우스·키보드 열 너비 조절
- 다단 행 그룹과 숫자 소계, ID·부모 ID 기반 트리와 자손 삭제
- 사각형 셀 병합·해제, 원본 값 보존과 병합 영역 Delete/Undo
- 로컬 XLSX 가져오기·내보내기와 가져오기 전체 Undo/Redo

범위와 차이는 [RealGrid 비교표](docs/realgrid-comparison.md), API는 [Grid README](packages/grid/README.md)에 정리했습니다.

## 바로 실행

저장소 ZIP을 받아 압축을 풀고 [examples/grid/index.html](examples/grid/index.html)을 브라우저에서 여세요. Node·npm·웹서버·인터넷 연결 없이 예제를 실행할 수 있습니다. 조직 브라우저 정책이 로컬 스크립트를 제한하면 같은 파일을 내부 웹서버에서 제공합니다.

기존 JSP·HTML 프로젝트에는 아래 두 파일을 복사합니다.

```html
<link rel="stylesheet" href="./moa-grid.css">
<div id="grid"></div>
<script src="./moa-grid.js"></script>
<script>
  const grid = new MoaGrid('#grid', {
    columns: [
      { field: 'code', header: '코드', editable: false },
      { field: 'name', header: '이름' },
      { field: 'quantity', header: '수량', type: 'number' }
    ],
    data: [{ code: 'A001', name: '품목', quantity: 10 }],
    onChange: ({ reason, changes, data }) => {
      // 호스트 애플리케이션에서 저장합니다. 그리드는 서버 통신을 하지 않습니다.
      console.log(reason, changes);
    }
  });
</script>
```

배포 파일 위치: [packages/grid/dist](packages/grid/dist). ESM과 CommonJS도 제공합니다. XLSX 파일 기능을 쓰려면 [vendor/sheetjs](packages/grid/vendor/sheetjs)의 로컬 JS를 그리드보다 먼저 로드하세요. 복사·붙여넣기만 사용할 때는 이 선택 모듈이 필요하지 않습니다. 배포 파일 해시는 [SHA256SUMS.txt](packages/grid/SHA256SUMS.txt)에 있습니다.

## 셀 조작

| 조작 | 동작 |
| --- | --- |
| 드래그 / Shift+방향키 | 사각형 범위 선택·확장·축소 |
| Ctrl+C | 선택 영역을 엑셀과 교환 가능한 TSV로 복사 |
| Ctrl+V | 여러 셀 붙여넣기, 한 번에 검증·반영 |
| Delete / Backspace | 선택한 셀 값 지우기, 행은 보존 |
| Ctrl+Z | 붙여넣기·지우기·셀 편집을 작업 단위로 되돌리기 |
| Ctrl+Y / Ctrl+Shift+Z | 다시 실행 |
| F2 / 더블클릭 | 셀 편집, Enter 확정, Esc 취소 |
| Tab / Shift+Tab | 다음·이전 셀; 표의 첫·마지막 경계에서는 밖으로 이동 |

macOS는 Ctrl 대신 ⌘를 사용합니다. 셀 안에서 텍스트를 편집 중이면 복사·붙여넣기·실행 취소는 기본 입력창 동작을 유지합니다. 읽기 전용 컬럼은 보호하며, 잘못된 값·범위 초과가 있으면 붙여넣기 전체를 적용하지 않습니다. 자세한 정책은 [셀 조작 계약](docs/grid-interaction-contract.md)에 있습니다.

일반 모드에서는 행만 부족한 경우 자동으로 추가합니다. 그룹·트리·검색·조건 필터 상태의 행 범위 초과는 거부합니다. XLSX 가져오기는 헤더로 매핑한 데이터 전체 교체이며 Ctrl+Z/Y로 복원할 수 있습니다. 한글 composition 파이프라인은 검사했으며, 네이티브 IME·스크린리더·다른 브라우저 엔진은 추가 수용시험이 필요합니다.

## 구현 대상과 개발 순서

- [기능 카탈로그](docs/feature-catalog.md): 공식 근거·구현 단계·상태·완료 판정이 있는 1차 기능 후보 목록
- [로드맵](docs/roadmap.md): 핵심 조작 → 업무 적용 → 고급 그리드 → 독립 모듈 확장
- [기계 판독 원본](docs/features.json): 기능 ID별 개발·검증 추적
- [검증 기록](docs/verification.md): 실행한 검사와 남은 제약

## 인터넷 없이 빌드·모델 테스트

Node.js 20 이상이 준비되어 있으면 외부 패키지 설치 없이 실행합니다.

```sh
npm test
npm run build
npm run catalog -- --check
```

`npm run build`는 소스에서 브라우저 JS·ESM·CommonJS·CSS를 생성합니다. `npm run catalog`는 JSON 원본에서 기능 문서를 갱신합니다. 배포물은 저장소에 포함하므로 사용자가 빌드할 필요는 없습니다.

브라우저 개발 검증 도구는 런타임과 별개입니다. Playwright와 Chromium을 준비한 개발 환경에서 `node scripts/serve.mjs`를 실행하고 다른 터미널에서 `node scripts/browser-check.mjs`, `node scripts/browser-advanced-check.mjs`, `node scripts/browser-followup-check.mjs`, `node scripts/browser-paging-check.mjs`를 실행합니다. 폐쇄망에서는 이미 준비된 개발 도구를 반입하거나 배포 파일만 사용하세요. 실제 Excel 생성 파일·복사 데이터와 내보낸 파일 검증 방법은 [검증 기록](docs/verification.md)에 있습니다.

## 현재 한계

변경은 메모리에 유지되며 서버·파일에 자동 저장하지 않습니다. 서버 페이징·행 변경 상태·자동 같은 값 병합·피벗·전체 Excel 수식은 후속 구현 대상입니다. 그룹과 트리는 별도 모드이며 수동 병합은 가상 스크롤이 꺼진 일반 모드에서 사용합니다. 대용량 처리 성능과 전체 브라우저·한글 IME·스크린리더 호환성은 아직 인증하지 않았습니다.

RealGrid는 기능 참고 대상의 제품명이며 이 프로젝트는 해당 제품과 제휴하지 않습니다. [MIT License](LICENSE)는 이 저장소의 자체 작성물에 적용됩니다.

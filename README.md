# Moa JS

**폐쇄망에서도 가져다 쓰는 업무용 JavaScript 도구함.** 첫 모듈은 엑셀 방식으로 조작하는 데이터 그리드입니다. 이름은 현재 가칭입니다.

외부 런타임 의존성·CDN·웹폰트·온라인 인증·텔레메트리 없이 실행합니다. 프레임워크와 분리된 JS·CSS 파일을 제공하며, 상업적 사용과 수정·재배포가 가능한 MIT 라이선스를 사용합니다.

현재는 **초기 그리드 구현과 개발 백로그**를 제공하는 단계입니다. RealGrid 공식 기능을 참고해 자체 구현합니다. RealGrid의 원본 코드·리소스를 포함하지 않으며, RealGrid 전체 기능 또는 API와의 호환성을 보장하지 않습니다. npm에는 아직 등록하지 않았습니다.

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

배포 파일 위치: [packages/grid/dist](packages/grid/dist). ESM과 CommonJS도 제공합니다. 상세 API는 [Grid README](packages/grid/README.md)를 참고하세요.

## 첫 버전의 셀 조작

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

브라우저 개발 검증 도구는 런타임과 별개입니다. 인터넷 사용이 가능한 개발 환경에서 Playwright와 Chromium을 준비한 후 `node scripts/browser-check.mjs`로 실행합니다. 폐쇄망에서는 이미 준비된 개발 도구를 반입하거나 배포 파일만 사용하세요.

## 현재 한계

변경은 메모리에 유지되며 서버·파일에 자동 저장하지 않습니다. 붙여넣기로 행을 자동 추가하지 않으며, 가상 스크롤·페이징·다중 정렬·그룹·트리·XLSX는 후속 구현 대상입니다. 대용량 처리 성능과 전체 브라우저·한글 IME·스크린리더 호환성은 아직 인증하지 않았습니다. XLSX 지원은 의존성을 로컬 동봉하는 선택 모듈로 설계할 예정입니다.

RealGrid는 기능 참고 대상의 제품명이며 이 프로젝트는 해당 제품과 제휴하지 않습니다. [MIT License](LICENSE)는 이 저장소의 자체 작성물에 적용됩니다.

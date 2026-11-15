# @moa-js/grid 0.1.0

외부 의존성 없는 초기 데이터 그리드입니다. npm 미등록 상태로, 저장소 배포 파일을 직접 사용합니다.

## 배포 형식

| 파일 | 사용 방식 |
| --- | --- |
| `dist/moa-grid.js` | 일반 script로 로드, `new MoaGrid(element, options)` |
| `dist/moa-grid.mjs` | `import Grid, { GridModel, parseTSV, toTSV } from './moa-grid.mjs'` |
| `dist/moa-grid.cjs` | `const { Grid } = require('./moa-grid.cjs')` |
| `dist/moa-grid.css` | 공통 CSS, `.moa-grid`의 `--moa-*` 변수로 테마 조정 |

ESM은 브라우저의 로컬 파일 제한이 적용될 수 있으므로 직접 파일 실행에는 일반 script 배포본을 사용하세요.

## 옵션

`new Grid(target, options)`는 비어 있는 컨테이너 요소 또는 선택자를 받습니다.

| 옵션 | 설명 |
| --- | --- |
| `columns` | 필수 배열, 각 컬럼은 `field`, `header`, `type`, `editable`, `required`, `width`, `validate` 사용 |
| `data` | 행 객체 배열, 기본값 `[]` |
| `editable` | 전체 편집 여부, 기본값 `true` |
| `historyLimit` | 보관할 트랜잭션 수, 기본값 `100` |
| `label` | 그리드 접근성 이름 |
| `onChange(event)` | `{reason, changes, data}`; reason은 `edit`, `paste`, `clear`, `undo`, `redo` |
| `onSelectionChange(range)` | 0 기준 표시 좌표 `{top,bottom,left,right}` |

`type`은 기본 텍스트, `number`, `boolean` 변환을 지원합니다. `validate(value)`는 유효하면 falsy, 오류이면 메시지 문자열을 반환합니다. 빈 값은 required를 검사한 뒤 숫자·불린에는 `null`, 텍스트에는 빈 문자열로 저장됩니다. 현재 사용자 validate 콜백은 비어 있지 않은 값에만 호출합니다. 날짜·Object 셀 편집은 후속 대상입니다.

## 공개 메서드

- `getData()`: 현재 전체 행의 얕은 복사본. 중첩 객체 편집·격리 계약은 제공하지 않습니다.
- `setData(rows)`: 데이터 교체, 선택·이력 초기화. 현재 정렬·검색은 유지됩니다.
- `setSearch(text)`: 전체 문자열 검색. 기존 편집 중 입력은 취소됩니다.
- `getSelection()`: 현재 표시 좌표의 사각형 범위.
- `select({row,col}, extend = false)`: 표시 좌표 선택·확장. 비어 있으면 아무 동작도 하지 않습니다.
- `copySelection()`: TSV 문자열 반환. 시스템 클립보드 쓰기는 직접 Ctrl+C 사용자 입력으로 처리됩니다.
- `paste(text)`: 현재 선택의 왼쪽 위에 TSV 적용. 성공 여부 반환.
- `clearSelection()`, `undo()`, `redo()`: 작업 단위 변경.
- `downloadCSV()`: 현재 검색·정렬 결과를 CSV 파일로 내려받기.
- `destroy()`: DOM과 전역 이벤트 구독 해제. 재사용할 때 새 인스턴스를 만드세요.

`changes`는 `{row, field, previous, value}` 배열이며 `row`는 현재 전체 데이터 배열의 인덱스입니다. 선택 좌표는 검색·정렬 후 표시 인덱스이므로 둘을 혼용하면 안 됩니다. `setData` 이후 이전 인덱스와 이력은 유효하지 않습니다.

`onChange`는 데이터 반영 후 실행됩니다. 호스트 콜백에서 발생한 예외는 이미 반영된 트랜잭션을 되돌리지 않으므로, 저장 실패 처리는 호스트에서 별도로 관리하세요.

`GridModel`은 DOM 없이 사용할 수 있습니다. `apply(changes, reason)`로 원자적 변경을 수행하고, `getData()`, `undo()`, `redo()`, `canUndo`, `canRedo`를 제공합니다. 불변 기준점 롤백·서버 저장·행 추가·삭제는 아직 구현되지 않았습니다.

---
type: "query"
date: "2026-08-02T14:21:48.135515+00:00"
question: "터미널 trailing slot의 FLAP/ROLL 카드 껍데기와 늦은 구분선 문제를 어떻게 수정했는가?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["BoardScreen()", "BoardColumn()", "CSS"]
---

# Q: 터미널 trailing slot의 FLAP/ROLL 카드 껍데기와 늦은 구분선 문제를 어떻게 수정했는가?

## Answer

BoardScreen의 각 separator에 다음 positional slot의 transition kind를 부여했다. split/roll에서 is-slot-exit와 is-slot-enter는 개별 글자 대신 board-band-surface 전체를 애니메이션하고 중첩된 flap/roll 애니메이션은 비활성화한다. exiting separator는 slot-divider-out, entering separator는 slot-divider-in으로 카드와 같은 전환 구간에 처리한다. 동일 목적지 is-slot-flight의 값 단위 선렌더링은 유지했다. terminal 단위 테스트 56개, 전체 frontend 테스트, Playwright terminal 계약 12개와 production build가 통과했다.

## Outcome

- Signal: useful

## Source Nodes

- BoardScreen()
- BoardColumn()
- CSS
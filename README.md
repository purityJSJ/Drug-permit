# 의약품 제품 허가정보 검색 대시보드

식품의약품안전처 「의약품 제품 허가정보」 오픈API(전체 약 43,000여 건)를 매일 오전 9시 30분에
GitHub Actions로 수집해서, 검색 가능한 정적 웹페이지로 보여주는 프로젝트입니다.
`dmf-dashboard`와 동일한 구조(GitHub Actions cron + 정적 JSON + GitHub Pages)를 씁니다.

## ⚠️ 필드명 확인 필요

이 API는 DMF현황 API보다 필드 스펙 문서를 정확히 확인하기 어려워서, 코드에는 가장 유력한
필드명 후보(`ITEM_NAME`, `ENTP_NAME`, `MATERIAL_NAME`, `ITEM_PERMIT_DATE`, `ETC_OTC_NAME`,
`CANCEL_NAME` 등)를 넣어뒀습니다.

**첫 실행 후 Actions 로그를 꼭 확인하세요.** 로그에 다음 줄이 찍힙니다:

```
첫 항목의 원본 키 목록 (필드명 확인용): [...]
```

여기 나오는 실제 키 이름이 스크립트에서 쓰는 이름과 다르면, `scripts/fetch-drug.mjs`의
`slim()` 함수에 있는 `pick(raw, [...])` 후보 목록에 실제 키 이름을 추가해주시면 됩니다.
(DMF 프로젝트 때도 이런 식으로 실제 응답을 보고 한 번 고쳤었죠.)

## 설정 방법 (dmf-dashboard와 동일)

1. 이 폴더 전체를 새 GitHub 리포지토리에 업로드 (`.github` 폴더 누락 여부 꼭 확인)
2. Settings → Secrets and variables → Actions에 `DRUG_API_KEY` 등록
   (data.go.kr에서 이 API를 별도로 "활용신청"한 인증키가 필요합니다 — DMF용 키와는 별개 신청)
3. 리포지토리 Public 전환
4. Settings → Pages → Branch: main, 폴더: /docs
5. Actions 탭 → Run workflow로 첫 실행 → 로그에서 필드명 확인

## 참고

- 목록 조회 엔드포인트: `https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07`
- 전체 데이터가 커서(4.3만 건, 약 600페이지) 첫 실행은 수 분 정도 걸릴 수 있습니다.

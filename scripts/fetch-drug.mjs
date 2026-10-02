// scripts/fetch-drug.mjs
//
// 식품의약품안전처_의약품 제품 허가정보 오픈API를 호출해서
// 전체 데이터를 페이지네이션으로 수집하고, 대시보드가 읽을 요약 JSON을 만듭니다.
//
// 실행: node scripts/fetch-drug.mjs
// 필요 환경변수: DRUG_API_KEY (공공데이터포털에서 발급받은 인증키, 인코딩된 형태 그대로)

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ENDPOINT = "https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07";
const NUM_OF_ROWS = 100;
const MAX_PAGES = 600;

function getDecodedServiceKey() {
  const raw = process.env.DRUG_API_KEY;
  if (!raw) {
    throw new Error("환경변수 DRUG_API_KEY가 설정되어 있지 않습니다.");
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(serviceKey, pageNo, attempt = 1) {
  const MAX_ATTEMPTS = 4;

  const params = new URLSearchParams({
    serviceKey,
    pageNo: String(pageNo),
    numOfRows: String(NUM_OF_ROWS),
    type: "json",
  });

  const url = `${ENDPOINT}?${params.toString()}`;

  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      await sleep(1000 * attempt);
      return fetchPage(serviceKey, pageNo, attempt + 1);
    }
    throw new Error(`네트워크 오류 (page ${pageNo}, ${attempt}회 시도): ${err.message}`);
  }

  if (!res.ok) {
    if (attempt < MAX_ATTEMPTS) {
      await sleep(1000 * attempt);
      return fetchPage(serviceKey, pageNo, attempt + 1);
    }
    throw new Error(`HTTP ${res.status} ${res.statusText} (page ${pageNo})`);
  }

  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`JSON 파싱 실패 (page ${pageNo}). 응답 원문 앞부분: ${text.slice(0, 300)}`);
  }

  const header = json?.response?.header ?? json?.header;
  if (!header || header.resultCode !== "00") {
    throw new Error(
      `API 오류: ${header?.resultCode ?? "?"} ${header?.resultMsg ?? "알 수 없는 오류"} | 원문: ${text.slice(0, 500)}`
    );
  }

  const body = json?.response?.body ?? json?.body;
  const totalCount = Number(body?.totalCount ?? 0);

  let items = body?.items;
  if (Array.isArray(items)) {
    // 그대로 사용
  } else if (items?.item) {
    items = Array.isArray(items.item) ? items.item : [items.item];
  } else {
    items = [];
  }

  return { items, totalCount };
}

async function fetchAll() {
  const serviceKey = getDecodedServiceKey();

  const first = await fetchPage(serviceKey, 1);
  const all = [...first.items];
  const totalCount = first.totalCount;
  const totalPages = Math.min(Math.ceil(totalCount / NUM_OF_ROWS), MAX_PAGES);

  console.log(`전체 ${totalCount}건 확인, ${totalPages}페이지 수집 예정...`);

  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const { items } = await fetchPage(serviceKey, pageNo);
    all.push(...items);
    if (pageNo % 50 === 0) {
      console.log(`  ...${pageNo}/${totalPages} 페이지 완료 (누적 ${all.length}건)`);
    }
  }

  return { items: all, totalCount };
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return "";
}

// 2026-09-xx 첫 실행 로그로 확인된 실제 필드명 기준으로 수정함:
// 주성분 = ITEM_INGR_NAME (MATERIAL_NAME 아님)
// 전문/일반 = SPCLTY_PBLC (ETC_OTC_NAME 아님)
function slim(raw) {
  return {
    ITEM_SEQ: pick(raw, ["ITEM_SEQ"]),
    ITEM_NAME: pick(raw, ["ITEM_NAME"]),
    ENTP_NAME: pick(raw, ["ENTP_NAME"]),
    MATERIAL_NAME: pick(raw, ["ITEM_INGR_NAME", "MATERIAL_NAME"]),
    ITEM_PERMIT_DATE: pick(raw, ["ITEM_PERMIT_DATE"]),
    ETC_OTC_NAME: pick(raw, ["SPCLTY_PBLC", "ETC_OTC_NAME"]),
    CANCEL_NAME: pick(raw, ["CANCEL_NAME"]),
    CANCEL_DATE: pick(raw, ["CANCEL_DATE"]),
    PERMIT_KIND_CODE: pick(raw, ["PERMIT_KIND_CODE"]),
    BIZRNO: pick(raw, ["BIZRNO"]),
  };
}

function buildSummary(items) {
  const byCompany = new Map();
  const byEtcOtc = new Map();
  let cancelledCount = 0;

  for (const it of items) {
    const company = it.ENTP_NAME?.trim();
    if (company) byCompany.set(company, (byCompany.get(company) ?? 0) + 1);

    const etcOtc = it.ETC_OTC_NAME?.trim();
    if (etcOtc) byEtcOtc.set(etcOtc, (byEtcOtc.get(etcOtc) ?? 0) + 1);

    if (it.CANCEL_NAME && it.CANCEL_NAME.trim() && it.CANCEL_NAME.trim() !== "정상") {
      cancelledCount += 1;
    }
  }

  const topCompanies = [...byCompany.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const etcOtcBreakdown = [...byEtcOtc.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  return {
    uniqueCompanies: byCompany.size,
    topCompanies,
    etcOtcBreakdown,
    cancelledCount,
  };
}

async function main() {
  console.log("의약품 제품 허가정보 수집을 시작합니다...");
  const { items: rawItems, totalCount } = await fetchAll();
  console.log(`수집 완료: ${rawItems.length} / ${totalCount}건`);

  if (rawItems.length > 0) {
    console.log("첫 항목의 원본 키 목록 (필드명 확인용):", Object.keys(rawItems[0]));
    console.log("ETC_OTC_NAME(전문/일반) 매핑 확인용 첫 항목 SPCLTY_PBLC 값:", rawItems[0].SPCLTY_PBLC);
  }

  const items = rawItems.map(slim);
  const summary = buildSummary(items);

  const output = {
    generatedAt: new Date().toISOString(),
    totalCount,
    fetchedCount: items.length,
    summary,
    items,
  };

  const outDir = path.resolve("data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "latest.json");
  await writeFile(outPath, JSON.stringify(output), "utf-8");

  console.log(`저장 완료: ${outPath}`);
}

main().catch((err) => {
  console.error("데이터 수집 실패:", err.message);
  process.exit(1);
});

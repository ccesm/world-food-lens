/**
 * Official-source adapter registry.
 *
 * The old ChatGPT-hosted site had a server-side/cache synchronization layer.
 * That projection is not exportable as source code, so this Git migration
 * intentionally separates recovered cache data from future live adapters.
 *
 * IMPORTANT:
 * - Do not put private API keys in browser code.
 * - Prefer a serverless/backend proxy for providers requiring credentials.
 * - Every adapter should return observation period, fetch time, units and source URL.
 */

export const officialSources = {
  fao: {
    label: "FAO Food Price Index",
    homepage: "https://www.fao.org/worldfoodsituation/foodpricesindex/",
    status: "adapter-pending",
  },
  eia: {
    label: "U.S. EIA / Brent",
    homepage: "https://www.eia.gov/",
    status: "adapter-pending",
  },
  worldBank: {
    label: "World Bank Commodity Price Data (Pink Sheet)",
    homepage: "https://www.worldbank.org/en/research/commodity-markets",
    status: "adapter-pending",
  },
  usda: {
    label: "USDA PSD / WASDE",
    homepage: "https://apps.fas.usda.gov/psdonline/",
    status: "adapter-pending",
  },
  fapda: {
    label: "FAO FAPDA",
    homepage: "https://fapda.apps.fao.org/",
    status: "adapter-pending",
  },
};

export async function refreshOfficialData() {
  return {
    ok: false,
    mode: "recovered-cache",
    message:
      "Live source adapters are not configured in this Git migration yet. The dashboard is showing a recovered cache snapshot from the previous hosted site.",
  };
}

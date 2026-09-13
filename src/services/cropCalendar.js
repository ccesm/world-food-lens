import {STAGES} from "../data/cropCalendars.js";

export function stageForMonth(record,month) {
  if (!Number.isInteger(month) || month<1 || month>12 || record?.months?.length!==12) return null;
  const code=record.months[month-1];
  if (!STAGES[code]) return null;
  return {code,...STAGES[code],critical:["F","G","W"].includes(code)};
}
export function seasonalPriorities(records,month) {
  return records.map(record=>({record,stage:stageForMonth(record,month)}))
    .filter(row=>row.stage?.critical)
    .sort((a,b)=>b.stage.sensitivity-a.stage.sensitivity || a.record.id.localeCompare(b.record.id));
}

// Educational joint-exposure checklist, not a fitted probability of plant death.
export function winterExposure({winterCrop,severeCold,lowSnow,prolonged}={}) {
  const inputs=[winterCrop,severeCold,lowSnow,prolonged];
  if (inputs.some(value=>typeof value!=="boolean")) return "unknown";
  return inputs.every(Boolean)?"joint-exposure":"not-all-present";
}

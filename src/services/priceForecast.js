// A deliberately small, reproducible price-only model. No future observations
// enter a rolling training window. Revised historical vintages are disclosed in UI.
export function monthOffset(month, offset) {
  const [year, number] = month.split("-").map(Number);
  const ordinal = year * 12 + number - 1 + offset;
  return `${Math.floor(ordinal / 12)}-${String(ordinal % 12 + 1).padStart(2, "0")}`;
}

export function fitMomentum(rows) {
  const returns = rows.slice(1).map((row, i) => Math.log(row.fao / rows[i].fao));
  let xy = 0, xx = 0.01; // fixed ridge penalty, no look-ahead tuning
  for (let i = 1; i < returns.length; i++) {
    xy += returns[i - 1] * returns[i];
    xx += returns[i - 1] ** 2;
  }
  const phi = Math.max(-0.95, Math.min(0.95, xy / xx));
  return {phi, lastReturn:returns.at(-1) || 0, last:rows.at(-1).fao};
}

function path(model, horizon) {
  let value = model.last, momentum = model.lastReturn;
  return Array.from({length:horizon}, () => {
    momentum *= model.phi;
    value *= Math.exp(momentum);
    return value;
  });
}

function quantile(values, p) {
  const sorted = [...values].sort((a,b) => a-b);
  const index = (sorted.length - 1) * p, lo = Math.floor(index);
  return sorted[lo] + (sorted[Math.ceil(index)] - sorted[lo]) * (index-lo);
}

export function buildPriceForecast(input, shockPct = 0) {
  if (!Array.isArray(input) || input.length < 84) return {available:false, reason:"short"};
  if (!Number.isFinite(shockPct) || Math.abs(shockPct) > 50) return {available:false, reason:"shock"};
  if (input.some((row,i) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) ||
    !Number.isFinite(row.fao) || row.fao <= 0 ||
    (i && monthOffset(input[i-1].month,1) !== row.month))) return {available:false, reason:"gaps"};
  const errors = Array.from({length:12}, () => []);
  const modelErrors = errors.map(() => []), naiveErrors = errors.map(() => []);
  // Same origins and outcomes for all horizons; up to 60 rolling origins.
  const firstOrigin = Math.max(59, input.length - 12 - 60);
  for (let origin = firstOrigin; origin < input.length - 12; origin++) {
    const train = input.slice(Math.max(0,origin-119), origin+1);
    const forecast = path(fitMomentum(train),12);
    for (let h = 0; h < 12; h++) {
      const actual = input[origin+h+1].fao;
      errors[h].push(Math.log(actual/forecast[h]));
      modelErrors[h].push(Math.abs(actual-forecast[h]));
      naiveErrors[h].push(Math.abs(actual-input[origin].fao));
    }
  }
  const training = input.slice(-120), model = fitMomentum(training);
  const future = path(model,12), last = input.at(-1);
  const mean = values => values.reduce((a,b)=>a+b,0)/values.length;
  const points = future.map((value,h) => {
    // Scenario is an explicitly user-assumed price shock, not a fitted causal effect.
    const multiplier = Math.exp(Math.log1p(shockPct/100)*(h+1)/12);
    return {month:monthOffset(last.month,h+1), forecast:value, scenario:value*multiplier,
      band:[value*Math.exp(Math.min(0,quantile(errors[h],.1))), value*Math.exp(Math.max(0,quantile(errors[h],.9)))],
      horizon:h+1, mae:mean(modelErrors[h]), naiveMae:mean(naiveErrors[h]), samples:errors[h].length};
  });
  return {available:true, points, model, trainingStart:training[0].month, lastMonth:last.month,
    originStart:input[firstOrigin].month, originEnd:input[input.length-13].month,
    history:input.slice(-24).map(row=>({month:row.month,actual:row.fao})), lastValue:last.fao};
}

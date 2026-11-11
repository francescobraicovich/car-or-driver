// Cached DOM element references. Call initDom() once on startup.
export const el = {};

const IDS = [
  'ratingsHost',
  'chartsPanel',
  'headToHeadPanel',
  'headToHeadA',
  'headToHeadB',
  'headToHeadLaps',
  'headToHeadGridFields',
  'headToHeadGridA',
  'headToHeadGridB',
  'headToHeadChart',
  'headToHeadChartWrap',
  'headToHeadNote',
  'headToHeadState',
  'headToHeadPrimeA',
  'headToHeadPrimeB',
  'headToHeadSameCar',
  'headToHeadCarName',
  'headToHeadOut',
  'headToHeadSideA',
  'headToHeadSideB',
];

export function initDom() {
  for (const id of IDS) el[id] = document.getElementById(id);
}

// Cached DOM element references. Call initDom() once on startup.
export const el = {};

const IDS = [
  'status',
  'ratingsHost',
  'chartsPanel',
  'headToHeadPanel',
  'headToHeadA',
  'headToHeadB',
  'headToHeadLaps',
  'headToHeadGridFields',
  'headToHeadChart',
  'headToHeadChartWrap',
  'headToHeadNote',
  'headToHeadOut',
  'headToHeadGridA',
  'headToHeadGridB',
  'headToHeadSession',
  'headToHeadCircuit',
  'headToHeadSideA',
  'headToHeadSideB',
  'headToHeadWet',
  'headToHeadSessionField',
];

export function initDom() {
  for (const id of IDS) el[id] = document.getElementById(id);
}

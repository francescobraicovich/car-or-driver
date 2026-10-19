// Retirement-cause attribution: status.csv -> mechanical/driver weights.
const UNKNOWN = { mech: 0, driver: 0, label: 'unknown / censored' };

export function isFinishStatusName(s) {
  s = (s || '').trim();
  return s === 'Finished' || /^\+\d+ Laps?$/.test(s);
}

export function defaultClass(status) {
  const s = (status || '').trim();
  const k = s.toLowerCase();
  if (isFinishStatusName(s)) return { mech: 0, driver: 0, label: 'normal finish' };
  const high = new Set([
    'engine',
    'gearbox',
    'transmission',
    'clutch',
    'hydraulics',
    'electrical',
    'radiator',
    'differential',
    'overheating',
    'mechanical',
    'driveshaft',
    'fuel pressure',
    'water pressure',
    'throttle',
    'technical',
    'electronics',
    'heat shield fire',
    'exhaust',
    'oil leak',
    'water leak',
    'fuel pump',
    'track rod',
    'oil pressure',
    'engine fire',
    'engine misfire',
    'pneumatics',
    'fuel system',
    'oil line',
    'fuel rig',
    'launch control',
    'fuel',
    'power loss',
    'drivetrain',
    'ignition',
    'chassis',
    'battery',
    'stalled',
    'halfshaft',
    'crankshaft',
    'alternator',
    'oil pump',
    'fuel leak',
    'injection',
    'distributor',
    'turbo',
    'cv joint',
    'water pump',
    'spark plugs',
    'fuel pipe',
    'oil pipe',
    'axle',
    'water pipe',
    'magneto',
    'supercharger',
    'power unit',
    'ers',
    'cooling system',
    'safety switch',
  ]);
  const med = new Set([
    'suspension',
    'brakes',
    'tyre',
    'puncture',
    'front wing',
    'wheel',
    'steering',
    'broken wing',
    'wheel rim',
    'tyre puncture',
    'wheel nut',
    'handling',
    'rear wing',
    'fire',
    'wheel bearing',
    'vibrations',
    'vibration',
    'brake duct',
    'undertray',
    'seat',
    'driver seat',
    'out of fuel',
  ]);
  if (high.has(k)) return { mech: 1, driver: 0, label: 'mechanical — high confidence' };
  if (med.has(k)) return { mech: 0.55, driver: 0.05, label: 'mechanical / damage ambiguous' };
  if (k === 'spun off') return { mech: 0, driver: 0.95, label: 'driver incident — high confidence' };
  if (k === 'accident') return { mech: 0.02, driver: 0.8, label: 'driver incident — probable' };
  if (k === 'collision') return { mech: 0.02, driver: 0.45, label: 'collision — fault ambiguous' };
  if (k === 'collision damage') return { mech: 0.08, driver: 0.35, label: 'collision damage — mixed/ambiguous' };
  if (k === 'fatal accident') return { mech: 0.02, driver: 0.75, label: 'accident — cause not fully observed' };
  if (k === 'damage') return { mech: 0.2, driver: 0.25, label: 'damage — highly ambiguous' };
  if (k === 'debris') return { mech: 0.02, driver: 0.02, label: 'external / debris' };
  if (['retired', 'physical', 'not restarted', 'safety', 'safety concerns'].includes(k))
    return { mech: 0, driver: 0, label: 'unknown / censored' };
  if (
    [
      'disqualified',
      'underweight',
      'excluded',
      '107% rule',
      'did not qualify',
      'did not prequalify',
      'withdrew',
      'not classified',
    ].includes(k)
  )
    return { mech: 0, driver: 0, label: 'administrative / censored' };
  if (['injured', 'injury', 'driver unwell', 'illness', 'eye injury'].includes(k))
    return { mech: 0, driver: 0, label: 'driver health / censored' };
  return UNKNOWN;
}

/** statusId -> default attribution, for every row of status.csv. */
export function buildDefaultMapping(statusRows) {
  return new Map((statusRows || []).map((s) => [String(s.statusId), defaultClass(s.status)]));
}

/** statusId -> status name. */
export function statusNameMap(statusRows) {
  return new Map((statusRows || []).map((s) => [String(s.statusId), s.status]));
}

/** Lookup over explicitly passed maps `{ def, ov }` (no globals; worker-safe). */
export function lookupMapping(maps, statusId) {
  const k = String(statusId);
  return maps?.ov?.get(k) || maps?.def?.get(k) || UNKNOWN;
}

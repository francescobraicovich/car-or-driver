// Construct graph replay exclusively from simulated evidence.
export function simulatedWeekends(timeline) {
  return timeline.map((weekend) => {
    const replayObs = ['race', 'qual'].flatMap((session) => weekend.obs[session].map((row) => {
      if (![0, 1].includes(row.o) || !row.x || !row.y || !row.cx || !row.cy || !Number.isFinite(row.w) || row.w <= 0)
        throw Error('Invalid synthetic observation');
      if (session === 'race' && (!(row.base > 0) || !Number.isFinite(row.base) || !row.src))
        throw Error('Missing synthetic race metadata');
      if (session === 'qual' && (!['q1', 'q2', 'q3'].includes(row.seg) || !Number.isFinite(row.tx) || !Number.isFinite(row.ty) || row.tx === row.ty || (row.tx < row.ty ? 1 : 0) !== row.o))
        throw Error('Missing or inconsistent synthetic qualifying metadata');
      return { session, weight: row.w, ob: { x: { driverId: row.x, constructorId: row.cx }, y: { driverId: row.y, constructorId: row.cy },
        obs: row.o, source: row.src, base: row.base, seg: row.seg, tx: row.tx, ty: row.ty } };
    }));
    return { info: { year: weekend.year, round: weekend.round, date: weekend.date, raceId: weekend.raceId },
      rows: weekend.rows, raceObs: weekend.obs.race, qualObs: weekend.obs.qual, replayObs };
  });
}

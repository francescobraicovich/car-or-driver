// Curated wet-weather flag per Grand Prix (2000-2015).
//
// Source: "Races in the rain or on a wet track in F1",
// Tudo Sobre Fórmula 1 (tudosobreformula1.com.br/corridas-com-pista-molhada-ou-umida),
// which lists rain-affected races with per-race notes on what counted.
// Definition used here: rain fell and wetted the track during the event
// (drizzle that never wet the track is excluded by the source).
//
// Notes:
// - 2013 lists "Evil (Vettel)": no such GP exists; the only 2013 Vettel win
//   from a wet start is Malaysia (opened on intermediates), mapped as such.
// - GP names match RaceData races.csv ("X Grand Prix") and are verified by
//   packages/research/node/verify-wet.mjs (each entry must match exactly one raceId).
export const WET_RACES = [
  { year: 2000, gp: 'European Grand Prix' },
  { year: 2000, gp: 'Canadian Grand Prix' },
  { year: 2000, gp: 'German Grand Prix' },
  { year: 2000, gp: 'Belgian Grand Prix' },
  { year: 2000, gp: 'United States Grand Prix' },
  { year: 2000, gp: 'Japanese Grand Prix' },
  { year: 2001, gp: 'Malaysian Grand Prix' },
  { year: 2001, gp: 'Brazilian Grand Prix' },
  { year: 2002, gp: 'British Grand Prix' },
  { year: 2003, gp: 'Brazilian Grand Prix' },
  { year: 2003, gp: 'United States Grand Prix' },
  { year: 2004, gp: 'Malaysian Grand Prix' },
  { year: 2004, gp: 'Italian Grand Prix' },
  { year: 2004, gp: 'Brazilian Grand Prix' },
  { year: 2005, gp: 'Belgian Grand Prix' },
  { year: 2006, gp: 'Hungarian Grand Prix' },
  { year: 2006, gp: 'Chinese Grand Prix' },
  { year: 2007, gp: 'European Grand Prix' },
  { year: 2007, gp: 'Japanese Grand Prix' },
  { year: 2007, gp: 'Chinese Grand Prix' },
  { year: 2008, gp: 'Monaco Grand Prix' },
  { year: 2008, gp: 'British Grand Prix' },
  { year: 2008, gp: 'Belgian Grand Prix' },
  { year: 2008, gp: 'Italian Grand Prix' },
  { year: 2008, gp: 'Brazilian Grand Prix' },
  { year: 2009, gp: 'Malaysian Grand Prix' },
  { year: 2009, gp: 'Chinese Grand Prix' },
  { year: 2010, gp: 'Australian Grand Prix' },
  { year: 2010, gp: 'Chinese Grand Prix' },
  { year: 2010, gp: 'Belgian Grand Prix' },
  { year: 2010, gp: 'Korean Grand Prix' },
  { year: 2011, gp: 'Canadian Grand Prix' },
  { year: 2011, gp: 'British Grand Prix' },
  { year: 2011, gp: 'Hungarian Grand Prix' },
  { year: 2012, gp: 'Malaysian Grand Prix' },
  { year: 2012, gp: 'Brazilian Grand Prix' },
  { year: 2013, gp: 'Malaysian Grand Prix' },
  { year: 2014, gp: 'Hungarian Grand Prix' },
  { year: 2014, gp: 'Japanese Grand Prix' },
  { year: 2015, gp: 'British Grand Prix' },
  { year: 2015, gp: 'United States Grand Prix' },
];

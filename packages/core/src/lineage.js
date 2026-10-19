// Teams that continue under a new constructor id: an owner change or a rename, with the same
// factory, staff and usually the same cars. The data gives each a fresh id, so without this the
// new id starts from the field average and the old one keeps a rating that goes stale (Renault
// returned in 2016 with its 2011 rating, Sauber in 2010 with its 2005 one).
//
// Each entry says: from the first weekend of `year` on, constructor `to` carries on from
// constructor `from`. Ids are the dataset's constructorId. Published history, not hindsight.
export const CONSTRUCTOR_LINEAGE = [
  { from: '22', to: '4', year: 2002 }, // Benetton -> Renault
  { from: '19', to: '9', year: 2005 }, // Jaguar -> Red Bull
  { from: '16', to: '11', year: 2006 }, // BAR -> Honda
  { from: '17', to: '13', year: 2006 }, // Jordan -> MF1
  { from: '13', to: '14', year: 2006, kind: 'rename' }, // MF1 -> Spyker MF1 (mid-season)
  { from: '18', to: '5', year: 2006 }, // Minardi -> Toro Rosso
  { from: '15', to: '2', year: 2006 }, // Sauber -> BMW Sauber
  { from: '14', to: '12', year: 2007, kind: 'rename' }, // Spyker MF1 -> Spyker
  { from: '12', to: '10', year: 2008 }, // Spyker -> Force India
  { from: '11', to: '23', year: 2009 }, // Honda -> Brawn
  { from: '23', to: '131', year: 2010 }, // Brawn -> Mercedes
  { from: '2', to: '15', year: 2010 }, // BMW Sauber -> Sauber
  { from: '4', to: '208', year: 2012 }, // Renault (Lotus Renault GP) -> Lotus F1
  { from: '166', to: '206', year: 2012, kind: 'rename' }, // Virgin -> Marussia
  { from: '205', to: '207', year: 2012 }, // Lotus Racing -> Caterham
  { from: '206', to: '209', year: 2015, kind: 'rename' }, // Marussia -> Manor
  { from: '208', to: '4', year: 2016 }, // Lotus F1 -> Renault
  { from: '10', to: '211', year: 2019, kind: 'rename' }, // Force India -> Racing Point
  { from: '15', to: '51', year: 2019, kind: 'rename' }, // Sauber -> Alfa Romeo
  { from: '5', to: '213', year: 2020, kind: 'rename' }, // Toro Rosso -> AlphaTauri
  { from: '4', to: '214', year: 2021, kind: 'rename' }, // Renault -> Alpine
  { from: '211', to: '117', year: 2021, kind: 'rename' }, // Racing Point -> Aston Martin
  { from: '213', to: '215', year: 2024, kind: 'rename' }, // AlphaTauri -> RB
  { from: '51', to: '15', year: 2024, kind: 'rename' }, // Alfa Romeo -> Sauber
  { from: '15', to: '217', year: 2026 }, // Sauber -> Audi
];

// The car, though, carries over only across a rename (same owner, factory and staff). After a takeover the new owner
// changes the car, so it starts fresh.
const carParent = new Map();
const findCar = (x) => (carParent.get(x) === undefined || carParent.get(x) === x ? x : findCar(carParent.get(x)));
for (const t of CONSTRUCTOR_LINEAGE) if (t.kind === 'rename') carParent.set(findCar(t.to), findCar(t.from));

/** The car a constructor id belongs to: every id a team raced under across renames maps to the same one. */
export const carIdentity = (id) => findCar(String(id));

// Driver nationality (demonym, from drivers.csv) -> country names as used in
// circuits.csv `country`. Only matchups that can trigger a home flag matter,
// but the map is generous. Dual nationalities count if either side matches.
const MAP = {
  British: ['UK'],
  German: ['Germany'],
  Spanish: ['Spain'],
  Finnish: ['Finland'],
  Japanese: ['Japan'],
  French: ['France'],
  Polish: ['Poland'],
  Brazilian: ['Brazil'],
  Italian: ['Italy'],
  Australian: ['Australia'],
  Austrian: ['Austria'],
  American: ['USA', 'United States'],
  Dutch: ['Netherlands'],
  Colombian: ['Colombia'],
  Portuguese: ['Portugal'],
  Canadian: ['Canada'],
  Indian: ['India'],
  Hungarian: ['Hungary'],
  Irish: ['Ireland'],
  Danish: ['Denmark'],
  Argentine: ['Argentina'],
  Argentinian: ['Argentina'],
  Czech: ['Czech Republic'],
  Malaysian: ['Malaysia'],
  Swiss: ['Switzerland'],
  Belgian: ['Belgium'],
  Monegasque: ['Monaco'],
  Swedish: ['Sweden'],
  Venezuelan: ['Venezuela'],
  'New Zealander': ['New Zealand'],
  Chilean: ['Chile'],
  Mexican: ['Mexico'],
  'South African': ['South Africa'],
  Thai: ['Thailand'],
  Russian: ['Russia'],
  Indonesian: ['Indonesia'],
  Chinese: ['China'],
  'East German': ['Germany'],
  'American-Italian': ['USA', 'United States', 'Italy'],
  'Argentine-Italian': ['Argentina', 'Italy'],
  Uruguayan: ['Uruguay'],
};

export function homeCountries(nationality) {
  return MAP[(nationality || '').trim()] || [];
}

export function isHomeRace(nationality, circuitCountry) {
  if (!nationality || !circuitCountry) return false;
  return homeCountries(nationality).includes(circuitCountry);
}

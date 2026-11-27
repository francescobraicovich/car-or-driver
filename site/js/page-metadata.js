// The title and description of each page of the site, as search engines and link previews show them. The publishing script writes them into the
// page published at each address (tools/build-pages.mjs), and the page shell sets the title when the address changes (workspace.js). The words are
// fixed; nothing here depends on the data, which changes after every Grand Prix.

export const SITE_NAME = 'Car or Driver';

/** The title of a page other than the front page: what it is, then the name of the site. */
export const pageTitle = (name) => `${name} - ${SITE_NAME}`;

export const PAGE_METADATA = {
  '/': {
    title: 'Who is the best Car or Driver in F1?',
    description:
      'Car or Driver separates how much of a Formula 1 result is the driver and how much is the car. Ratings with error bars for every weekend since 1994, head to head forecasts and findings.',
  },
  '/ratings': {
    title: pageTitle('F1 driver and car ratings, race by race'),
    heading: 'F1 driver and car ratings',
    description:
      'Formula 1 driver ratings and car ratings, with error bars, updated after every Grand Prix: who is the best driver once the car is taken out.',
  },
  '/history': {
    title: pageTitle('F1 driver rating history since 1994'),
    heading: 'F1 rating history',
    description:
      'Chart any Formula 1 driver’s or car’s rating over time, weekend by weekend since 1994, and compare drivers across seasons and eras.',
  },
  '/head-to-head': {
    title: pageTitle('F1 head to head: compare any two drivers'),
    heading: 'F1 head to head',
    description:
      'Compare two Formula 1 drivers or cars head to head: the rating gap between them and the chance that one finishes ahead of the other.',
  },
  '/prediction': {
    title: pageTitle('F1 race prediction for the next Grand Prix'),
    heading: 'F1 race prediction',
    description:
      'A prediction of the next Formula 1 Grand Prix from driver and car ratings: the expected finishing position of every driver, adjustable for the grid.',
  },
  '/graph': {
    title: pageTitle('F1 teammate network since 1994'),
    heading: 'The F1 teammate network',
    description:
      'Every Formula 1 driver since 1994 linked to their teammates, placed by era and rating, with their qualifying and race records against each teammate.',
  },
  '/insights': {
    title: pageTitle('F1 insights: driver or car, answered with data'),
    heading: 'F1 insights',
    description:
      'Who is the best Formula 1 driver since 1994, what is the best car, and how much of a result is the car? Findings from driver and car ratings.',
  },
  '/methodology': {
    title: pageTitle('How the F1 driver and car ratings work'),
    heading: 'How the ratings work',
    description:
      'How Car or Driver separates the Formula 1 driver from the car: the model behind the ratings, explained simply or in full.',
  },
  '/methodology/simple': {
    title: pageTitle('How the ratings work, simply explained'),
    heading: 'How the ratings work, simply explained',
    description:
      'A plain-language explanation of how Car or Driver rates Formula 1 drivers and cars separately, from teammates and the rest of the field.',
  },
  '/methodology/full': {
    title: pageTitle('Full methodology of the F1 rating model'),
    heading: 'Full methodology',
    description:
      'The full methodology of the Car or Driver ratings: the model, the evidence from qualifying and races, calibration, validation and limits.',
  },
  '/about': {
    title: pageTitle('About and privacy'),
    heading: 'About and privacy',
    description: 'About Car or Driver: where the data comes from, credits and licences, how to cite it, and the privacy notice.',
  },
};

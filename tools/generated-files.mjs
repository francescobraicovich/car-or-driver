// The files the publishing script computes from the ratings for the pages to read, besides the pages themselves: the questions of the front page,
// which it shows before the ratings arrive (the whole history is fetched only once the visitor does something, site/js/model-loader.js), and every
// driver with the pages of the pairs, for the head to head of any two drivers (site/js/pair-page.js). The local server (tools/serve.mjs) computes
// them on request, so the site works the same from the source.
import { driverSummary, pairPagesByKey } from './driver-and-team-pages.mjs';

export const GENERATED_FILES = {
  '/front-page-questions.json': (ratings) => JSON.stringify(ratings.questions),
  '/head-to-head-drivers.json': (ratings) =>
    JSON.stringify({
      drivers: [...ratings.drivers.values()].map((driver) => driverSummary(ratings, driver)),
      grid: ratings.current.drivers.map((row) => row.driver.id),
      pages: pairPagesByKey(ratings),
    }),
};

// Who runs the site, as the privacy and legal pages state it. This is the only place these details are written; the pages read them from here.
//
// `contactEmail` must be set before the site is published: `npm run check:publication` fails while it is empty, and the deploy workflow runs that check.
export const SITE = {
  name: 'Car or Driver',
  operatorName: 'Francesco Braicovich',
  operatorCountry: 'Italy',
  contactEmail: 'carordriver@proton.me',
  repositoryUrl: 'https://github.com/francescobraicovich/car-or-driver',
  lastUpdated: '26 October 2026', // change when the privacy notice or the legal page changes
  dataLicence: { name: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
};

// Who runs the site, as the privacy and legal pages state it. This is the only place these details are written; the pages read them from here.
//
// `contactEmail` must be set before the site is published: `npm run check:publication` fails while it is empty, and the deploy workflow runs that check.
export const SITE = {
  name: 'Driver or Car',
  operatorName: 'Francesco Braicovich',
  operatorCountry: 'Italy',
  contactEmail: null, // for example 'privacy@example.org'
  repositoryUrl: 'https://github.com/francescobraicovich/driver-or-car',
  lastUpdated: '21 October 2026', // change when the privacy notice or the legal page changes
  dataLicence: { name: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
};

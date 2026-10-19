// The checks that only the person publishing the site can satisfy; the deploy workflow runs them (`npm run check:publication`) and refuses to publish
// until they pass. `npm test` does not include them, because the repository is meant to stay testable before these details are filled in.
//   - the contact address on the privacy and About pages is set (the privacy notice names a controller and a way to reach them);
//   - the controller's name is set.
import { SITE } from '../site/js/site-identity.js';

const problems = [];
if (!SITE.operatorName?.trim())
  problems.push('site/js/site-identity.js: operatorName is empty (the privacy notice must name the person responsible).');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(SITE.contactEmail ?? '') || /example\.(org|com|invalid)$/i.test(SITE.contactEmail ?? '')) {
  problems.push(
    'site/js/site-identity.js: contactEmail is not set to a real address (the privacy notice must say how to reach the controller).',
  );
}
if (problems.length) {
  console.error(problems.join('\n'));
  console.error('FAIL publication checks: the site cannot be published yet.');
  process.exit(1);
}
console.log('PASS publication checks: the privacy notice names the controller and a contact address');

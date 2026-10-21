# Compliance record: Driver or Car

Prepared 19 October 2026 (revised 21 October 2026, when the redesign removed the one thing the site stored) for a **non-commercial personal website** run by a private individual (Francesco Braicovich, resident in Italy), without a company, published to visitors in the EU and the UK. This file is not published. It records what the site does, which rules were checked, what was done, and what only the operator can do.

**What this is not.** It is not legal advice, and no tool or assistant can certify that a website is "fully compliant": that is a legal judgement that depends on facts about the operator and on how regulators and courts read the rules. It is a careful, sourced best effort. Section 9 lists the points that remain a judgement call; for a site you publish under your own name, a one-off review by an Italian data-protection lawyer before launch is the way to close them (cost unverified).

## 1. The position in one paragraph

The site is a static website. It sets no cookies, loads nothing from any other origin, has no analytics, no advertising, no forms and no accounts. A visit reaches only the host, Cloudflare. It stores nothing in the browser: no cookie, no local or session storage (the light/dark theme button, which wrote one value after a press, was removed with the redesign). The data behind the ratings carries a non-commercial licence, so the site is non-commercial and **cannot be monetised** (section 8). Everything the privacy notice says is checked by `tests/test-compliance.mjs` (the files) and `tests/smoke-browser.mjs` (the running site).

## 2. Rules checked

| Rule | Applies? | What was done |
| --- | --- | --- |
| **GDPR** (EU 2016/679) and **UK GDPR** with the **Data Protection Act 2018**; Italian **D.Lgs. 196/2003** | Yes. A private person who publishes a website to the public is a controller: the household exemption does not cover publication to an indefinite audience (CJEU [Lindqvist, C-101/01](https://www.thomashelbing.com/en/wissen/dsgvo-hub/rechtsprechung/1.4.43-eugh-lindqvist)). The host sees visitors' IP addresses; the site publishes data about named drivers | Privacy notice with Article 13 content: controller, purposes, legal bases, recipients, transfers, retention, rights, complaint authorities (Garante, ICO). Data minimised to what a web request carries. Processor terms with the host (section 6) |
| **ePrivacy Directive Art. 5(3)**; Italian Codice privacy art. 122 and the Garante's 2021 cookie guidelines; UK **PECR** reg. 6 as amended by the **Data (Use and Access) Act 2025** | Yes, to any storing or reading of information on the visitor's device | No cookies, and no local storage, session storage or similar: nothing is stored on or read from the visitor's device, so there is nothing to consent to and nothing for the "appearance" exception to cover. No consent banner is needed, and none is shown |
| **Transfers** (GDPR Chapter V; UK GDPR) | Yes: Cloudflare, Inc. is in the United States | Cloudflare relies on the EU-U.S. Data Privacy Framework and the UK Extension, with the standard contractual clauses as fallback ([Cloudflare](https://www.cloudflare.com/trust-hub/gdpr/)). Its current listing on the Data Privacy Framework register was not verified: check it |
| **Information duties of an information-society provider**: E-Commerce Directive 2000/31/EC art. 5; Italian **D.Lgs. 70/2003 art. 7**; UK Electronic Commerce (EC Directive) Regulations 2002 reg. 6 | **Uncertain.** These cover services "normally provided for remuneration", so a free, non-commercial personal site is probably outside them; I found no source that settles the personal-site case. Germany's imprint duty (DDG §5) has a similar reach | The About page gives name, country and a contact email. It does **not** give a postal address: not shown to be required for a non-commercial site, and publishing a home address has a real privacy cost. If you ever earn from the site, a postal address and any tax number become mandatory (section 8) |
| **Digital Services Act** (EU 2022/2065) | No: the site hosts no third-party content and is not an intermediary service | None needed |
| **Online Safety Act 2023** (UK) | No: no user-generated content, no search service | None needed |
| **European Accessibility Act** (Directive 2019/882; Italian D.Lgs. 82/2022) and **Equality Act 2010** (UK) | EAA: no for a free informational site (it covers defined consumer services such as e-commerce and banking; secondary sources, not the Directive's text). Equality Act: applies to providers of services to the public in principle | Best effort and honest statement on the About page: keyboard operation, measured text contrast on the front page, in the panel and beside the race (3:1 for the large title, 4.5:1 for the rest; the cards of slides are not measured the same way, and the notice says so), a table view for the History chart and some of the Insights charts, responsive layout; known gaps stated. No third-party audit |
| **Copyright and database right** (Directive 96/9/EC; UK Copyright and Rights in Databases Regulations 1997) | Yes: the race data tables are databases and are licensed by their publishers | Licence terms followed (section 8): credit, non-commercial, share-alike; notice inside each published data file and on the About page; `data/NOTICE.md` |
| **Third-party software licences** | Yes | Inter and Lexend Giga (SIL OFL 1.1) and KaTeX (MIT): licence texts and a notice ship with the files (`site/vendor/`); a test checks they are present. The circuit outlines (bacinger/f1-circuits, MIT) ship with their licence text (`site/assets/tracks-licence.txt`) and a credit on the About page; a test checks both. |
| **Trade marks** | F1, FORMULA 1 and related marks belong to Formula One Licensing B.V. | Not used in the name or domain; the About page says the site is independent and unaffiliated, and uses names only to identify. Descriptive reference to the sport is not endorsement |
| **Gambling advertising** (Italy, "Decreto Dignità" 2018; UK Gambling Act advertising rules) | Relevant only if betting content or links appeared | None: no betting links, and the About page says the numbers are not betting tips |
| **Consumer law** (Consumer Rights Directive; UK Consumer Rights Act 2015) | No: nothing is sold and there is no contract | None needed; the terms say that nothing limits rights the law does not allow to be limited |
| **EU AI Act** (2024/1689) | No obligation identified: a statistical rating model that forecasts race results is not one of the listed high-risk uses, and the site neither interacts with people as an AI system nor generates synthetic media | None |
| **Tax** (Italy) | No income, no tax obligation. Any income would change this (section 8) | None |
| **EU/UK representative** (GDPR/UK GDPR Art. 27) | Possibly for UK visitors: a controller outside the UK needs a UK representative unless processing is occasional, low risk and without large-scale special-category data (the [ICO states the exemption](https://cy.ico.org.uk/for-organisations/data-protection-and-the-eu/data-protection-and-the-eu-in-detail/the-uk-gdpr/uk-representatives)); sources disagree on how "occasional" applies to a website | The site collects and monitors nothing about visitors (no analytics), is not aimed at the UK in particular and carries no special-category data, which is the best position against the exemption. A residual judgement call (section 9) |

## 3. What the site does with personal data (record of processing, Art. 30)

Art. 30 has an exemption for small controllers whose processing is occasional; a website's request handling is continuous, so this record is kept anyway.

| Processing | Whose data | Purpose | Legal basis | Recipients | Retention |
| --- | --- | --- | --- | --- | --- |
| Delivering the files of the site: IP address, URL, time, user agent | Visitors | Deliver and secure the site | Legitimate interests, Art. 6(1)(f) | Cloudflare (processor for delivery; controller for its own security) | Set by Cloudflare; the operator keeps nothing |
| Emails sent to the contact address | People who write | Reply | Legitimate interests / steps at the person's request | The email provider (processor) | Deleted within 12 months after the conversation, unless needed for a legal claim |
| Names, nationalities and performance statistics of racing drivers | Drivers named in public race data | Publish statistical ratings and findings | Legitimate interests, Art. 6(1)(f); no special-category data | The public; Cloudflare (hosting) | As long as the site exists (a record of past seasons) |

**Legitimate interests assessment.** *Visitors' technical data:* the interest is operating and defending a public website; the data is minimal, not used for profiling, and cannot be avoided if a page is to be delivered; visitors reasonably expect it. *Driver statistics:* the interest is analysing a public sport from published results; the data comes from public tables, contains nothing sensitive and no contact or private details, the estimates are labelled and uncertain, and drivers are public figures in the exercise of a public activity; the impact on them is low, and they can object by email. No data protection impact assessment is required: no systematic monitoring, no large-scale sensitive data, no automated decisions about people. Duty to inform people whose data was not collected from them (Art. 14): the Privacy notice, section 5, is the information; individual notices to ~900 drivers would be disproportionate effort for data that is public.

## 4. Third parties

| Party | Role | Data they see | Agreement |
| --- | --- | --- | --- |
| Cloudflare, Inc. | Hosting (Pages), network, and (if the domain is registered there) DNS and registrar | Visitors' technical request data; the operator's account details | [Customer DPA](https://www.cloudflare.com/cloudflare-customer-dpa/), accepted with the account; keep a copy |
| Email provider (to be chosen by the operator) | Processor for the contact mailbox | Emails received | The provider's standard processor terms |
| GitHub | Hosts the source code (private repository); builds and publishes | No visitor data | Not a processor of visitor data |
| Domain registrar | Registers the domain | The operator's details in the registration record | Turn on WHOIS privacy / redaction at registration |
| Everyone else | **None.** No font, script, analytics, advertising, map, video or social service is contacted | | |

## 5. What was changed in the site for this

- Fonts (Inter, Lexend Giga) and KaTeX are served from `site/vendor/`. Before, they came from Google Fonts and cdnjs, which would have sent every visitor's IP address to those companies (the 2022 Munich ruling concerned exactly Google Fonts: [report](https://thehackernews.com/2022/01/german-court-rules-websites-embedding-google-fonts-violates-gdpr.html)).
- `tools/deploy-headers.txt` (published as `_headers`): `Content-Security-Policy: default-src 'none'; script-src 'self'; …; connect-src 'self'`, `Referrer-Policy: no-referrer`, and others. The browser itself refuses any request to another origin, so the privacy notice does not depend on nobody making a mistake later. The local server applies the same headers, so tests run under them.
- Nothing is stored in the browser. The theme button (light and dark, one `localStorage` value written after a press, with a button on the Privacy page to remove it) was removed with the redesign, together with the Share button and the old page chrome; the notice, its date and this record were changed in the same commit.
- The inline boot script moved to `site/js/boot-probe.js` so scripts can be restricted to the site's own files.
- Pages: Privacy, and About and credits, each a card of slides over the front page, reachable from the links at its foot.
- Data licence: `data/NOTICE.md`, a `licence` field in every published data file. (The ratings panel no longer offers the CSV download; `data/export-rows.json` is still built and published, with the same licence field.)
- Drivers' personal data: the ratings are about named people. The data files carry each rated driver's first name, surname and the year and month of birth (`driverProfiles`), for the card that shows a driver's age; they carry no full birth date, and a test fails if one appears. The privacy notice says the same. The source is `data/drivers.csv` (public race records).
- 19 references in the Methodology (part 8), cited in the text and in the Insights notes. Each journal reference was checked against its publisher's record (Crossref) on 19 October 2026; Shapley (1953) and McFadden (1974) are book chapters without DOI and were checked against bibliographic records.
- Tests: `tests/test-compliance.mjs` (no loading from another origin, no script that uses browser storage, strict headers, licences present, citations complete, only intended files published); the browser smoke test checks that the running site makes no request to another origin, sets no cookie, stores nothing after every page has been opened, and that the legal pages exist.
- **The repository is public and open source.** The code is MIT; the data tables, the built ratings, the findings and the text are CC BY-NC-SA 4.0, with the credit and the non-commercial restriction stated in the README, `data/NOTICE.md`, the About page and inside each data file. The public repository contains no personal data beyond the operator's name (also on the site) and a GitHub no-reply address in the commit history. Publishing the CSV tables in the repository is itself a redistribution of the source data and follows the same licence reasoning (credit, non-commercial, share-alike).
- The deploy runs `npm run check:publication`, which refuses to publish while the contact email is empty, and, after deploying, `tools/check-live-site.mjs`, which fetches the live site and fails if any response sets a cookie, if the policy headers are missing, or if the page loads anything from another origin or from Cloudflare's `/cdn-cgi/` scripts. The tests run on a local server, which cannot show what a host adds, so this check is part of the launch (section 6, item 10).
- The deploy target is **Cloudflare Pages** (the notice names it, and only Cloudflare reads the `_headers` file that carries the Content-Security-Policy). The workflow was GitHub Pages before. `_headers` is written from the parsed rules without comments.
- The internal documents are not published: only the site, the model package, the three data files and `_headers` are (a test checks). The raw write-ups the Methodology used to link to were removed from the site, because they still discuss the old benchmark system.

## 6. What only the operator can do (before and after launch)

1. **Set the contact email** in `site/js/site-identity.js` (`contactEmail`), a dedicated address. Confirm the name there is how you want to be named (it was taken from your account name). The deploy refuses to publish without the email.
2. **Do not switch on any visitor measurement**: Cloudflare Web Analytics, Logpush, Workers analytics, or any analytics service. **Keep Cloudflare's cookie-setting features off**: Bot Fight Mode and Super Bot Fight Mode, Waiting Room, Load Balancer session affinity, Always Online, and rate-limiting rules that use the unique-visitor option ([Cloudflare's cookie list](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/)). Also leave Email Address Obfuscation and automatic script injection off (they add scripts under `/cdn-cgi/`). Cloudflare's security systems can still challenge a visit it suspects is automated and set a `cf_clearance` cookie; the Privacy notice says so, and such a cookie is strictly for security. If you turn any listed feature on, the notice changes first. The notice states there is none, and the "I receive nothing" statement depends on it. If you ever want analytics, the notice, this file and the tests change first.
3. **Accept and keep the Cloudflare Customer DPA** (it is part of the account terms); check Cloudflare's entry on the Data Privacy Framework register.
4. **Turn on WHOIS privacy / redaction** when registering the domain (Cloudflare Registrar redacts by default; confirm).
5. **Answer requests within one month** (access, correction, erasure, objection). Keep a short log of requests received and what you did.
6. **Delete emails** 12 months after a conversation ends (the notice promises this).
7. **Keep the credit and licence** wherever the ratings are copied, and do not use them commercially.
8. **Never monetise** (section 8), and do not add a donation button, ads, affiliate links, tracking, a comment form, embedded video or a social widget without first updating the notice and this file.
9. **Re-read the notice** whenever the site changes, and change the date on it (`lastUpdated` in `site/js/site-identity.js`).
10. **After the first deploy**, run `node tools/check-live-site.mjs <your address>` (the workflow does this too), then open the site once in a browser with the developer tools: *Application* should show no cookies and empty local storage, and *Network* only your own domain. Repeat after any change to the Cloudflare settings.
11. **If a data breach affects personal data you hold** (for example your mailbox), notify the Garante within 72 hours if it is likely to harm people (GDPR Art. 33), and keep a note even if you do not notify.

## 7. When this file and the notice must change

A new third-party service of any kind; any analytics; any advertising or affiliate or payment feature; any form or user input; any new data source; any new browser storage; a change of host; a change of controller or contact; any income from the site.

## 8. Can the site be monetised? **No, not with this data.**

- The race data comes from RaceData (CC0 as labelled), which credits **Jolpica-F1 (CC BY-NC-SA 4.0: non-commercial; commercial use needs the maintainers' permission, admin@jolpi.ca)** and Kaggle datasets that are reported to derive from **Ergast** (whose terms are reported to have been non-commercial; I could not retrieve them, **unverified**). The mirror cannot grant more than its sources allow, and it does not say which table came from where, so the strictest licence governs.
- The ratings, findings and downloads are adapted material, so they must carry the same licence: **CC BY-NC-SA 4.0**, with credit and a statement of changes.
- Advertising, affiliate links, paid access and sponsorship are commercial. Donations are a grey area (Creative Commons gives no definitive guidance; its 2009 study found that earning money or online advertising was generally seen as commercial); I did not add one.
- Monetising would also remove the "private individual, no business" position: a sole trader in Italy (partita IVA; regime forfettario is the usual route: 15%, or 5% for five years for a new activity, up to €85,000, [summary](https://www.partitaiva.it/?p=9240); the total burden of tax and contributions depends on the activity code, 12% to over 30% in the sources I read), a postal address and tax number on the site (D.Lgs. 70/2003 art. 7 applies to remunerated services), a consent banner with a certified consent platform for ads in the EEA, UK and Switzerland ([AdSense](https://support.google.com/adsense/answer/13554020)), a rewritten privacy notice, and gambling-advertising rules if betting ever came near. You would not have to incorporate a company, but you would no longer be a private hobbyist.
- **What would make it possible:** written permission from the data owners (Jolpica, TracingInsights, the Kaggle author), or replacing the data with a source that allows commercial use (none free was found for 2000 to now), and then redoing this file.
- Costs and the deployment steps are in [deployment.md](deployment.md).

## 9. Residual risk and open judgement calls

1. **Data licence ambiguity.** If an upstream owner objected even to non-commercial use, the site would have to change. Credit and share-alike are implemented; the position is the strictest reading, not a certainty.
2. **Information-society provider duties** for a non-commercial site: probably not applicable; unconfirmed. Mitigation: name, country and email are published anyway.
3. **UK representative:** relying on the occasional/low-risk exemption, or on the site not targeting the UK. Unsettled in the sources.
4. **Legitimate interests for driver statistics:** a reasoned assessment, not a regulator's finding. Risk is low; drivers can object.
5. **Cloudflare:** the statement that the operator receives no visitor data assumes the settings in section 6; Cloudflare's own retention is set in its policy, which I did not audit.
6. **Accessibility:** a best-effort statement, no audit.
7. **Law changes.** The UK's 2025 reform of storage rules (Data (Use and Access) Act) and the ICO's updated guidance were read from secondary summaries and the ICO's exceptions page; the position should be re-read when guidance changes.

## 10. Sources (read 19 October 2026)

- [ICO: exceptions to the storage and access rules](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/): strictly necessary, appearance (preferences) and statistics exceptions; simple and free means to object.
- [Garante: cookie and tracker guidelines (2021)](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876): technical cookies need only information; first-party analytics under conditions.
- [Cloudflare GDPR information](https://www.cloudflare.com/trust-hub/gdpr/) and [Customer DPA](https://www.cloudflare.com/cloudflare-customer-dpa/): DPF, UK Extension, SCCs.
- [ICO: UK representatives](https://cy.ico.org.uk/for-organisations/data-protection-and-the-eu/data-protection-and-the-eu-in-detail/the-uk-gdpr/uk-representatives).
- [Jolpica-F1 terms](https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md): CC BY-NC-SA 4.0; commercial use by permission.
- [TracingInsights/RaceData](https://github.com/TracingInsights/RaceData): CC0 as stated; credits Ergast/Jolpica and Kaggle; trade-mark notice.
- [Creative Commons FAQ](https://creativecommons.org/faq/) and [Defining Noncommercial](https://wiki.creativecommons.org/wiki/defining_Noncommercial).
- [Italian D.Lgs. 70/2003](https://www.interlex.it/testi/dlg0370.htm): art. 7, general information to be provided.
- [CJEU Lindqvist (C-101/01)](https://www.thomashelbing.com/en/wissen/dsgvo-hub/rechtsprechung/1.4.43-eugh-lindqvist) (via a commentary).
- [Munich Regional Court on Google Fonts, 20 January 2022](https://thehackernews.com/2022/01/german-court-rules-websites-embedding-google-fonts-violates-gdpr.html) (via a report).
- [Google AdSense: consent requirements](https://support.google.com/adsense/answer/13554020).
- Accessibility Act scope: secondary commentary only ([summary](https://accessible.org/does-eaa-apply-all-websites/)).
- References in the Methodology: [Crossref](https://www.crossref.org/) records, checked per DOI.

// The text of the Privacy and the About pages, as HTML. Every statement about what the site does is checked by tests/test-compliance.mjs against what the
// site's files actually contain (no cookies, no requests to other origins, nothing stored), so the notice cannot drift from the site.
// `{{name}}` is replaced from site-identity.js; an element with `data-contact-email` is filled with the contact address.
//
// The notice follows GDPR Articles 12 to 14 and the UK GDPR, with the ePrivacy Directive (and in the UK the Privacy and Electronic Communications
// Regulations) for stored data. It describes this project as it is: a private individual's non-commercial website with no cookies, no analytics and
// no third-party content. If any of that changes (analytics, advertising, a form, a third-party embed), this text and docs/compliance.md must change first.

export const PRIVACY_HTML = String.raw`
<div class="legal-summary">
  <p><b>In short.</b> This site has no accounts, no cookies, no advertising, no analytics and no forms. Every file it shows comes from its own address; nothing is loaded from another company. Your visit necessarily reaches the company that hosts the site (section 2). The site stores nothing on your device (section 3).</p>
</div>
<p class="legal-date">Last updated {{lastUpdated}}.</p>

<h3>1. Who is responsible</h3>
<p>
  {{operatorName}}, {{operatorCountry}}, a private individual. This site is a personal, non-commercial project; there is no company behind it, and no data protection officer has been appointed. Under the General Data Protection Regulation (GDPR) and its United Kingdom equivalent (UK GDPR), the person responsible for the processing described here is the <i>controller</i>: that is {{operatorName}}.
</p>
<p>Contact, for anything in this notice: <a data-contact-email></a>.</p>

<h3>2. What happens when you visit</h3>
<p>
  To show you a page, your browser asks this site's address for its files. The site is hosted by <b>Cloudflare Pages</b>, a service of Cloudflare, Inc. (United States), which delivers the files from a network of servers close to you. As with any web request, Cloudflare therefore receives your <b>IP address</b>, the address of the file requested, the date and time, and the type of browser and device you use (the "user agent"). It uses this to deliver the files, keep the service running and defend it against attacks.
</p>
<ul>
  <li><b>What I receive:</b> nothing. I have not switched on any analytics, log export or visitor counter, so I do not see who visits, how often or from where, and I do not use this data for any purpose.</li>
  <li><b>Legal basis:</b> legitimate interests (GDPR Article 6(1)(f)): a website cannot be delivered without these technical data. They are few, they are not used for profiling, and they are not used to identify you.</li>
  <li><b>Cloudflare's role:</b> for delivering the site Cloudflare acts for me as a processor under its Data Processing Addendum; for its own network security it is a controller of its own, as its <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener noreferrer">privacy policy</a> explains. How long it keeps technical data is set out there.</li>
  <li><b>Transfers outside Europe:</b> Cloudflare is established in the United States. It relies on the EU-U.S. Data Privacy Framework and its UK Extension, with the European Commission's standard contractual clauses as a fallback, as it describes in its <a href="https://www.cloudflare.com/trust-hub/gdpr/" rel="noopener noreferrer">GDPR information</a>.</li>
  <li><b>Referrer:</b> the site tells your browser not to send the address of the page you came from when you follow a link to another site.</li>
</ul>

<h3>3. Cookies and similar technologies</h3>
<p><b>This site sets no cookies and loads no scripts, fonts, images, maps or embeds from other sites.</b> Fonts and the formula display come from this site's own files. That is why there is no cookie banner: there is nothing to ask your consent for. One caveat concerns the host, not this site: if Cloudflare's security systems suspect that a visit comes from an automated program, they may show a check and set a security cookie on that visitor's device. Such a cookie exists only for security and is not used for anything else; I have not switched on the Cloudflare features that set cookies.</p>
<p>
  The site also stores nothing in your browser: it uses no local storage, no session storage and no other technique that saves or reads information on your device, so there is nothing to consent to and nothing to remove. This is why the consent rules for such storage (Article 5(3) of the ePrivacy Directive and, in the United Kingdom, regulation 6 of the Privacy and Electronic Communications Regulations) have nothing to apply to here.
</p>
<p>Your browser also keeps copies of the files it downloaded (the ratings, for example) so the site loads faster next time. That is the ordinary cache of your browser, controlled by its own settings, and it holds no information about you.</p>

<h3>4. What the site does not do</h3>
<ul>
  <li>No advertising, no affiliate links, no trackers, no tracking pixels, no social-media buttons.</li>
  <li>No accounts, no sign-up, no comments, no forms, no newsletter: it asks you for no personal data.</li>
  <li>No profiling and no decisions made about you by automated means.</li>
  <li>Nothing is sold or shared.</li>
</ul>

<h3>5. Information about racing drivers</h3>
<p>
  The ratings, charts and findings are about named people: Formula 1 drivers, past and present. They are computed from published race results (which team a driver raced for, finishing positions, qualifying, lap times, retirements and, for one finding, ages worked out from public birth dates: shown as averages, and for a few named drivers as their rating against their age in each season) and are shown as statistical estimates with their uncertainty. The names and nationalities come from the same public data tables. I use no private information about any driver and nothing about health, beliefs or other sensitive matters, and I publish no full birth dates, addresses or contact details (the card on a row of the ratings shows each driver's age, worked out from the year and month of birth, which is all that the files the site serves carry).
</p>
<ul>
  <li><b>Legal basis:</b> legitimate interests (GDPR Article 6(1)(f)) in analysing and discussing a public sport from public results. The estimates are labelled as estimates and can be wrong; they describe a driver's results in a car, not the person.</li>
  <li><b>Where it comes from:</b> the public data tables credited on the <a href="#/about?v=1&slide=credits">About page</a>, not from the drivers themselves.</li>
  <li><b>How long:</b> the historical statistics are kept as long as the site exists, since the purpose is a lasting record of past seasons.</li>
  <li><b>If you are named here</b> and want something corrected or want to object, write to <a data-contact-email></a>; I will answer within one month.</li>
</ul>

<h3>6. Links to other sites</h3>
<p>Some pages link to sources, papers and data repositories. If you follow a link, the other site's own privacy policy applies to your visit there.</p>

<h3>7. If you write to me</h3>
<p>
  If you email <a data-contact-email></a>, I receive your address and what you write. I use them only to answer you (legitimate interests, GDPR Article 6(1)(f), or taking steps at your request). My email provider handles the message on my behalf. I delete the conversation within 12 months after it ends, unless I need to keep it to establish or defend a legal claim. I do not add you to any list.
</p>

<div class="legal-summary">
  <p><b>Your right to object.</b> Where I process your data because of my legitimate interests (the technical data of a visit, emails you send, and the statistics about named drivers), you have the right to object, on grounds relating to your situation, at any time (GDPR Article 21 and UK GDPR). To object, write to <a data-contact-email></a>. For the technical data of a visit, which Cloudflare handles, you can also ask Cloudflare. I will stop unless I can show compelling reasons that override your interests, or I need the data to establish or defend a legal claim.</p>
</div>

<h3>8. Your rights</h3>
<p>
  You have the right to ask me for access to personal data I hold about you, to have it corrected or erased, to restrict its use, and to object to it, and, where it applies, to have it moved to another service. Because this site collects nothing from visitors, the personal data I hold is, in practice, only any email you have sent me and the driver statistics described in section 5. Write to <a data-contact-email></a>; I will answer within one month. Requests about the technical data Cloudflare handles when it delivers the site should go to Cloudflare, which is responsible for it.
</p>
<p>
  If you think your data has been handled unlawfully, you may complain to a data protection authority. In Italy that is the <a href="https://www.garanteprivacy.it/" rel="noopener noreferrer">Garante per la protezione dei dati personali</a>; in the United Kingdom, the <a href="https://ico.org.uk/make-a-complaint/" rel="noopener noreferrer">Information Commissioner's Office</a>; elsewhere, the authority of the country where you live or work. You are welcome to write to me first.
</p>

<h3>9. Children</h3>
<p>The site is about a sport and is open to everyone. It collects no personal data from anyone, including children.</p>

<h3>10. Changes</h3>
<p>If the site's behaviour changes in a way that affects this notice, the notice will be updated first and the date at the top will change.</p>
`;

export const ABOUT_HTML = String.raw`
<p class="legal-date">Last updated {{lastUpdated}}.</p>

<h3>Who runs this site</h3>
<p>
  {{name}} is a personal project by {{operatorName}} ({{operatorCountry}}). It is run as a private individual, not as a business: there is no company, nothing is sold, there is no advertising and the site earns no income. Contact: <a data-contact-email></a>. How the site handles data is in the <a href="#/privacy">privacy and cookies notice</a>.
</p>

<h3>Not affiliated with Formula 1</h3>
<p>
  This site is independent. It is not associated with, endorsed by or connected to Formula One Management, Formula One Licensing B.V., the FIA or any team or driver. F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE WORLD CHAMPIONSHIP, GRAND PRIX and related marks are trademarks of Formula One Licensing B.V. Names of drivers, teams and races appear only to identify whom the numbers describe.
</p>

<h3>What the numbers are, and are not</h3>
<p>
  The ratings, forecasts and findings are statistical estimates computed from past results by the method described under <a href="#/methodology">Methodology</a>, with their uncertainty shown. They are offered for interest and discussion. They are not facts about any person, they are not betting or gambling tips, and they are not financial or professional advice. They can be wrong. The site is provided as it is, free of charge, without any warranty, and to the extent the law allows I am not liable for losses arising from its use; nothing here limits any liability that the law does not allow to be limited, or any right you have as a consumer.
</p>

<h3 id="about-data">Data sources, licences and credits</h3>
<p>All results behind the ratings come from public race data. The ratings were computed from the tables listed below.</p>
<div class="table-wrap">
  <table class="params">
    <thead><tr><th scope="col" class="left">Source</th><th scope="col" class="left">What it is</th><th scope="col" class="left">Licence stated by its publisher</th></tr></thead>
    <tbody>
      <tr><th scope="row" class="left"><a href="https://github.com/TracingInsights/RaceData" rel="noopener noreferrer">TracingInsights/RaceData</a></th><td class="left">The collection of CSV tables this site was computed from (results, qualifying, races, drivers, constructors, lap times, circuits).</td><td class="left">CC0 1.0, as stated by that project.</td></tr>
      <tr><th scope="row" class="left"><a href="https://github.com/jolpica/jolpica-f1" rel="noopener noreferrer">Jolpica-F1</a> (offers endpoints compatible with the Ergast Developer API)</th><td class="left">An open source of Formula 1 results that RaceData lists among its sources.</td><td class="left"><a href="https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md" rel="noopener noreferrer">CC BY-NC-SA 4.0</a>: free for non-commercial use; commercial use needs the maintainers' permission.</td></tr>
      <tr><th scope="row" class="left">Kaggle datasets "Formula 1 Race Data" and "Formula 1 Race Events" by J. Trotman</th><td class="left">Two Kaggle datasets that RaceData lists among its sources.</td><td class="left">CC0, as stated by RaceData. Datasets of this kind are reported to derive from the Ergast database, whose terms are reported to have been non-commercial; those terms are no longer online, so I could not check them.</td></tr>
    </tbody>
  </table>
</div>
<p>
  RaceData states CC0 for what it publishes but also credits Jolpica and Ergast; Jolpica states that its data is CC BY-NC-SA 4.0, and RaceData does not say which table comes from which source. I cannot tell from here, so this site follows the <b>strictest</b> of the licences involved: it is <b>non-commercial</b> and it credits all of them.
</p>
<p><b>Credit.</b> "Race data: Ergast / Jolpica-F1, Kaggle datasets by J. Trotman, and TracingInsights/RaceData; used under CC BY-NC-SA 4.0. Changed: the results were converted into ratings, forecasts and findings by {{operatorName}}."</p>

<h3>Licence of what this site publishes</h3>
<p>
  The ratings, the findings, the charts and the data files the site publishes (<code>model-latest.json</code>, <code>model.json</code>, <code>export-rows.json</code> and the files of laps in <code>race-laps/</code>) are derived from the data above, so they are shared under the same terms: <a href="{{dataLicenceUrl}}" rel="noopener noreferrer">{{dataLicenceName}}</a>. In short, you may copy, share and adapt them if you give credit (the credit above, and a link to this site), say what you changed, do not use them commercially, and share what you make from them under the same licence.
</p>
<p>The text and the charts are shared under the same licence. The program code is open source under the MIT licence: <a href="{{repositoryUrl}}" rel="noopener noreferrer">the source code is on GitHub</a>. The third-party components listed below keep their own licences.</p>
<p>To cite this site: {{operatorName}} (2026), <i>{{name}}: ratings of Formula 1 drivers and cars since 2000</i>, <span id="citationAddress"></span>.</p>

<h3>Software and fonts that come with the site</h3>
<p>These are served from this site's own address, so your browser contacts no one else. Each keeps its own licence, and the licence texts are published with the files.</p>
<ul>
  <li><b>Inter</b> and <b>Lexend Giga</b> (typefaces): SIL Open Font License 1.1. <a href="./vendor/licenses/inter-OFL-1.1.txt">Inter licence</a>, <a href="./vendor/licenses/lexend-giga-OFL-1.1.txt">Lexend Giga licence</a>.</li>
  <li><b>KaTeX</b> 0.16.9 (formulas): MIT licence. <a href="./vendor/licenses/katex-MIT.txt">Licence</a>.</li>
  <li><b>Circuit outlines</b> (the track drawn on the front page): from <a href="https://github.com/bacinger/f1-circuits" rel="noopener noreferrer">bacinger/f1-circuits</a> by Tomislav Bacinger, MIT licence, Copyright (c) 2019-2025 Tomislav Bacinger. I projected and scaled them, and reversed the direction of two (Paul Ricard and Marina Bay) to match how they are raced. They are not official, and not approved or endorsed by Formula One Licensing B.V. <a href="./assets/tracks-licence.txt">Licence</a>.</li>
  <li><a href="./vendor/NOTICE.txt">Where each file came from</a>.</li>
</ul>

<h3>References</h3>
<p>The methods behind the ratings and the findings, with full references, are listed in <a href="#/methodology?v=1&slide=method-references">part 8 of the Methodology</a>.</p>

<h3>Corrections and feedback</h3>
<p>If you find an error in the numbers, the text or the credits, please write to <a data-contact-email></a> or open an issue in <a href="{{repositoryUrl}}" rel="noopener noreferrer">the repository</a>.</p>

<h3>Accessibility</h3>
<p>
  I aim to make this site usable with a keyboard and a screen reader and readable at different sizes. The controls are standard form elements, and the rows of the ratings can be reached and selected with the keyboard; the colours of the text on the front page, in the ratings panel and beside the race are measured against the drawing behind them (3 to 1 for the large title, 4.5 to 1 for the rest); the History chart has a table view; the Insights, the Methodology, this page and the Privacy page are cards of slides that move with their Previous and Next buttons, the arrow keys, the list beside the card and, on a touch screen, a swipe; and the layout works on phones. There are known gaps: only a few of the charts on the Insights have a table version, and not the Head to head chart, the charts are drawn as images with tooltips, and I have not measured the contrast of the cards of slides and of the list beside them in the same way. The front page is a drawing: the car and the driver's hands are two buttons (reachable with Tab, opened with Enter), the drawing itself is decorative, and on a computer with a mouse the usual pointer is replaced by a square one that shakes slightly, with the box around the car or the hands wobbling; with reduced motion switched on in the system nothing shakes. Rows of the ratings list are read as a sentence (rank, name, rating, error bar, change), not as the bars drawn beside them. The site has not been audited by a third party, and I cannot promise conformance with any standard. If something stops you using the site, write to <a data-contact-email></a> and I will try to fix it.
</p>
`;

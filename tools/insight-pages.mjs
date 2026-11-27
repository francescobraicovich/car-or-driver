// The page of each finding of the Insights at its own address (/insights/best-f1-driver-of-all-time), written by the publishing script
// (tools/build-pages.mjs): the question as people search for it and one line on what it measures (site/js/insight-page-metadata.js), the answer and
// its chart (site/js/insight-card.js, with how it is computed behind an "i"), the nearby questions people also ask with their answers from the
// ratings (the best driver right now, the best of each decade), and the findings before and after it. The chart is drawn in the browser
// (site/js/insight-page.js).
import { INSIGHTS_DATA } from '../site/js/insights-data.js';
import { INSIGHT_CARDS, INSIGHT_TOPICS } from '../site/js/insights-cards.js';
import { INSIGHT_PAGES } from '../site/js/insight-page-metadata.js';
import { INTRO_NOTE, insightCardHtml, KINDS } from '../site/js/insight-card.js';
import { infoHtml } from '../site/js/info-tip.js';
import { PAGE_METADATA, pageTitle, SITE_NAME } from '../site/js/page-metadata.js';
import { SITE } from '../site/js/site-identity.js';
import { DRIVER_PEAK_MINIMUM_STARTS } from './driver-and-team-pages.mjs';
import { breadcrumbData, documentPage, escapeHtml, headTags, SHARE_IMAGE } from './page-template.mjs';

const plain = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const pathOf = (card) => `/insights/${INSIGHT_PAGES[card.id].slug}`;
const link = (entity) => `<a href="${entity.path}">${escapeHtml(entity.name)}</a>`;
const DECADES = [1990, 2000, 2010, 2020];

/** Every finding, in the order of the Insights, with its page and the sentence that answers it. */
export const insightList = () =>
  INSIGHT_CARDS.map((card) => ({ card, page: INSIGHT_PAGES[card.id], path: pathOf(card), answer: plain(card.lead(INSIGHTS_DATA)) }));

/** The highest (or lowest) rating of any driver or car in a decade, with a driver's highest counted after the starts the Insights require. */
function extremeOfDecade(entities, decade, highest, isDriver) {
  let found = null;
  for (const entity of entities.values())
    for (const row of entity.rows) {
      if (row.year < decade || row.year >= decade + 10 || (isDriver && highest && row.starts < DRIVER_PEAK_MINIMUM_STARTS)) continue;
      if (!found || (highest ? row.rating > found.row.rating : row.rating < found.row.rating)) found = { entity, row };
    }
  return found;
}

/** The questions near a finding that people also ask, answered from the ratings: [question, answer HTML]. */
function nearbyQuestions(card, ratings) {
  const since = (decade) => (decade === 1990 ? ' (the ratings start in 1994)' : '');
  const decades = (question, entities, highest, isDriver, describe) =>
    DECADES.map((decade) => {
      const found = extremeOfDecade(entities, decade, highest, isDriver);
      return found ? [question(`${decade}s`), `${describe(found)}${since(decade)}.`] : null;
    }).filter(Boolean);
  const [first, second, third] = ratings.current.drivers;
  const [car, nextCar, thirdCar] = ratings.current.cars;
  const driverAt =
    (verb) =>
    ({ entity, row }) =>
      `${link(entity)}, who ${verb} ${Math.round(row.rating)} at the ${row.year} ${escapeHtml(row.grandPrix)}`;
  const carAt =
    (verb) =>
    ({ entity, row }) =>
      `The ${row.year} ${link(entity)}, which ${verb} ${Math.round(row.rating)} at the ${escapeHtml(row.grandPrix)}`;
  const questions = {
    'driver-peak-ratings': [
      [
        'Who is the best F1 driver right now?',
        `${link(first.driver)}, rated ${Math.round(first.rating)}, ahead of ${link(second.driver)} and ${link(third.driver)}. The <a href="/ratings">ratings</a> change after every Grand Prix.`,
      ],
      ...decades((decade) => `Who was the best F1 driver of the ${decade}?`, ratings.drivers, true, true, driverAt('reached')),
    ],
    'driver-low-ratings': decades(
      (decade) => `Who was the worst F1 driver of the ${decade}?`,
      ratings.drivers,
      false,
      true,
      driverAt('fell to'),
    ),
    'car-peak-ratings': [
      [
        'What is the fastest F1 car right now?',
        `The ${link(car.team)}, rated ${Math.round(car.rating)}, ahead of the ${link(nextCar.team)} and the ${link(thirdCar.team)}. The <a href="/teams">car ratings</a> change after every Grand Prix.`,
      ],
      ...decades((decade) => `What was the best F1 car of the ${decade}?`, ratings.teams, true, false, carAt('reached')),
    ],
    'car-low-ratings': decades((decade) => `What was the worst F1 car of the ${decade}?`, ratings.teams, false, false, carAt('fell to')),
  }[card.id];
  return questions ?? [];
}

/** The pages of the findings. `ratings` are the displayed ratings (driver-and-team-pages.mjs); `base` the address of the site. */
export function insightPages({ base, ratings }) {
  const list = insightList();
  return list.map(({ card, page, path, answer }, index) => {
    const [previous, next] = [list[index - 1], list[index + 1]];
    const questions = nearbyQuestions(card, ratings);
    const content = [
      `      <div class="insight-document" id="stage">
        <section class="deck-card insight-alone" data-deck="insights" data-open aria-labelledby="insightHeading">
          <h1 class="list-title" id="insightHeading">${escapeHtml(page.heading)}</h1>
          <p class="insight-introduction">${escapeHtml(page.introduction)}</p>
          <div class="deck-slide">${insightCardHtml(card, INSIGHTS_DATA, { alone: true })}</div>
        </section>
      </div>`,
      questions.length
        ? `      <section class="document-panel"><h2 class="panel-title">People also ask</h2><dl class="questions">${questions.map(([question, reply]) => `<dt>${question}</dt><dd>${reply}</dd>`).join('')}</dl></section>`
        : '',
      `      <nav class="document-neighbours document-neighbours-plain" aria-label="Other insights">${previous ? `<a rel="prev" href="${previous.path}">← ${escapeHtml(previous.page.heading)}</a>` : '<span></span>'}${next ? `<a rel="next" href="${next.path}">${escapeHtml(next.page.heading)} →</a>` : ''}</nav>`,
    ]
      .filter(Boolean)
      .join('\n');
    const address = new URL(path, base).href;
    return {
      path,
      html: documentPage({
        head: headTags({
          base,
          path,
          title: pageTitle(page.title),
          description: page.description,
          type: 'article',
          data: [
            breadcrumbData(base, [
              ['Insights', '/insights'],
              [page.heading, path],
            ]),
            {
              '@context': 'https://schema.org',
              '@type': 'Article',
              headline: page.heading,
              description: `${page.description} ${answer}`,
              url: address,
              mainEntityOfPage: address,
              dateModified: ratings.lastRace.date,
              author: { '@type': 'Person', name: SITE.operatorName },
              publisher: { '@type': 'Organization', name: SITE_NAME, url: base, logo: new URL('/assets/icons/icon-192.png', base).href },
              image: new URL(SHARE_IMAGE.path, base).href,
            },
            ...(questions.length
              ? [
                  {
                    '@context': 'https://schema.org',
                    '@type': 'FAQPage',
                    mainEntity: [[page.heading, answer], ...questions].map(([question, reply]) => ({
                      '@type': 'Question',
                      name: question,
                      acceptedAnswer: { '@type': 'Answer', text: plain(reply) },
                    })),
                  },
                ]
              : []),
          ],
        }),
        content,
        scripts: ['/js/insight-page.js'],
      }),
    };
  });
}

/** The page of all the findings (/insights): the questions by topic, then the card of every finding with its chart, each leading to its own page. */
export function insightIndexPage({ base }) {
  const list = insightList();
  const meta = PAGE_METADATA['/insights'];
  const topics = INSIGHT_TOPICS.map((topic) => ({ topic, entries: list.filter(({ card }) => card.topic === topic.id) }));
  const kinds = Object.values(KINDS);
  const content = [
    `      <section class="document-panel profile">
        <p class="profile-subject">Insights</p>
        <h1 class="list-title">${escapeHtml(meta.heading)}: driver or car, answered with data</h1>
        <p class="profile-meta">${list.length} findings on one question: how much of a Formula 1 result is the driver, and how much is the car? Each is a claim, a chart, and a note behind the "i" on how it was computed.${infoHtml(INTRO_NOTE)}</p>
        <p class="insight-kinds-note">${kinds.map(([name, note]) => `<span class="insight-chip">${name}</span> ${escapeHtml(note)}`).join('<br />')}</p>
      </section>`,
    `      <section class="document-panel"><h2 class="panel-title">The questions</h2><div class="insight-contents">${topics
      .map(
        ({ topic, entries }) =>
          `<section><h3>${escapeHtml(topic.title)}</h3><ol>${entries.map(({ card, page }) => `<li><a href="#finding-${card.id}">${escapeHtml(page.heading)}</a></li>`).join('')}</ol></section>`,
      )
      .join('')}</div></section>`,
    `      <div class="insight-document" id="stage">${topics
      .map(
        ({ topic, entries }) =>
          `<h2 class="document-section-title">${escapeHtml(topic.title)}</h2>${entries
            .map(
              ({ card, page, path }) =>
                `<section class="deck-card" data-deck="insights" data-open id="finding-${card.id}" aria-label="${escapeHtml(card.title)}"><div class="deck-slide">${insightCardHtml(card, INSIGHTS_DATA)}</div><p class="insight-more"><a href="${path}">${escapeHtml(page.heading)} On its own page, with the questions people also ask →</a></p></section>`,
            )
            .join('')}`,
      )
      .join('')}</div>`,
  ].join('\n');
  return {
    path: '/insights',
    html: documentPage({
      head: headTags({
        base,
        path: '/insights',
        title: meta.title,
        description: meta.description,
        data: [
          breadcrumbData(base, [['Insights', '/insights']]),
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: meta.title,
            itemListElement: list.map(({ page, path }, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: page.heading,
              url: new URL(path, base).href,
            })),
          },
        ],
      }),
      content,
      scripts: ['/js/insight-page.js'],
    }),
  };
}

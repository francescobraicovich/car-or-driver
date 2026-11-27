// The page of each finding of the Insights (insights-cards.js), at its own address (written by tools/insight-pages.mjs): the address, the title and
// description that search engines and link previews show, the heading, and one line under it that says what the finding measures. The words are
// fixed and name no result: names and numbers come from the data (insights-data.js), which changes after every Grand Prix.

export const INSIGHT_PAGES = {
  'driver-peak-ratings': {
    slug: 'best-f1-driver-of-all-time',
    title: 'Who is the best F1 driver of all time? Ranked without the car',
    heading: 'Who is the best F1 driver of all time?',
    description:
      'The greatest F1 drivers ranked with the car taken out: the best Formula 1 driver of all time since 1994, the best right now, and the best of each decade.',
    introduction: 'This ranking takes the car out and orders every driver from 1994.',
  },
  'driver-low-ratings': {
    slug: 'worst-f1-driver-ever',
    title: 'Who is the worst F1 driver ever? The lowest driver ratings',
    heading: 'Who is the worst F1 driver ever?',
    description:
      'The worst Formula 1 drivers in history by driver rating, with the slow car taken out: the lowest-rated drivers since 1994 and of each decade.',
    introduction: 'This ranking takes the car out and orders every driver from 1994, from the bottom.',
  },
  'car-peak-ratings': {
    slug: 'best-f1-car-of-all-time',
    title: 'What is the best F1 car of all time? The most dominant cars',
    heading: 'What is the best F1 car of all time?',
    description:
      'The most dominant Formula 1 cars ever, ranked by car rating with the drivers taken out: the best F1 car since 1994, the fastest right now, and the best of each decade.',
    introduction: 'This ranking takes the drivers out and orders every car from 1994.',
  },
  'car-low-ratings': {
    slug: 'worst-f1-car-ever',
    title: 'What is the worst F1 car ever? The slowest cars since 1994',
    heading: 'What is the worst F1 car ever?',
    description:
      'The slowest Formula 1 cars in history, ranked by car rating with the drivers taken out: the worst F1 cars since 1994 and the worst of each decade.',
    introduction: 'This ranking takes the drivers out and orders every car from 1994, from the bottom.',
  },
  'explained-share': {
    slug: 'is-f1-more-car-or-driver',
    title: 'Is F1 more car or driver? The real percentage',
    heading: 'Is F1 more about the car or the driver?',
    description:
      'How much of Formula 1 is the car and how much is the driver? The car and driver percentage, measured from decades of race results rather than guessed.',
    introduction: 'How much of each result the car explains, and how much the driver, from the races since 1994.',
  },
  'circuit-weights': {
    slug: 'f1-tracks-where-the-driver-matters-most',
    title: 'Which F1 tracks reward the driver most? Driver and car tracks',
    heading: 'Which F1 tracks reward the driver most?',
    description:
      'Driver tracks and car tracks in Formula 1: the circuits where the driver makes the biggest difference, and those where the car decides the result.',
    introduction: 'How much the driver decides the result at each circuit, against the average circuit.',
  },
  champions: {
    slug: 'f1-champions-car-or-driver',
    title: 'Which F1 world champions won it with the car?',
    heading: 'Which F1 world titles were won by the driver, and which by the car?',
    description:
      'Formula 1 world champions split into driver and car: which titles the driver won, which the car won, and which champion did the most with the least.',
    introduction: 'The advantage of each season’s points leader, split into the driver’s share and the car’s.',
  },
  'equal-car-titles': {
    slug: 'f1-champions-in-equal-cars',
    title: 'Who would win F1 in equal cars? Titles with the same car',
    heading: 'Who would be F1 champion if every car were equal?',
    description:
      'If every Formula 1 driver had the same car: how many world championships each driver could expect, in their own era and placed in other eras.',
    introduction: 'The titles each driver could expect if every car were the same.',
  },
  'career-driver-and-car': {
    slug: 'f1-drivers-who-carried-their-car',
    title: 'Which F1 drivers carried their car, and who was carried?',
    heading: 'Which F1 drivers carried their car, and which were carried by it?',
    description:
      'Formula 1 careers placed by driver rating and car rating: the drivers who dragged slow cars up the order, and those carried by the best car on the grid.',
    introduction: 'Each career, placed by its average driver rating and its average car rating.',
  },
  'teammate-gaps': {
    slug: 'biggest-f1-teammate-gaps',
    title: 'Who beat their F1 teammate by the most? The biggest gaps',
    heading: 'Who beat their F1 teammate by the most?',
    description:
      'The most one-sided Formula 1 teammate battles since 1994, by season and over careers, and the teams with the most lopsided driver pairings.',
    introduction: 'The most one-sided teammate battles: by season, over whole careers and for each team.',
  },
  'qualifying-versus-race': {
    slug: 'best-f1-qualifiers-and-racers',
    title: 'Best qualifier or best racer? F1 Saturday and Sunday drivers',
    heading: 'Who are the best qualifiers in F1, and who are the best racers?',
    description:
      'Which Formula 1 drivers are fastest over one lap on Saturday, and which are better in the race on Sunday: qualifying rating against race rating.',
    introduction: 'Each driver’s qualifying rating against their race rating, season by season.',
  },
  ageing: {
    slug: 'f1-driver-peak-age',
    title: 'At what age do F1 drivers peak? Driver rating by age',
    heading: 'At what age are F1 drivers at their best?',
    description:
      'When Formula 1 drivers peak and when they decline: the average change in driver rating from one season to the next, by age, from rookies to veterans.',
    introduction: 'The average change in driver rating at each age, from the early twenties into the forties.',
  },
  upsets: {
    slug: 'biggest-f1-upsets',
    title: 'The biggest upsets in F1 history: the most unlikely wins',
    heading: 'What are the biggest upsets in F1 history?',
    description:
      'The most unlikely Formula 1 race wins since 1994, ranked by the chance the pre-race driver and car ratings gave the winner.',
    introduction: 'The winners the ratings gave the smallest chance before the race.',
  },
};

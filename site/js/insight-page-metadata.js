// The page of each finding of the Insights (insights-cards.js), at its own address (written by tools/insight-pages.mjs): the address, the title and
// description that search engines and link previews show, the heading, and an introduction that asks the question the many ways people search for
// it ("the best F1 driver of all time", "the greatest driver in F1 history"). The ratings start in 1994, and each introduction says so. The words are
// fixed and name no result: names and numbers come from the data (insights-data.js), which changes after every Grand Prix.

export const INSIGHT_PAGES = {
  'driver-peak-ratings': {
    slug: 'best-f1-driver-of-all-time',
    title: 'Who is the best F1 driver of all time? Ranked without the car',
    heading: 'Who is the best F1 driver of all time?',
    description:
      'The greatest F1 drivers ranked with the car taken out: the best Formula 1 driver of all time since 1994, the best right now, and the best of each decade.',
    introduction:
      'Who is the greatest Formula 1 driver in history? Wins and championships mostly measure the car. This ranking takes the car out and orders every driver by the highest driver rating they reached. The ratings start in 1994, so the champions before then, from Fangio to Prost, are not in it, and Senna appears only in his last races.',
  },
  'driver-low-ratings': {
    slug: 'worst-f1-driver-ever',
    title: 'Who is the worst F1 driver ever? The lowest driver ratings',
    heading: 'Who is the worst F1 driver ever?',
    description:
      'The worst Formula 1 drivers in history by driver rating, with the slow car taken out: the lowest-rated drivers since 1994 and of each decade.',
    introduction:
      'Who was the slowest Formula 1 driver of all time? A driver in a slow car finishes at the back whatever their talent, so this ranking takes the car out and orders every driver by the lowest driver rating they reached, short careers included. The ratings start in 1994.',
  },
  'car-peak-ratings': {
    slug: 'best-f1-car-of-all-time',
    title: 'What is the best F1 car of all time? The most dominant cars',
    heading: 'What is the best F1 car of all time?',
    description:
      'The most dominant Formula 1 cars ever, ranked by car rating with the drivers taken out: the best F1 car since 1994, the fastest right now, and the best of each decade.',
    introduction:
      'Which was the fastest, most dominant Formula 1 car ever built? A great driver can make a car look better than it is, so this ranking separates each car from its drivers and orders every team by the highest car rating it reached. The ratings start in 1994.',
  },
  'car-low-ratings': {
    slug: 'worst-f1-car-ever',
    title: 'What is the worst F1 car ever? The slowest cars since 1994',
    heading: 'What is the worst F1 car ever?',
    description:
      'The slowest Formula 1 cars in history, ranked by car rating with the drivers taken out: the worst F1 cars since 1994 and the worst of each decade.',
    introduction:
      'Which was the slowest Formula 1 car of all time? This ranking separates each car from its drivers and orders every team by the lowest car rating it reached. The ratings start in 1994.',
  },
  'explained-share': {
    slug: 'is-f1-more-car-or-driver',
    title: 'Is F1 more car or driver? The real percentage',
    heading: 'Is F1 more about the car or the driver?',
    description:
      'How much of Formula 1 is the car and how much is the driver? The car and driver percentage, measured from decades of race results rather than guessed.',
    introduction:
      'Is F1 80% car and 20% driver, or 90% car? The split is quoted all the time and rarely measured. Here it is measured from race results: how much of who finishes ahead of whom the car ratings explain, and how much the driver ratings do.',
  },
  'circuit-weights': {
    slug: 'f1-tracks-where-the-driver-matters-most',
    title: 'Which F1 tracks reward the driver most? Driver and car tracks',
    heading: 'Which F1 tracks reward the driver most?',
    description:
      'Driver tracks and car tracks in Formula 1: the circuits where the driver makes the biggest difference, and those where the car decides the result.',
    introduction:
      'Is Monaco a driver’s track? Which circuits are decided by the car? For every circuit with enough races, this measures how much the driver ratings and the car ratings predict who finishes ahead there, compared with the average circuit.',
  },
  champions: {
    slug: 'f1-champions-car-or-driver',
    title: 'Which F1 world champions won it with the car?',
    heading: 'Which F1 world titles were won by the driver, and which by the car?',
    description:
      'Formula 1 world champions split into driver and car: which titles the driver won, which the car won, and which champion did the most with the least.',
    introduction:
      'Did Schumacher, Hamilton or Verstappen win their titles, or did their cars? For the points leader of each season, this splits the advantage over the field into the driver’s share and the car’s share.',
  },
  'equal-car-titles': {
    slug: 'f1-champions-in-equal-cars',
    title: 'Who would win F1 in equal cars? Titles with the same car',
    heading: 'Who would be F1 champion if every car were equal?',
    description:
      'If every Formula 1 driver had the same car: how many world championships each driver could expect, in their own era and placed in other eras.',
    introduction:
      'What if Formula 1 were a one-make series and every driver had the same car? This estimates how many world titles each driver could expect with equal cars, in their own seasons and placed in other eras.',
  },
  'career-driver-and-car': {
    slug: 'f1-drivers-who-carried-their-car',
    title: 'Which F1 drivers carried their car, and who was carried?',
    heading: 'Which F1 drivers carried their car, and which were carried by it?',
    description:
      'Formula 1 careers placed by driver rating and car rating: the drivers who dragged slow cars up the order, and those carried by the best car on the grid.',
    introduction:
      'Which Formula 1 drivers made a slow car look fast, and which won because their car was the best on the grid? Each career is placed by its average driver rating and its average car rating.',
  },
  'teammate-gaps': {
    slug: 'biggest-f1-teammate-gaps',
    title: 'Who beat their F1 teammate by the most? The biggest gaps',
    heading: 'Who beat their F1 teammate by the most?',
    description:
      'The most one-sided Formula 1 teammate battles since 1994, by season and over careers, and the teams with the most lopsided driver pairings.',
    introduction:
      'Teammates share the same car, so beating your teammate is the cleanest measure of a Formula 1 driver. These are the most one-sided teammate battles, by season, over whole careers and for each team.',
  },
  'qualifying-versus-race': {
    slug: 'best-f1-qualifiers-and-racers',
    title: 'Best qualifier or best racer? F1 Saturday and Sunday drivers',
    heading: 'Who are the best qualifiers in F1, and who are the best racers?',
    description:
      'Which Formula 1 drivers are fastest over one lap on Saturday, and which are better in the race on Sunday: qualifying rating against race rating.',
    introduction:
      'Some Formula 1 drivers are kings of qualifying; others come alive on Sunday. This compares each driver’s qualifying rating with their race rating, season by season.',
  },
  ageing: {
    slug: 'f1-driver-peak-age',
    title: 'At what age do F1 drivers peak? Driver rating by age',
    heading: 'At what age are F1 drivers at their best?',
    description:
      'When Formula 1 drivers peak and when they decline: the average change in driver rating from one season to the next, by age, from rookies to veterans.',
    introduction:
      'How old is a Formula 1 driver at their peak, and when does age start to cost speed? This follows driver ratings from one season to the next and averages the change at each age, from the early twenties into the forties.',
  },
  upsets: {
    slug: 'biggest-f1-upsets',
    title: 'The biggest upsets in F1 history: the most unlikely wins',
    heading: 'What are the biggest upsets in F1 history?',
    description:
      'The most unlikely Formula 1 race wins since 1994, ranked by the chance the pre-race driver and car ratings gave the winner.',
    introduction:
      'Which Formula 1 wins were the biggest shocks? Before each race the ratings give every driver a chance of winning; these are the winners they rated least likely.',
  },
};

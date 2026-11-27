// The text of the simple methodology, as HTML: the idea of the ratings in plain words, without formulas, for a reader who has not studied
// mathematics. Elements with an id are the figures that methodology-simple-view.js draws (shared with the full methodology,
// methodology-interactives.js and methodology-figures.js). The full account is methodology-content.js; the two describe the same code, and the
// Ferrari example of the fourth part is checked by tests/test-methodology-example.mjs.

export const SIMPLE_CONTENT_HTML = String.raw`
<section id="simple-problem" class="method-part">
  <h3>1. Why the problem is hard</h3>
  <p>
    When a driver wins a Grand Prix, two things won together: the driver and the car. A brilliant driver in a slow car can finish tenth, and an ordinary driver in the best car can win. This site tries to say how much of each result belongs to the driver and how much to the car.
  </p>
  <p>
    The trouble is that we never see one without the other. Every lap ever timed is a driver in a car. It is like watching two people carry a heavy table across a room: we can time how fast the table moves, but we cannot see who is doing the lifting.
  </p>
  <p>The sport makes it harder still.</p>
  <ul>
    <li><b>Good drivers and good cars end up together.</b> The best teams hire the best drivers, so the two kinds of strength arrive tangled up.</li>
    <li><b>Cars change all the time.</b> A team improves its car during the season and builds a new one every winter, so what was true last year is soon out of date.</li>
    <li><b>Luck plays a part.</b> A crash, a puncture, rain or a badly timed pit stop can decide a race.</li>
  </ul>
  <p>
    Teammates help, because they drive the same car. Yet even a perfect record of teammate results leaves one question open. Suppose two teammates are 20 points apart on a rating scale (the next part explains the points). We can give both drivers 20 extra points and take 20 points away from their car, and every result is explained equally well. The slider shows this.
  </p>
  <figure class="method-figure method-interactive">
    <div id="simpleSplitLab"></div>
    <figcaption>Move the slider. However the credit is divided, the two drivers stay 20 points apart and each driver with the car stays exactly as fast, so their results cannot tell the divisions apart.</figcaption>
  </figure>
  <p>
    Settling that question needs evidence from outside the team. Three kinds help: cars differ from one another far more than drivers do, cars change much faster than drivers, and drivers move between teams, taking their skill with them.
  </p>
</section>

<section id="simple-odds" class="method-part">
  <h3>2. Ratings as chances of winning</h3>
  <p>
    Imagine that every driver and every car has a hidden strength, written as a number: a rating. What makes a rating useful is the meaning of the difference between two ratings. Add up a driver's rating and their car's, do the same for a rival, and the difference gives the chance that one finishes ahead of the other.
  </p>
  <ul>
    <li>Equal ratings mean an even contest: 50% each.</li>
    <li>A lead of 30 points means about a 72% chance of finishing ahead.</li>
    <li>A lead of 75 points means odds of 10 to 1, a 91% chance.</li>
    <li>A lead of 150 points means odds of 100 to 1, a 99% chance.</li>
  </ul>
  <p>The chess rating that ranks the world's players works on the same principle.</p>
  <figure class="method-figure">
    <div class="method-figure-box" id="simpleOddsChart"></div>
    <figcaption>How a lead in rating turns into a chance of finishing ahead. A small lead makes a large difference in a close contest; past about 150 points the result is nearly certain.</figcaption>
  </figure>
  <p>
    Differences add up. If A is 20 points better than B, and B is 10 points better than C, then A is 30 points better than C, even if A and C have never raced each other. Because of this, one scale can cover every driver and every car since 1994. On the site, 1,000 stands for the typical level of the recent leading field: the middle of the 20 best-rated drivers, or of the 10 best-rated cars.
  </p>
  <p>
    The hard part is finding the ratings. Nobody can measure them directly. All we see is who finished ahead of whom, and how far apart their lap times were, and every one of those results mixes the driver with the car. The rest of this explanation shows how to get from results to ratings.
  </p>
</section>

<section id="simple-teammates" class="method-part">
  <h3>3. Learning from teammates</h3>
  <p>
    The model assumes that teammates have the same car, so a comparison between them is evidence about the drivers alone. Real teammates can receive different upgrades, strategies or treatment, so this is an approximation, but a good one. It suggests a first way to compare drivers: use teammate results and nothing else.
  </p>
  <p>
    Take two teammates, A and B, who meet ten times: A finishes ahead 7 times and B 3 times. To turn this record into points, we first add one imaginary win to each side, which stops a short unbeaten record from looking infinitely strong. That gives 8 to 4, odds of 2 to 1. On our scale, odds of 2 to 1 are a gap of about 23 points.
  </p>
  <p>
    Drivers change teams, so these pairs link up into chains. If A is 23 points ahead of B, and B later partners C and comes out about 18 points ahead, then A is about 41 points ahead of C. Each link carries some luck, so a long chain is less certain than a direct meeting. The figure builds such a chain one pairing at a time.
  </p>
  <figure class="method-figure method-interactive">
    <div id="simpleCareerGraph"></div>
    <figcaption>An invented example. Move the slider to add teammate pairings one at a time and watch the comparison between A and the last driver build up along the chain.</figcaption>
  </figure>
  <p>
    Done for every teammate pairing since 1994, this gives a network: every driver is a point, and every pair of teammates is a line between two points. The <a href="/graph">Graph page</a> draws this network for every driver, with each driver placed at their rating on the site.
  </p>
  <p>
    One could rate drivers from the network alone, by finding one number per driver whose differences agree as closely as possible with all the teammate records. That is a helpful way to think about it, but the site does not compute such a score. A teammate score says nothing about cars, ignores lap times, treats a result from ten years ago like one from last week, and struggles with a driver who only ever had one teammate. The ratings on this site come instead from a model that reads every teammate result directly, together with everything a teammate score leaves out.
  </p>
</section>

<section id="simple-model" class="method-part">
  <h3>4. A model that keeps learning</h3>
  <p>
    The model keeps track of three numbers for every driver and every car: a speed over one qualifying lap, a speed over a race stint, and an overall racing strength. For each number it keeps two things: a <b>best guess</b>, and <b>how sure it is</b> of that guess. A newcomer starts at an average guess, and the model is much less sure about a new car than about a new driver, because cars differ from one another far more.
  </p>
  <p>Every race weekend then goes through the same three steps.</p>
  <ol>
    <li><b>Time passes.</b> Before the weekend, the model becomes a little less sure of every number, because drivers and cars may have changed since it last saw them. Cars, which are developed during the season and rebuilt over the winter, become uncertain much faster than drivers. The best guesses themselves stay where they were.</li>
    <li><b>Forecast.</b> The model gives every pair of drivers a chance of finishing ahead, and how far apart their lap times should be. These forecasts are recorded before anything happens.</li>
    <li><b>Update.</b> After the weekend, it compares what happened with what it expected, and adjusts its guesses.</li>
  </ol>
  <p>How far a guess moves in the update follows two common-sense rules.</p>
  <ul>
    <li><b>A surprise moves it more than an expected result.</b> If the favourite wins, little changes. If an outsider beats a strong driver, the guesses move.</li>
    <li><b>A guess the model is unsure of moves more than one it is sure of.</b> A newcomer's rating moves a lot after one strong weekend. A driver with 200 races behind them moves much less.</li>
  </ul>
  <figure class="method-figure method-interactive">
    <div id="simpleBeliefUpdate"></div>
    <figcaption>One rating before and after a single result. The dashed curve is what the model believed before: the peak is its best guess and the width shows how unsure it was. Change how surprising the result is and how sure the model was, and see how far the guess moves and how much narrower the curve becomes.</figcaption>
  </figure>
  <p>
    Teammate comparisons carry the most weight, because the car cancels out of them. Since drivers and cars are tracked together, a result that lifts or drops both teammates is credited mostly to their car, while a gap between the teammates is credited to the drivers. At the 2026 Las Vegas Grand Prix, for example, both Ferraris finished behind cars the model rated well below them. Because both drivers fell short together, the model lowered the Ferrari car by 10 points, while each driver moved by less than 2 points.
  </p>
  <figure class="method-figure">
    <div class="method-figure-box" id="simpleWeekendChart"></div>
    <figcaption>The Ferrari weekend in Las Vegas. Each bar is how far a rating moved, and the grey band is how unsure the model was before the weekend. The car moved furthest, and the model was least sure about it.</figcaption>
  </figure>
  <p>
    The model also links what it knows. A driver's three numbers tend to move together, so a strong qualifying lap raises the guess about their race strength too. And a driver who has shared a car with someone stays linked to them, so a surprising result for a former teammate or a former team nudges their rating even on a weekend they did not race.
  </p>
  <p>
    The model reads more than finishing positions. Qualifying laps show speed with little luck involved, and race lap times show how much faster one car was than another, beyond the order in which they finished. Breakdowns and crashes are tracked separately, as each driver's and each car's risk of not finishing, and they do not count against a driver's rating.
  </p>
</section>

<section id="simple-history" class="method-part">
  <h3>5. Looking back, and how well it works</h3>
  <p>
    So far the model moves forward through time, rating each weekend with only the races before it. That is exactly what a forecast needs, but it leaves information unused when describing the past: how good a driver was in 2005 also shows in what their later teammates did. For the history, the site therefore runs the same model a second time, over all the races at once, so that every past rating also uses the races that came after it.
  </p>
  <p>
    The past ratings on the Ratings, History and Graph pages come from this second run. The latest weekend, which no later race can inform, comes from the first. The two runs agree closely in recent seasons. Further back they differ by several points, and at the very start of the record, in 1994 and 1995, they can differ sharply for some drivers and cars. Ratings from those first seasons are the least certain on the site.
  </p>
  <figure class="method-figure">
    <div class="method-figure-box" id="simpleTwoRunsChart"></div>
    <figcaption>Michael Schumacher's rating above the leading field from 1994 to 2006 in both runs. Moving forward through time (the chronological run), the model needs most of 1994 to see how strong Schumacher was; looking back with every race (the historical run), it sees it from the first weekend.</figcaption>
  </figure>
  <p>
    Because each weekend is forecast before it is used, the forecasts can be scored afterwards. In every season since 2008 they have beaten tossing a coin, and in about three pairs out of four the driver they favoured finished ahead. The weakest season was 2009, the first year of new technical rules, when the favourite finished ahead in 67% of pairs.
  </p>
  <p>
    Good forecasts do not prove that the credit is divided correctly, because a model can predict a driver and car together well while splitting them wrongly. The hardest real test uses drivers who change team: their rating, frozen before the move, predicts how they will fare against their new teammate. Over 51 moves it does better than a coin toss, but only slightly, and on finishing order alone it does not. In simulated seasons where the true split is known, the model's driver ratings had typical errors of about 12 points and its car ratings of about 15, and when a car suddenly became faster, the gain went to the car. It did worse when some drivers suited some cars particularly well, which the model does not allow for.
  </p>
  <p>
    The ratings are estimates with real uncertainty, above all in the split between driver and car. The <a href="/methodology/full">full methodology</a> gives every step, setting and test in detail.
  </p>
</section>
`;

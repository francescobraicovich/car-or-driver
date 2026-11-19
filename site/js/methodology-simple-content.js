// The text of the simple methodology, as HTML: the idea of the ratings in plain words, without formulas, for a reader who has not studied
// mathematics. Elements with an id are the figures that methodology-simple-view.js draws (shared with the full methodology,
// methodology-interactives.js and methodology-figures.js). The full account is methodology-content.js.

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
    Teammates help, because they drive the same car. Yet even a perfect record of teammate results leaves one question open. Suppose two teammates are 20 points apart on a rating scale (the next slide explains the points). We can give both drivers 20 extra points and take 20 points away from their car, and every result is explained equally well. The slider shows this.
  </p>
  <figure class="method-figure method-interactive">
    <div id="simpleSplitLab"></div>
    <figcaption>Move the slider. However the credit is divided, the two drivers stay 20 points apart and each driver with the car stays exactly as fast, so their results cannot tell the divisions apart.</figcaption>
  </figure>
  <p>
    Settling that question needs evidence from outside the team: drivers who move to other teams, and the way cars change from one year to the next.
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
    Differences add up. If A is 20 points better than B, and B is 10 points better than C, then A is 30 points better than C, even if A and C have never raced each other. This is what lets one scale cover every driver and every car since 1994. On the site, 1,000 stands for the typical level of the recent field.
  </p>
  <p>
    The hard part is finding the ratings. Nobody can measure them directly. All we see is who finished ahead of whom, and every one of those results mixes the driver with the car. The rest of this explanation shows how to get from results to ratings.
  </p>
</section>

<section id="simple-teammates" class="method-part">
  <h3>3. Learning from teammates</h3>
  <p>
    Teammates drive the same car, so when one beats the other, the car cannot be the reason. A teammate record is the cleanest evidence there is about drivers, and it suggests a first way to rate them: use teammate comparisons and nothing else.
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
    Done for every teammate pairing since 1994, this gives a graph: every driver is a point, and every pair of teammates is a line between two points. A score for each driver can then be found by looking for one number per driver whose differences agree as closely as possible with all the teammate records at once. A partnership with many races should count for more than a short one, and a driver with few comparisons should stay close to the average, because little is known about them. The <a href="#/graph">Graph page</a> draws this network of teammates for every driver.
  </p>
  <p>
    A teammate score is a good first answer, and it leaves a lot out. It says nothing about cars. It ignores qualifying laps and lap times. It treats a result from ten years ago like one from last week. And a driver who only ever had one teammate is hard to place against everyone else. The ratings on this site come from a model built to fill these gaps.
  </p>
</section>

<section id="simple-model" class="method-part">
  <h3>4. A model that keeps learning</h3>
  <p>
    The model does what the teammate score does, and much more. It keeps track of many numbers at once: for every driver and every car, a speed over one qualifying lap, a speed over a race stint, and an overall racing strength. For each number it keeps two things: a <b>best guess</b>, and <b>how sure it is</b> of that guess.
  </p>
  <p>Every race weekend goes through the same two steps.</p>
  <ol>
    <li><b>Predict.</b> Before the weekend, the model uses its best guesses to give every pair of drivers a chance of finishing ahead. The predictions are recorded before anything happens.</li>
    <li><b>Update.</b> After the weekend, it compares what happened with what it expected, and adjusts its guesses.</li>
  </ol>
  <p>How far a guess moves follows two common-sense rules.</p>
  <ul>
    <li><b>A surprise moves it more than an expected result.</b> If the favourite wins, little changes. If an outsider beats a strong driver, the guesses move.</li>
    <li><b>A guess the model is unsure of moves more than one it is sure of.</b> A newcomer's rating moves a lot after one strong weekend. A driver with 200 races behind them moves much less.</li>
  </ul>
  <figure class="method-figure method-interactive">
    <div id="simpleBeliefUpdate"></div>
    <figcaption>One rating before and after a single result. The dashed curve is what the model believed before: the peak is its best guess and the width shows how unsure it was. Change how surprising the result is and how sure the model was, and see how far the guess moves and how much narrower the curve becomes.</figcaption>
  </figure>
  <p>
    Teammate comparisons carry the most weight in the model, because the car cancels out of them. Because drivers and cars are tracked together, a result that lifts both teammates is credited mostly to their car, while a gap between the teammates is credited to the drivers. Cars change, so the model lets its certainty about every car fade a little each weekend and a lot over the winter, ready to learn about a new car quickly. A driver's skill changes slowly, so their ratings go with them when they move to another team, and their results in the new car tell the model how good that car is.
  </p>
  <p>
    The model reads more than finishing positions. Qualifying laps show speed with little luck involved, and race lap times show how much faster one car was than another, beyond the order in which they finished. Breakdowns and crashes are tracked separately, as each driver's and each car's risk of not finishing.
  </p>
  <p>
    Every prediction is checked. Because each weekend is predicted before it happens, the predictions can be scored afterwards. In every season since 2008 they have beaten tossing a coin, and about three times in four the driver they favoured finished ahead. The <a href="#/methodology/full">full methodology</a> gives every step, setting and test in detail.
  </p>
</section>
`;

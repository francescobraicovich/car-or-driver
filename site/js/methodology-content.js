// The text of the full methodology, as HTML. Formulas are LaTeX in elements with `data-math` (inline) or `data-math-display` (display), typeset by
// KaTeX in methodology-view.js. Elements with `data-setting` are filled from the settings of the loaded model, and elements with an id are the
// figures and live tables and sentences that methodology-view.js draws.
//
// The text describes the code, not earlier documentation. Keep it in step with packages/core/python/unified_model.py (the state-space model and
// its forward run), packages/core/node/unified-evidence.mjs (the comparisons and their weights), packages/core/python/build_unified.py,
// unified_calibration.py and unified_grid.py (the weekend cycle, calibration and grid forecast), packages/core/src/hazard.js (retirement risks),
// packages/core/src/unified/ (the browser's forecasts), research/retrospective-refit/retrospective_refit.py (the historical run) and
// site/js/rating-reference.js (the displayed scale). The worked weekend of the forward run is checked by tests/test-methodology-example.mjs.
export const CONTENT_HTML = String.raw`
<section id="method-questions" class="method-part">
  <h3>1. The question: driver or car?</h3>

  <h4>Every result is a driver in a car</h4>
  <p>
    Every Formula 1 result is produced by a driver in a car. When a car crosses the line first, the result belongs to both, and the result alone does not say how much of it came from the driver and how much from the machine. This site estimates that division. After every Grand Prix weekend since 1994 it gives each driver and each car ratings of their own, in the same units and with an uncertainty attached, and it uses those ratings to forecast who will finish ahead of whom.
  </p>

  <h4>Why the split cannot be seen directly</h4>
  <p>
    A driver is never timed without a car, and a car never races without a driver, so every lap time and every finishing position measures the two together. Moreover, the two kinds of strength tend to arrive together: the strongest teams hire the strongest drivers, so fast drivers sit in fast cars far more often than chance would produce. A driver who wins often may therefore be excellent, may have the best car, or both, and the results by themselves cannot say which.
  </p>

  <h4>What the sport gives us: teammates, moves, timing, changing cars</h4>
  <p>Several features of the sport nonetheless carry information about the split.</p>
  <ul>
    <li><b>Teammates share a car.</b> Two drivers of the same team race the same machinery, so the comparison between them reflects the drivers. In practice upgrades, strategy and team orders can still differ between them.</li>
    <li><b>Drivers change teams.</b> A driver takes their skill to the new team. Their results there compare the new car with the old one, and their new teammate with the old.</li>
    <li><b>Laps are timed.</b> Qualifying and race lap times measure the size of an advantage as well as its direction, and qualifying in particular leaves little room for luck.</li>
    <li><b>Cars change faster than drivers.</b> Teams rebuild their cars every winter and develop them through the season, whereas a driver's skill changes slowly. When both drivers of a team improve at once, the car is the likely cause.</li>
  </ul>

  <h4>Three ratings for three things a weekend measures</h4>
  <p>A race weekend measures three different things, so each driver and each car carries three ratings.</p>
  <table><thead><tr><th>Rating</th><th>What it measures</th><th>Evidence it learns from</th></tr></thead><tbody>
    <tr><td><b>Qualifying pace</b></td><td>Speed over one qualifying lap.</td><td>Time gaps between drivers in the same qualifying session.</td></tr>
    <tr><td><b>Race pace</b></td><td>Speed over comparable race laps.</td><td>Time gaps between drivers on the same race laps.</td></tr>
    <tr><td><b>Overall strength</b></td><td>How likely an entry is to finish ahead of another.</td><td>Who finished ahead of whom, among drivers who finished.</td></tr>
  </tbody></table>
  <p>
    Overall strength is the headline rating: it orders the Ratings page and drives every race forecast. The two pace ratings measure speed directly, and since the three ratings of a driver or a car are linked (<a href="#" data-jump="method-filter">Section 6</a>), they also inform overall strength.
  </p>

  <h4>How the rest of this methodology answers the question</h4>
  <p>
    The remaining sections build the answer in order. <a href="#" data-jump="method-data">Section 2</a> describes the data, <a href="#" data-jump="method-ratings">Section 3</a> defines what a rating means, and <a href="#" data-jump="method-separation">Section 4</a> explains which comparisons separate drivers from cars. <a href="#" data-jump="method-model">Section 5</a> states the model, a state-space model of the strength of every driver and car, and Sections <a href="#" data-jump="method-filter">6</a> and <a href="#" data-jump="method-history">7</a> compute it in two ways: forward, one weekend at a time, and over the whole history at once. <a href="#" data-jump="method-forecast">Section 8</a> turns the ratings into predictions, <a href="#" data-jump="method-evidence">Section 9</a> reports how well they hold up, and <a href="#" data-jump="method-limits">Section 10</a> collects the limitations, the settings and the sources. The findings on the <a href="#/insights">Insights page</a> use the same ratings, or the raw results where no rating is needed, and each finding carries its own note on how it was computed.
  </p>
</section>

<section id="method-data" class="method-part">
  <h3>2. Data: what exists</h3>

  <h4>Sources and licence</h4>
  <p>
    The results, qualifying times and lap times come from the open collection TracingInsights/RaceData <a class="cite" href="#" data-jump="ref-17">[17]</a>, which draws on the Jolpica-F1 database <a class="cite" href="#" data-jump="ref-18">[18]</a> and two Kaggle datasets <a class="cite" href="#" data-jump="ref-19">[19]</a>. The ratings, forecasts and findings derived from them are shared under the non-commercial licence CC BY-NC-SA 4.0, and the About page gives the full credits.
  </p>

  <h4>What results, qualifying and lap times each record</h4>
  <p>
    Three tables carry the evidence. The <b>results</b> table gives, for every driver at every Grand Prix, the team, the starting position, the classified finishing position, the number of laps completed and a status that says whether the driver finished, was lapped or retired, and why. The <b>qualifying</b> table gives each driver's best time in each qualifying session (Q1, Q2 and Q3 in the current format). The <b>lap-times</b> table gives the duration of every race lap each driver completed. Smaller tables name the drivers, teams, circuits and finishing statuses.
  </p>

  <h4>Coverage by era</h4>
  <p>
    The tables reach back to different years: results to 1950, race lap times to 1982 and qualifying times to 1994. The ratings therefore start in 1994, the first season with all three. The chronological run of <a href="#" data-jump="method-filter">Section 6</a> covers <span id="methodologyCoverage">every Grand Prix weekend since 1994</span>. The historical run of <a href="#" data-jump="method-history">Section 7</a> also reads the results and race laps of 1990 to 1993 to give the ratings of 1994 a running start.
  </p>

  <h4>What is missing or deliberately unused</h4>
  <p>
    Some records are absent. Qualifying times are missing for 9 of the 16 races of 1996 and 7 of the 17 races of 1997, so on those weekends the pace ratings learn from race laps alone. Sprint races are not in the tables, and weather is not recorded at all, so a wet race enters the ratings like a dry one.
  </p>

  <h4>Keeping up to date after each Grand Prix</h4>
  <p>
    A scheduled job checks the sources every day. It accepts a new Grand Prix only when its results, qualifying times and lap times all look complete (at least ten drivers in each, and at least a hundred lap times), when no scheduled race has been skipped and when the race date has passed. It then rebuilds every rating, forecast and finding and runs the full test suite, and the site changes only if every test passes.
  </p>
</section>

<section id="method-ratings" class="method-part">
  <h3>3. What a rating means</h3>

  <h4>Three ratings: qualifying pace, race pace, overall strength</h4>
  <p>
    Every rating is a number of points, and only differences between ratings carry meaning. The three ratings share the unit but read it differently: a gap in overall strength translates into odds of finishing ahead, whereas a gap in either pace rating translates into a fraction of a lap.
  </p>

  <h4>Overall strength as odds: 75 points is 10 to 1</h4>
  <p>
    Suppose that each entry, a driver in a car, has an overall strength, and that the chance of one entry finishing ahead of another depends only on the difference between their strengths. The simplest rule with that property is the logistic curve of the <b>Bradley–Terry</b> model <a class="cite" href="#" data-jump="ref-1">[1]</a>. For an overall gap <span data-math>g</span> in the model's internal units,
  </p>
  <p class="method-equation" data-math-display>\Pr(A\text{ finishes ahead of }B)=\sigma(g)=\frac{1}{1+e^{-g}}.</p>
  <p>
    The site quotes strengths in points, one internal unit being <span data-math>75/\ln 10\approx 32.6</span> points. On this scale a lead of 75 points gives odds of 10 to 1 (a 91% chance), a lead of 150 points gives 100 to 1 (99%), a lead of 30 points gives 71.5%, and equal strengths give 50%.
  </p>
  <figure class="method-figure">
    <div class="method-figure-box" id="methodologyOddsChart"></div>
    <figcaption>How a gap in overall strength becomes a chance of finishing ahead, before uncertainty, calibration and retirements (<a href="#" data-jump="method-forecast">Section 8</a>). The curve is steepest where the contest is close.</figcaption>
  </figure>

  <h4>Pace ratings as time: one point is about 0.0092% of a lap</h4>
  <p>
    The pace ratings use the same points for time. Internally a time gap is counted in units of 0.3% of a lap, and one point is <span data-math>1/32.6</span> of that unit, so one point is about 0.0092% of a lap. A 10-point gap in qualifying pace is therefore about 0.09% of a lap, or 0.08 seconds on a 90-second lap. The odds reading applies to overall strength only.
  </p>

  <h4>Differences add up: one scale for everyone since 1994</h4>
  <p>
    Because the odds depend only on the difference between strengths, differences add. If A is 20 points stronger than B and B is 10 points stronger than C, then A is 30 points stronger than C, a 71.5% chance, even if A and C never raced each other. This additivity lets results from many different pairs combine into one scale covering every driver and every car since 1994.
  </p>

  <h4>What 1000 and ± mean on the site</h4>
  <p>
    In the model's own coordinates every newcomer starts at 1000 (<a href="#" data-jump="method-model">Section 5</a>). The Ratings, History and Graph pages shift all the ratings of a weekend by the same amount, so that 1000 stands for the leading field of recent races: the middle of the 20 highest-rated drivers, or of the 10 highest-rated cars. <a href="#" data-jump="method-history">Section 7</a> describes how this reference is built. Since the shift is common to a whole weekend, the gaps within a weekend and every forecast are unaffected. The ± after a current rating is one standard deviation of that driver's or car's estimate, and Section 7 explains the ± of past ratings.
  </p>
</section>

<section id="method-separation" class="method-part">
  <h3>4. Separating driver and car</h3>

  <h4>An entry's strength is driver plus car</h4>
  <p>The model treats an entry as the sum of its parts. For each of the three ratings, entry A's expected advantage over entry B is</p>
  <p class="method-equation" data-math-display>g=(d_A-d_B)+(c_A-c_B),</p>
  <p>
    where <span data-math>d</span> and <span data-math>c</span> are the driver and car strengths of each entry. If A's driver is 20 points stronger than B's but A's car is 10 points weaker, A's expected advantage is 10 points.
  </p>

  <h4>Between teammates, the car cancels</h4>
  <p>
    Teammates drive the same car, so <span data-math>c_A=c_B</span> and the car terms cancel: a comparison between teammates measures the two drivers alone. A comparison between drivers of different teams, by contrast, measures two whole packages, and it cannot say on its own whether the winning package was ahead because of its driver or its car.
  </p>

  <h4>The shared shift teammates cannot settle</h4>
  <p>
    Even a complete record of teammate results leaves one quantity open. Teammate results fix the gap between two drivers but not their common level: adding 20 points to both drivers of a team and subtracting 20 from their car leaves every package, and so every predicted result, unchanged. The slider shows this.
  </p>
  <figure class="method-figure method-interactive">
    <div id="methodologySplitLab"></div>
    <figcaption>Move the slider. Two packages and one teammate gap allow many divisions between drivers and car, all predicting the same results.</figcaption>
  </figure>

  <h4>What settles it: cars differ more, change faster, and drivers move</h4>
  <p>The shift is settled by information from outside the team, and <a href="#" data-jump="method-model">Section 5</a> gives each source its number.</p>
  <ul>
    <li><b>Cars differ more than drivers.</b> Before any result, the model expects a car's strength to be far less certain than a driver's. Consequently, when both drivers of a team rise together, the rise is credited mostly to the car.</li>
    <li><b>Cars change faster than drivers.</b> The model lets a car's strength change much more from weekend to weekend, and over the winter, than a driver's. A sudden rise shared by teammates therefore points to the car.</li>
    <li><b>Drivers move.</b> A driver who changes team takes their strength along, so their results in the new car measure that car against the old one.</li>
  </ul>
  <figure class="method-figure">
    <div class="method-figure-box" id="methodologyCareerChart"></div>
    <figcaption id="methodologyCareerCaption">One driver's overall strength after every weekend of their career, and the overall strength of the car they drove.</figcaption>
  </figure>

  <h4>Chains of teammates and the career network</h4>
  <p>
    Each teammate comparison links two drivers, and when one of them later partners someone else, the links form a chain. Differences add along the chain: if A is about 20 points ahead of B and B about 10 ahead of C, then A is about 30 ahead of C, although they never shared a car. Each link carries noise, so a chain is less precise than a direct comparison. Its variance is
  </p>
  <p class="method-equation" data-math-display>v_{AC}=v_{AB}+v_{BC}+2\operatorname{Cov}(g_{AB},g_{BC}).</p>
  <p>
    The figure builds a chain one pairing at a time. Each label turns an illustrative win–loss record into a gap with <span data-math>g=75\log_{10}\frac{W+1}{L+1}</span>; the added ones keep an unbeaten record finite, so 7 wins against 3 losses give <span data-math>75\log_{10}(8/4)\approx23</span> points.
  </p>
  <figure class="method-figure method-interactive">
    <div id="methodologyCareerGraph"></div>
    <figcaption>An illustrative career network, revealed in date order. The win–loss records are invented.</figcaption>
  </figure>
  <p>
    Over three decades these chains join drivers of different teams and eras into one network. The <a href="#/graph">Graph page</a> draws it: every driver, placed at their published overall rating and linked to each of their teammates. The model holds the same network in another form, as relations between the uncertainties of its estimates (<a href="#" data-jump="method-filter">Section 6</a>).
  </p>

  <h4>A teammate-only score as intuition, and why the site does not use one</h4>
  <p>
    The chains suggest a simple rating: choose one number per driver so that the differences agree as closely as possible with every teammate record at once. Such a score is a helpful way to think about the network. The published ratings, however, include no separate teammate score; every teammate comparison enters the model directly as an observation, alongside the comparisons between teams. A teammate score added on top would count the same teammate results twice and make the ratings look more certain than they are.
  </p>

  <h4>Where the split stays weak: isolated drivers and thin links</h4>
  <p>
    The split is only as reliable as the links behind it. A driver who only ever had one teammate is tied to the rest of the field through that single pairing, and a team whose drivers rarely moved is compared with other teams mainly through results between teams, which mix driver and car. In those places a strong driver is hard to tell from a strong car, and the uncertainty of the ratings is wider. <a href="#" data-jump="method-limits">Section 10</a> lists the other assumptions the split rests on.
  </p>
</section>

<section id="method-model" class="method-part">
  <h3>5. The state-space model: strengths and how they produce results</h3>

  <h4>What a state-space model is, in one paragraph</h4>
  <p>
    A state-space model describes something that cannot be observed directly, the <b>state</b>, through two rules <a class="cite" href="#" data-jump="ref-3">[3]</a><a class="cite" href="#" data-jump="ref-4">[4]</a>. The first rule says how the state changes over time; the second says how each observation depends on the current state. Here the state is the strength of every driver and every car, the first rule says how much those strengths can change between weekends, and the second says how they produce qualifying gaps, race-pace gaps and finishing orders. Estimating the model means working back from the observations to the state. This section states the model; Sections <a href="#" data-jump="method-filter">6</a> and <a href="#" data-jump="method-history">7</a> estimate it in two ways.
  </p>

  <h4>The state: three strengths for every driver and every car</h4>
  <p>
    Each driver <span data-math>i</span> has three strengths, one per rating, written <span data-math>d_i=(d_i^{q},d_i^{r},d_i^{o})</span> for qualifying pace, race pace and overall strength, and each car <span data-math>j</span> has three, <span data-math>c_j</span>. The state at weekend <span data-math>t</span>, written <span data-math>\theta_t</span>, collects the strengths of every driver and car met so far. A car here means a team's line of cars: a team that is only renamed keeps its car, whereas a takeover by a new owner starts a new car. Toro Rosso, for example, continued as AlphaTauri and then RB, while Brawn and Mercedes are separate cars.
  </p>

  <h4>Starting beliefs for a newcomer</h4>
  <p>
    The first time a driver or a car appears, each of its strengths starts at 1000 with a standard deviation of 20 points for a driver and 50 points for a car. These two numbers encode the first source of separation in <a href="#" data-jump="method-separation">Section 4</a>: before any result, cars are expected to differ far more than drivers. The three strengths of a newcomer are correlated, so that a driver who proves quick in qualifying is also expected to be quick in the race:
  </p>
  <p class="method-equation" data-math-display>d_{\text{new}}\sim\mathcal{N}\!\left(1000,\;20^2R_d\right),\qquad c_{\text{new}}\sim\mathcal{N}\!\left(1000,\;50^2R_c\right),\qquad R=(1-\rho)I+\rho\,\mathbf{1}\mathbf{1}^{\mathsf T},</p>
  <p>
    where <span data-math>R</span> is a three-by-three correlation matrix with <span data-math>\rho</span> = <span data-setting="driver_correlation"></span> for drivers and <span data-setting="car_correlation"></span> for cars.
  </p>

  <h4>How the state changes: drivers with time, cars with races and winters</h4>
  <p>Between two weekends every strength may change, and the model describes the change as a random step with no preferred direction:</p>
  <p class="method-equation" data-math-display>\theta_t=\theta_{t-1}+\eta_t,\qquad \eta_t\sim\mathcal{N}(0,Q_t).</p>
  <p>
    The best guess of a strength therefore stays where it is between weekends; only its uncertainty grows, and only new results move the estimate. The size of the step, <span data-math>Q_t</span>, differs between drivers and cars.
  </p>
  <ul>
    <li><b>Drivers</b> change in proportion to the time elapsed: the standard deviation of the step is 8 points over a year, or <span data-math>8\sqrt{\Delta t}</span> points over <span data-math>\Delta t</span> years, about 1.6 points over the two weeks between consecutive races. The step applies to every driver, racing or not, so a driver who returns after a season away comes back with a wider band.</li>
    <li><b>Cars</b> change with racing and with the calendar: 6 points for each weekend a car races, for development, and 30 points at the first race of a new year, when cars are rebuilt. The winter step applies to every car the model has met.</li>
  </ul>
  <p>
    The three strengths of a driver or a car change together, with the same correlations as their starting beliefs. Steps add as variances, so a driver's ±14 grows only to about ±14.1 over two weeks, whereas a car's ±40 grows to about ±50 over a winter.
  </p>
  <figure class="method-figure">
    <div class="method-figure-box" id="methodologyUncertaintyChart"></div>
    <figcaption>The uncertainty of Charles Leclerc's overall strength and of the Ferrari car's after every weekend since 2019, in the chronological run. Each season is drawn as its own line. The car's band widens at the first race of each season, when cars are rebuilt, and narrows as results arrive, while the driver's stays narrow throughout.</figcaption>
  </figure>

  <h4>From state to result: the gap equation, and why the car cancels between teammates</h4>
  <p>The second rule links the state to the observations. A comparison between entries A and B in rating <span data-math>k</span> depends on the state only through the gap</p>
  <p class="method-equation" data-math-display>g=\left(d_A^{k}-d_B^{k}\right)+\left(c_A^{k}-c_B^{k}\right)=x^{\mathsf T}\theta_t,</p>
  <p>
    where <span data-math>x</span> is a vector with <span data-math>+1</span> at A's driver and car, <span data-math>-1</span> at B's driver and car, and zeros elsewhere. For teammates the <span data-math>+1</span> and <span data-math>-1</span> of the car fall on the same strength and cancel exactly, so <span data-math>x</span> touches the two drivers only. A qualifying comparison touches qualifying strengths only, a race-pace comparison race-pace strengths and a finishing order overall strengths; the three ratings interact only through the correlations of their starting beliefs and their steps.
  </p>

  <h4>What the model observes: comparisons from qualifying, race laps and finishing order</h4>
  <p>Each weekend is turned into comparisons between pairs of drivers; a finishing order of 20 drivers alone contains 190 pairs.</p>
  <ul>
    <li><b>Qualifying.</b> Two drivers are compared in the latest session in which both set a usable time: Q3, else Q2, else Q1. From 2006 to 2009, when Q3 was run with race fuel on board, Q2 and Q1 are used instead. The comparison is the time difference divided by the average of the two times: if A takes 90.0 seconds and B 90.3, A's advantage is about 0.33%. In Q2 and Q3, with at least eight times recorded, a time more than 10% above the session median is left out, as are a few documented interrupted attempts and isolated Q1 laps far slower than both the field and the driver's teammate.</li>
    <li><b>Race pace.</b> Two drivers are compared on laps with the same number. Lap 1 is dropped, and so is any lap slower than 105% of the driver's fastest remaining lap, which removes pit stops and safety-car laps. The relative time difference of each matched lap is computed, its median is taken within consecutive eight-lap windows (laps 2 to 9, 10 to 17, and so on), and the comparison is the median of those window medians, so that a single odd lap or stint cannot dominate. At least four matched laps are needed, and the comparison reaches full coverage at sixteen.</li>
    <li><b>Finishing order.</b> Two drivers who were both classified as finishers, lapped or not, form a pair, and the one classified ahead wins it. A retirement does not enter the ratings: it updates the retirement risks of <a href="#" data-jump="method-forecast">Section 8</a>, while the laps completed before it still count for race pace unless an early failure visibly slowed them.</li>
  </ul>
  <p>A pair of drivers contributes at most one comparison per rating per weekend, and a race of fewer than two laps, such as the 2021 Belgian Grand Prix behind the safety car, gives no race comparisons at all.</p>

  <h4>How likely each observation is: a logistic error for time gaps, Bradley–Terry for order</h4>
  <p>
    Each observed value receives a probability given the gap <span data-math>g</span>. A time gap <span data-math>y</span>, counted in units of 0.3% of a lap, scatters around <span data-math>g</span> according to a logistic distribution with scale <span data-math>s</span>:
  </p>
  <p class="method-equation" data-math-display>\ell(g)=-\log p(y\mid g)=2\log\!\left(2\cosh\frac{y-g}{2s}\right)+\log s.</p>
  <p>
    Near its centre this distribution resembles a bell curve, but its tails are heavier, so a lap lost to traffic or damage pulls the estimate only a limited distance. The scale <span data-math>s</span> is <span data-setting="noise"></span> in internal units, about 0.58% of a lap in qualifying and 0.49% in race pace. For finishing order, <span data-math>y</span> is 1 if A finished ahead and 0 otherwise, and its probability follows the Bradley–Terry curve of <a href="#" data-jump="method-ratings">Section 3</a>:
  </p>
  <p class="method-equation" data-math-display>\ell(g)=-\log p(y\mid g)=\log\!\left(1+e^{g}\right)-y\,g.</p>
  <figure class="method-figure">
    <div class="method-figure-box" id="methodologyMissPullChart"></div>
    <figcaption>How strongly one qualifying comparison pulls the estimate, against the size of the miss, at the fitted qualifying scale. For small misses the logistic error behaves like a bell curve. With a bell curve the pull grows without limit, whereas the logistic error levels off, so a miss of 3% of a lap pulls little more than a miss of 1.5%.</figcaption>
  </figure>

  <h4>How much each comparison counts</h4>
  <p>
    One weekend produces hundreds of comparisons, and they reuse the same laps, drivers and conditions, so they carry less independent information than their number suggests. Each pair of drivers therefore receives a fixed budget <span data-math>b</span>. A qualifying comparison has a budget of 1. Race pace and finishing order share a budget of 1.5 between them, in proportion to their coverage (a finishing order has full coverage, a race-pace comparison the fraction of sixteen matched laps it reaches, up to 1); a pair with both at full coverage gives each 0.75. A comparison between drivers of different teams then receives its budget divided by the number of drivers at the weekend, <span data-math>n</span>, minus one:
  </p>
  <p class="method-equation" data-math-display>w=\begin{cases}b & \text{teammates},\\[2pt] b/(n-1) & \text{different teams.}\end{cases}</p>
  <p>
    As a result, all of one driver's comparisons with other teams at a weekend together count about as much as one teammate comparison, while teammate pairs count in full because the car cancels from them. The weights make the model's likelihood a composite one: the weighted terms approximate the information in dependent observations without making them independent, and <a href="#" data-jump="method-limits">Section 10</a> returns to what this means for the uncertainty.
  </p>

  <h4>One model, two ways to solve it</h4>
  <p>
    Together, the starting beliefs, the steps, the gap equation, the two likelihoods and the weights define one probability model for every strength at every weekend. Two procedures compute it. The <b>chronological run</b> (<a href="#" data-jump="method-filter">Section 6</a>) moves forward one weekend at a time and, at each date, uses only the races already run; it produces the current ratings and every forecast. The <b>historical run</b> (<a href="#" data-jump="method-history">Section 7</a>) solves the same model for all weekends at once, so that every past rating also uses the races that came after it; it produces the past ratings shown on Ratings, History and Graph.
  </p>
</section>

<section id="method-filter" class="method-part">
  <h3>6. Running the model forward: one weekend at a time</h3>

  <h4>A belief is a best guess plus a covariance</h4>
  <p>
    At any moment the chronological run holds a Gaussian belief about the state: a vector of best guesses <span data-math>m</span> and a covariance matrix <span data-math>P</span>. The diagonal of <span data-math>P</span> holds each strength's variance, the square of its ±; the entries off the diagonal record how pairs of strengths are related. When a driver and a car have mostly been seen together, for example, a stronger driver and a stronger car explain the same results, so their estimates are negatively related. Each weekend then passes through three steps, the cycle of a Kalman filter <a class="cite" href="#" data-jump="ref-3">[3]</a> extended to results that are not Gaussian <a class="cite" href="#" data-jump="ref-2">[2]</a><a class="cite" href="#" data-jump="ref-5">[5]</a>.
  </p>

  <h4>Step 1, time passes: uncertainty grows</h4>
  <p>First, the time since the previous weekend is applied. The best guesses stay where they are, and the step variance of <a href="#" data-jump="method-model">Section 5</a> is added:</p>
  <p class="method-equation" data-math-display>m_{t\mid t-1}=m_{t-1},\qquad P_{t\mid t-1}=P_{t-1}+Q_t.</p>
  <p>
    Drivers and cars seen for the first time join the state with their starting beliefs. Filter textbooks call this the prediction step; here it is called the time update, to keep the word forecast for Step 2.
  </p>

  <h4>Step 2, forecast: every comparison is predicted and recorded before the weekend</h4>
  <p>Before any result of the weekend is used, every comparison of the weekend is forecast from the belief after Step 1. For a comparison with vector <span data-math>x</span>, the gap has mean and variance</p>
  <p class="method-equation" data-math-display>\bar g=x^{\mathsf T}m_{t\mid t-1},\qquad v=x^{\mathsf T}P_{t\mid t-1}\,x.</p>
  <p>
    These forecasts are recorded before the update, and <a href="#" data-jump="method-evidence">Section 9</a> scores them. Because nothing from a weekend enters its own forecast, and because later weekends never revise an earlier one, the recorded forecasts are predictions of races the model had not seen.
  </p>

  <h4>Step 3, update: the most probable strengths, and the new uncertainty</h4>
  <p>The update combines the belief after Step 1 with the weekend's comparisons. For the strengths that appear in the weekend's comparisons, it finds the values that minimise</p>
  <p class="method-equation" data-math-display>L(\theta)=\tfrac12(\theta-m)^{\mathsf T}P^{-1}(\theta-m)+\sum_i w_i\,\ell_i\!\left(x_i^{\mathsf T}\theta\right),</p>
  <p>
    where <span data-math>m</span> and <span data-math>P</span> are the belief after Step 1, <span data-math>\ell_i</span> is the negative log-probability of comparison <span data-math>i</span> from <a href="#" data-jump="method-model">Section 5</a> and <span data-math>w_i</span> its weight. The first term keeps the strengths near the previous belief, more firmly where that belief was sure; the second rewards strengths that explain the weekend. The minimum <span data-math>\hat\theta</span> is the most probable state given every result up to this weekend, the posterior mode <a class="cite" href="#" data-jump="ref-5">[5]</a>. It is found by Newton's method with a line search, and the build stops with an error, publishing nothing, if the search does not converge.
  </p>
  <p>The new uncertainty is read from the curvature of <span data-math>L</span> at its minimum:</p>
  <p class="method-equation" data-math-display>P_t=\Big[P^{-1}+\sum_i w_i\,h_i\,x_i x_i^{\mathsf T}\Big]^{-1},</p>
  <p>
    where <span data-math>h_i</span> is the curvature of <span data-math>\ell_i</span> at <span data-math>\hat\theta</span>. This is the Laplace approximation: the updated belief is again treated as Gaussian, centred on <span data-math>\hat\theta</span>. A comparison with a large weight and a sharply curved likelihood narrows the uncertainty most. A large miss on a time gap lies in the heavy tail of the logistic distribution, where the curvature is small, so it narrows the uncertainty little and moves the estimate a limited distance.
  </p>
  <figure class="method-figure method-interactive">
    <div id="methodologyBeliefUpdate"></div>
    <figcaption>One strength and one result. The dashed curve is the belief before the result: its peak is the best guess and its width the uncertainty. A more surprising result, or a less certain belief, moves the guess further, and every result narrows the curve. The model makes this update for all the strengths of a weekend at once.</figcaption>
  </figure>

  <h4>How a result reaches drivers and cars that did not race</h4>
  <p>
    The minimisation involves only the strengths that appear in the weekend's comparisons, written <span data-math>a</span>. Every other strength, written <span data-math>R</span>, then moves through its covariance with them, by Gaussian conditioning:
  </p>
  <p class="method-equation" data-math-display>m_R\leftarrow m_R+P_{Ra}P_{aa}^{-1}\left(\hat\theta_a-m_a\right),\qquad P_{RR}\leftarrow P_{RR}+P_{Ra}P_{aa}^{-1}\left(P_t-P_{aa}\right)P_{aa}^{-1}P_{aR}.</p>
  <p>
    Through this step the model holds the career network of <a href="#" data-jump="method-separation">Section 4</a>. Racing a car relates a driver's strength to that car's strength in <span data-math>P</span>, and sharing a car relates two teammates. When a former team or a former teammate produces a surprising result, the strengths related to it move too, in proportion to the relation. At the 2026 Las Vegas Grand Prix, for example, Esteban Ocon did not race, yet his overall strength moved by +0.57 points and that of the Sauber car, last raced in 2025, by −0.64 points, since both are related to drivers and cars that raced that weekend.
  </p>

  <h4>How qualifying moves overall strength</h4>
  <p>
    A qualifying comparison touches only qualifying strengths (<a href="#" data-jump="method-model">Section 5</a>), yet strong qualifying also raises a driver's overall strength. The link is the covariance between the three strengths of a driver, with correlation <span data-setting="driver_correlation"></span>, and of a car, <span data-setting="car_correlation"></span>. Through the first term of <span data-math>L</span>, and through the conditioning step above for a strength without comparisons of its own, a change in one strength carries over to the other two in proportion to their correlation. Early in a career, when race evidence is scarce, this carry-over shapes the overall rating. As finishing orders accumulate, overall strength rests increasingly on its own evidence and can differ from the pace ratings.
  </p>

  <h4>One weekend worked through, with real numbers</h4>
  <p>
    The 2026 Las Vegas Grand Prix shows the three steps at work for one team, Ferrari, with Lewis Hamilton and Charles Leclerc. The numbers are overall strengths from the chronological run, in the model's own coordinates, and the changes are computed before rounding. They therefore differ from the values on the Ratings and History pages, which use the displayed scale of <a href="#" data-jump="method-ratings">Section 3</a> and, for past weekends, the historical run.
  </p>
  <div class="table-wrap">
    <table class="params">
      <thead><tr><th scope="col" class="left">Overall strength</th><th scope="col">Before the weekend</th><th scope="col">After the weekend</th><th scope="col">Change</th></tr></thead>
      <tbody>
        <tr><th scope="row" class="left">Lewis Hamilton</th><td>1030.8</td><td>1031.8</td><td>+1.0</td></tr>
        <tr><th scope="row" class="left">Charles Leclerc</th><td>1046.4</td><td>1044.7</td><td>−1.7</td></tr>
        <tr><th scope="row" class="left">Ferrari car</th><td>1134.8</td><td>1124.8</td><td>−10.1</td></tr>
      </tbody>
    </table>
  </div>
  <p>
    Before the weekend, Leclerc led Hamilton by 15.5 points in overall strength. From that gap and its uncertainty, Step 2 gave Hamilton a 39% chance of finishing ahead if both finished, before the calibration of <a href="#" data-jump="method-forecast">Section 8</a>, and it expected Leclerc to be faster by 0.10% of a lap in qualifying and by 0.09% in race pace.
  </p>
  <p>
    The comparisons between the two were mixed. Leclerc was faster in Q2, by 0.06%, less than forecast; Hamilton was faster by 0.08% on matched race laps; and Hamilton finished seventh, ahead of Leclerc in tenth. The qualifying comparison counted 1, and race pace and finishing order 0.75 each. Because the results leaned towards Hamilton, the gap between them narrowed from 15.5 to 12.9 points.
  </p>
  <p>
    The car moved far more than either driver. Both Ferraris qualified outside the top ten, in 11th and 12th, and both finished behind cars rated well below Ferrari, including the two Alpines. Since the shortfall was shared by the two drivers, it was credited mostly to the car, whose larger uncertainty (about ±44 points, against ±14 for each driver) also let it move further. It is the attribution described in <a href="#" data-jump="method-separation">Section 4</a>, applied to one weekend.
  </p>
  <figure class="method-figure">
    <div class="method-figure-box" id="methodologyWeekendChart"></div>
    <figcaption>The 2026 Las Vegas Grand Prix for Ferrari in the chronological run. Each bar is the change in overall strength over the weekend, and the grey band around zero is the uncertainty before it (one standard deviation either way). The car moved further, and its band is three times as wide.</figcaption>
  </figure>

  <h4>What the model learns from, and what it is scored on</h4>
  <p>
    The model learns from the weighted comparisons of <a href="#" data-jump="method-model">Section 5</a>. Its forecasts, however, are scored on a separate fixed set of targets, so that a change to the rules for building comparisons cannot change the test. For finishing, the scoring set contains every pair of classified drivers, including pairs in which one or both retired, with the outcome read from the official classification. For timing, it contains qualifying and race-pace gaps measured from the same sessions and laps by simpler fixed rules. Every weekend counts equally in the score, whatever its number of pairs. The calibration of <a href="#" data-jump="method-forecast">Section 8</a> and the evaluation of <a href="#" data-jump="method-evidence">Section 9</a> use only these recorded forecasts.
  </p>

  <h4>The few settings, chosen on 2002–2007</h4>
  <p>
    Six numbers are chosen from data rather than fixed in advance: the correlation between a driver's three strengths, the same for a car, the two logistic scales of the time gaps, and two multipliers that set the size of the steps for drivers and cars (giving the 8, 6 and 30 points of <a href="#" data-jump="method-model">Section 5</a>). They were chosen once, by scoring the forecasts the chronological run made for 2002 to 2007, after a warm-up from 1994 to 2001, and they have been fixed since. Every evaluation in <a href="#" data-jump="method-evidence">Section 9</a> therefore starts in 2008. The starting uncertainties of 20 and 50 points are fixed in advance. All of these settings are treated as known, so their own uncertainty is not part of the ± of any rating.
  </p>
</section>

<section id="method-history" class="method-part">
  <h3>7. Running the model over the whole history</h3>

  <h4>Why later races improve earlier ratings</h4>
  <p>
    The chronological run rates each weekend with only the races before it. That is exactly right for a forecast, but it leaves information unused when describing the past. How strong a driver was in 2005 is also revealed by what their later teammates did, and how strong a car was at its first race is clearer after a season of results. The historical run therefore estimates every past rating from all the races, before and after it.
  </p>

  <h4>Same model, solved for all weekends at once</h4>
  <p>
    The historical run uses the starting beliefs, steps, gap equation, likelihoods and weights of <a href="#" data-jump="method-model">Section 5</a>. Instead of updating one weekend at a time, it finds the single most probable path of every strength through every weekend, given all the comparisons at once, by minimising
  </p>
  <p class="method-equation" data-math-display>\sum_{\text{newcomers}}\tfrac12\left(\theta_{0}-1000\right)^{\mathsf T}P_{0}^{-1}\left(\theta_{0}-1000\right)+\sum_t\tfrac12\left(\theta_t-\theta_{t-1}\right)^{\mathsf T}Q_t^{-1}\left(\theta_t-\theta_{t-1}\right)+\sum_t\sum_i w_i\,\ell_i\!\left(x_i^{\mathsf T}\theta_t\right).</p>
  <p>
    The first sum holds each newcomer near its starting belief, the second penalises steps between weekends according to their expected size, and the third is the evidence. A strength is represented only at the weekends where its driver or car appears, and the steps between two appearances are combined exactly, since a sum of Gaussian steps is Gaussian. The minimum is found by Newton's method on a sparse system. For a model with Gaussian observations, this path would coincide with the output of a Kalman smoother <a class="cite" href="#" data-jump="ref-4">[4]</a>; here it is the mode of the joint posterior, computed directly.
  </p>

  <h4>Starting in 1990 to give 1994 a running start</h4>
  <p>
    At the beginning of any history every rating rests on the starting beliefs, so the first weekends are the least informed. The historical run therefore starts four seasons early, in 1990, reading the results and race laps of 1990 to 1993; qualifying times do not exist for those years. The pages show ratings from 1994 only.
  </p>

  <h4>The latest weekend: where the two runs meet</h4>
  <p>
    No later race can inform the most recent weekend, so the pages show the chronological run's ratings for the latest weekend and the historical run's ratings for every weekend before it. The two runs agree closely near the end of the record and less further back. Measuring each driver against the leading field of the same run, the median difference between the two runs is a few points in the latest seasons and between about 6 and 16 points in the seasons from 1994 to 2022. Because the two estimates meet at the latest weekend, the last step of a line on the History page joins two runs, and it can show a small jump that no single race explains.
  </p>

  <h4>Which pages use which run</h4>
  <ul>
    <li><b>Chronological run:</b> the current ratings and their ±, every forecast on Head to head and Prediction, the scores in <a href="#" data-jump="method-evidence">Section 9</a>, the retirement risks and most model-based Insights findings.</li>
    <li><b>Historical run:</b> the past ratings on Ratings, History and Graph, what-if matchups at past dates and the four rating extremes on the Insights page.</li>
  </ul>

  <h4>Uncertainty of past ratings</h4>
  <p>
    The historical run computes uncertainty with the same Laplace approximation as Step 3 of <a href="#" data-jump="method-filter">Section 6</a>, but only for selected blocks of weekends, since the full covariance of every strength at every weekend would be too large to store. The ± shown next to a past rating is therefore a yearly average: the mean standard deviation of all drivers, or of all cars, at the first, middle and last weekends of that year. It describes how precise the ratings of that season are as a group; individual error bars are not published for past weekends. What-if matchups at past dates use the same averages and treat the drivers, cars and dates involved as independent, so their uncertainty is only rough.
  </p>

  <h4>Building the 1000 reference from the leading field</h4>
  <p>
    The model pins the general level of ratings only weakly, through the starting value of 1000 given to newcomers, so raw ratings from different eras sit at different levels. The pages therefore express every rating against a benchmark that follows the leading field. For each of the six ratings (three for drivers, three for cars) and each displayed weekend, let <span data-math>\mu_t</span> be the median raw rating of the 20 highest-rated drivers, or of the 10 highest-rated cars (all of them on a smaller grid). The benchmark follows these medians with a lag:
  </p>
  <p class="method-equation" data-math-display>B_0=\mu_0,\qquad B_t=(1-\alpha)\,B_{t-1}+\alpha\,\mu_{t-1},\qquad \alpha=1-2^{-1/20}.</p>
  <p>
    Each weekend the benchmark thus moves about 3.4% of the way toward the previous weekend's median, and the influence of any one weekend halves over 20 weekends. A raw rating <span data-math>r_t</span> is displayed as <span data-math>1000+r_t-B_t</span>. The field has a fixed size because grids have not: 28 drivers entered in 1994 and 22 in 2026, so backmarkers below the leading group do not move the benchmark. Equal displayed ratings in different decades therefore mean equal standing relative to the leading field of their own time.
  </p>

  <h4>The start of history: why 1994–95 is sensitive</h4>
  <p>
    At the start of the record the two runs can differ sharply. At the 1994 Brazilian Grand Prix, the first weekend the pages show, the chronological run still rates almost everyone near the starting value: it places Ayrton Senna 1.2 points ahead of Michael Schumacher, and its cars span 104 points. With all later races, the historical run places Schumacher 42 points ahead of Senna and spreads the cars over 355 points, from Williams down to Pacific. Both readings come from the same model. The historical one is better informed, but at the start of the record it also depends most on its assumptions, since the 1990–1993 warm-up has no qualifying and the starting beliefs carry more weight there than anywhere else. The ratings of 1994 and 1995 are consequently the least certain on the site, including the extreme ratings of those seasons shown on the Insights page.
  </p>
  <figure class="method-figure">
    <div class="method-figure-box" id="methodologyTwoRunsChart"></div>
    <figcaption>Michael Schumacher's overall strength above the leading field (the median of the 20 highest-rated drivers at each weekend, in the same run), after every weekend raced from 1994 to 2006. The chronological run starts close to the field and needs most of 1994 to place Schumacher far ahead, whereas the historical run, which uses every race, does so from the first weekend. Later in the career the two runs still differ by tens of points.</figcaption>
  </figure>
</section>

<section id="method-forecast" class="method-part">
  <h3>8. Predictions</h3>

  <h4>Head to head: from a rating gap to a probability</h4>
  <p>
    Head to head gives the chance that driver A, in their car, finishes ahead of driver B, in theirs, at the next race. It starts from the forecast of Step 2 in <a href="#" data-jump="method-filter">Section 6</a>: the overall gap <span data-math>\bar g</span>, driver plus car, and its variance <span data-math>v</span> from the full covariance, with one more week of change added (or the change up to a chosen date). When the two drivers share a car, the car cancels from both the gap and its variance.
  </p>

  <h4>Uncertainty and calibration</h4>
  <p>An uncertain gap deserves a less confident forecast than a known one, so the probability is pulled toward 50% according to <span data-math>v</span>, and a calibration slope <span data-math>s</span> sets how strongly a gap moves the odds:</p>
  <p class="method-equation" data-math-display>\Pr(A\text{ ahead}\mid\text{both finish})=\sigma\!\left(\frac{s\,\bar g}{\sqrt{1+\pi v/8}}\right).</p>
  <p>
    The square root is the standard approximation to averaging the logistic curve over a Gaussian gap. The slope is fitted to the recorded forecasts of earlier years only, by minimising their log loss, and refreshed once a year: forecasts for 2008 to 2011 use a slope fitted on 2002 to 2007, those for 2012 to 2015 a slope fitted on 2002 to 2011, and so on. The fitted slope has been above 1 in every period, between 1.17 and 1.37, which means that the model's raw probabilities were slightly too cautious and calibration sharpens them.
  </p>

  <h4>Retirements: driver incident risk and car failure risk</h4>
  <p>
    A forecast concerns the classified result, so it must allow for retirements. Each driver carries a per-lap incident risk <span data-math>q_D</span> and each car a per-lap mechanical risk <span data-math>q_C</span>, estimated from finishing statuses: every lap completed counts as a success and every retirement of the matching kind as a failure. Older records fade, with a half-life of 35 races for a car's mechanical record, which also keeps 95% of its weight over the winter, and 5 races for a driver's incident record. Both are pulled toward the field's rate by a prior worth 100 laps for cars and 2,000 laps for drivers, so a single crash changes a driver's risk only a little. An entry's risk per lap is <span data-math>1-(1-q_D)(1-q_C)</span>.
  </p>
  <p>
    Over a race of <span data-math>L</span> laps (60 unless another distance is chosen), the forecast combines the two entries' chances of lasting with the probability above: if both finish, that probability decides; if only one finishes, it is ahead; if both retire, the one who lasted longer is ahead, and a retirement on the same lap splits evenly.
  </p>

  <h4>Using the starting grid</h4>
  <p>Once the starting grid is known, a second forecast adds it. Its log odds are</p>
  <p class="method-equation" data-math-display>a\,\frac{\bar g}{\sqrt{1+\pi v/8}}+b\,\frac{G_B-G_A}{10},</p>
  <p>
    where <span data-math>G_A</span> and <span data-math>G_B</span> are the starting positions. The coefficients <span data-math>a</span> and <span data-math>b</span> are fitted on earlier races only, with a penalty that pulls them toward the forecast without the grid, and the strength of that penalty is itself chosen on earlier seasons. Missing positions and pit-lane starts are never read as pole position: with either position missing, the forecast without the grid applies unchanged. The grid changes the forecast only and never enters the ratings.
  </p>

  <h4>Timing forecasts: qualifying and race-pace gaps</h4>
  <p>
    The two pace ratings forecast the size of a gap as well as its sign. The forecast gap and its spread come from the same Gaussian belief, with a slope and an extra noise term fitted on earlier years as for overall strength, and the spread follows a logistic distribution. Each timing forecast carries a 90% interval for the gap.
  </p>

  <h4>What-if matchups across cars and dates</h4>
  <p>
    Head to head can also pair any driver with any car, at any two dates, or put both drivers in the same car. Matchups at past dates use the historical run's ratings with the yearly-average uncertainty of <a href="#" data-jump="method-history">Section 7</a> and treat the drivers, cars and dates as independent, and every matchup uses the current calibration. They are thought experiments: none of them is a forecast that could have been made at the time.
  </p>

  <h4>The prediction grid: expected finishing positions</h4>
  <p>The Prediction page compares each driver of the latest field, in their own car, with every other entrant, using the head-to-head probability with retirements. A driver's expected finishing position is one plus the expected number of opponents who finish ahead:</p>
  <p class="method-equation" data-math-display>\mathbb{E}[\text{position}_A]=1+\sum_{B\neq A}\Pr(B\text{ ahead of }A).</p>
  <p>Sorting these expectations gives the displayed order, which is neither the most likely complete finishing order nor a probability of winning.</p>

  <h4>What the predictions leave out: circuit, weather, line-up changes</h4>
  <p>
    The forecasts have no circuit-specific or weather term, so a forecast for Monaco in the rain uses the same ratings as one for Monza in the dry; choosing a circuit sets only the race distance, from its most recent race. The latest field is assumed to start the next race, so withdrawals and substitutions are not forecast.
  </p>
</section>

<section id="method-evidence" class="method-part">
  <h3>9. Evidence</h3>

  <h4>The replay: every weekend forecast before it is used, on fixed scoring targets</h4>
  <p>
    The model is judged on races it had not seen <a class="cite" href="#" data-jump="ref-8">[8]</a>. The chronological run replays the whole history in date order, and every weekend is forecast before it updates the ratings (<a href="#" data-jump="method-filter">Section 6</a>). The replay warms up from 1994 to 2001, the settings were chosen on the forecasts of 2002 to 2007, and the years from 2008 to 2025 are scored in four periods, each with a calibration fitted only on earlier years. The targets are the fixed set described in Section 6, and every scored weekend carries the same total weight. The 2026 season is scored as it happens, with calibration from earlier years only.
  </p>

  <h4>How forecasts are scored</h4>
  <p>
    The main score is the <b>log loss</b> of the race forecasts: the average, over every pair of drivers, of <span data-math>-\ln p</span>, where <span data-math>p</span> is the probability the forecast gave to what actually happened, retirements included. A forecast of 80% for A costs <span data-math>-\ln 0.8=0.223</span> if A finishes ahead and <span data-math>-\ln 0.2=1.609</span> if not. A forecaster scores best on average by stating the probabilities it actually holds, which makes log loss a proper scoring rule <a class="cite" href="#" data-jump="ref-7">[7]</a>. Calling every pair 50/50 scores <span data-math>\ln 2=0.693</span>, and a perfect forecaster scores 0. Two further scores are reported: <b>accuracy</b>, the share of pairs in which the favourite finished ahead, and the <b>Brier score</b>, the mean squared error of the probabilities, for which 50/50 scores 0.25 <a class="cite" href="#" data-jump="ref-6">[6]</a>.
  </p>

  <h4>Race forecasts by period and season</h4>
  <p>The table and the figure are computed in the browser from the forecasts stored in the published model.</p>
  <div class="table-wrap">
    <table class="params">
      <thead><tr><th scope="col" class="left">Period</th><th scope="col">Weekends</th><th scope="col">Log loss</th><th scope="col">Accuracy</th><th scope="col">Brier score</th></tr></thead>
      <tbody id="methodologyBlocks"></tbody>
    </table>
  </div>
  <p id="methodologyValidationSummary"></p>
  <figure class="method-figure">
    <div class="method-figure-box" id="methodologySeasonChart"></div>
    <figcaption>The log loss of the race forecasts in every season, each weekend forecast before it was used, against a coin flip.</figcaption>
  </figure>

  <h4>Calibration: do the probabilities mean what they say?</h4>
  <p>
    A forecast is calibrated if, among all pairs given about 70%, the favourite finishes ahead about 70% of the time. Refitting the slope of the calibrated forecasts within each scored period gives 1.00 for 2008 to 2011, 0.90 for 2012 to 2015, 0.95 for 2016 to 2020 and 1.00 for 2021 to 2025, where 1 means the stated probabilities matched how often things happened and values below 1 mean they were somewhat overconfident. Over the first 19 weekends of 2026 the slope was 0.86.
  </p>
  <figure class="method-figure">
    <div class="method-figure-box" id="methodologyReliabilityChart"></div>
    <figcaption>The race forecasts of 2008 to 2025, grouped by the chance they gave the first driver of a pair. Each dot is the average forecast of a group against how often that driver finished ahead; dots on the dashed line would be perfectly calibrated. Hover or tap a dot for its numbers.</figcaption>
  </figure>

  <h4>Timing forecasts: error and interval coverage</h4>
  <p>The two pace ratings forecast the size of each gap. The table gives the average error, in percent of lap time, and how often the outcome fell inside the forecast's 90% interval.</p>
  <div class="table-wrap">
    <table class="params">
      <thead><tr><th scope="col" class="left">Period</th><th scope="col">Qualifying error</th><th scope="col">Inside 90%</th><th scope="col">Race-pace error</th><th scope="col">Inside 90%</th></tr></thead>
      <tbody>
        <tr><th scope="row" class="left">2008–2011</th><td>0.71%</td><td>95.2%</td><td>0.74%</td><td>91.8%</td></tr>
        <tr><th scope="row" class="left">2012–2015</th><td>0.74%</td><td>92.7%</td><td>0.60%</td><td>96.0%</td></tr>
        <tr><th scope="row" class="left">2016–2020</th><td>0.66%</td><td>94.2%</td><td>0.57%</td><td>95.3%</td></tr>
        <tr><th scope="row" class="left">2021–2025</th><td>0.54%</td><td>95.2%</td><td>0.52%</td><td>95.5%</td></tr>
      </tbody>
    </table>
  </div>
  <p>In every period and for both ratings the intervals held the outcome more than 90% of the time, so they are slightly wide. The average error has fallen from one period to the next.</p>

  <h4>Testing the split: drivers who change team</h4>
  <p>
    A model can forecast packages well and still divide them wrongly between driver and car, so forecast scores alone do not test the split. On real data, the most direct test uses drivers who change team. For 51 moves, the strengths of the moving driver and of their new teammate were frozen before the mover's last weekend at the old team. The frozen gap then forecast the 1,882 comparisons between the two over their first five and ten weekends together: who was quicker in qualifying, who was quicker in race pace and who finished ahead. Nothing the mover did in the new car entered these forecasts, and their calibration comes from earlier frozen comparisons of drivers who stayed with their teams.
  </p>
  <p>
    The pooled log loss is 0.679, below the 0.693 of a coin flip. By kind of comparison it is 0.676 for qualifying and 0.667 for race pace, while for finishing order, at 0.698, it is slightly worse than a coin flip. Frozen driver ratings thus carry real but modest information about a new teammate battle, and with 51 moves the test is small.
  </p>

  <h4>Testing the split: simulated seasons with a known answer</h4>
  <p>
    On real data the true split is never observed, so the model was also run on simulated seasons in which it is known. Each simulated world has 12 drivers in 6 cars over 100 weekends, with three correlated strengths per driver and car that change over time and noisy observations of all three kinds. Two events test attribution directly: two drivers swap teams at weekend 60, and one car suddenly becomes about 33 points faster at weekend 70. Four worlds vary the difficulty: in the first, the three strengths of each driver and car are strongly related; in the second, drivers specialise, with weakly related strengths; in the third, some drivers suit some cars, through a lasting driver–car fit of about 15 points that the model does not contain; the fourth has heavy noise. Each world was run with three random seeds, using the research implementation of the same model.
  </p>
  <div class="table-wrap">
    <table class="params">
      <thead><tr><th scope="col" class="left">World</th><th scope="col">Driver error</th><th scope="col">Car error</th><th scope="col">Teammate gap inside 90% band</th></tr></thead>
      <tbody>
        <tr><th scope="row" class="left">Related strengths</th><td>11.8</td><td>14.8</td><td>99.7%</td></tr>
        <tr><th scope="row" class="left">Specialised drivers</th><td>11.0</td><td>12.3</td><td>94.8%</td></tr>
        <tr><th scope="row" class="left">Lasting driver–car fit</th><td>14.3</td><td>19.6</td><td>78.7%</td></tr>
        <tr><th scope="row" class="left">Heavy noise</th><td>11.5</td><td>14.7</td><td>98.2%</td></tr>
      </tbody>
    </table>
  </div>
  <p>
    The errors are root-mean-square differences, in points, between estimated and true overall strengths from weekend 25 onward. In every world the sudden gain of the car was credited to the car: within five weekends its rating rose by 12 to 16 points on average, and its drivers' by less than 1 point. The bands held the true teammate gap in about 95% of cases or more, except where drivers suit particular cars; there they held it only 79% of the time, because the model has no term for a lasting driver–car fit. Apart from the departures built into them, these worlds follow the model's own assumptions, so they show what it can recover under known conditions; they are not a measurement of the real split.
  </p>

  <h4>Does the history refit describe the past better?</h4>
  <p>
    The historical run cannot be tested by forecasting, because it uses later races. It can, however, be tested on races withheld from it. For 31 complete weekends from 2012 onward, each weekend was removed from the fit and then predicted from the strengths around it. The historical run predicted them better than the chronological run on all three kinds of comparison, measured by the average negative log-likelihood (lower is better): 2.489 against 2.531 for qualifying, 2.219 against 2.270 for race pace and 0.511 against 0.530 for finishing order. The historical run therefore describes the past more accurately. The comparison is not a forecast test, since the historical run also sees the races after each withheld weekend.
  </p>

  <h4>Stability and checks on the code</h4>
  <p>
    In the evaluation, the median change in a driver's overall rating, relative to the field, between consecutive appearances was 1.3 points, and 90% of the changes were below 3.6 points. Automated tests check the code whenever the site is rebuilt: the published files equal a fresh fit from the data at every weekend; the inference matches reference calculations, and the car's covariance cancels exactly between teammates; swapping the two drivers of a forecast gives complementary probabilities; and the forecasts computed in the browser match the model's own calculation.
  </p>
</section>

<section id="method-limits" class="method-part">
  <h3>10. Limitations, settings and references</h3>
  <p>
    The ratings are model-based estimates of competitiveness in the races observed. They do not measure innate talent, and they do not estimate the causal effect of placing a driver in a car. The qualifications of the preceding sections are collected here, followed by the settings and the sources.
  </p>

  <h4>The driver–car split</h4>
  <ul>
    <li>The split assumes that teammates have the same car. Real teammates can receive different upgrades, strategies or treatment, and team orders can decide a comparison.</li>
    <li>The model has no term for a driver's lasting advantage in one particular car. In simulated seasons with such an advantage, the bands for teammate gaps held the true gap only 79% of the time (<a href="#" data-jump="method-evidence">Section 9</a>).</li>
    <li>A model can forecast packages well while dividing them wrongly. The test on drivers who change team is small (51 moves), scores only slightly better than a coin flip, and on finishing order alone scores slightly worse.</li>
    <li>The split also depends on the starting uncertainties of 20 and 50 points and on the size of the steps, which were fixed in advance or chosen by forecast scores rather than by the split itself. Where teammate links are sparse, a strong driver is hard to tell from a strong car.</li>
  </ul>

  <h4>The evidence</h4>
  <ul>
    <li>Matching lap numbers does not guarantee matching conditions: traffic, tyres, fuel, weather and strategy still affect the laps kept, and cars on the same numbered lap can run at different times. Race pace is not independent of starting position.</li>
    <li>Finishing order learns only from drivers who finish. Retirements inform the risk records, which do not assign the fault of a collision.</li>
    <li>The comparisons of a weekend are dependent. The weights limit repeated evidence without making the observations independent, and the uncertainty is conditional on those weights.</li>
    <li>Qualifying times are missing before 1994 and for 16 races of 1996 and 1997, and from 2006 to 2009 the comparisons use Q2 or Q1. Sprint races and weather are not used.</li>
  </ul>

  <h4>Uncertainty</h4>
  <ul>
    <li>The ± is approximate: a Laplace approximation to a weighted likelihood, conditional on the shared-car assumption and on fixed settings whose own uncertainty is not included.</li>
    <li>The ± of past ratings is a yearly average over all drivers or all cars. What-if matchups at past dates treat drivers, cars and dates as independent, so their uncertainty is rough.</li>
    <li>Early historical ratings depend strongly on the starting beliefs and on the 1990–1993 warm-up, and their bands do not include that sensitivity (<a href="#" data-jump="method-history">Section 7</a>).</li>
    <li>The bands omit any uncertainty in the display benchmark. Displayed ratings from different dates include the movement of the benchmark, so their difference is not the gap a what-if matchup uses.</li>
    <li>Equal ratings in different decades do not establish equal absolute ability across different regulations, machinery and competitors.</li>
  </ul>

  <h4>Forecasts</h4>
  <ul>
    <li>Calibration slopes below 1 mean that the probabilities ran somewhat overconfident: 0.90 in 2012 to 2015, and 0.86 over the first 19 weekends of 2026.</li>
    <li>Retirement risks assume a constant chance per lap, which shared conditions or changing failure rates can violate. Pairwise chances alone do not give the probability of a complete finishing order or of a win.</li>
    <li>The grid forecast measures an association, scored with the final starting positions; it is not the effect of moving a car on the grid. It improves the forecasts of pairs who both finish and slightly worsens those of pairs with a retirement.</li>
    <li>What-if matchups are thought experiments with the current calibration. Entrants are treated as known before the weekend, so withdrawals and substitutions are not forecast.</li>
  </ul>

  <h4>Evaluation</h4>
  <ul>
    <li>All historical periods informed the development of the model, so the scores are retrospective evidence rather than an untouched holdout. The 2026 season is scored separately as it happens.</li>
    <li>Comparisons within a race share evidence, and the reported results do not account for every choice made in building the model.</li>
    <li>The holdout test of the historical run uses later races, so it tests a description of the past and not a forecast.</li>
  </ul>

  <h4>Settings</h4>
  <p>The settings below are fixed for the published model. The values marked live are read from the loaded model.</p>
  <div class="table-wrap">
    <table class="params">
      <thead><tr><th scope="col" class="left">Setting</th><th scope="col" class="left">Value</th></tr></thead>
      <tbody>
        <tr class="group"><th colspan="2" scope="colgroup">Strengths</th></tr>
        <tr><th scope="row" class="left">Starting uncertainty of a driver</th><td class="left">20 points</td></tr>
        <tr><th scope="row" class="left">Starting uncertainty of a car</th><td class="left">50 points</td></tr>
        <tr><th scope="row" class="left">Change of a driver</th><td class="left">8 points per square-root year</td></tr>
        <tr><th scope="row" class="left">Change of a car</th><td class="left">6 points per weekend raced, and 30 points across the winter</td></tr>
        <tr><th scope="row" class="left">Correlation of a driver's three strengths (live)</th><td class="left"><span data-setting="driver_correlation"></span></td></tr>
        <tr><th scope="row" class="left">Correlation of a car's three strengths (live)</th><td class="left"><span data-setting="car_correlation"></span></td></tr>
        <tr><th scope="row" class="left">Logistic scale of time gaps (live)</th><td class="left"><span data-setting="noise"></span></td></tr>
        <tr><th scope="row" class="left">Timing unit</th><td class="left">0.003 of a lap</td></tr>
        <tr><th scope="row" class="left">Points per internal unit</th><td class="left">75 / ln 10 (75 points are 10-to-1 odds in overall strength)</td></tr>
        <tr class="group"><th colspan="2" scope="colgroup">Comparisons</th></tr>
        <tr><th scope="row" class="left">Qualifying budget</th><td class="left">1</td></tr>
        <tr><th scope="row" class="left">Race pace and finishing order</th><td class="left">1.5 together, shared by coverage</td></tr>
        <tr><th scope="row" class="left">Divisor for different teams</th><td class="left">number of drivers minus one</td></tr>
        <tr><th scope="row" class="left">Slow-lap cutoff</th><td class="left">105% of the driver's fastest remaining lap</td></tr>
        <tr><th scope="row" class="left">Race-pace windows</th><td class="left">8 laps; at least 4 matched laps; full coverage at 16</td></tr>
        <tr class="group"><th colspan="2" scope="colgroup">Display and forecasts</th></tr>
        <tr><th scope="row" class="left">Display benchmark half-life</th><td class="left">20 weekends</td></tr>
        <tr><th scope="row" class="left">Display benchmark field</th><td class="left">median of the 20 highest-rated drivers; of the 10 highest-rated cars</td></tr>
        <tr><th scope="row" class="left">Mechanical risk</th><td class="left">35-race half-life, 100-lap prior, 95% kept over the winter</td></tr>
        <tr><th scope="row" class="left">Incident risk</th><td class="left">5-race half-life, 2,000-lap prior</td></tr>
        <tr><th scope="row" class="left">Forecast race distance</th><td class="left">60 laps unless another is chosen</td></tr>
      </tbody>
    </table>
  </div>

  <h4>Reproducing the calculation</h4>
  <p id="methodologyPublication"></p>
  <p>
    In the <a href="https://github.com/francescobraicovich/car-or-driver" rel="noopener noreferrer">repository</a>, <code>packages/core/node/unified-evidence.mjs</code> builds the comparisons and their weights, and <code>packages/core/python/unified_model.py</code> holds the state-space model and its forward run. <code>build_unified.py</code> runs the weekend cycle, and <code>unified_calibration.py</code> and <code>unified_grid.py</code> fit the calibration and the grid forecast. <code>research/retrospective-refit/retrospective_refit.py</code> fits the historical run, and <code>packages/core/src/hazard.js</code> keeps the retirement risks. In the browser, <code>packages/core/src/unified/</code> computes the forecasts and <code>site/js/rating-reference.js</code> applies the display reference. The site reads the saved model and fits nothing itself.
  </p>

  <h4>References</h4>
  <p>Numbers in square brackets in the text refer to this list. Each entry with a DOI links to the publisher's record of the work.</p>
  <p><b>Methods behind the ratings and the forecasts</b></p>
  <ol class="references" start="1">
    <li id="ref-1">Bradley, R. A., &amp; Terry, M. E. (1952). Rank analysis of incomplete block designs: I. The method of paired comparisons. <i>Biometrika</i>, 39(3/4), 324–345. <a href="https://doi.org/10.2307/2334029" rel="noopener noreferrer">https://doi.org/10.2307/2334029</a></li>
    <li id="ref-2">Glickman, M. E. (1999). Parameter estimation in large dynamic paired comparison experiments. <i>Journal of the Royal Statistical Society: Series C (Applied Statistics)</i>, 48(3), 377–394. <a href="https://doi.org/10.1111/1467-9876.00159" rel="noopener noreferrer">https://doi.org/10.1111/1467-9876.00159</a></li>
    <li id="ref-3">Kalman, R. E. (1960). A new approach to linear filtering and prediction problems. <i>Journal of Basic Engineering</i>, 82(1), 35–45. <a href="https://doi.org/10.1115/1.3662552" rel="noopener noreferrer">https://doi.org/10.1115/1.3662552</a></li>
    <li id="ref-4">Durbin, J., &amp; Koopman, S. J. (2012). <i>Time Series Analysis by State Space Methods</i> (2nd ed.). Oxford University Press. <a href="https://doi.org/10.1093/acprof:oso/9780199641178.001.0001" rel="noopener noreferrer">https://doi.org/10.1093/acprof:oso/9780199641178.001.0001</a></li>
    <li id="ref-5">Fahrmeir, L. (1992). Posterior mode estimation by extended Kalman filtering for multivariate dynamic generalized linear models. <i>Journal of the American Statistical Association</i>, 87(418), 501–509. <a href="https://doi.org/10.1080/01621459.1992.10475232" rel="noopener noreferrer">https://doi.org/10.1080/01621459.1992.10475232</a></li>
    <li id="ref-6">Brier, G. W. (1950). Verification of forecasts expressed in terms of probability. <i>Monthly Weather Review</i>, 78(1), 1–3. <a href="https://doi.org/10.1175/1520-0493(1950)078&lt;0001:VOFEIT&gt;2.0.CO;2" rel="noopener noreferrer">https://doi.org/10.1175/1520-0493(1950)078&lt;0001:VOFEIT&gt;2.0.CO;2</a></li>
    <li id="ref-7">Gneiting, T., &amp; Raftery, A. E. (2007). Strictly proper scoring rules, prediction, and estimation. <i>Journal of the American Statistical Association</i>, 102(477), 359–378. <a href="https://doi.org/10.1198/016214506000001437" rel="noopener noreferrer">https://doi.org/10.1198/016214506000001437</a></li>
    <li id="ref-8">Tashman, L. J. (2000). Out-of-sample tests of forecasting accuracy: an analysis and review. <i>International Journal of Forecasting</i>, 16(4), 437–450. <a href="https://doi.org/10.1016/S0169-2070(00)00065-0" rel="noopener noreferrer">https://doi.org/10.1016/S0169-2070(00)00065-0</a></li>
  </ol>
  <p><b>Methods used in the Insights findings</b></p>
  <ol class="references" start="9">
    <li id="ref-9">Cox, D. R. (1958). The regression analysis of binary sequences. <i>Journal of the Royal Statistical Society: Series B (Methodological)</i>, 20(2), 215–232. <a href="https://doi.org/10.1111/j.2517-6161.1958.tb00292.x" rel="noopener noreferrer">https://doi.org/10.1111/j.2517-6161.1958.tb00292.x</a></li>
    <li id="ref-10">Plackett, R. L. (1975). The analysis of permutations. <i>Journal of the Royal Statistical Society: Series C (Applied Statistics)</i>, 24(2), 193–202. <a href="https://doi.org/10.2307/2346567" rel="noopener noreferrer">https://doi.org/10.2307/2346567</a></li>
    <li id="ref-11">Shapley, L. S. (1953). A value for <i>n</i>-person games. In H. W. Kuhn &amp; A. W. Tucker (Eds.), <i>Contributions to the Theory of Games, Volume II</i> (pp. 307–317). Princeton University Press.</li>
    <li id="ref-12">Lipovetsky, S., &amp; Conklin, M. (2001). Analysis of regression in game theory approach. <i>Applied Stochastic Models in Business and Industry</i>, 17(4), 319–330. <a href="https://doi.org/10.1002/asmb.446" rel="noopener noreferrer">https://doi.org/10.1002/asmb.446</a></li>
    <li id="ref-13">McFadden, D. (1974). Conditional logit analysis of qualitative choice behavior. In P. Zarembka (Ed.), <i>Frontiers in Econometrics</i> (pp. 105–142). Academic Press.</li>
    <li id="ref-14">Shrout, P. E., &amp; Fleiss, J. L. (1979). Intraclass correlations: uses in assessing rater reliability. <i>Psychological Bulletin</i>, 86(2), 420–428. <a href="https://doi.org/10.1037/0033-2909.86.2.420" rel="noopener noreferrer">https://doi.org/10.1037/0033-2909.86.2.420</a></li>
    <li id="ref-15">Efron, B. (1979). Bootstrap methods: another look at the jackknife. <i>The Annals of Statistics</i>, 7(1), 1–26. <a href="https://doi.org/10.1214/aos/1176344552" rel="noopener noreferrer">https://doi.org/10.1214/aos/1176344552</a></li>
    <li id="ref-16">Spearman, C. (1904). The proof and measurement of association between two things. <i>The American Journal of Psychology</i>, 15(1), 72–101. <a href="https://doi.org/10.2307/1412159" rel="noopener noreferrer">https://doi.org/10.2307/1412159</a></li>
  </ol>
  <p><b>Data</b></p>
  <ol class="references" start="17">
    <li id="ref-17">TracingInsights. <i>RaceData</i>: Formula 1 data tables (CC0 1.0, as stated by the project). Retrieved November 2026. <a href="https://github.com/TracingInsights/RaceData" rel="noopener noreferrer">github.com/TracingInsights/RaceData</a></li>
    <li id="ref-18">Jolpica-F1. <i>Jolpica-F1: free and open-source Formula 1 API</i> (data under CC BY-NC-SA 4.0). Retrieved October 2026. <a href="https://github.com/jolpica/jolpica-f1" rel="noopener noreferrer">github.com/jolpica/jolpica-f1</a></li>
    <li id="ref-19">Trotman, J. <i>Formula 1 Race Data</i> and <i>Formula 1 Race Events</i> (Kaggle datasets listed as a source by RaceData). Retrieved October 2026. <a href="https://www.kaggle.com/datasets/jtrotman/formula-1-race-data" rel="noopener noreferrer">kaggle.com/datasets/jtrotman/formula-1-race-data</a></li>
  </ol>
</section>
`;

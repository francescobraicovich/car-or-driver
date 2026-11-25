// The text of the full methodology, as HTML. Formulas are LaTeX in elements with `data-math` (inline) or `data-math-display` (display), typeset by
// KaTeX in methodology-view.js. Elements with `data-setting` are filled from the settings of the loaded model, and elements with an id are the
// figures and live tables that methodology-view.js draws. The narrative parts state what the model does and what the tests found; every
// qualification of those statements belongs in the Limitations part (method-limits). Settings and References follow it as an appendix.
//
// Keep this explanation in step with packages/core/node/unified-evidence.mjs, packages/core/python/unified_model.py, unified_calibration.py,
// unified_grid.py, packages/core/src/unified/ and site/js/rating-reference.js.
export const CONTENT_HTML = String.raw`
<section id="method-questions" class="method-part">
  <h3>1. The question</h3>
  <p>
    Every Formula 1 result is produced by a driver in a car. A win shows that the pairing was the fastest on the day and leaves open how the credit divides between the driver and the machine. This site divides it. After every Grand Prix weekend since 1994 it gives each driver and each car ratings of their own, in the same units and with an uncertainty attached, and it uses those ratings to forecast who will finish ahead of whom.
  </p>
  <p>A driver is never observed without a car, and a car never without a driver, so the split has to be inferred. The sport itself supplies the evidence.</p>
  <ul>
    <li><b>Teammates share a car.</b> When two drivers in the same car finish apart, the car is common to both, and the gap between them measures the drivers.</li>
    <li><b>Drivers change teams.</b> A driver takes their skill into the new car. Each move links the old teammate to the new one, and over three decades these links join drivers from different teams and different eras into one network of comparisons.</li>
    <li><b>Qualifying is a clean measurement.</b> A single flying lap, with no traffic or pit stops, shows the speed of a driver and car with far less noise than a race.</li>
    <li><b>Cars change faster than drivers.</b> Teams rebuild their cars every winter and develop them through the season, while a driver's skill moves slowly. When a whole team's results jump at once, the car is the likely source.</li>
  </ul>
  <p>Each driver and each car carries three ratings, because a race weekend measures three different things.</p>
  <table><thead><tr><th>Rating</th><th>What it measures</th><th>Evidence that teaches it</th></tr></thead><tbody>
    <tr><td><b>Qualifying pace</b></td><td>Speed over one representative qualifying lap.</td><td>Time differences in the same qualifying session.</td></tr>
    <tr><td><b>Race pace</b></td><td>Speed sustained over comparable race laps.</td><td>Time differences on matching race laps.</td></tr>
    <tr><td><b>Overall strength</b></td><td>Competitiveness in the race, judged before the weekend begins.</td><td>Who finished ahead of whom.</td></tr>
  </tbody></table>
  <p>Overall strength is the headline rating. It orders the Ratings page and drives the race forecasts. The two timing ratings measure speed directly and help it learn.</p>
  <p>The method builds the ratings in stages.</p>
  <ol>
    <li><b>Comparisons.</b> Every session becomes a set of head-to-head results between pairs of drivers, each weighted by how much it reveals (<a href="#" data-jump="method-evidence">Part 2</a>).</li>
    <li><b>Strengths.</b> Each driver and each car has hidden strengths; the gap between two entrants, driver plus car, sets the odds that one finishes ahead (<a href="#" data-jump="method-odds">Parts 3 to 5</a>).</li>
    <li><b>Tracking.</b> The strengths are followed weekend by weekend. A weekend's results move them in proportion to how surprising the results were and how uncertain the strengths were beforehand (<a href="#" data-jump="method-time">Parts 6 to 8</a>).</li>
    <li><b>Testing.</b> Before a weekend updates the ratings, the ratings forecast it. Scoring those forecasts against what happened is how the model was tested and how its settings were chosen (<a href="#" data-jump="method-forecast">Parts 9</a> and <a href="#" data-jump="method-validation">10</a>).</li>
  </ol>
  <p>
    The twenty findings on the <a href="#/insights">Insights page</a> come from these same ratings, or from the raw results where no rating is needed, and each carries its own note on how it was computed.
  </p>
</section>

<section id="method-evidence" class="method-part">
  <h3>2. From results to comparisons</h3>

  <h4>The data</h4>
  <p>
    The model reads qualifying times, race lap times, finishing positions and finishing statuses from the open collection TracingInsights/RaceData <a class="cite" href="#" data-jump="ref-17">[17]</a>, which draws on Jolpica-F1 <a class="cite" href="#" data-jump="ref-18">[18]</a> and two Kaggle datasets <a class="cite" href="#" data-jump="ref-19">[19]</a>. The site shows ratings from 1994; the historical fit (<a href="#" data-jump="method-scale">Part 8</a>) also reads 1990 to 1993 to give those first ratings a running start. The weekends are read in date order, and every rating is computed once, when the site is published.
  </p>

  <h4>A result as a set of contests</h4>
  <p>
    A finishing order of 20 drivers contains 190 head-to-head results: the winner beat each of the other 19, second place beat the 18 behind, and so on down the order. The model works with these pairs. Each comparison sets two entrants of the same weekend against each other, and a timing comparison keeps the size of the advantage: beating a rival by a tenth of a second is different evidence from beating them by a second.
  </p>

  <h4>The comparisons</h4>
  <p>
    <b>Qualifying.</b> Two drivers are compared in the latest session in which both set a usable time: Q3, else Q2, else Q1. To put circuits of different lengths on one scale, the time difference is divided by the average of the two times. If A takes 90.0 seconds and B takes 90.3, A's advantage is about 0.33%.
  </p>
  <p>
    <b>Race pace.</b> Two drivers are compared lap by lap, on laps with the same number. The first lap and unusually slow laps (pit stops, safety cars) are removed, and the remaining differences are summarised with medians, so that a single odd lap cannot dominate. A long overlap counts for more than a short one.
  </p>
  <p>
    <b>Finishing order.</b> Two drivers who both completed the race, lapped or not, make a pair, and the one classified ahead wins it. This comparison teaches overall strength. A retirement teaches something else: it updates the risk record of the driver or the car (<a href="#" data-jump="method-forecast">Part 9</a>), and the laps the retiree completed still count for race pace.
  </p>

  <h4>The weight of a comparison</h4>
  <p>
    One race produces many comparisons, and they reuse the same laps, drivers and conditions, so they carry less independent information than their number suggests. Each pair therefore has a fixed budget. A teammate qualifying comparison counts 1. A teammate's race pace and finishing order share at most 1.5 between them, in proportion to how many laps the pace comparison covers. A comparison between drivers of different teams receives the same budgets divided by the number of entrants minus one, so that, for each driver, all their cross-team comparisons of a weekend together count about as much as one teammate comparison. Teammate pairs count in full because the car cancels from them (<a href="#" data-jump="method-separation">Part 4</a>).
  </p>

  <details><summary>Qualifying selection and timing units</summary>
    <p>Try Q3, then Q2, then Q1, and use the latest phase in which both drivers have a valid time. From 2006 to 2009 Q3 is skipped, because cars ran it with race fuel on board. Documented interrupted Q1 attempts and severe isolated Q1 outliers are excluded. In Q2 and Q3, when at least eight times are recorded, a time more than 10% above the phase median is excluded and the earlier phases stay available.</p>
    <p>The Q1 outlier rule needs at least ten recorded times, no later timed phase for that driver, and a lap slower than both the field median and every timed teammate by more than 5% in a multi-phase session, or 10% in a single-phase session. Missing evidence is never turned into a loss.</p>
    <p>For times <span data-math>t_A</span> and <span data-math>t_B</span>, A's fractional advantage is <span data-math>\frac{2(t_B-t_A)}{t_A+t_B}</span>. A positive value means A is faster, and equal times give zero. The model divides this fraction by <span data-math>0.003</span> to obtain its internal timing units.</p>
  </details>
  <details><summary>Race-lap selection and aggregation</summary>
    <p>A pair must first share race windows in which both drivers ran, and a driver whose early mechanical failure visibly slowed their laps is left out. For each driver, remove lap 1, invalid durations and laps slower than 105% of their fastest remaining lap. Match exact lap numbers and require at least four matches.</p>
    <p>Compute the fractional advantage on each matched lap, take its median within fixed eight-lap windows starting with laps 2 to 9, and then take the median of those window medians. Coverage is the number of matched laps divided by 16, capped at one, and it scales the weight of the comparison.</p>
  </details>
  <details><summary>Weights and repeated observations</summary>
    <p>A pair contributes at most one observation per rating. Duplicates of equal coverage with conflicting outcomes are excluded. The entrant count that divides cross-team budgets includes the distinct drivers in the weekend's race and qualifying records. These weights shape how the ratings learn; the evaluation (<a href="#" data-jump="method-validation">Part 10</a>) separately gives every scored weekend the same total weight.</p>
  </details>
</section>

<section id="method-odds" class="method-part">
  <h3>3. Ratings as odds</h3>
  <p>
    Suppose each entrant has a hidden strength, and that when two meet, the chance that one finishes ahead depends only on the difference between their strengths. The simplest rule with that property is the logistic curve of the <b>Bradley–Terry</b> model <a class="cite" href="#" data-jump="ref-1">[1]</a>. For an overall-strength gap <span data-math>g</span> in the model's internal units,
  </p>
  <p class="method-equation" data-math-display>\Pr(A\text{ finishes ahead of }B)=\sigma(g)=\frac{1}{1+e^{-g}}.</p>
  <p>
    The site quotes strengths in points: one internal unit is <span data-math>75/\ln 10\approx 32.6</span> points. With that choice a lead of 75 points is odds of 10 to 1 (91%), a lead of 150 points is 100 to 1 (99%), a lead of 30 points is a 71.5% chance and a lead of 10 points about 58%. Equal strengths give 50%.
  </p>
  <figure class="method-figure">
    <div class="method-figure-box" id="methodologyOddsChart"></div>
    <figcaption>How a gap in overall strength turns into a chance of finishing ahead, before uncertainty, calibration and retirement risk (<a href="#" data-jump="method-forecast">Part 9</a>). The curve is steepest where the contest is close.</figcaption>
  </figure>
  <p>
    Because the odds are exponential in the rating, rating differences add. If A is 20 points ahead of B and B is 10 points ahead of C, then A is 30 points ahead of C, a 71.5% chance, even if A and C never met. Additivity is what lets results from thousands of different pairs combine into one scale.
  </p>
  <p>
    The odds reading belongs to overall strength. Qualifying and race-pace points measure time: one point is about 0.00921% of a lap, so a 10-point gap in qualifying pace is about 0.09%, or 0.08 seconds on a 90-second lap.
  </p>
</section>

<section id="method-separation" class="method-part">
  <h3>4. Splitting driver from car</h3>

  <h4>A strength made of two parts</h4>
  <p>In Formula 1 the entrant is a driver in a car, so for each of the three ratings the model gives A this expected advantage over B:</p>
  <p class="method-equation" data-math-display>g=(d_A-d_B)+(c_A-c_B).</p>
  <p>
    Here <span data-math>d_i</span> and <span data-math>c_i</span> are the driver and car strengths of entrant <span data-math>i</span>. If A's driver is 20 points stronger but A's car is 10 points weaker, A's advantage is 10 points.
  </p>
  <p>
    Teammates share a car, so <span data-math>c_A=c_B</span> and the car cancels: a teammate comparison measures the drivers alone. A comparison between different teams measures two whole packages, driver and car together.
  </p>

  <h4>The shared shift</h4>
  <p>
    Teammate results fix the gap between two drivers and leave their common level open. Add 20 points to both drivers of a team and subtract 20 from their car, and every package, and so every probability, is unchanged. The slider makes this concrete.
  </p>
  <figure class="method-figure method-interactive">
    <div id="methodologySplitLab"></div>
    <figcaption>Move the slider. Two packages, one teammate gap, and many possible divisions between drivers and car, all predicting the same results.</figcaption>
  </figure>
  <p>The shift is pinned down by information from outside the team.</p>
  <ul>
    <li><b>Spread.</b> The model expects car strengths to differ far more than driver strengths: a car it has never seen starts with an uncertainty of 50 points, a driver with 20. A gain shared by both drivers of a team is therefore attributed mostly to the car.</li>
    <li><b>Time.</b> Cars are rebuilt every winter and developed through the season, while drivers change slowly, so a sudden team-wide jump points to the car (<a href="#" data-jump="method-time">Part 6</a>).</li>
    <li><b>Movement.</b> A driver who changes team takes their strength with them. Their results in the new car measure that car against the old one, and their new teammate against their old teammate.</li>
  </ul>

  <h4>A network of careers</h4>
  <p>
    Each teammate comparison links two drivers. When one of them later partners someone else, the links make a path, and differences add along it: if A is about 20 points ahead of B and B about 10 ahead of C, then A is about 30 ahead of C, although they never shared a car. Each link carries noise, so a chain is less precise than a direct comparison. Its variance is
  </p>
  <p class="method-equation" data-math-display>v_{AC}=v_{AB}+v_{BC}+2\operatorname{Cov}(g_{AB},g_{BC}).</p>
  <p>
    Links share drivers and seasons, so they are correlated, and the model tracks the full covariance between every two strengths for this reason (<a href="#" data-jump="method-joint">Part 5</a>). The figure builds a chain one pairing at a time. Each label turns a teaching win–loss record into a gap with <span data-math>g=75\log_{10}\frac{W+1}{L+1}</span>; the added ones keep an unbeaten record finite, and 7 wins against 3 losses give <span data-math>75\log_{10}(8/4)\approx23</span> points.
  </p>
  <figure class="method-figure method-interactive">
    <div id="methodologyCareerGraph"></div>
    <figcaption>A teaching example of a career network, revealed in date order. The win–loss records are illustrative.</figcaption>
  </figure>
  <p>
    The model itself reads every teammate comparison as an observation, alongside the cross-team ones, and the network takes shape through the strengths they share. The <a href="#/graph">Graph page</a> draws that network: every driver, linked to each of their teammates, placed at their published overall rating.
  </p>
</section>

<section id="method-joint" class="method-part">
  <h3>5. Three related strengths</h3>
  <p>
    The three ratings measure different things, and they are related. A driver who is quick over one lap is usually quick over a race stint, and both usually help them finish ahead. The model makes use of that. Each driver and each car has three strengths, one per rating, and the model expects them to move together: the correlation between a driver's three strengths is <span data-setting="driver_correlation"></span>, and between a car's three strengths <span data-setting="car_correlation"></span>. The correlations hold both in the starting estimates and in how the strengths change over time.
  </p>
  <p>
    Consider a driver who qualifies quickly, records ordinary race laps and regularly finishes ahead of rivals. Qualifying times teach their qualifying pace, race laps their race pace and finishing order their overall strength. When race evidence is scarce, strong qualifying lifts the overall estimate too; as race evidence accumulates, it establishes its own pattern, and the three ratings can then disagree.
  </p>
  <p>
    All driver and car strengths make up one joint estimate, with the relationships between their uncertainties kept in a <b>covariance</b> matrix. A driver and their car are estimated together: when a package is fast, a stronger driver and a stronger car explain it equally well, and the covariance records that trade-off. A result that a stronger car could explain gives less certainty that the driver is stronger, and the model can be surer of a package than of either of its parts.
  </p>
</section>

<section id="method-time" class="method-part">
  <h3>6. Strength through time</h3>
  <p>
    Strengths change. Cars are developed through the season and rebuilt over the winter; drivers improve and age. A rating has to follow these changes while ignoring the noise of any single result. The model is a state-space filter <a class="cite" href="#" data-jump="ref-3">[3]</a><a class="cite" href="#" data-jump="ref-4">[4]</a>: each strength is an estimate with an uncertainty, the uncertainty grows while time passes, and each weekend's evidence shrinks it again <a class="cite" href="#" data-jump="ref-2">[2]</a>.
  </p>
  <ul>
    <li><b>Starting point.</b> A driver or car the model has never seen starts at 1,000 in the model's own coordinates, with an uncertainty (one standard deviation) of 20 points for a driver and 50 for a car.</li>
    <li><b>Drivers.</b> A driver's strength may drift by about 8 points (one standard deviation) over a year, and by more over a longer gap, in proportion to the square root of the time elapsed. A driver absent for a season returns with a wider band.</li>
    <li><b>Cars.</b> A car that races may drift by 6 points each weekend, for development, and by a further 30 points across the winter, when it is rebuilt. Drifts add as variances.</li>
    <li><b>Team changes.</b> A driver who moves keeps their strength and their uncertainty, and pairs with the strength of the new car. A team that only changes its name keeps its car; a takeover by a new owner starts a new car.</li>
  </ul>
  <p>
    These changes widen the uncertainty and leave the estimate itself where it was: nothing moves a rating except evidence. A wide uncertainty makes the next result count for more (<a href="#" data-jump="method-update">Part 7</a>).
  </p>
  <p>The figure shows the outcome over one long career on the published ratings.</p>
  <figure class="method-figure">
    <div class="method-figure-box" id="methodologyCareerChart"></div>
    <figcaption id="methodologyCareerCaption">One driver's overall strength after every weekend of their career, and the overall strength of the car they drove.</figcaption>
  </figure>
</section>

<section id="method-update" class="method-part">
  <h3>7. Learning from a weekend</h3>
  <p>
    Each weekend runs in two steps. First the model predicts every comparison of the weekend from what it knew beforehand, and those predictions are recorded. Then it updates every strength with the weekend's evidence. Nothing from a weekend is used to forecast it.
  </p>

  <h4>The update</h4>
  <p>
    Before the weekend, the strengths <span data-math>\theta</span> have a Gaussian estimate <span data-math>\theta\sim\mathcal{N}(m,P)</span>. For comparison <span data-math>i</span>, the vector <span data-math>x_i</span> selects A's driver and car with +1 and B's with −1, so the predicted gap is <span data-math>g_i=x_i^\mathsf{T}\theta</span>. With outcome <span data-math>y_i</span>, weight <span data-math>w_i</span> from <a href="#" data-jump="method-evidence">Part 2</a> and timing scale <span data-math>\tau_i</span>, the update finds the strengths that minimise
  </p>
  <p class="method-equation" data-math-display>L(\theta)=\tfrac12(\theta-m)^\mathsf{T}P^{-1}(\theta-m)+\sum_i w_i\,\ell_i(g_i,y_i).</p>
  <p>
    The first term holds the strengths near what the model believed before, more firmly where it was sure. The sum rewards strengths that explain the weekend. For a timing comparison, <span data-math>y_i</span> is the fractional advantage divided by 0.003 and
  </p>
  <p class="method-equation" data-math-display>\ell_i=2\log\!\left(2\cosh\!\left(\frac{g_i-y_i}{2\tau_i}\right)\right)+\log\tau_i,</p>
  <p>
    a logistic error curve that pulls like a squared error for small misses and only linearly for large ones, so one damaged car or one blocked lap cannot drag a rating far. The timing scales are <span data-setting="noise"></span> in internal units. For finishing order, <span data-math>y_i\in\{0,1\}</span> records whether A finished ahead and <span data-math>\ell_i=\log(1+e^{g_i})-y_i g_i</span>, the log-likelihood of the odds curve of <a href="#" data-jump="method-odds">Part 3</a>.
  </p>
  <p>
    The minimum is the new best estimate. Around it, the model approximates the new distribution by a Gaussian whose covariance is the inverse curvature, <span data-math>\left[\nabla^2 L(\hat\theta)\right]^{-1}</span> at the minimum <span data-math>\hat\theta</span>: a Laplace step, the standard way to carry a filter through a non-Gaussian likelihood <a class="cite" href="#" data-jump="ref-5">[5]</a>. The covariance then carries the update to every strength that shares history with the weekend's entrants, including drivers and cars that did not race.
  </p>

  <h4>One strength, one result</h4>
  <p>
    A result moves an estimate in proportion to how surprising it was and how unsure the estimate was. The figure shows this for a single strength and a single result.
  </p>
  <figure class="method-figure method-interactive">
    <div id="methodologyBeliefUpdate"></div>
    <figcaption>A teaching example with one number. The model makes this update for every driver and car strength of a weekend at once, with the covariance carrying it between them.</figcaption>
  </figure>
</section>

<section id="method-scale" class="method-part">
  <h3>8. Reading a rating</h3>

  <h4>Two views of the same model</h4>
  <p>
    The site uses the model in two ways. The <b>chronological</b> run follows the calendar and knows, at each weekend, only what had happened by then. It produces the current ratings, every forecast and every test of <a href="#" data-jump="method-validation">Part 10</a>. The <b>historical</b> run fits the whole history at once, from 1990, so that the rating of a driver in 2005 also benefits from what their later teammates revealed <a class="cite" href="#" data-jump="ref-4">[4]</a>. It produces the past ratings shown on Ratings, History and Graph, and the historical what-if matchups.
  </p>
  <p>
    The historical run describes the past more accurately. On 31 complete weekends from 2012 onward, withheld from the fit and then predicted, it scored a log loss of 2.489 against 2.531 for the chronological run on qualifying, 2.219 against 2.270 on race pace and 0.511 against 0.530 on finishing order. Lower is better.
  </p>

  <h4>The reference of 1,000</h4>
  <p>
    Higher is stronger, and 1,000 stands for the recent leading field. Ratings, History and Graph quote every rating against a benchmark that gradually follows the median of the 20 highest-rated drivers, or of the 10 highest-rated cars: each weekend it moves about 3.4% of the way toward the previous weekend's median, so the influence of any one weekend halves over 20 weekends. The field has a fixed size because grids have not: 28 drivers entered in 1994 and 20 in 2025. Backmarkers below the leading 20 therefore do not move the benchmark, and a newcomer joins it by rating, not by experience. A change of line-up or a surprising result enters the benchmark only from the following weekend. The translation leaves every gap within a weekend, and every forecast, unchanged.
  </p>
  <p>
    Equal ratings in different decades mean equal standing relative to the leading field of their own time.
  </p>

  <h4>The ± sign</h4>
  <p>
    For current ratings, ± is one standard deviation of the driver's or car's own estimate. For past ratings it is the average standard deviation of the drivers, or of the cars, in that year, computed from the first, middle and last weekends of the year.
  </p>
  <details><summary>The display reference</summary>
    <p>There are six references: one for each rating, separately for drivers and cars. At each weekend of the historical run that the pages display, rank the drivers, or the distinct cars, by that rating and take the median of the highest 20 drivers or 10 cars (all of them on a smaller grid). For one reference, let <span data-math>\mu_t</span> be that median and <span data-math>B_t</span> the benchmark used at weekend <span data-math>t</span>.</p>
    <p>Set <span data-math>B_0=\mu_0</span>, and thereafter <span data-math>B_t=(1-\alpha)B_{t-1}+\alpha\mu_{t-1}</span> with <span data-math>\alpha=1-2^{-1/20}</span>. A raw rating <span data-math>r_t</span> is displayed as <span data-math>1000+r_t-B_t</span>. The benchmark has no winter reset and no decay in calendar time. Each past rating keeps the benchmark of its own date, and a retired driver's Graph rating stays at their last appearance. Forecasts and historical scenarios read the raw ratings.</p>
  </details>
</section>

<section id="method-forecast" class="method-part">
  <h3>9. Forecasts</h3>
  <p>
    Head to head gives the chance that A finishes ahead of B in the next race. It starts from the overall gap, driver plus car, and its variance from the full covariance, with one more week of change added. Uncertainty pulls the probability toward 50%, and a calibration slope <span data-math>s</span>, fitted on the forecasts of earlier years, sets how strongly a gap should move the odds:
  </p>
  <p class="method-equation" data-math-display>\Pr(A\text{ ahead}\mid\text{both finish})=\sigma\!\left(\frac{s\,g}{\sqrt{1+\pi v/8}}\right).</p>
  <p>
    Here <span data-math>g</span> is the gap in internal units and <span data-math>v</span> its variance; the square root is the standard approximation to averaging the logistic curve over an uncertain gap. When the two drivers share a car, the car cancels from both the gap and its variance.
  </p>

  <h4>Retirements</h4>
  <p>
    A forecast is about the classified result, so it accounts for retirements. Each driver has an incident risk and each car a mechanical risk per lap, learned from finishing statuses. If both entrants finish, the probability above decides. If one finishes, it is ahead. If both retire, the one who lasted longer is ahead, and a retirement on the same lap splits evenly. The default race distance is 60 laps.
  </p>

  <h4>The starting grid</h4>
  <p>
    When both starting positions are known, a second forecast adds them: it combines the overall gap with the grid difference, using two coefficients fitted on earlier races. On 73,749 pairs across 362 races with valid grids, it scored a log loss of 0.50465 against 0.52805 for the pre-weekend forecast of the same pairs. It improved every evaluation period, and the season-resampled 95% interval for the improvement is 0.01618 to 0.03100. The grid changes the forecast only; it never enters the ratings.
  </p>

  <h4>What-if matchups</h4>
  <p>
    Head to head can also pair drivers and cars that never met, from any two dates, or put both drivers in the same car. Matchups at past dates use the historical ratings, and every matchup uses the current calibration.
  </p>
  <details><summary>Probability, retirement risks and the grid</summary>
    <p>The variance includes the change expected by the forecast date, by default seven days after the latest weekend. Each entrant's per-lap retirement probability combines the driver's incident risk <span data-math>q_D</span> and the car's mechanical risk <span data-math>q_C</span> as <span data-math>1-(1-q_D)(1-q_C)</span>, and the forecast combines survival and retirement order over the race distance.</p>
    <p>Risk records shrink toward the field's behaviour. Mechanical records have a 35-race half-life and a 100-lap prior, and a car keeps 95% of its record over the winter; incident records have a five-race half-life and a 2,000-lap prior. Timing forecasts combine the strength uncertainty with the calibrated observation noise into a 90% prediction interval.</p>
    <p>With two valid, distinct grid positions, the log odds are <span data-math>\frac{a\,g}{\sqrt{1+\pi v/8}}+\frac{b\,(G_B-G_A)}{10}</span>, where <span data-math>G_A</span> and <span data-math>G_B</span> are the positions. The coefficients <span data-math>a</span> and <span data-math>b</span> are fitted on earlier races, with a penalty that pulls them toward the pre-weekend fit, and the strength of that penalty is chosen on earlier seasons. Missing positions and pit-lane starts are never read as pole position; with either position missing, the pre-weekend forecast applies exactly.</p>
    <p>Historical what-ifs use the yearly-average uncertainty and treat the drivers and cars, and the two dates, as independent. The forecast target is the ordinary classified order including retirements; disqualifications, withdrawals and non-starters are left out.</p>
  </details>
</section>

<section id="method-validation" class="method-part">
  <h3>10. Testing against the future</h3>
  <p>
    The ratings are judged by what they say about results they have not yet seen. The whole history was replayed in date order, each weekend forecast from the weekends before it and only then used to update the ratings <a class="cite" href="#" data-jump="ref-8">[8]</a>. The replay starts in 1994, warms up through 2001, and chooses the model's few shared settings from the forecasts of 2002 to 2007. The years from 2008 to 2025 are scored in four periods, each with a calibration fitted only on earlier years, and every scored weekend carries the same total weight. The 2026 season is scored as it happens, with the calibration refreshed once a year from earlier years only.
  </p>

  <h4>The score</h4>
  <p>
    The main score is the <b>log loss</b> of the race forecasts: for every pair of drivers, the forecast probability of the outcome that actually happened, retirements included. A forecast of 80% for A costs <span data-math>-\ln 0.8=0.223</span> if A finishes ahead and <span data-math>-\ln 0.2=1.609</span> if not. A forecaster scores best on average by stating the probabilities it actually holds, which makes log loss a proper scoring rule <a class="cite" href="#" data-jump="ref-7">[7]</a>. Calling every pair 50/50 scores <span data-math>\ln 2=0.693</span>, and a perfect forecaster scores 0. Accuracy is the share of pairs in which the favourite finished ahead, and the <b>Brier score</b> is the mean squared error of the probabilities, where 50/50 scores 0.25 <a class="cite" href="#" data-jump="ref-6">[6]</a>.
  </p>
  <div class="table-wrap">
    <table class="params">
      <thead><tr><th scope="col" class="left">Period</th><th scope="col">Weekends</th><th scope="col">Log loss</th><th scope="col">Accuracy</th><th scope="col">Brier score</th></tr></thead>
      <tbody id="methodologyBlocks"></tbody>
    </table>
  </div>
  <p id="methodologyValidationSummary"></p>
  <figure class="method-figure">
    <div class="method-figure-box" id="methodologySeasonChart"></div>
    <figcaption>The log loss of the race forecasts in every season, each weekend forecast before it was used, against a coin flip. Computed live from the published model.</figcaption>
  </figure>
  <p>
    The forecasts are calibrated: a slope of 1 means the stated probabilities match how often things happen, and the slopes in the four periods are 1.00, 0.90, 0.95 and 1.00.
  </p>

  <h4>Timing predictions</h4>
  <p>
    The two timing ratings predict the size of each gap. The table gives the average error in percent of lap time, and how often the outcome fell inside the forecast's 90% interval.
  </p>
  <div class="table-wrap">
    <table class="params">
      <thead><tr><th scope="col" class="left">Period</th><th scope="col">Qualifying error</th><th scope="col">Inside 90%</th><th scope="col">Race-pace error</th><th scope="col">Inside 90%</th></tr></thead>
      <tbody>
        <tr><th scope="row" class="left">2008–2011</th><td>0.71%</td><td>95.2%</td><td>0.75%</td><td>91.8%</td></tr>
        <tr><th scope="row" class="left">2012–2015</th><td>0.74%</td><td>92.7%</td><td>0.60%</td><td>96.0%</td></tr>
        <tr><th scope="row" class="left">2016–2020</th><td>0.66%</td><td>94.2%</td><td>0.57%</td><td>95.3%</td></tr>
        <tr><th scope="row" class="left">2021–2025</th><td>0.54%</td><td>95.2%</td><td>0.52%</td><td>95.6%</td></tr>
      </tbody>
    </table>
  </div>

  <h4>Drivers who change team</h4>
  <p>
    The hardest test of a driver rating is a driver in a new car. For 51 moves, the strengths of the mover and of their new teammate were frozen before the mover's last weekend at the old team. The frozen gap then forecast the 1,882 comparisons between the two over the mover's first five and ten weekends together: who was quicker in qualifying, who was quicker in race pace, and who finished ahead. Nothing the mover did in the new car entered these forecasts, and their calibration comes from earlier frozen comparisons of drivers who stayed with their teams. Their log loss is 0.679, below the 0.693 of a coin flip.
  </p>

  <h4>Checks on the code</h4>
  <p>
    Tests confirm that the published files match a fresh fit at every weekend; that adding later races leaves every earlier forecast unchanged; that swapping two drivers flips every probability; that the car cancels exactly between teammates; and that the browser's forecasts match the model's own calculation.
  </p>
</section>

<section id="method-limits" class="method-part">
  <h3>11. Limitations</h3>
  <p>
    The ratings are model-dependent estimates of competitiveness in the available observations. They do not measure innate talent, and they do not estimate the causal effect of placing a driver in a car. Every qualification of the preceding parts is collected below.
  </p>

  <h4>The driver–car split</h4>
  <ul>
    <li>The split rests on the assumption that teammates share the same car. Real teammates can receive different upgrades, strategies or treatment, and team orders can decide a comparison.</li>
    <li>The model has no term for a driver's lasting advantage in one particular car. It can predict a package well while dividing the credit inaccurately; forecasting accuracy and a correct split are different claims.</li>
    <li>Cross-team results inform car differences given the evidence about their drivers. The split also depends on the starting uncertainties and the assumed rates of change, and sparse teammate connections make a strong driver hard to tell from a strong car.</li>
    <li>In simulated seasons where a driver has a lasting advantage in one car, the uncertainty bands are too narrow to cover the true differences reliably.</li>
    <li>The test of drivers who change team scores only slightly better than a coin flip (0.679 against 0.693), and on finishing order alone it scores 0.698, worse than a coin flip. With 51 moves the test is small, and it does not establish how well the split itself is estimated.</li>
    <li>Ratings respond quickly to new evidence: in the evaluation, the 90th-percentile change in an overall rating between consecutive appearances, relative to the field, was 3.6 points.</li>
  </ul>

  <h4>The evidence</h4>
  <ul>
    <li>Matching lap numbers does not guarantee matching conditions: traffic, tyres, fuel, weather and strategy still affect the kept laps, and cars can run the same numbered lap at different times. Race pace is not independent of starting position.</li>
    <li>Finishing order learns only from drivers who finish. Retirements inform the risk records, which do not assign the fault of a collision.</li>
    <li>The comparisons of a weekend are dependent. The weights restrain repeated evidence without making the observations independent, and the uncertainty is conditional on those weights.</li>
    <li>Qualifying comparisons are unavailable before 1994, and from 2006 to 2009 they use Q2 or Q1.</li>
  </ul>

  <h4>Uncertainty</h4>
  <ul>
    <li>The uncertainty is approximate: a Laplace approximation to a weighted likelihood, conditional on the observation model, the shared-car assumption and the fixed settings. It does not include every error caused by those choices.</li>
    <li>The ± of past ratings is a yearly average over all drivers or cars, computed from three sampled weekends; it is not an individual error bar. Historical what-ifs treat drivers, cars and dates as independent, so their uncertainty is rough.</li>
    <li>Early historical ratings depend strongly on the 1990 starting date and the starting uncertainties, and their bands do not include that sensitivity.</li>
    <li>The bands omit any uncertainty in the display benchmark. Displayed changes between appearances include the movement of the benchmark, and displayed ratings from different dates do not subtract to the gap a historical what-if uses.</li>
    <li>Equal ratings in different decades do not establish equal absolute ability across different regulations, machinery and competitors.</li>
  </ul>

  <h4>Forecasts</h4>
  <ul>
    <li>Calibration slopes below 1 mean the probabilities ran somewhat overconfident: 0.90 in 2012 to 2015, and 0.86 in 2026 through the 19th weekend. Over the same 2026 weekends, race-pace intervals covered 86% of outcomes against a target of 90%.</li>
    <li>Retirement risks assume a constant chance per lap, and shared conditions or changing failure rates can violate that. Pairwise chances alone do not give the probability of a full finishing order or of the winner.</li>
    <li>The grid forecast measures a predictive association, scored with the final starting positions; it is not the causal effect of moving a car on the grid. Historical what-ifs are thought experiments with current calibration, not forecasts that were available at the time.</li>
    <li>Entrants are treated as known before the weekend, so withdrawals and substitutions are not forecast.</li>
  </ul>

  <h4>Evaluation</h4>
  <ul>
    <li>All historical periods informed the development of the model, so the scores are retrospective evidence rather than an untouched holdout. The 2026 season is scored separately as it happens.</li>
    <li>Comparisons within a race share evidence, and season-resampled intervals do not account for every choice made in building the model. The true split between driver and car is never observed directly.</li>
    <li>The holdout test of the historical run uses later races, so it tests a description of the past, not a forecast.</li>
  </ul>
</section>

<section id="method-settings" class="method-part">
  <h3>12. Settings</h3>
  <p>
    The settings below are fixed for the published model. The shared settings were chosen on the forecasts of 2002 to 2007; the values marked live are read from the loaded model.
  </p>
  <div class="table-wrap">
    <table class="params">
      <thead><tr><th scope="col" class="left">Setting</th><th scope="col" class="left">Value</th></tr></thead>
      <tbody>
        <tr class="group"><th colspan="2" scope="colgroup">Strengths</th></tr>
        <tr><th scope="row" class="left">Starting uncertainty of a driver</th><td class="left">20 points</td></tr>
        <tr><th scope="row" class="left">Starting uncertainty of a car</th><td class="left">50 points</td></tr>
        <tr><th scope="row" class="left">Change of a driver</th><td class="left">8 points per square-root year</td></tr>
        <tr><th scope="row" class="left">Change of a racing car</th><td class="left">6 points per weekend, and 30 points across the winter</td></tr>
        <tr><th scope="row" class="left">Correlation of a driver's three strengths (live)</th><td class="left"><span data-setting="driver_correlation"></span></td></tr>
        <tr><th scope="row" class="left">Correlation of a car's three strengths (live)</th><td class="left"><span data-setting="car_correlation"></span></td></tr>
        <tr><th scope="row" class="left">Timing noise scales (live)</th><td class="left"><span data-setting="noise"></span></td></tr>
        <tr><th scope="row" class="left">Timing unit</th><td class="left">0.003 of a lap</td></tr>
        <tr><th scope="row" class="left">Points per internal unit</th><td class="left">75 / ln 10 (75 points are 10-to-1 odds in overall strength)</td></tr>
        <tr class="group"><th colspan="2" scope="colgroup">Comparisons</th></tr>
        <tr><th scope="row" class="left">Teammate qualifying weight</th><td class="left">1</td></tr>
        <tr><th scope="row" class="left">Teammate race pace and finishing order</th><td class="left">at most 1.5 together, by lap coverage</td></tr>
        <tr><th scope="row" class="left">Cross-team divisor</th><td class="left">number of entrants minus one</td></tr>
        <tr><th scope="row" class="left">Slow-lap cutoff</th><td class="left">105% of the driver's fastest remaining lap</td></tr>
        <tr><th scope="row" class="left">Race-pace windows</th><td class="left">8 laps; at least 4 matched laps; full weight at 16</td></tr>
        <tr class="group"><th colspan="2" scope="colgroup">Display and forecasts</th></tr>
        <tr><th scope="row" class="left">Display benchmark half-life</th><td class="left">20 weekends</td></tr>
        <tr><th scope="row" class="left">Display benchmark field</th><td class="left">median of the 20 highest-rated drivers; of the 10 highest-rated cars</td></tr>
        <tr><th scope="row" class="left">Mechanical risk</th><td class="left">35-race half-life, 100-lap prior, 95% kept over the winter</td></tr>
        <tr><th scope="row" class="left">Incident risk</th><td class="left">5-race half-life, 2,000-lap prior</td></tr>
        <tr><th scope="row" class="left">Forecast race distance</th><td class="left">60 laps</td></tr>
      </tbody>
    </table>
  </div>
  <h4>This publication</h4>
  <p id="methodologyPublication"></p>
  <h4>Reproducing the calculation</h4>
  <p>
    In the <a href="https://github.com/francescobraicovich/car-or-driver" rel="noopener noreferrer">repository</a>, <code>packages/core/node/unified-evidence.mjs</code> prepares the comparisons and <code>packages/core/python/unified_model.py</code> updates the strengths. <code>unified_calibration.py</code> and <code>unified_grid.py</code> fit the forecast calibration and the grid forecast, <code>research/retrospective-refit/retrospective_refit.py</code> fits the historical run, and <code>packages/core/node/build-unified.mjs</code> publishes the dated model files. In the browser, <code>packages/core/src/unified/</code> computes the forecasts and <code>site/js/rating-reference.js</code> applies the display reference. The site reads the saved model and fits nothing itself.
  </p>
</section>

<section id="method-references" class="method-part">
  <h3>13. References</h3>
  <p>Numbers in square brackets in the text refer to this list. Each entry with a DOI links to the publisher's record of the work.</p>
  <h4>Methods behind the ratings and the forecasts</h4>
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
  <h4>Methods used in the Insights findings</h4>
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
  <h4>Data</h4>
  <ol class="references" start="17">
    <li id="ref-17">TracingInsights. <i>RaceData</i>: Formula 1 data tables (CC0 1.0, as stated by the project). Retrieved November 2026. <a href="https://github.com/TracingInsights/RaceData" rel="noopener noreferrer">github.com/TracingInsights/RaceData</a></li>
    <li id="ref-18">Jolpica-F1. <i>Jolpica-F1: free and open-source Formula 1 API</i> (data under CC BY-NC-SA 4.0). Retrieved October 2026. <a href="https://github.com/jolpica/jolpica-f1" rel="noopener noreferrer">github.com/jolpica/jolpica-f1</a></li>
    <li id="ref-19">Trotman, J. <i>Formula 1 Race Data</i> and <i>Formula 1 Race Events</i> (Kaggle datasets listed as a source by RaceData). Retrieved October 2026. <a href="https://www.kaggle.com/datasets/jtrotman/formula-1-race-data" rel="noopener noreferrer">kaggle.com/datasets/jtrotman/formula-1-race-data</a></li>
  </ol>
</section>
`;

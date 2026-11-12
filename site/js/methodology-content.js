// Reader-facing methodology for the production joint model.
// Live settings and publication details are filled by methodology-view.js.
export const CONTENT_HTML = String.raw`
<section id="method-questions" class="method-part">
  <h3>1. Estimate what the driver and car contribute</h3>
  <p>A Formula 1 result tells us how a driver and car performed together. This site shows ratings since 1994. The historical refit uses evidence from 1990 onward; the forecast model starts in 1994. The starting point is the teammate comparison: if two drivers share the same car contribution, it cancels when we compare them. Drivers who change teams connect those comparisons across the field.</p>
  <p>The shared car is an assumption of the model. Real teammates can receive different upgrades, strategies or treatment. The ratings describe contributions under this assumption. Both the estimates and their separation are uncertain.</p>
  <p>Consider a driver who qualifies quickly, records ordinary race laps and regularly finishes ahead of rivals. The model gives each driver and each car three ratings:</p>
  <table><thead><tr><th>Rating</th><th>Contribution being estimated</th><th>Direct evidence</th></tr></thead><tbody>
    <tr><td><b>Qualifying pace</b></td><td>Speed over a representative qualifying lap.</td><td>Time differences in the same qualifying phase.</td></tr>
    <tr><td><b>Race pace</b></td><td>Sustained speed on comparable race laps.</td><td>Time differences on matching retained laps.</td></tr>
    <tr><td><b>Overall strength</b></td><td>Race competitiveness before the weekend begins.</td><td>Order between drivers who finish without retiring.</td></tr>
  </tbody></table>
  <p>Lap times measure speed; finishing order also reflects track position and how the race unfolds. <b>Overall strength supplies the default ranking and race forecast.</b> It learns from finishing order while sharing information with the timing ratings, without assigning a fixed percentage to either.</p>
  <p>A driver estimate is intended to carry between teams. The car estimate includes team contributions that these observations cannot distinguish from machinery. Mechanical failures and driver incidents have separate risk estimates, used when forecasting race results.</p>
</section>

<section id="method-evidence" class="method-part">
  <h3>2. Compare performances under similar conditions</h3>
  <p>The inputs are qualifying times, race laps, finishing positions and retirement statuses. <a class="cite" href="#" data-jump="ref-17">[17]</a> Each observation compares two entrants in the same weekend. Timing observations retain the size of the advantage: winning a comparison by a tenth of a second carries different evidence from winning it by a second.</p>
  <p><b>Qualifying comparisons use a shared phase (Q1, Q2 or Q3).</b> We take the latest phase in which both drivers have usable times. Missing or excluded times supply no comparison. To account for different circuit lengths, we divide the time difference by the average of the two times. If A takes 90.0 seconds and B takes 90.3, A’s advantage is about 0.33%.</p>
  <p><b>Race-pace comparisons use matching race-lap numbers.</b> We remove the first lap and unusually slow laps, then summarise the remaining differences with medians. Shorter overlaps provide less evidence. Traffic, tyres, fuel, weather and strategy still affect the retained laps. Cars can run the same numbered lap at different times, so matching the number does not guarantee matching conditions.</p>
  <p><b>Overall strength learns who finished ahead when both drivers completed the race without retiring.</b> Drivers who were lapped still count as finishers. Retirement positions and intermediate positions before retirement are omitted from this update. A retiree can still supply usable earlier laps, subject to the pace checks. The retirement also updates the appropriate risk record.</p>
  <details><summary>Qualifying selection and timing units</summary>
    <p>Try Q3, then Q2, then Q1, retaining the latest valid shared phase. In 2006–2009, omit Q3 because race-fuel requirements affected those times. Documented interrupted Q1 attempts and severe isolated Q1 outliers are excluded. For Q2 and Q3, when at least eight times are recorded, a time more than 10% above the phase median is excluded while earlier usable phases remain available.</p>
    <p>The Q1 outlier rule requires at least ten times, no later timed phase for that driver, and a lap slower than both the field median and every timed teammate by more than 5% in a multi-phase session, or 10% in a single-phase session. Missing evidence is never converted to a loss.</p>
    <p>For times <span data-math>t_A</span> and <span data-math>t_B</span>, A’s fractional advantage is <span data-math>\frac{2(t_B-t_A)}{t_A+t_B}</span>. A positive value means A is faster; equal times give zero. The numerical model divides this fraction by <span data-math>0.003</span> to obtain its internal timing units.</p>
  </details>
  <details><summary>Race-lap selection and aggregation</summary>
    <p>Pairs must first pass the existing overlapping-window pace checks, including the exclusion of compromised early mechanical retirements. For each driver, remove lap 1, invalid durations and laps exceeding 105% of the fastest remaining candidate lap. Match exact lap numbers and require at least four matches.</p>
    <p>Calculate the fractional advantage on each matched lap. Take its median within fixed eight-lap windows, starting with laps 2–9, then take the median of those window medians. Coverage is the matched-lap count divided by 16, capped at one. These rules reduce the influence of pit laps and isolated slow laps; they do not establish that pace is independent of traffic or starting position.</p>
  </details>
</section>

<section id="method-separation" class="method-part">
  <h3>3. Use teammates to separate the contributions</h3>
  <p>For any one of the three ratings, the model gives A this expected advantage over B:</p>
  <p class="method-equation" data-math-display>g = (d_A-d_B)+(c_A-c_B)</p>
  <p>Here <span data-math>d_i</span> and <span data-math>c_i</span> are the driver and car strengths for entrant <span data-math>i</span>, in the same output and internal units. The gap <span data-math>g</span> is positive when A has the stronger package.</p>
  <p>If A’s driver is 20 rating points stronger but A’s car is 10 points weaker, A’s combined advantage is 10 points. An observation of that advantage constrains the sum. Several driver–car combinations could produce it.</p>
  <p>For teammates, the car terms are equal and cancel. Their comparison supplies evidence about the driver difference within the model. If A races alongside B and later alongside C, A connects the two comparisons. Using assumptions about how strengths change, the model can estimate differences between drivers who never shared a car directly.</p>
  <p>Cross-team results help estimate car differences, given the evidence about their drivers. The split also depends on starting estimates and assumptions about how quickly strengths change. Sparse teammate connections make it harder to distinguish a strong driver from a strong car.</p>
  <p>The shared-car assumption cannot remove unequal upgrades, team orders or a driver’s lasting advantage in a particular car. The model has no separate driver–car compatibility term. It can predict a combined package well while dividing credit inaccurately.</p>
  <p>The Graph page displays these teammate connections and the same overall ratings published elsewhere. It does not fit an additional ranking or feed a second estimate of the same races into the model.</p>
</section>

<section id="method-joint" class="method-part">
  <h3>4. Learn related strengths together</h3>
  <p>Return to the driver with quick qualifying laps, ordinary race pace and strong finishing positions. Qualifying observations support their qualifying rating, race laps constrain their race-pace rating, and finishing order supports their overall rating. Each contribution is assessed together with the car’s contribution.</p>
  <p>The three ratings also inform one another. When little race evidence is available, strong qualifying can support a higher overall estimate. As race evidence accumulates, it can establish a different pattern. The amount of sharing depends on the model’s assumptions and its current uncertainty, so the outputs can disagree.</p>
  <p>Within each model, all driver and car strengths belong to one joint estimate. This preserves relationships between their uncertainties: if a result could be explained by a stronger car, it provides less certainty that the driver must be stronger. The mathematical record of these relationships is called <b>covariance</b>.</p>
  <details><summary>Observation rules and joint calculation</summary>
    <p>Each driver and car has three latent strengths. Their starting distribution and changes over time have cross-output correlations of <span data-setting="driver_correlation"></span> for drivers and <span data-setting="car_correlation"></span> for cars. These correlations express expected association, not percentages of an overall rating.</p>
    <p>Qualifying and race margins use logistic timing errors. Their loss limits the influence of an extreme residual on the update. The global timing-noise scales are <span data-setting="noise"></span> in internal units. Normal-finisher comparisons use a Bernoulli logistic rule: for an internal overall package gap <span data-math>g</span>, the probability of A finishing ahead is <span data-math>\sigma(g)=\frac{1}{1+e^{-g}}</span>. <a class="cite" href="#" data-jump="ref-1">[1]</a></p>
    <p>More precisely, let the predicted state be <span data-math>\theta\sim\mathcal{N}(m,P)</span>, and let <span data-math>g_i=x_i^\mathsf{T}\theta</span> be the package gap for comparison <span data-math>i</span>. With target <span data-math>y_i</span>, weight <span data-math>w_i</span> and timing scale <span data-math>\tau_i</span>, the update minimises</p>
    <p class="method-equation" data-math-display>L(\theta)=\tfrac12(\theta-m)^\mathsf{T}P^{-1}(\theta-m)+\sum_i w_i\ell_i(g_i,y_i).</p>
    <p>For a timing observation, <span data-math>y_i</span> is the fractional advantage divided by <span data-math>0.003</span> and its loss, up to an additive constant, is</p><p class="method-equation" data-math-display>\ell_i=2\log\!\left(2\cosh\!\left(\frac{g_i-y_i}{2\tau_i}\right)\right)+\log\tau_i.</p><p>For finishing order, <span data-math>y_i\in\{0,1\}</span> indicates whether A finished ahead and <span data-math>\ell_i=\log(1+e^{g_i})-y_i g_i</span>. The weights form a weighted likelihood, so its Gaussian uncertainty is conditional on those weights.</p>
    <p>For the filtered model, combine each weekend’s weighted observations with the previous joint Gaussian distribution. Find the most probable strengths, then approximate the distribution around them by a multivariate Gaussian, using covariance <span data-math>\left[\nabla^2 L(\hat\theta)\right]^{-1}</span> at the mode <span data-math>\hat\theta</span>. This is a Laplace approximation; posterior-mode filtering provides related statistical background. <a class="cite" href="#" data-jump="ref-5">[5]</a> Conditional Gaussian propagation retains correlations with inactive drivers and cars. The historical model instead fits the complete trajectory jointly. The site publishes average uncertainty for each year, calculated from the first, middle and last available historical weekends of each year, rather than individual historical covariance.</p>
  </details>
</section>

<section id="method-update" class="method-part">
  <h3>5. Update once after each weekend</h3>
  <p>The forecast model follows the calendar and updates from evidence available at each weekend. Historical ratings use a separate joint refit that also incorporates later races. The latest ratings and forecasts use the filtered model; historical ratings can change as new races are added. <a class="cite" href="#" data-jump="ref-4">[4]</a></p>
  <p>Drivers and cars can change between appearances. The model allows for this by increasing uncertainty before new evidence arrives. An uncertain estimate can respond more to a surprise; repeated evidence is needed to move a well-established estimate as far. A driver changing teams keeps their accumulated history.</p>
  <p>One race produces many comparisons, but they reuse the same laps, entrants and conditions. We limit each pair’s contribution and reduce the weight of cross-team pairs. This restrains repeated evidence without making the observations independent. The uncertainty remains conditional on that approximation.</p>
  <details><summary>Starting estimates and change over time</summary>
    <p>In the model’s fixed coordinates, an unseen driver or car starts at 1,000. Initial standard deviations are 20 points for drivers and 50 for cars. A first displayed rating already includes the first weekend’s evidence and the display reference.</p>
    <p>Driver evolution adds variance at a rate corresponding to 8 points of standard deviation over a year, scaling with the square root of elapsed years. Active cars receive a 6-point component per weekend; a further 30-point component is added across winter. These components add as variances, with no automatic change to the mean rating. <a class="cite" href="#" data-jump="ref-2">[2]</a></p>
    <p>A transfer changes the accompanying car without resetting or penalising driver strength. Under the project’s lineage rules, a rename continues a car state and a takeover begins a separate one. The retrospective fit starts in 1990, although qualifying comparisons are unavailable before 1994. Early historical estimates depend strongly on the starting date and prior; their error bars do not include that sensitivity. The selected evolution and timing-noise settings are fixed in production; the response to evidence still changes with posterior uncertainty.</p>
  </details>
  <details><summary>Weights and repeated observations</summary>
    <p>A pair contributes at most one observation per output. Equal-coverage duplicates with conflicting targets are excluded. A teammate qualifying comparison has weight 1. Race pace and finishing order share at most 1.5, distributed in proportion to their coverage; when only short pace coverage is available, the total is smaller.</p>
    <p>Cross-team comparisons receive the same budgets divided by the entrant count minus one. The entrant count includes distinct drivers in the weekend’s race and qualifying records. These weights affect the strength update; the evaluation separately gives each scored weekend equal aggregate weight.</p>
  </details>
</section>

<section id="method-scale" class="method-part">
  <h3>6. Read ratings relative to their era</h3>
  <p><b>Higher is stronger; 1,000 represents the recent competitive environment.</b> Ratings, History and Graph use a benchmark that follows earlier field averages gradually. The current field’s mean need not equal 1,000. A lineup change or surprising result enters the benchmark from the following weekend, rather than immediately moving everyone’s reference.</p>
  <p>This translation preserves differences within a weekend and leaves forecasts unchanged. The historical estimates are jointly refitted, while the display reference itself only translates ratings. Each historical point keeps its own dated reference, and a retired driver’s Graph rating stays at their last appearance. Displayed changes between appearances include any reference movement between those dates.</p>
  <p>For current ratings, <b>±</b> is an approximate individual standard deviation. For historical ratings, it is the average standard deviation for drivers or cars in that year, calculated from up to three sampled weekends. It is not an individual error bar. Both depend on the model’s assumptions and omit uncertainty in the display benchmark and starting choices.</p>
  <p>Equal displayed ratings across decades mean comparable standing relative to their recent fields. They cannot establish equal absolute ability across different regulations, machinery or competitors.</p>
  <details><summary>The display reference</summary>
    <p>There are six references: one for each output, separately for drivers and cars. At each snapshot, calculate the unweighted mean across drivers and the mean across unique cars from the filtered model; the same reference is used for the retrospective display. For any one reference, let <span data-math>\mu_t</span> be that mean and <span data-math>B_t</span> the benchmark used at weekend <span data-math>t</span>.</p>
    <p>Set <span data-math>B_0=\mu_0</span>. Thereafter use <span data-math>B_t=(1-\alpha)B_{t-1}+\alpha\mu_{t-1}</span>, with <span data-math>\alpha=1-2^{-1/20}</span>. For raw rating <span data-math>r_t</span>, display <span data-math>1000+r_t-B_t</span>. The benchmark moves about 3.4% toward the previous mean at each update. Existing influence halves over 20 rated weekends, with no winter reset or calendar-time decay.</p>
    <p>The reference is treated as a fixed display convention, so the underlying standard deviations remain unchanged. Forecasts and historical scenarios read raw model coordinates. Subtracting displayed ratings from different dates therefore does not reproduce the gap used in a historical scenario.</p>
  </details>
  <details><summary>Point units and matchup uncertainty</summary>
    <p>One internal strength unit equals <span data-math>75/\ln(10)</span> points. For overall strength, a 75-point package advantage gives raw odds of 10:1. A 10-point advantage gives about 58% before uncertainty, calibration and retirement risk.</p>
    <p>Qualifying and race-pace points instead describe fractional time advantages: one point corresponds to about 0.00921% of lap time before calibration. The odds interpretation applies only to overall strength.</p>
    <p>Current forecast uncertainty uses the full covariance of the driver and car terms. Historical scenarios instead use the yearly averages and assume drivers and cars are independent, so their uncertainty is a rough approximation. A shared car cancels from both the mean gap and its variance.</p>
  </details>
</section>

<section id="method-forecast" class="method-part">
  <h3>7. Turn strength into a race probability</h3>
  <p>Head to head estimates the chance that A finishes ahead of B. Begin with the overall driver difference plus the overall car difference. Carry uncertainty forward to the next weekend, then convert that gap to a probability.</p>
  <p><b>Calibration</b> sets how strongly a rating difference should affect the odds, using forecast outcomes from earlier years. Uncertain strength estimates produce less confident competitive probabilities. Finally, separate driver-incident and mechanical-failure risks account for retirements over the chosen distance, 60 laps by default.</p>
  <p>If both entrants finish, competitive strength determines their relative-order probability. If one finishes, it wins the head-to-head comparison. If both retire, the risk model compares how long they last and splits simultaneous retirements evenly. The validated target includes retirements in ordinary classified order; disqualifications, withdrawals and other excluded or non-start statuses are omitted.</p>
  <h4>Adding a known starting grid</h4>
  <p>For current drivers in their own cars, supplying both starting positions adds information about track position. A fitted prediction layer uses the overall package gap and the grid difference. It changes the forecast while leaving strength ratings unchanged. If either position is missing, the original pre-weekend calculation is used exactly.</p>
  <p>In historical comparisons on the same pairs with valid grids, this extra information improved forecasts. It measures a predictive association, not the causal effect of moving an otherwise unchanged car to another slot. Historical car-and-driver combinations are exploratory scenarios. They use current calibration and depend on assumptions about comparability across dates.</p>
  <details><summary>Probability calculation and retirement risks</summary>
    <p>Let <span data-math>g</span> be the overall package gap in internal units, <span data-math>v</span> its joint variance and <span data-math>s</span> the fitted positive calibration slope. Competitive probability is <span data-math>\sigma\!\left(\frac{sg}{\sqrt{1+\pi v/8}}\right)</span>, where <span data-math>\sigma(x)=\frac{1}{1+e^{-x}}</span>. This is an approximation to averaging over uncertain strength, rather than an exact logistic-normal integral. The variance includes next-weekend evolution; the default date is seven days after the latest snapshot.</p>
    <p>Each entrant’s per-lap retirement probability combines driver incident risk <span data-math>q_D</span> and car mechanical risk <span data-math>q_C</span> as <span data-math>1-(1-q_D)(1-q_C)</span>. The forecast assumes constant per-lap risks and combines survival and retirement order over the race. Shared conditions and changing failure rates can violate those assumptions.</p>
    <p>Risk records shrink toward field-average behaviour. Mechanical records have a 35-race half-life and 100-lap prior; incident records have a five-race half-life and 2,000-lap prior. Cars retain 95% of their mechanical record over winter. Timing forecasts separately combine strength uncertainty with calibrated observation noise to form a 90% prediction interval.</p>
    <p>Historical scenarios use yearly-average uncertainty and treat drivers and cars as independent; states from different dates are also treated as independent. The full historical covariance is not published. These calculations use raw ratings and current calibration; they are not forecasts available at the historical date.</p>
  </details>
  <details><summary>Grid calculation and its validation</summary>
    <p>With two valid, distinct grid positions, competitive log odds are <span data-math>\frac{ag}{\sqrt{1+\pi v/8}}+\frac{b(G_B-G_A)}{10}</span>. Here <span data-math>G_A</span> and <span data-math>G_B</span> are the grid positions; earlier races determine the coefficients <span data-math>a</span> and <span data-math>b</span>. Regularisation pulls them toward a rating-only fit on the same training sample, with its strength selected using earlier validation seasons. The same retirement calculation follows. Missing positions and pit-lane codes are not interpreted as pole position.</p>
    <p>These forecast evaluations use the filtered model, not the retrospective ratings. On 73,749 grid-covered pairs across 362 historical races, log loss fell from 0.52805 to 0.50465. Each evaluation block improved; the season-resampled 95% interval for the difference was −0.03100 to −0.01618. Both forecasts were scored on the same pairs, using final archival starting positions assumed available before the start. This measures the value of extra grid information on a smaller sample than the pre-weekend evaluation.</p>
    <p>No circuit, weather or current qualifying-time correction is retained, and no separate recent-form layer enters the forecast.</p>
  </details>
</section>

<section id="method-validation" class="method-part">
  <h3>8. Test prediction and the division of credit</h3>
  <p>For the historical refit, we also withheld 31 complete weekends from 2012 onward and estimated them using the remaining races. Predictive log loss was 2.489 versus 2.531 for qualifying, 2.219 versus 2.270 for race pace, and 0.511 versus 0.530 for finishing order, compared with the filtered estimates. Lower is better. The refit uses later races, so this is a test of retrospective descriptions rather than a historical forecast. Comparisons within a race share evidence, and the true driver–car split is not directly observed.</p>
  <p>We replayed history in order, predicting each weekend before its observations updated the ratings. Model settings and forecast calibration used earlier data. Each scored race had equal aggregate weight. <a class="cite" href="#" data-jump="ref-8">[8]</a> The final model was chosen after inspecting historical comparisons, so the results below are retrospective evidence. Monitoring from 2026 is reported separately.</p>
  <p>The comparison uses the site’s previous published ratings with the same probability calibration and retirement treatment. <b>Log loss</b> penalises confident wrong predictions; lower is better, and a constant 50–50 prediction scores about 0.693. <a class="cite" href="#" data-jump="ref-7">[7]</a> Timing error is the average absolute difference between predicted and observed fractional time advantages.</p>
  <table><thead><tr><th>2008–2025 comparison</th><th>Previous ratings</th><th>Joint model</th></tr></thead><tbody>
    <tr><td>Race-result log loss</td><td>0.53172</td><td>0.53012</td></tr>
    <tr><td>Qualifying timing error</td><td>Reference</td><td>20.8% lower</td></tr>
    <tr><td>Race-pace timing error</td><td>Reference</td><td>15.3% lower</td></tr>
    <tr><td>Team-change log loss, with estimates held fixed</td><td>0.67799</td><td>0.67926</td></tr>
  </tbody></table>
  <p>Race forecasts improved slightly and timing predictions improved more substantially. The timing reductions are relative to the previous ratings’ errors. Resampling whole seasons estimates how much the comparison varies with the seasons included: the 95% interval for the race log-loss difference is approximately −0.00313 to −0.00009. It does not account for every choice made during model development.</p>
  <p><b>Team changes test whether the driver estimate carries to a new car.</b> We freeze estimates before a move and predict comparisons with new teammates. Performance was slightly worse, with an interval spanning improvement, no change and deterioration. This test did not establish better separation of driver and car.</p>
  <p>Ratings also moved more between appearances across the evaluation, making the estimates less stable. In simulations with known driver and car strengths, recovery was mixed. When a driver had a lasting advantage in one particular car, uncertainty bars could be too narrow to cover the true differences reliably.</p>
  <p>We retained the joint model for its unified treatment of the evidence and competitive forecasts. The transfer and simulation results leave the division of credit uncertain.</p>
  <details><summary>Evaluation periods, intervals and movement</summary>
    <p>The replay starts in 1994, warms up through 2001 and selects shared model settings from predictions in 2002–2007. Evaluation blocks are 2008–2011, 2012–2015, 2016–2020 and 2021–2025; each block’s calibration uses earlier years. From 2026, production calibration refreshes annually using years before the new bundle begins.</p>
    <p>Timing errors use fixed common comparison targets. The qualifying mean absolute error changes from 0.008170 to 0.006468 and race pace from 0.007010 to 0.005939, as fractions of lap time. Brier scores, the mean squared errors of outcome probabilities, supply an additional forecast check. <a class="cite" href="#" data-jump="ref-6">[6]</a></p>
    <p>The transfer study includes 51 matched moves. Driver estimates and their covariance are frozen before the last old-team weekend, then assessed against new teammates over the first five and ten appearances. The targets combine which driver was quicker in qualifying and race pace with normal-finisher order. Calibration uses earlier frozen comparisons between drivers who stayed with their teams. This is a different test from the all-field race-result score. Its log-loss difference is +0.001271, with a paired move-resampling interval of approximately −0.02419 to +0.02336.</p>
    <p>In the original field-centred evaluation, the 90th-percentile overall rating change rose from 2.406 to 3.570 points. Dividing movement by field spread gives a ratio of 1.239, an increase of about 24%. The current gradual display reference changes chart levels and dated changes; it leaves the fitted model and forecasts intact.</p>
  </details>
  <details><summary>Why there is no additional recent-form estimate</summary>
    <p>Later comparisons tested an external form correction and a joint slow/fast decomposition. Race-result log loss was 0.53012 without form, 0.53114 with external form and 0.52976 with embedded form. The embedded improvement was below the declared 0.001 adoption threshold, and its season-resampled interval included zero. The total ratings also moved substantially more.</p>
    <p>Reweighting all six driver and car strengths, circuit interactions, nonlinear additions and another calibration stage did not justify extra complexity. The retained grid correction uses additional information without revising the underlying strengths.</p>
  </details>
  <div id="methodologyValidationSummary" class="note"></div>
</section>

<section id="method-limits" class="method-part">
  <h3>9. Keep the estimates within their scope</h3>
  <p>The ratings describe repeatable competitiveness in the available observations. They cannot isolate innate talent from every effect of equipment, strategy, opportunity or adaptation. The lap filters restrict which racing conditions the pace evidence represents. The finishing-order update learns only from drivers who finish without retiring.</p>
  <p>The uncertainty is approximate and conditional on the observation model, its shared-car assumption and fixed settings. It does not include every error caused by those choices. Pairwise chances alone do not give the probability of each possible full finishing order or race winner.</p>
  <p>The site publishes saved, dated estimates from the same numerical implementation used in the study. A source fingerprint identifies the inputs and calculation behind the current publication:</p>
  <p id="methodologyPublication"></p>
  <details><summary>Reproducing the calculation</summary>
    <p>In the repository, <code>research/retrospective-refit/retrospective_refit.py</code> fits the historical trajectory, and <code>packages/core/node/unified-evidence.mjs</code> prepares observations and <code>packages/core/python/unified_model.py</code> updates strengths. The adjacent <code>unified_calibration.py</code> and <code>unified_grid.py</code> fit the forecast mappings. <code>packages/core/node/build-unified.mjs</code> publishes dated model files; <code>packages/core/src/unified/</code> computes browser forecasts.</p>
    <p><code>site/js/rating-reference.js</code> applies the display translation, with dated references saved in <code>data/rating-reference.json</code>. The original protocol and results are in <code>research/unified-ratings/</code>; subsequent form and grid comparisons are in <code>research/unified-form/</code>. The site reads the saved model rather than fitting another set of ratings.</p>
  </details>
</section>

<section id="method-references" class="method-part">
<h3>10. Sources and further reading</h3>
<p>The references below explain the statistical background and data used in this page and in Insights. Evidence for this implementation comes from the project’s code and validation reports; the background papers do not validate its driver–car estimates.</p>
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

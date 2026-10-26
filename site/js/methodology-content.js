// The text of the Methodology page, as HTML. Formulas are LaTeX inside `.math` (inline) and `.math.block` (display), typeset by KaTeX in methodology-view.js.
// `{{name}}` is replaced by a value from the shipped presets, so the numbers on the page cannot drift from the model: `{{r.x}}` and `{{q.x}}` are the
// race and qualifying state-space settings, `{{link.x}}` and `{{adapt.x}}` the cross-session link and the arrival-adaptation option, `{{hybrid.x}}` the published blend, and the rest come from the
// scoring and reliability settings (presets/model-settings.js) and from presets/state-space-fit.js. Elements with an id are filled from the loaded model by methodology-view.js.
//
// Keep this explanation in step with packages/core/src/state-space/{filter,qualifying-link,build}.js,
// packages/core/src/hybrid/, observations.js, forecast/form.js and docs/metrics.md.

export const CONTENT_HTML = String.raw`
<section id="method-overview" class="method-part">
  <h3>1. Overview</h3>

  <h4>The problem</h4>
  <p>
    The stopwatch sees a driver in a car. It cannot label which part of a quick lap came from the person and which came from the machine. We can learn something about the split because teammates share a car,
    because the same driver appears with different teammates and sometimes with different teams, and because qualifying and race pace are two observations of related skills.
    The ratings are an estimate of that hidden split, rather than a rearrangement of championship points. This page builds the estimate one step at a time.
  </p>
  <ol>
    <li><b>A driver rating and a car rating</b>, in the same units, after every weekend.</li>
    <li><b>An approximate uncertainty</b> for each rating, with its limits stated where it appears.</li>
    <li><b>A test against future results.</b> Before reading a weekend, we ask what the existing ratings would have predicted.</li>
  </ol>

  <h4>Formula 1 in one paragraph</h4>
  <p>
    A Grand Prix weekend has a <b>qualifying</b> session, knockout rounds (Q1, Q2, Q3) in which each driver sets their fastest lap and the order sets the <b>starting grid</b>, and a <b>race</b> of roughly 50 to 70 laps. About ten teams
    (<b>constructors</b>) each build a car and enter two drivers in it. A driver can <b>retire</b> (not finish) through a mechanical failure or an accident, and the official finishing status says which. Pit stops, tyre choices and <b>safety cars</b> (laps behind a slow
    pace car after an accident) shape the order in ways that have little to do with pace. Until 2009 cars were refuelled during the race, which changed strategy. Teams are sometimes renamed or sold.
  </p>

  <h4>The approach in one paragraph</h4>
  <p>
    We turn each weekend into comparisons between pairs of drivers. A probabilistic rule converts a difference in hidden pace into a chance that one driver beats another. Two filters follow driver and car pace through time, one for qualifying and one for races <a class="cite" href="#" data-jump="ref-3">[3]</a><a class="cite" href="#" data-jump="ref-4">[4]</a>. The race filter uses the qualifying estimate as an input. A separate online learner also reads race comparisons. Fixed weights combine their portable driver and car estimates. The order of operations matters: predict the weekend first, then use it to update the ratings.
  </p>

  <!--DIAGRAM-->

  <h4>The numbers you will see</h4>
  <dl class="glossary">
    <dt>Rating</dt>
    <dd>
      Estimated underlying pace, on a scale where 1,000 is the average of those racing that weekend and higher is faster. A driver's rating aims to capture the part that travels with them between cars; a car's rating captures the car contribution. A particular driver–car fit is kept separate. (Part 3)
    </dd>
    <dt>Uncertainty</dt>
    <dd>An approximate standard deviation carried over from the joint filter. It does not include all uncertainty in the hybrid blend. (Part 3)</dd>
    <dt>Combined pace</dt>
    <dd>Race pace and qualifying pace together, weighted towards the race. (Part 3)</dd>
    <dt>Package pace</dt>
    <dd>A driver’s combined pace plus their car’s: what the pairing could do together. (Part 3)</dd>
    <dt>Effective pace</dt>
    <dd>Combined pace, lowered by how often the driver or the car fails to finish, so that a quick but fragile entry ranks lower. (Part 3)</dd>
    <dt>Recent form</dt>
    <dd>How the last few races compare with the rating. The forecast model uses it; the ratings panel can show it as an adjustment. (Part 4)</dd>
    <dt>Win probability</dt>
    <dd>The chance that one driver finishes ahead of another, on the Head to head page. (Part 4)</dd>
    <dt>Forecast error</dt>
    <dd>The log-loss of past forecasts. A coin flip scores 0.693; lower is better. (Part 5)</dd>
  </dl>

  <h4>Notation</h4>
  <p>
    <span class="math">D_i</span> means the underlying level of driver <span class="math">i</span>; <span class="math">C_c</span> means the car level for team <span class="math">c</span>; <span class="math">A_i</span> is the driver's temporary fit with that car; and <span class="math">c(i)</span> identifies their team on this weekend. The superscripts <span class="math">R,Q,O</span> identify the race filter, qualifying filter and online learner. All levels use <b>rating points</b>. We write <span class="math">\sigma(u)=1/(1+e^{-u})</span> for the logistic curve and <span class="math">N(m,v)</span> for a bell-shaped distribution with mean <span class="math">m</span> and variance <span class="math">v</span>. A variance is a squared uncertainty; its square root is the standard deviation, in rating points.
  </p>
</section>

<section id="method-data" class="method-part">
  <h3>2. Data</h3>

  <h4>What goes in</h4>
  <p>
    Seven public tables: race results, qualifying results, the race calendar, drivers, constructors, finishing statuses, and lap times (circuits are optional).
    They cover every Grand Prix weekend from 2000 and come from the open collection TracingInsights/RaceData <a class="cite" href="#" data-jump="ref-17">[17]</a>, which lists Jolpica-F1 <a class="cite" href="#" data-jump="ref-18">[18]</a> and two Kaggle datasets <a class="cite" href="#" data-jump="ref-19">[19]</a> among its sources.
    The ratings are computed from them in advance, when the site is published, and the site shows the result. Their licences, and what that means for how the ratings may be used, are on the <a href="#/about">About page</a>.
    The model reads the weekends in date order and keeps no information from the future: a rating shown for a weekend uses that weekend and earlier ones only.
  </p>

  <h4>Why the model compares pairs</h4>
  <p>
    A finishing position depends on the size of the field, on who retired and on who started where; a comparison between <i>two</i> drivers does not. Every update therefore starts from pairs. For two drivers
    <span class="math">x,y</span> in the same session an observation is an outcome <span class="math">o_{xy}\in\{0,1\}</span> (1 if <span class="math">x</span> was ahead) and a weight <span class="math">w_{xy}</span>.
    A pair of teammates says almost purely something about the drivers, since the car is shared; a pair from different teams says something about the two packages.
  </p>

  <h4>The four kinds of observation</h4>
  <p>
    <b>Finishing order.</b> For two classified finishers with positions <span class="math">p_x\lt p_y</span> the outcome is <span class="math">o_{xy}=1</span>, the gap is <span class="math">g=p_y-p_x</span>, and the base weight is
    <span class="math">b=\omega_{\text{ord}}={{orderW}}</span>.
  </p>
  <p>
    <b>Lap pace.</b> A finishing order is blurred by traffic, pit stops, safety cars and strategy, and says nothing about how much faster one car was; lap times do. Lap 1 is dropped. For each driver, laps slower than 1.05 times
    their own best are discarded (pit laps, safety cars). The rest are grouped into windows of 8 race laps, <span class="math">k=0,1,\dots</span>; <span class="math">m_{ik}</span> is the median of driver <span class="math">i</span>’s kept
    laps in window <span class="math">k</span>, based on <span class="math">n_{ik}</span> laps. A driver needs at least 3 kept laps to be compared. Two drivers are compared window by window, only where both ran the same window with
    <span class="math">n\ge 2</span>, so that fuel load and track state roughly match:
  </p>
  <div class="math block">\Delta_{xy}=\frac{\sum_k \min(n_{xk},n_{yk})\,\bigl(m_{yk}-m_{xk}\bigr)}{\sum_k \min(n_{xk},n_{yk})},\qquad o_{xy}=\mathbb{1}[\Delta_{xy}\gt 0].</div>
  <p>
    The shared windows must hold at least 4 laps; if they do not, the two drivers’ overall medians are compared instead. The base weight is
    <span class="math">b=\omega_{\text{pace}}\cdot\operatorname{clip}(\ell_{xy}/16,\,0.25,\,1)</span> with <span class="math">\omega_{\text{pace}}={{paceW}}</span> and <span class="math">\ell_{xy}</span> the number of shared laps
    (the smaller of the two drivers’ lap counts when the overall medians are used, over 8).
  </p>
  <p>
    <b>Retirements.</b> A driver who stops early would otherwise vanish from the data or be ranked last as if they had been slow. A driver without enough laps for the pace comparison is compared at the lap
    <span class="math">\ell</span> on which they stopped, against everyone’s position on that lap; the gap <span class="math">g</span> is the difference in positions. The base weight falls with how early they stopped:
    <span class="math">b=(\ell/L_{\max})^{\beta_r}</span> with <span class="math">\beta_r={{partialExp}}</span>, where <span class="math">L_{\max}</span> is the winner’s lap count. Why a driver stopped is tracked separately (Part 3).
  </p>
  <p>
    <b>Qualifying.</b> For each pair, the latest session in which both set a time (Q3, else Q2, else Q1) decides <span class="math">o_{xy}=\mathbb 1[t_x\lt t_y]</span>. A missing time is treated as a disrupted session, never guessed to be a
    crash or a failure.
  </p>

  <h4>How much a pair is worth</h4>
  <p>
    A win by a minute is better evidence than a win by a tenth, but with diminishing returns: one bad race should not dominate. A pair’s evidence grows with the size of the gap and saturates, with
    <span class="math">\alpha={{alpha}}</span> and <span class="math">\kappa={{cap}}</span>:
  </p>
  <div class="math block">
    \begin{aligned}
    \gamma_{xy}&=\min\!\Bigl(\kappa,\;1+\alpha\log_2 g\Bigr) &&\text{(finishing order and retirements)}\\[4pt]
    \gamma_{xy}&=\min\!\Bigl(\kappa,\;1+\alpha\log_2\bigl(1+\tfrac{|\Delta|}{0.3}\bigr)\Bigr) &&\text{(pace; gap in seconds per lap)}\\[4pt]
    \gamma_{xy}&=\min\!\Bigl(\kappa,\;1+\alpha\log_2\bigl(1+\tfrac{|t_x-t_y|}{0.25}\bigr)\Bigr) &&\text{(qualifying; gap in seconds)}
    \end{aligned}
  </div>
  <p>
    The weight a pair carries when the model is <i>scored</i> (Part 5) is <span class="math">w_{xy}=b\,\gamma_{xy}\,\tau_0^{[c(x)=c(y)]}</span> with <span class="math">\tau_0={{tmBoost}}</span> for a pair of teammates, because those pairs are the cleanest
    test of a driver. These scoring weights are fixed: they define the exam, so no search can improve a score by changing the exam. The weights the model uses to <i>learn</i> are allowed to differ (Part 3).
  </p>
  <p>
    For a concrete example, two teammates finishing two places apart have <span class="math">\gamma=1+{{alpha}}\log_2(2)=1.55</span>. Their finishing-order score weight is <span class="math">{{orderW}}\times1.55\times{{tmBoost}}=148.8</span>. The same gap between different-team drivers has weight 18.6. Neither number says the teammate result is 8 times as likely to be correct; it says the evaluation deliberately gives that cleaner driver comparison more influence.
  </p>
</section>

<section id="method-ratings" class="method-part">
  <h3>3. Ratings</h3>

  <h4>A rating is a number whose differences are odds</h4>
  <p>
    Give each entry a positive strength weight <span class="math">a_i=10^{S_i/s}</span>. If x and y meet and each receives a share of the win chance proportional to that weight, then <span class="math">p_{xy}=a_x/(a_x+a_y)</span>. Dividing the numerator and denominator by <span class="math">a_x</span> produces the <b>Bradley–Terry</b> probability <a class="cite" href="#" data-jump="ref-1">[1]</a>:
  </p>
  <div class="math block">\Pr(o_{xy}=1)=\sigma_s\bigl(S_x-S_y\bigr),\qquad \sigma_s(u)=\frac{1}{1+10^{-u/s}}=\sigma(k\,u),\qquad k=\frac{\ln 10}{s}.</div>
  <p>
    Equal strengths give 50%. A lead of <span class="math">s</span> points gives 10:1 odds (91%), a lead of <span class="math">2s</span> gives 100:1. The unit is arbitrary and the zero is too: only differences mean anything, so every rating on the site is
    quoted relative to the field of that weekend, with the average of the entrants set to 1,000. Comparing a rating from 2005 with one from 2020 is a thought experiment, not a measurement.
  </p>
  <p>
    With the chosen <span class="math">s={{r.s}}</span>, a 30-point gap means odds of <span class="math">10^{30/75}\approx2.51</span> to 1, or about 71.5%. The logarithm in the exponent is why rating <i>differences</i> add: a 20-point A–B gap and a 10-point B–C gap imply a 30-point A–C gap, before uncertainty is considered.
  </p>
  <figure class="method-figure">
    <div class="method-figure-box" id="methodologyOddsChart"></div>
    <figcaption>The odds curve. A lead of {{scale}} points is worth 91% and a lead of {{scale2}} points is worth 99%; the curve is steepest where the contest is close.</figcaption>
  </figure>

  <h4>A strength made of parts</h4>
  <p>In Formula 1 a competitor is a driver in a car, so the strength is built from parts,</p>
  <div class="math block">S_i \;=\; D_i + A_i + C_{c(i)} ,</div>
  <p>
    the driver’s own level <span class="math">D_i</span>, the level <span class="math">C_c</span> of their car, and a driver–car fit <span class="math">A_i</span> (some drivers are better in one car than another for reasons that belong to neither alone:
    set-up preferences, braking style against a car’s balance, a team’s way of working; this is zero when a driver arrives at a team and persists while they stay). For two teammates <span class="math">c(x)=c(y)</span>, the car cancels in
    <span class="math">S_x-S_y</span>, so those pairs measure only drivers. Pairs from different cars measure whole packages.
  </p>
  <p>
    The data alone cannot split a package. Adding <span class="math">\delta</span> to both drivers of a team and subtracting <span class="math">\delta</span> from its car changes no probability. What decides the split is stated as a prior assumption
    (a car is expected to change more than a driver), plus the evidence of drivers who move: a driver’s level goes with them, so a new car is measured against a driver whose level is already known. Everything else in this part is
    about doing that split as honestly as possible, and saying how well it worked.
  </p>
  <figure class="method-figure method-interactive">
    <div id="methodologySplitLab"></div>
    <figcaption>Move the slider. The same two package paces admit many driver/car splits. Teammate evidence fixes the gap between drivers; a move to another car helps locate the car level.</figcaption>
  </figure>
  <h4>How a career creates a network of evidence</h4>
  <p>
    A teammate result is a link between two drivers. When one of those drivers later shares a car with someone else, the links form a path. For example, if A is roughly 20 points ahead of B and B is roughly 10 ahead of C, A is roughly 30 ahead of C even if they never raced as teammates. That is <b>transitivity</b>, but it is uncertain: both links are noisy, so the indirect comparison is less precise than a direct one. A driver who has only one teammate in an isolated team is correspondingly hard to place.
  </p>
  <p>
    The teaching graph turns a small win–loss record into an edge label with <span class="math">g_{xy}=s\log_{10}[(W_{xy}+1)/(L_{xy}+1)]</span>. The added ones keep an undefeated record from implying infinite strength: 7 wins and 3 losses give <span class="math">75\log_{10}(8/4)\approx23</span> points. That is only a way to read this illustration. The actual filters and online learner update from individual dated comparisons, with their weights and uncertainties, rather than inserting a career win percentage. If <span class="math">g_{AC}=g_{AB}+g_{BC}</span>, its variance is <span class="math">v_{AC}=v_{AB}+v_{BC}+2\operatorname{Cov}(g_{AB},g_{BC})</span>; links can be correlated, which is why a full covariance is useful.
  </p>
  <figure class="method-figure method-interactive">
    <div id="methodologyCareerGraph"></div>
    <figcaption>An illustrative career network, revealed in date order. The labels are smoothed pair scores from a small teaching example, not measured F1 results. The model learns these connections by updating shared driver and car states after each weekend; it does not insert a separate career-score feature.</figcaption>
  </figure>
  <p>
    The <a href="#/graph">Graph page</a> shows the measured network at any selected weekend. It uses a separate teammate-only scale so you can see what this evidence says on its own. Each shared weekend can add a qualifying comparison from the last session both drivers entered and a race comparison if both have a classified finishing place. Qualifying laps at least 2.5 seconds apart are set aside as poor evidence of their usual pace. The qualifying comparison comes from lap time, so a grid penalty does not turn a quick lap into a loss. A race win counts 1.5 and a qualifying win counts 1. For a link from driver <span class="math">a</span> to <span class="math">b</span>, call their weighted wins <span class="math">W_{ab}</span> and losses <span class="math">L_{ab}</span>.
  </p>
  <div class="math block">g_{ab}=75\log_{10}\frac{W_{ab}+1}{L_{ab}+1},\qquad w_{ab}=\frac{\min(W_{ab}+L_{ab},60)}{8},\qquad \min_{z}\left[\sum_{(a,b)}w_{ab}(z_a-z_b-g_{ab})^2+\sum_a z_a^2\right].</div>
  <p>
    The first formula turns the record into a link gap; the added ones keep a short or unbeaten record finite. The second gives a link more say as comparisons accumulate, up to a cap so one very long partnership cannot overwhelm the rest of the graph. The final expression finds one level <span class="math">z_a</span> per driver: it rewards levels whose differences agree with the links and pulls poorly connected drivers toward zero. The displayed score is <span class="math">1000+z_a</span>. Separate groups of drivers have no observed path between them, so their relative height comes only from that common prior. The horizontal coordinate is the average year of that driver's starts through the selected weekend. Only weekends up to that date enter any of these quantities. This score explains what the teammate network says by itself; the published rating also uses qualifying, race pace, different-car comparisons and the dated model described below.
  </p>

  <h4>Beliefs, and how they move in time</h4>
  <p>
    Instead of a single number, the model keeps a <b>belief</b> about every level: a Gaussian with a mean (the rating) and a variance (the uncertainty), and a <b>covariance</b> between levels. A Gaussian is a tractable approximation to many small sources of variation, not a claim that real pace has a perfect bell-shaped distribution. A driver and their car are estimated together: if their package was fast, overestimating the driver often means underestimating the car. Their covariance records that trade-off. The package can therefore be known better than either part.
  </p>
  <p>
    Levels are not constant. Cars are developed during a season and rebuilt over the winter; drivers improve, age and change. A rating that never moved would be wrong within a year; one that jumped on every result would be noise. A state-space model
    makes the compromise explicit: each level starts from a prior, drifts by a stated amount between weekends, and is unsure about whatever it has not seen lately.
  </p>
  <ul>
    <li>
      <b>Priors.</b> <span class="math">D_i\sim N(0,\sigma_D^2)</span> with <span class="math">\sigma_D={{r.sdD}}</span>, or <span class="math">\sigma_{\text{new}}={{r.sdNew}}</span> for a driver’s first appearance;
      <span class="math">C_c\sim N(0,\sigma_C^2)</span> with <span class="math">\sigma_C={{r.sdC}}</span>. Cars are allowed to differ from the average by more than drivers, because they do.
    </li>
    <li>
      <b>Within a season</b> a car drifts: <span class="math">C_c\leftarrow C_c+\varepsilon</span>, <span class="math">\operatorname{sd}(\varepsilon)={{r.raceC}}</span> per weekend (development). A driver’s race level does not drift between weekends.
    </li>
    <li>
      <b>Over the winter</b> a car is partly rebuilt and a driver’s level moves a little: <span class="math">C_c\leftarrow\rho\,C_c+\eta</span> with <span class="math">\rho={{r.rho}}</span>,
      <span class="math">\operatorname{sd}(\eta)={{r.winterC}}</span>; <span class="math">D_i\leftarrow D_i+\xi</span>, <span class="math">\operatorname{sd}(\xi)={{r.yearD}}</span>. The pull towards the average
      (<span class="math">\rho\lt1</span>) says that last year’s advantage is only partly kept when the regulations or the team change.
    </li>
    <li>
      <b>A new driver</b> (first seen after the first season of data) starts at zero latent level, with a race-residual prior spread of {{r.sdNew}} points and a qualifying prior spread of {{q.sdNew}} points. Zero is the prior centre, not a promise of average field pace after ratings are recentered. Qualifying also carries a temporary debut adjustment,
      <span class="math">A_i\leftarrow-{{q.dipR}}</span> with spread <span class="math">{{q.sdR}}</span>, fading by a factor <span class="math">{{q.rhoR}}</span> each weekend. The race filter has no such debut adjustment. For a driver's first five races, the ratings panel marks the estimate as provisional (“new”).
    </li>
    <li>
      <b>A team that only changes its name</b> (Racing Point to Aston Martin, Toro Rosso to AlphaTauri to RB) keeps its car: <span class="math">C_c</span> carries on under the new name. After a takeover by a new owner (Jaguar to Red Bull, Honda to Brawn,
      Sauber to Audi) the car starts again from the prior, because a new owner changes the car.
    </li>
    <li>
      <b>A driver who changes team</b> gets a small jump in level, <span class="math">D_i\leftarrow D_i+\zeta</span> with <span class="math">\operatorname{sd}(\zeta)={{r.sdJ}}</span> in the race and <span class="math">{{q.sdJ}}</span> in qualifying
      (qualifying levels do move with the car), and their fit <span class="math">A_i</span> restarts at zero.
    </li>
  </ul>

  <p>Two pictures show what these choices do. First, how sure the model is of a driver as their career grows:</p>
  <figure class="method-figure">
    <div class="method-figure-box" id="methodologyUncertaintyChart"></div>
    <figcaption>
      The error bar of a rating against the number of races the driver has driven, over every driver since 2000 (the band holds the middle 8 in 10). A debutant starts near ±20 points and learns fast over the first ten races,
      but the error bar settles at about ±15 and never reaches zero, because pace keeps drifting: what was learnt a year ago is only partly true today.
    </figcaption>
  </figure>
  <p>Second, one rating through time, with its error band:</p>
  <figure class="method-figure">
    <div class="method-figure-box" id="methodologyTimelineChart"></div>
    <figcaption id="methodologyTimelineCaption">
      The published rating after each of the last 48 weekends, with the joint filter’s approximate standard deviation either side. It does not yet include uncertainty from blending the online learner.
    </figcaption>
  </figure>

  <h4>Learning from a weekend</h4>
  <p>
    Before reading a weekend, the filter has a prior belief: mean vector <span class="math">m</span> and covariance matrix <span class="math">P</span> for all current driver, car and fit levels. A diagonal entry of <span class="math">P</span> is one level's variance; an off-diagonal entry records how two levels have become linked by their shared history. For a pair, let <span class="math">e_{xy}</span> select x's driver, fit and car with +1 and y's with −1. Its predicted gap is <span class="math">e_{xy}^{\top}m</span>, plus any known qualifying input. Bayes' rule says to find levels that balance the old belief against the weekend's evidence:
  </p>
  <div class="math block">\log p(z\mid\text{weekend})=\text{constant}-\tfrac12(z-m)^\top P^{-1}(z-m)+\sum_{xy}\omega_{xy}\left[o_{xy}\log p_{xy}+(1-o_{xy})\log(1-p_{xy})\right].</div>
  <p>
    The first term penalises implausibly large moves from the prior. The sum rewards levels that assign higher probability to the observed comparisons. Its pair weight is
  </p>
  <div class="math block">\omega_{xy}=\tau\;u_{xy}\;\theta^{[c(x)=c(y)]}\;m_{\text{src}},\qquad u_{xy}=\frac{w_{xy}}{\tau_0^{[c(x)=c(y)]}},</div>
  <p>
    Here <span class="math">w_{xy}</span> is the fixed scoring weight from Part 2. We remove its teammate factor <span class="math">\tau_0</span> before learning, then apply the learner's factor <span class="math">\theta={{r.thetaT}}</span>. The multiplier <span class="math">\tau={{r.tau}}</span> tempers the whole weekend: 20 drivers produce 190 pairs, yet a single safety car or tyre choice can affect many of them at once. Treating all pairs as independent would make the filter too certain. The source multiplier is 1 for finishing order, {{r.mPace}} for lap pace, and {{r.mPart}} for retirement snapshots. This lets repeated lap evidence influence learning differently from the weights used to define the evaluation score.
  </p>
  <p>
    For one pair, the derivative of log likelihood with respect to its gap is <span class="math">k(o-p)</span>. That is the correction signal: a surprise has a large <span class="math">|o-p|</span>. Its curvature is <span class="math">k^2p(1-p)</span>; a near-50/50 pair is more informative about a small change in the gap than an almost certain one. Summing the weighted derivatives gives the weekend gradient <span class="math">g</span> and information matrix <span class="math">J</span>:
  </p>
  <div class="math block">
    g=\sum_{xy}\omega_{xy}\,k\,(o_{xy}-\hat p_{xy})\,e_{xy},\qquad
    J=\sum_{xy}\omega_{xy}\,k^{2}\,\hat p_{xy}(1-\hat p_{xy})\,e_{xy}e_{xy}^{\top},
  </div>
  <p>
    The exact posterior is not bell-shaped. The filter approximates it near its most likely value with a Gaussian (a Laplace or extended-Kalman step <a class="cite" href="#" data-jump="ref-5">[5]</a>). Let <span class="math">a</span> denote the levels active this weekend. At each of {{r.iters}} iterations, it solves the following local update, recalculating <span class="math">g</span> and <span class="math">J</span> at the current estimate <span class="math">\mu_a</span>:
  </p>
  <div class="math block">\mu=m+P_{\cdot a}(I+JP_{aa})^{-1}\bigl[g+J(\mu_a-m_a)\bigr],\qquad P'=P-P_{\cdot a}(I+JP_{aa})^{-1}JP_{a\cdot}.</div>
  <p>
    <span class="math">P_{aa}</span> is the covariance block for this weekend's active levels; <span class="math">P_{\cdot a}</span> connects them to every stored level. The matrix inverse balances new evidence against prior uncertainty. Thus a result can change an absent driver's estimate if their past overlap created covariance with a current driver. The covariance update reduces uncertainty where the result supplies information, while leaving linked uncertainties correlated.
  </p>
  <ul>
    <li>
      <b>Everything is estimated jointly, with the full covariance.</b> A result moves both the driver and the car, and it moves the other drivers and cars that share a history with them.
    </li>
    <li>
      <b>No look-ahead.</b> Every weekend’s pairs are <i>forecast</i> from <span class="math">m</span> and <span class="math">P</span> before this step, so nothing from a weekend is used to forecast it, and a rating after a weekend uses only that
      weekend and earlier ones. Tests check this by changing every later result and verifying that nothing earlier moves.
    </li>
    <li>
      <b>Numerical safeguards.</b> The covariance update reads columns of <span class="math">P</span> from a copy taken before the update (otherwise <span class="math">P</span> can turn indefinite), and an iteration that would raise the negative log
      posterior is halved until it does not. Entities not seen for {{window}} weekends (about five seasons) stop carrying correlations with others, which keeps the update fast.
    </li>
  </ul>

  <h4>Why qualifying informs race pace</h4>
  <p>
    A race is long enough for tyre wear, traffic and strategy to obscure speed. A qualifying lap offers a different, usually cleaner view of the same driver and car. The qualifying filter estimates its own driver and car levels from timed qualifying pairs. The race filter then treats part of those levels as <i>known inputs</i> and learns the remaining race-specific pace:
  </p>
  <div class="math block">S_i^R=\underbrace{\beta D_i^Q+D_i^{R,\mathrm{res}}}_{\text{driver}}+\underbrace{\gamma C_{c(i)}^Q+C_{c(i)}^{R,\mathrm{res}}}_{\text{car}}+A_i,\qquad \beta={{link.beta}},\quad\gamma={{link.gamma}}.</div>
  <p>
    The word <i>residual</i> means “what race observations still need to explain after the qualifying contribution.” For example, a 20-point qualifying driver level contributes 8 race points when <span class="math">\beta=0.4</span>; the race observations can then move the residual up or down. This link is valuable when race evidence is sparse. For a forecast, the qualifying inputs stop at the <i>end of the preceding weekend</i>. For the rating posted after a weekend, that weekend's qualifying may be used: it was already known by race time. This distinction prevents the starting grid from leaking into a pre-weekend ratings test.
  </p>

  <h4>Why fit stays inside the model</h4>
  <p>
    Some performance belongs to the pairing rather than permanently to either side. The race filter gives that effect its own level <span class="math">A_i</span>, initially zero with a {{r.sdA}}-point prior spread. It persists by a factor {{r.rhoA}} per weekend while the pairing continues and restarts at a new team. The portable race-filter output is <span class="math">D_i^R=D_i^{R,\mathrm{res}}+\beta D_i^Q</span>; the fit is excluded. The race-filter car output is <span class="math">C_c^R=C_c^{R,\mathrm{res}}+\gamma C_c^Q</span>. A driver therefore carries their own level when changing cars, while the model can still assign a persistent mismatch with one car to fit.
  </p>
  <p>
    A team change does widen the race filter's uncertainty in the driver's level by {{r.sdJ}} points, because its old evidence may transfer imperfectly. It does not insert an expected speed gain or loss: the explicit arrival offset is {{adapt.state}}. Qualifying uses a wider {{q.sdJ}}-point change uncertainty. These are assumptions about <i>uncertainty</i>, distinct from changing a driver's mean rating because they moved.
  </p>

  <h4>The published hybrid: three driver signals, two car signals</h4>
  <p>
    The two filters and an online comparison learner each provide a driver level in the same units. Call them <span class="math">D^R,D^Q,D^O</span>. The two filters also provide car levels <span class="math">C^R,C^Q</span>. The site publishes a fixed weighted average:
  </p>
  <div class="math block">D^{\rm pub}=(1-{{hybrid.rankingDriverShare}})\bigl[(1-{{hybrid.qualifyingDriverShare}})D^R+{{hybrid.qualifyingDriverShare}}D^Q\bigr]+{{hybrid.rankingDriverShare}}D^O
    =0.48D^R+0.32D^Q+0.20D^O,\qquad C^{\rm pub}=(1-{{hybrid.qualifyingCarShare}})C^R+{{hybrid.qualifyingCarShare}}C^Q.</div>
  <p>
    The weights add to one for each entity, so the unit remains rating points. The race filter carries the largest share because it sees both race and qualifying evidence and estimates the driver/car split jointly. The qualifying level adds a clean one-lap signal; the online level contributes a differently regularised reading of race pairs. The car blend remains mostly a race measure. The same weights apply to every driver, car and date. For a pre-weekend forecast, the formula uses the levels available before that weekend; for the posted rating, it uses the levels after the update. The separately shown qualifying rating is still the qualifying filter output.
  </p>
  <p>
    The online learner writes a strength as <span class="math">s_i=d_i+c_{c(i)}+a_{i,c(i)}+\mathbb{1}_{\rm wet}u_i</span>: portable driver level, car, fit with that car, and a driver-specific wet term when relevant. Its pair probability is <span class="math">p_{xy}=\sigma((\ln 10/{{r.s}})(s_x-s_y))</span>. Only <span class="math">d_i</span> becomes <span class="math">D^O</span>. The other terms stop a strong car, a particular pairing, or wet conditions from automatically becoming a permanent driver advantage.
  </p>
  <div class="math block">G_j=\frac{\sum_{xy} w_{xy}^{O}(o_{xy}-p_{xy})\,e_{xy,j}}{\sum_{xy} w_{xy}^{O}},\qquad z_j\leftarrow\operatorname{clip}\!\bigl((1-\lambda_j)z_j+{{hybrid.ranking.learningRate}}G_j,-200,200\bigr).</div>
  <p>
    Here <span class="math">z_j</span> is any active coefficient, <span class="math">e_{xy,j}</span> is +1 if it belongs to x, −1 if it belongs to y, and zero otherwise. An upset has <span class="math">o-p</span> large and causes a larger correction; a result already expected causes little change. Teammate evidence receives {{hybrid.ranking.teammateWeight}} times its ordinary learning weight, and the denominator prevents a weekend with many correlated pairs from taking a proportionally huge step. The shrinkage <span class="math">\lambda_j</span> is {{hybrid.ranking.fitPenalty}} for fit and {{hybrid.ranking.levelPenalty}} for other active terms. Across winter, driver levels retain {{hybrid.ranking.driverWinterRetention}}, car levels {{hybrid.ranking.carWinterRetention}}, and fits 0.4 of their value. The rule does not change for movers; only the fit key changes with the car.
  </p>
  <p>
    The blend is an empirical combination of correlated estimates, not a single Bayesian posterior. Its fixed shares were chosen from dated forecast tests, including driver transfers. They are useful as a predictive rule; they do not imply that the three sources are independent measurements.
  </p>

  <h4>From beliefs to the published numbers</h4>
  <p>
    <b>Uncertainty.</b> A rating is a level relative to the field of that weekend, <span class="math">1000+(\text{level}_i-\overline{\text{level}})</span>, re-centred so that the entrants average 1,000. The bar on the ratings panel is an <i>approximation</i> carried over from the race filter’s covariance. For that filter alone, the standard deviation of a field-centred level uses the full covariance over the <span class="math">n</span> entrants:
  </p>
  <div class="math block">\operatorname{sd}_i=\sqrt{P_{ii}-\frac{2}{n}\sum_{j}P_{ij}+\frac{1}{n^{2}}\sum_{j,k}P_{jk}}\ .</div>
  <p>
    The hybrid keeps that covariance while blending the means. It does <b>not</b> propagate the qualifying and online learner uncertainties or their correlations into a new hybrid covariance, so the displayed bar is not a calibrated standard deviation of the final hybrid rating. Combined pace uses <span class="math">\sqrt{(1-w)^2\sigma_R^2+w^2\sigma_Q^2}</span>, treating its race and qualifying inputs as independent; that is also only approximate because the race filter reads qualifying.
    Even for the race filter alone, tempering a weekend’s pairs by <span class="math">\tau</span> leaves its bars too narrow by a factor of about {{r.sqrtVarInfl}}: over six races a driver’s rating revised by that many times the distance its bar said.
    The displayed race-filter variances are therefore multiplied by <span class="math">{{r.varInfl}}</span>, a scale fitted on 2002–2007 rating revisions. It has not been calibrated as the uncertainty of the complete blend. A mover's bar can look much like a stayer's even when transfer predictions are less reliable. Treat it as a rough guide to the filter's knowledge of a level, not a promise about its transfer to a new car.
  </p>
  <p>
    <b>Reliability and incidents.</b> Retirements are tracked separately from the ratings, because a retirement is mostly not about pace, and the cause matters: a failure belongs to the car, a collision partly to the driver. For each constructor
    (mechanical failures) and each driver (incidents) the model keeps decayed counts: <span class="math">\lambda</span>, the laps run, and <span class="math">f</span>, the attributed failures. A fixed table from finishing status to cause gives each retirement a
    mechanical weight and a driver weight. Each weekend, before adding new laps and events,
  </p>
  <div class="math block">(\lambda,f)\leftarrow\delta\,(\lambda,f),\qquad \delta=2^{-1/h},\qquad h=\text{half-life in races}\ ({{relHalf}}\text{ for cars, }{{incHalf}}\text{ for drivers}).</div>
  <p>The per-lap hazard is shrunk towards the field’s hazard <span class="math">q_F</span>, with <span class="math">n_0</span> laps of prior, so a car with little history is not judged on one failure:</p>
  <div class="math block">q=\frac{f+q_F\,n_0}{\lambda+f+n_0},\qquad n_0={{relPrior}}\ (\text{cars}),\ {{incPrior}}\ (\text{drivers}).</div>
  <p>
    The chance of getting through <span class="math">L</span> laps is <span class="math">(1-q)^L</span>; this is the “Survival” and “Clean race” column. To fold hazards into a pace probability, suppose A and B retire on any lap with probability
    <span class="math">q_A,q_B</span>, and <span class="math">p</span> is the chance A is faster when both finish. With <span class="math">a=1-q_A</span> and <span class="math">b=1-q_B</span>, a closed form for the chance that A finishes ahead follows by cases. The first term is both reaching the end with A faster; the second is A reaching the end while B does not;
    the rest counts the cases in which A retires, where A still counts as ahead only if B retired on an earlier lap (a tie on the same lap splits evenly), which is a geometric sum over the lap on which A retires:
  </p>
  <div class="math block">
    H(p,q_A,q_B,L)=a^{L}b^{L}\,p+a^{L}(1-b^{L})+(1-a^{L})-q_A\bigl(1-\tfrac12 q_B\bigr)\frac{1-(ab)^{L}}{1-ab}.
  </div>
  <p>
    <b>Combined, package and effective pace.</b> Race and qualifying are different skills measured differently, so combined pace is a blend for display, weighted towards the race, not a third rating; it falls back to the race rating until a driver or car has
    qualifying data. Package pace adds a driver and their car. <b>Effective pace</b> is the rating whose pace probability equals the hazard-adjusted chance of finishing ahead of an average entrant over <span class="math">L={{stdLaps}}</span> laps. For a driver
    <span class="math">q</span> is their incident hazard, for a car its failure hazard, and for a package <span class="math">q=1-(1-q_{\text{driver}})(1-q_{\text{car}})</span>.
  </p>
  <div class="math block">
    \text{Combined}=1000+(1-w)(R-1000)+w(Q-1000),\quad w={{qualWeight}};\qquad
    \text{Package}=1000+(\text{Combined}_{\text{driver}}-1000)+(\text{Combined}_{\text{car}}-1000);
  </div>
  <div class="math block">E=1000+s\log_{10}\frac{P}{1-P},\qquad P=H\bigl(\sigma_s(\text{Combined}-1000),\,q,\,q_F,\,L\bigr).</div>
</section>

<section id="method-forecasts" class="method-part">
  <h3>4. Forecasts</h3>

  <h4>From the ratings alone</h4>
  <p>
    For a pairing at the latest weekend, the hybrid supplies the mean <span class="math">\mu</span> of the gap <span class="math">S_A-S_B</span> (with one more weekend of filter drift added). The race filter supplies an approximate variance <span class="math">v</span>. The probability that A
    finishes ahead folds the uncertainty in, so that a gap that is known poorly is pulled towards 50%:
  </p>
  <div class="math block">\Pr(A\succ B)=\sigma\!\Bigl(\frac{c\,k\,\mu}{\sqrt{1+\tfrac{\pi}{8}k^{2}v}}\Bigr),\qquad c={{slopeRace}}\ (\text{race}),\ {{slopeQual}}\ (\text{qualifying}).</div>
  <p>
    The square root is the standard approximation to the expected value of a logistic function of a Gaussian gap, <span class="math">\mathbb E\,\sigma(k\Delta)\approx\sigma\bigl(k\mu/\sqrt{1+\pi k^{2}v/8}\bigr)</span>.
    The multiplier <span class="math">c</span> calibrates how strongly a point gap should affect real-world odds. It was fitted on dated 2002–2007 predictions. A value near one means the rating-point scale already gives approximately the right slope.
    This is the “ratings alone” figure on the Head to head page, and what the ratings backtest scores.
  </p>

  <h4>The forecast model</h4>
  <p>
    A rating is slow on purpose: it should say what a driver or car <i>is</i>, not how the last race went. A forecast benefits from fast information that the rating deliberately ignores, and from facts that are not about pace at all: the starting grid,
    retirement risk, the circuit. The forecast model adds these on top of the ratings and nothing else, so the Head to head page can show what the ratings say and what the forecast model says.
  </p>
  <ul>
    <li>
      <b>Recent form</b> is a set of fast trackers of how each driver and car has done lately, in three channels (qualifying gaps, lap-pace gaps, finishing order), each at a fast (0.6) and a slow (0.2) rate. After each weekend a driver’s result in a channel is
      compared with what their current form predicted, driver plus car. The team’s average miss goes mostly to the car, the driver gets a share of what is left, and a per-circuit residual is kept. Over the winter, car and circuit form shrink to 65%. Form is
      updated only after a weekend has been forecast.
    </li>
    <li>
      <b>Retirement risk.</b> The starting probability is the ratings’ pace probability mixed with the retirement risks of Part 3, with <span class="math">w={{hazardW}}</span>:
      <span class="math">p_0=(1-w)\,\sigma(c\,k\,g)+w\,H\bigl(\sigma(c\,k\,g),\,q_A,\,q_B,\,L={{stdLaps}}\bigr)</span>, where <span class="math">g</span> is the gap of driver plus car levels (including the fit term, since the forecast is about these two drivers in these cars).
    </li>
    <li>
      <b>Probability models.</b> Separate ensembles of a regularised linear model and boosted trees, trained on earlier seasons only, forecast a race before qualifying (“Thursday”), a race with the grid only, after qualifying (“race day”), and qualifying duels.
      They take the rating gaps, the form features and context (same team, refuelling era, early season, a driver’s experience), and after qualifying that weekend’s session gaps and the grid. Swapping the two drivers always gives the mirror-image probability.
    </li>
    <li>
      <b>Training in time order.</b> The probability models used for 2008–2011, 2012–2015 and 2016 onward were trained only on data available through 2007, 2011 and 2015 respectively. Thus even the flexible boosted-tree part cannot read a result from the year it forecasts. Its score measures the complete forecast, which also uses context and form; the ratings-only score below tests the portable pace levels more directly.
    </li>
  </ul>

  <h4>What-if matchups</h4>
  <p>
    A what-if has no real weekend behind it, so it has no form and no qualifying, and the forecast model is not used. The probability is the ratings gap, stretched by constants fitted on finishing-order pairs of 2002–2015. For a driver in a car other than their own,
    the published (portable) rating is the one used, which is the point of keeping the fit term out of it:
  </p>
  <div class="math block">P=\sigma\!\bigl(\kappa\,\operatorname{logit}\sigma(k\,\text{gap})\bigr),\qquad \kappa=\begin{cases}{{kCars}}&\text{different cars}\\{{kMates}}&\text{teammates}\end{cases},\qquad \kappa_{\text{wet}}={{kWet}}\,\kappa,</div>
  <p>
    with each driver’s wet-weather skill and circuit offset (learned separately, from wet races and from results at each circuit) added to the gap when asked for. Both come from a simple per-driver track beside the main ratings: after each weekend, a driver’s offset at that circuit moves a fraction {{circK}} of the way towards how they did there compared with what the ratings expected, and a share {{circCarry}} of every circuit offset is kept over the winter; the wet-weather skill moves the same way after wet races, with a fraction {{wetK}}. They are small corrections, so they are applied only on request. The stretch is near 1 because the ratings are already close to calibrated.
  </p>
</section>

<section id="method-backtesting" class="method-part">
  <h3>5. Backtesting</h3>

  <h4>The principle</h4>
  <p>
    A rating system is only credible if it is tested on weekends it has not seen. Every weekend is forecast <b>before</b> it is read, from the ratings as they stood after the previous weekend, and the forecast is scored against what happened (<b>walk-forward</b>
    evaluation <a class="cite" href="#" data-jump="ref-8">[8]</a>). The score is the weighted log-loss over pairs (a proper scoring rule, which rewards honest probabilities <a class="cite" href="#" data-jump="ref-7">[7]</a>; the Brier score <a class="cite" href="#" data-jump="ref-6">[6]</a> is the same idea with squared error), with the weights of Part 2,
  </p>
  <div class="math block">
    \mathcal J=\frac{\sum_{\text{pairs}} w\,\bigl[-o\ln p-(1-o)\ln(1-p)\bigr]}{\sum_{\text{pairs}} w},
  </div>
  <p>
    skipping a burn-in of 20 weekends. It punishes confident mistakes severely and rewards honest probabilities: a forecast of 50% always scores <span class="math">\ln 2=0.693</span> (a coin flip), lower is better, and a perfect forecaster would score 0.
    Teammate pairs carry weight {{tmBoost}} against 1 for other pairs, so they make up 25.7% of the score although they are a small share of pairs. The same observations and weights score every forecast, so figures from different seasons can be compared.
  </p>
  <p>
    If a forecast says 80% for A, an A win costs <span class="math">-\ln(0.8)=0.223</span>; an A loss costs <span class="math">-\ln(0.2)=1.609</span>. A model cannot improve this score by always sounding certain. The weighting changes which pairs matter most in the average, but it does not change the loss assigned to an individual probability and outcome.
  </p>

  <h4>Are the ratings right?</h4>
  <p id="methodologyLead">
    To judge the ratings alone, every weekend is forecast from the ratings of earlier weekends only, using the odds formula of Part 3 and nothing else: no recent form, no starting grid. The score is the weighted log-loss above, set against a coin flip that gives every
    pair 50%. The figures are computed live from the ratings loaded on this page.
  </p>
  <dl class="stats" id="methodologyRatingsStats" hidden>
    <div>
      <dt id="methodologyRatingsLabel">These ratings</dt>
      <dd id="methodologyRatingsValue">—<small>Forecast error from the ratings alone.</small></dd>
    </div>
    <div>
      <dt>A coin flip</dt>
      <dd id="methodologyCoinValue">—<small>Every pair at 50%.</small></dd>
    </div>
    <div>
      <dt>Weekends scored</dt>
      <dd id="methodologyRatingsWeekends">—<small>Race and qualifying, each forecast from earlier weekends only.</small></dd>
    </div>
  </dl>
  <div class="method-chart" id="methodologyRatingsChartWrap" hidden>
    <svg id="methodologyRatingsChart" class="chart" role="group"></svg>
  </div>
  <div class="table-wrap">
    <table class="params">
      <thead>
        <tr>
          <th scope="col" class="left">Window</th>
          <th scope="col">Coin flip</th>
          <th scope="col">These ratings</th>
          <th scope="col">Skill</th>
        </tr>
      </thead>
      <tbody id="methodologyWindows"></tbody>
    </table>
  </div>
  <p>Skill is the share of the coin flip’s error that the ratings remove: 0% is no better than a coin flip, 100% would be a perfect forecaster.</p>

  <h4>And the forecasts?</h4>
  <p>The Head to head forecast adds recent form to the ratings, and the starting grid once qualifying is done.</p>
  <dl class="stats" id="methodologyForecastStats" hidden>
    <div>
      <dt id="methodologyAccuracyLabel">Favourite finishes ahead</dt>
      <dd id="methodologyAccuracy">—</dd>
    </div>
    <div>
      <dt>Forecast error</dt>
      <dd id="methodologyLoss">—<small id="methodologyLossNote"></small></dd>
    </div>
    <div>
      <dt>Weekends scored</dt>
      <dd id="methodologyWeekends">—<small id="methodologyWeekendsNote"></small></dd>
    </div>
  </dl>
  <div class="method-chart" id="methodologyForecastChartWrap" hidden>
    <svg id="methodologyForecastChart" class="chart" role="group"></svg>
  </div>

  <h4>The hardest test: drivers who change team</h4>
  <p>
    A rating is intended to travel with its driver. To test that property, freeze it before the driver's final weekend at the old team, then predict duels against the <i>new teammate</i> over their first five new-team weekends. Both drivers now have the same car, so a wrong forecast points directly at a problem with the portable driver comparison. The frozen rating cannot learn from those five weekends. The losses below use the same weighted log-loss as the rest of this page.
  </p>
  <div class="table-wrap">
    <table class="params">
      <thead>
        <tr>
          <th scope="col" class="left">Move period</th>
          <th scope="col">Frozen-rating loss</th>
        </tr>
      </thead>
      <tbody>
        <tr><th scope="row" class="left">2002–2011</th><td><b>0.6461</b></td></tr>
        <tr><th scope="row" class="left">2012–2015</th><td><b>0.7084</b></td></tr>
        <tr><th scope="row" class="left">2016–2025</th><td><b>0.6511</b></td></tr>
      </tbody>
    </table>
  </div>
  <p>
    These values are much closer to a coin flip (0.693) than the all-pair score. That is the central weakness: the car and driver are easiest to disentangle after a driver moves, but a useful prediction must be made before seeing them in the new car. There are only 15 eligible moves in 2012–2015, so that period is especially noisy. The years shown were inspected while choosing settings; they are dated forecasts, not a pristine untouched test set. A fresh season with more transfers is the cleaner future check.
  </p>

  <h4>Other checks</h4>
  <ul>
    <li><b>Overall ratings-only loss</b> is 0.3820 (2008–2011), 0.3601 (2012–2015), and 0.3965 (2016–2025), on the fixed all-pair exam. The broad score can look strong even while transfers remain difficult, because most observations do not test how well a driver level travels.</li>
    <li>
      <b>Time-order checks.</b> Prefix-invariance tests append later races and verify that earlier predictions stay identical. The online learner uses one update rule for all drivers. These checks support the claim that the numbers are dated; predictive loss still decides whether they are useful.
    </li>
    <li>
      <b>Recent sample.</b> Through 17 completed 2026 weekends, ratings-only loss is 0.3839. The mover sample contains only 16 teammate duels, too few to settle the portability question.
    </li>
    <li>
      <b>Complete forecasts.</b> On 2016 onward the combined probability-model loss is 0.3916 before qualifying and 0.3371 once the grid is known. Those are different questions from the ratings-only exam: the forecast model can exploit recent form and context.
    </li>
    <li><b>No leakage.</b> Tests check that adding future data changes no earlier rating or forecast, and that swapping the two drivers flips the probability.</li>
    <li>
      <b>Selection caveat.</b> The blend shares and several settings were selected after looking at historical forecast scores, including these periods. Walk-forward scoring prevents future results from entering an individual prediction, but it does not turn a model-selection period into an untouched holdout.
    </li>
  </ul>

  <h4>How the settings were chosen</h4>
  <p>
    The 75-point scale gives rating gaps a readable odds meaning; the pair definitions and scoring weights define a fixed exam. Prior spreads and drift rates control how quickly evidence can move a level. Qualifying linkage determines how much one-lap evidence may inform race pace. Blend shares determine how much each dated learner contributes. These values were selected by searching historical walk-forward loss, while also examining the frozen-transfer test so a strong all-pair score could not hide a weak portable driver rating. The odds-calibration multipliers were fitted on 2002–2007. The blend was examined on 2008–2011, 2012–2015 and 2016–2025; those years cannot now be claimed as untouched validation for that choice. The fixed settings and time splits make the next unseen season a checkable test.
  </p>
</section>

<section id="method-limits" class="method-part">
  <h3>6. Limits and open problems</h3>
  <ul>
    <li>The split between driver and car is an assumption, informed by teammates, qualifying and team moves. The hybrid’s bars carry only the filter covariance; they omit uncertainty from the blend and do not flag which ratings travel well.</li>
    <li>
      <b>Drivers in a new car remain hard to forecast.</b> Some of this is a driver–car interaction that no prior rating can know, and there are only a few dozen moves to measure it on. Frozen-transfer loss remains above 0.5 in every historical period shown here.
    </li>
    <li>Comparing drivers in different cars is much less certain than comparing teammates: a teammate gap is known to roughly ±12 points, a cross-team gap to roughly ±18.</li>
    <li>The ratings see results and lap times; the online learner also uses a wet-weekend indicator as a nuisance term. Tyre choice, pit stops, safety cars, penalties, practice sessions and component upgrades enter only through the results they produce. A recorded power-unit replacement by itself does not identify a pace gain.</li>
    <li>Little is known about a new driver, who takes a few races to find a level. A driver who has only ever raced one team is placed through that team’s other drivers.</li>
    <li>Retirement risk is tracked separately and does not feed back into the pace ratings, beyond the weight a retirement carries as a comparison.</li>
    <li>A rating is relative to the field of its time. Ratings from different eras can be compared as a thought experiment, not as a measurement.</li>
  </ul>
</section>

<section id="method-settings" class="method-part">
  <h3>7. Settings</h3>
  <p>
    The hybrid blend uses the shares in Part 3 and an online learner with a {{hybrid.ranking.learningRate}}-point gradient step, teammate weight {{hybrid.ranking.teammateWeight}}, fit penalty {{hybrid.ranking.fitPenalty}}, level penalty {{hybrid.ranking.levelPenalty}}, car winter retention {{hybrid.ranking.carWinterRetention}} and driver winter retention {{hybrid.ranking.driverWinterRetention}}. They are read from the shipped <code>hybrid.js</code> preset. The filter settings below and the fitted multipliers also come from shipped code. The link and arrival-adaptation settings belong to the race filter.
  </p>
  <div class="table-wrap" id="methodologyParams"></div>
  <h4>Scoring, reliability and scale</h4>
  <p>
    These settings fix what is scored (“Fixed”), how retirements are tracked and the unit of the ratings. They are shared by the qualifying and the race model.
  </p>
  <div class="table-wrap" id="methodologyScoring"></div>
</section>

<section id="method-references" class="method-part">
  <h3>8. References</h3>
  <p>Numbers in square brackets in the text refer to this list. Each entry with a DOI links to the publisher’s record of the work.</p>
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
    <li id="ref-17">TracingInsights. <i>RaceData</i>: Formula 1 data tables (CC0 1.0, as stated by the project). Retrieved October 2026. <a href="https://github.com/TracingInsights/RaceData" rel="noopener noreferrer">github.com/TracingInsights/RaceData</a></li>
    <li id="ref-18">Jolpica-F1. <i>Jolpica-F1: free and open-source Formula 1 API</i> (data under CC BY-NC-SA 4.0). Retrieved October 2026. <a href="https://github.com/jolpica/jolpica-f1" rel="noopener noreferrer">github.com/jolpica/jolpica-f1</a></li>
    <li id="ref-19">Trotman, J. <i>Formula 1 Race Data</i> and <i>Formula 1 Race Events</i> (Kaggle datasets listed as a source by RaceData). Retrieved October 2026. <a href="https://www.kaggle.com/datasets/jtrotman/formula-1-race-data" rel="noopener noreferrer">kaggle.com/datasets/jtrotman/formula-1-race-data</a></li>
  </ol>
</section>
`;

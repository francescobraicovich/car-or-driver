// The overview diagram at the top of the Methodology page: how the data become the numbers on the site.
// Plain HTML and CSS (classes `flow-*` in styles.css) rather than SVG, so that it reflows on a phone and its text stays selectable.
// Formulas are typeset with the same `.math` mechanism as the rest of the page (methodology-view.js).

export const DIAGRAM_HTML = String.raw`
<figure class="flow" aria-labelledby="flowCaption">
  <figcaption id="flowCaption" class="flow-caption">
    From the race data to the numbers on this site. Read from top to bottom; each step is explained in its own part of this page.
  </figcaption>
  <ol class="flow-stages">
    <li class="flow-stage">
      <p class="flow-step">Data <a href="#" data-jump="method-data">Part 2</a></p>
      <p>
        Race results, qualifying times, lap times and finishing statuses for every Grand Prix weekend since 2000, read in date order.
      </p>
    </li>
    <li class="flow-link" aria-hidden="true"><span>every pair of drivers in a session becomes one comparison</span></li>
    <li class="flow-stage">
      <p class="flow-step">Observations <a href="#" data-jump="method-data">Part 2</a></p>
      <p>
        For two drivers <span class="math">x,y</span>: an outcome <span class="math">o_{xy}\in\{0,1\}</span> (1 if <span class="math">x</span> was ahead) and a weight
        <span class="math">w_{xy}</span> for how much that comparison tells us.
      </p>
    </li>
    <li class="flow-link" aria-hidden="true"><span>a model of how the odds depend on hidden pace, and Bayes’ rule after every weekend</span></li>
    <li class="flow-stage">
      <p class="flow-step">Beliefs about pace <a href="#" data-jump="method-ratings">Part 3</a></p>
      <p>
        A mean and a covariance for the hidden pace of every driver <span class="math">D</span> and every car <span class="math">C</span>, in rating points. Odds depend on the
        strength <span class="math">S=D+A+C</span> (<span class="math">A</span>: the driver’s fit with their car).
      </p>
      <div class="flow-pair">
        <div class="flow-box">
          <b>Qualifying model</b>
          <span>one lap, little noise: levels <span class="math">D^{\text{qual}},C^{\text{qual}}</span></span>
        </div>
        <div class="flow-arrow" aria-hidden="true"><span>read by</span></div>
        <div class="flow-box">
          <b>Race model</b>
          <span><span class="math">S=\beta D^{\text{qual}}+D+A+C+\gamma C^{\text{qual}}</span></span>
        </div>
      </div>
    </li>
    <li class="flow-link" aria-hidden="true"><span>read the beliefs off, with their uncertainty</span></li>
    <li class="flow-stage flow-site">
      <p class="flow-step">Ratings <a href="#" data-jump="method-ratings">Part 3</a></p>
      <div class="flow-outputs">
        <div class="flow-box">
          <b>Rating ± uncertainty</b>
          <span>driver <span class="math">D+\beta D^{\text{qual}}</span>, car <span class="math">C+\gamma C^{\text{qual}}</span>; the bar is the standard deviation</span>
        </div>
        <div class="flow-box">
          <b>Reliability</b>
          <span>failure and incident rates from the finishing statuses</span>
        </div>
        <div class="flow-box">
          <b>Combined, package and effective pace</b>
          <span>blends and adjustments of the above</span>
        </div>
      </div>
      <p class="flow-where">Shown on: Ratings, History</p>
    </li>
    <li class="flow-link" aria-hidden="true"><span>the ratings gap becomes a probability, then recent form, retirement risk and the grid refine it</span></li>
    <li class="flow-stage flow-site">
      <p class="flow-step">Forecasts <a href="#" data-jump="method-forecasts">Part 4</a></p>
      <p>The chance that one driver finishes ahead of another, from the ratings alone or from a forecast model built on them.</p>
      <p class="flow-where">Shown on: Head to head</p>
    </li>
    <li class="flow-link flow-link-test" aria-hidden="true">
      <span>every forecast, made before the weekend, is scored against what happened</span>
    </li>
    <li class="flow-stage flow-test">
      <p class="flow-step">Backtest <a href="#" data-jump="method-backtesting">Part 5</a></p>
      <p>
        Weighted log-loss, walk-forward: a weekend is scored using only the weekends before it. This is how the ratings, the forecast model and the settings
        are judged, and what the “Are the ratings right?” figures below report.
      </p>
    </li>
  </ol>
</figure>
`;

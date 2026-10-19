// The forecasting code behind Head to head, kept in one module so the page can fetch it (with the fitted forecast tables it pulls in, about 0.5 MB
// compressed) the first time Head to head is opened instead of on every first visit.
export { forecastH2H, forecastPreWeekend } from '../../packages/core/src/forecast/head-to-head.js';
export { isStateSpace } from '../../packages/core/src/forecast/prepare.js';
export { ratingsAlone } from '../../packages/core/src/state-space/forecast.js';
export { scenarioForecast, WET_RATIO } from '../../packages/core/src/forecast/scenario.js';

// The pages that are the front page. The picture alone is `home`; `ratings` is the same page with the ratings panel kept open, and `history` is
// the same page again with a view opened over the ratings in the panel (a button there goes back); the graph, the prediction, the methodology and
// About & Privacy are cards over the picture. (The head to head, the insights, the drivers and the teams are documents of their own.)

export const PINNED_PAGES = ['ratings', 'history']; // the panel is kept open
export const DECK_PAGES = ['graph', 'prediction', 'methodology', 'methodology-simple', 'methodology-full', 'about']; // a card over the picture, with no ratings panel

/** What the panel shows on a page: the ratings, or a view over them. */
export const panelView = (page) => (page === 'history' ? page : 'ratings');

// The pages that are the front page. The picture alone is `home`; `ratings` is the same page with the ratings panel kept open, and `history` and
// `head-to-head` are the same page again with a view opened over the ratings in the panel (a button there goes back); `insights` is the picture with a
// card of slides in the middle; `methodology`, `privacy` and `about` are the same picture with a card of slides of their own.

export const PINNED_PAGES = ['ratings', 'history', 'head-to-head']; // the panel is kept open
export const DECK_PAGES = ['insights', 'methodology', 'privacy', 'about']; // a card of slides over the picture, with no panel (slide-deck.js)

/** What the panel shows on a page: the ratings, or a view over them. */
export const panelView = (page) => (page === 'history' || page === 'head-to-head' ? page : 'ratings');

// The pages that are the front page. The picture alone is `home`; `ratings` is the same page with the ratings panel kept open, and `history` and
// `head-to-head` are the same page again with a view opened over the ratings in the panel (a button there goes back); `insights` is the picture with a
// card of slides in the middle. The other pages are pages of their own. workspace.js sets `data-surface` on the body from this, and the scripts and the style sheets that belong to the front page read it.

export const PINNED_PAGES = ['ratings', 'history', 'head-to-head']; // the panel is kept open
export const STAGE_PAGES = ['home', ...PINNED_PAGES, 'insights']; // (the insights are a card over the picture, with no panel)

/** What the panel shows on a page: the ratings, or a view over them. */
export const panelView = (page) => (page === 'history' || page === 'head-to-head' ? page : 'ratings');

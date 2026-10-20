// The text on the front page, written as a few lines of TypeScript. Each line is a list of [kind, text] tokens (kind: '' plain, k keyword, t type,
// f function, s string, n number, c comment), so the page can colour them without ever building HTML from a name or a number. Pure: tested in Node.

const plain = (text) => ['', text];
const keyword = (text) => ['k', text];
const type = (text) => ['t', text];
const call = (text) => ['f', text];
const string = (text) => ['s', text];
const number = (text) => ['n', text];
const comment = (text) => ['c', text];

const whole = (value) => String(Math.round(value));

/**
 * @param {{ subject: 'car'|'driver'|null, open: boolean, weekend: string|null, leader: {name:string, team?:string, rating:number, deviation:number}|null, count: number }} context
 *   subject: what the box is on; open: whether it has been clicked open (the list is showing); leader: the top entry of that subject; weekend: for example "2026 Singapore Grand Prix"
 */
export function codeLines({ subject, open, weekend, leader, count }) {
  if (!subject) {
    return [
      [comment(weekend ? `// driver_or_car.ts · ratings after the ${weekend}` : '// driver_or_car.ts')],
      [comment('// how much of a result is the driver, and how much is the car?')],
      [],
      [keyword('const'), plain(' pace = driver + car;   '), comment('// every result is both at once')],
      [keyword('const'), plain(' split = '), call('rate'), plain('(pace);   '), comment('// we pull them apart, with error bars')],
      [
        call('select'),
        plain('('),
        type('Car'),
        plain(' | '),
        type('Driver'),
        plain(');   '),
        comment("// point at the car, or at the driver's hands"),
      ],
    ];
  }
  const noun = subject === 'car' ? 'car' : 'driver';
  const Noun = subject === 'car' ? 'Car' : 'Driver';
  const lines = [[comment(`// ${noun}.ts`)]];
  if (!leader) {
    lines.push(
      [keyword('const'), plain(` ${noun} = `), call('best'), plain('('), type(`${Noun}[]`), plain(');')],
      [comment('// loading the ratings…')],
    );
    return lines;
  }
  lines.push(
    [
      keyword('const'),
      plain(` ${noun} = `),
      call('best'),
      plain('('),
      type(`${Noun}[]`),
      plain(');    '),
      comment(weekend ? `// after the ${weekend}` : ''),
    ],
    [plain(`${noun}.name   = `), string(`"${leader.name}"`), plain(';')],
  );
  if (subject === 'driver' && leader.team) lines.push([plain('driver.car  = '), string(`"${leader.team}"`), plain(';')]);
  lines.push(
    [
      plain(`${noun}.rating = `),
      number(whole(leader.rating)),
      plain(';    '),
      comment(`// ± ${whole(leader.deviation)} · 1000 is the field's average`),
    ],
    [],
  );
  lines.push(
    open
      ? [comment(`// ${count} ${noun}s, best first · j k to move · esc to go back`)]
      : [call('open'), plain(`(${noun});    `), comment(`// click for all ${count} ratings`)],
  );
  return lines;
}

/** The lines as plain text, for tests and for the page's accessible description. */
export const linesAsText = (lines) => lines.map((line) => line.map(([, text]) => text).join('')).join('\n');

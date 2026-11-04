"""Fetch an unverified Vike Polymarket event window using VIKE_API_KEY.

The provider's endpoint returns recorded events, not proof of complete exchange
coverage. See README.md before using the output in a replay.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener


ENDPOINT = 'https://data.vike.io/v1/polymarket/events'
MAX_WINDOW_MS = 24 * 60 * 60 * 1000


class NoRedirect(HTTPRedirectHandler):
    """Do not forward credentials to another endpoint."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_events(token_ids, start_ms, end_ms, api_key, *, opener=None, page_limit=5000, max_pages=100):
    if (not token_ids or len(token_ids) > 100 or len(set(token_ids)) != len(token_ids)
            or any(not isinstance(token, str) or not token.isascii() or not token.isdecimal() for token in token_ids)):
        raise ValueError('Provide between 1 and 100 distinct numeric token IDs')
    if (not isinstance(start_ms, int) or isinstance(start_ms, bool) or not isinstance(end_ms, int)
            or isinstance(end_ms, bool) or start_ms < 0 or end_ms <= start_ms
            or end_ms - start_ms > MAX_WINDOW_MS):
        raise ValueError('The window must be positive and at most 24 hours in epoch milliseconds')
    if not isinstance(api_key, str) or not api_key.strip():
        raise ValueError('VIKE_API_KEY is required')
    if not 1 <= page_limit <= 50000 or not 1 <= max_pages <= 10000:
        raise ValueError('Invalid pagination limit')
    opener = opener or build_opener(NoRedirect())
    params = {'token_ids': ','.join(token_ids), 'from_ms': start_ms, 'to_ms': end_ms, 'limit': page_limit}
    events, seen_cursors, notes = [], set(), []
    for _ in range(max_pages):
        request = Request(f'{ENDPOINT}?{urlencode(params)}', headers={'X-API-Key': api_key, 'Accept': 'application/json'})
        try:
            with opener.open(request, timeout=30) as response:
                payload = json.load(response)
                note = response.headers.get('X-Vike-Note')
        except HTTPError as error:
            raise RuntimeError(f'Vike request failed with HTTP {error.code}; no response body saved') from None
        except (URLError, OSError, TimeoutError, ValueError):
            raise RuntimeError('Vike request failed or returned invalid JSON') from None
        if (not isinstance(payload, dict) or not isinstance(payload.get('events'), list)
                or not isinstance(payload.get('has_more'), bool) or 'next_cursor' not in payload):
            raise RuntimeError('Vike returned an invalid event page')
        if note:
            notes.append(note)
        events.extend(payload['events'])
        cursor = payload['next_cursor']
        if not payload['has_more']:
            if cursor is not None:
                raise RuntimeError('Vike returned an unexpected final cursor')
            return {'source': ENDPOINT, 'retrievedAt': datetime.now(timezone.utc).isoformat(),
                    'tokenIds': token_ids, 'fromMs': start_ms, 'toMsExclusive': end_ms,
                    'coverageComplete': False, 'coverageNote': 'Unverified source capture and stream-health coverage',
                    'providerNotes': notes, 'pages': len(seen_cursors) + 1, 'events': events}
        if not isinstance(cursor, str) or not cursor or cursor in seen_cursors:
            raise RuntimeError('Vike pagination cursor is missing or repeated')
        seen_cursors.add(cursor)
        params['cursor'] = cursor
    raise RuntimeError('Vike pagination exceeded the page limit; no partial output saved')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--token-id', action='append', required=True, help='Outcome token ID; repeat for additional tokens')
    parser.add_argument('--from-ms', type=int, required=True, help='Inclusive UTC epoch milliseconds')
    parser.add_argument('--to-ms', type=int, required=True, help='Exclusive UTC epoch milliseconds')
    parser.add_argument('--output', type=Path, required=True, help='New JSON output file; never overwritten')
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Output file already exists')
    try:
        result = fetch_events(args.token_id, args.from_ms, args.to_ms, os.environ.get('VIKE_API_KEY', ''))
        with args.output.open('x', encoding='utf8') as output:
            json.dump(result, output, indent=2)
            output.write('\n')
    except (ValueError, RuntimeError, OSError) as error:
        print(f'Fetch failed: {error}', file=sys.stderr)
        return 1
    print(f'Saved {len(result["events"])} events in {result["pages"]} page(s); coverage remains unverified.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

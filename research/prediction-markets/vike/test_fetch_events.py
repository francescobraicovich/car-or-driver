import io
import json
import unittest
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

from fetch_events import MAX_WINDOW_MS, fetch_events


class Response(io.BytesIO):
    def __init__(self, payload, note=None):
        super().__init__(json.dumps(payload).encode())
        self.headers = {'X-Vike-Note': note} if note else {}


class Opener:
    def __init__(self, pages):
        self.pages = list(pages)
        self.requests = []

    def open(self, request, timeout):
        self.requests.append(request)
        return Response(self.pages.pop(0))


class FetchEventsTest(unittest.TestCase):
    def test_opaque_cursor_and_raw_records_are_preserved(self):
        cursor = '123:0:9~1'
        opener = Opener([
            {'events': [{'event_type': 'trade', 'token_id': '9', 'seq': 0}], 'has_more': True, 'next_cursor': cursor},
            {'events': [{'event_type': 'status', 'status': 'gap_start'}], 'has_more': False, 'next_cursor': None},
        ])
        result = fetch_events(['9'], 1, 1000, 'test-secret', opener=opener)
        self.assertEqual(len(result['events']), 2)
        self.assertEqual(result['pages'], 2)
        self.assertFalse(result['coverageComplete'])
        self.assertEqual(parse_qs(urlsplit(opener.requests[1].full_url).query)['cursor'], [cursor])
        self.assertNotIn('test-secret', json.dumps(result))
        self.assertEqual(opener.requests[0].get_header('X-api-key'), 'test-secret')

    def test_rejects_invalid_requests_and_repeated_cursor(self):
        for tokens, start, end, key in [([], 1, 2, 'key'), (['1', '1'], 1, 2, 'key'),
                                         (['x'], 1, 2, 'key'), (['1'], 1, 1, 'key'),
                                         (['1'], 1, MAX_WINDOW_MS + 2, 'key'), (['1'], 1, 2, '')]:
            with self.subTest(tokens=tokens, start=start, end=end, key=key), self.assertRaises(ValueError):
                fetch_events(tokens, start, end, key, opener=Opener([]))
        repeated = {'events': [], 'has_more': True, 'next_cursor': 'cursor'}
        with self.assertRaisesRegex(RuntimeError, 'repeated'):
            fetch_events(['1'], 1, 2, 'key', opener=Opener([repeated, repeated]))

    def test_provider_error_does_not_print_response_or_secret(self):
        class Failure:
            def open(self, request, timeout):
                raise HTTPError(request.full_url, 401, 'secret-in-response', {}, None)

        with self.assertRaises(RuntimeError) as error:
            fetch_events(['1'], 1, 2, 'secret-in-response', opener=Failure())
        self.assertEqual(str(error.exception), 'Vike request failed with HTTP 401; no response body saved')

    def test_pagination_limit_rejects_partial_result(self):
        page = {'events': [{'event_type': 'book'}], 'has_more': True, 'next_cursor': 'cursor'}
        with self.assertRaisesRegex(RuntimeError, 'no partial output'):
            fetch_events(['1'], 1, 2, 'key', opener=Opener([page]), max_pages=1)


if __name__ == '__main__':
    unittest.main()

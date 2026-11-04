import hashlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError


SPEC = importlib.util.spec_from_file_location('pmdata_download', Path(__file__).with_name('download_market_day.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class Response(io.BytesIO):
    def __init__(self, content, length=None):
        super().__init__(content)
        self.status = 200
        self.headers = {'Content-Length': str(len(content) if length is None else length)}


class Opener:
    def __init__(self, content=b'PAR1dataPAR1', length=None, error=None):
        self.content = content
        self.length = length
        self.error = error
        self.requests = []

    def open(self, request, timeout):
        self.requests.append(request)
        if self.error:
            raise self.error
        return Response(self.content, self.length)


class DownloadTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name) / 'sample.parquet'
        self.key = 'private-test-credential'

    def download(self, opener, **kwargs):
        return MODULE.download_market_day(kwargs.get('data_type', 'l2'), kwargs.get('day', '2026-07-02'),
                                          kwargs.get('slug', 'f1-british-grand-prix-winner-norris-2026-07-05'),
                                          self.output, kwargs.get('key', self.key), opener=opener)

    def test_download_sends_key_only_in_header_and_checks_digest(self):
        opener = Opener()
        result = self.download(opener)
        self.assertEqual(self.output.read_bytes(), opener.content)
        self.assertEqual(result['sha256'], hashlib.sha256(opener.content).hexdigest())
        self.assertEqual(len(opener.requests), 1)
        self.assertNotIn(self.key, opener.requests[0].full_url)
        self.assertNotIn(self.key, str(result))
        self.assertEqual(opener.requests[0].get_header('Api_key'), self.key)

    def test_existing_file_never_uses_quota(self):
        self.output.write_bytes(b'existing')
        opener = Opener()
        with self.assertRaises(FileExistsError):
            self.download(opener)
        self.assertEqual(opener.requests, [])
        self.assertEqual(self.output.read_bytes(), b'existing')

    def test_quota_exhaustion_never_retries_or_prints_response_body(self):
        error = HTTPError('https://api.pmdata.dev', 429, self.key, {}, None)
        opener = Opener(error=error)
        with self.assertRaisesRegex(RuntimeError, '429') as captured:
            self.download(opener)
        self.assertNotIn(self.key, str(captured.exception))
        self.assertEqual(len(opener.requests), 1)
        self.assertFalse(self.output.exists())

    def test_truncated_and_invalid_files_are_not_published(self):
        for opener in (Opener(length=100), Opener(content=b'PAR1wrong')):
            with self.subTest(content=opener.content), self.assertRaises(RuntimeError):
                self.download(opener)
            self.assertFalse(self.output.exists())
            self.assertEqual(list(Path(self.directory.name).iterdir()), [])

    def test_invalid_inputs_and_redirects_are_rejected(self):
        for kwargs in ({'day': '2026-02-30'}, {'slug': '../elsewhere'}, {'key': ''}, {'data_type': 'unknown'}):
            opener = Opener()
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                self.download(opener, **kwargs)
            self.assertEqual(opener.requests, [])
        handler = MODULE.NoRedirect()
        self.assertIsNone(handler.redirect_request(None, None, 302, 'redirect', {}, 'https://unexpected.test'))


if __name__ == '__main__':
    unittest.main()

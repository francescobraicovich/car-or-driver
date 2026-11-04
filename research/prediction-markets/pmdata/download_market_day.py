"""Download one PMData market-day Parquet file; every successful request uses quota."""

import argparse
import hashlib
import os
import re
import sys
import tempfile
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener


BASE = 'https://api.pmdata.dev/v1/polymarket'
DATA_TYPES = ('l2', 'trades', 'onchain_fills')


class NoRedirect(HTTPRedirectHandler):
    """Prevent forwarding the API key to an unexpected host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def download_market_day(data_type, day, market_slug, output, api_key, *, opener=None):
    """Download once, validate the Parquet envelope and publish without overwriting."""
    if data_type not in DATA_TYPES:
        raise ValueError('Unsupported data type')
    try:
        parsed_day = date.fromisoformat(day)
    except (TypeError, ValueError):
        raise ValueError('Date must use YYYY-MM-DD') from None
    if parsed_day.isoformat() != day:
        raise ValueError('Date must use YYYY-MM-DD')
    if not isinstance(market_slug, str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,254}', market_slug):
        raise ValueError('Invalid market slug')
    if not isinstance(api_key, str) or not api_key.strip() or '\r' in api_key or '\n' in api_key:
        raise ValueError('PMDATA_API_KEY is missing or invalid')
    output = Path(output)
    if output.exists():
        raise FileExistsError('Output already exists; refusing to spend quota again')
    if not output.parent.is_dir():
        raise ValueError('Output directory does not exist')

    url = f'{BASE}/{data_type}/{parsed_day:%Y/%m/%d}/{market_slug}.parquet'
    request = Request(url, headers={'api_key': api_key, 'User-Agent': 'Mozilla/5.0'})
    opener = opener or build_opener(NoRedirect())
    temporary_path = None
    try:
        try:
            response = opener.open(request, timeout=60)
        except HTTPError as error:
            # PMData uses 429 for exhausted download quota. Do not retry automatically.
            raise RuntimeError(f'PMData returned HTTP {error.code}; no automatic retry') from None
        except (URLError, OSError, TimeoutError):
            raise RuntimeError('PMData request failed; no automatic retry') from None

        with response:
            if response.status != 200:
                raise RuntimeError(f'PMData returned HTTP {response.status}; no automatic retry')
            length = response.headers.get('Content-Length')
            if length is not None and (not length.isdecimal() or int(length) < 8):
                raise RuntimeError('Invalid response length')
            fd, temporary_name = tempfile.mkstemp(prefix='.pmdata-', dir=output.parent)
            temporary_path = Path(temporary_name)
            digest = hashlib.sha256()
            size = 0
            with os.fdopen(fd, 'wb') as file:
                while chunk := response.read(1024 * 1024):
                    size += len(chunk)
                    digest.update(chunk)
                    file.write(chunk)
            if (length is not None and size != int(length)) or size < 8:
                raise RuntimeError('Incomplete response; no output published')
            with temporary_path.open('rb') as file:
                prefix = file.read(4)
                file.seek(-4, os.SEEK_END)
                suffix = file.read(4)
            if prefix != b'PAR1' or suffix != b'PAR1':
                raise RuntimeError('Response is not a complete Parquet envelope')
            # Linking publishes atomically and fails if another process created output.
            os.link(temporary_path, output)
            return {'url': url, 'bytes': size, 'sha256': digest.hexdigest()}
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--type', choices=DATA_TYPES, required=True)
    parser.add_argument('--date', required=True, help='UTC date, YYYY-MM-DD')
    parser.add_argument('--market', required=True, help='Exact PMData market slug')
    parser.add_argument('--output', type=Path, required=True, help='New local output path')
    args = parser.parse_args()
    try:
        result = download_market_day(args.type, args.date, args.market, args.output,
                                     os.environ.get('PMDATA_API_KEY', ''))
    except FileExistsError:
        print('Download failed: output already exists', file=sys.stderr)
        return 1
    except (ValueError, RuntimeError) as error:
        print(f'Download failed: {error}', file=sys.stderr)
        return 1
    except OSError:
        print('Download failed: local file or network error', file=sys.stderr)
        return 1
    print(f'Saved {result["bytes"]} bytes; SHA-256 {result["sha256"]}.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

import unittest

from scan_winner_markets import winner_windows


class WinnerWindowTest(unittest.TestCase):
    def test_four_races_and_wednesday_to_fp1_windows(self):
        markets = {race: [{'outcomes': [{'tokenId': race + '-yes'}, {'tokenId': race + '-no'}]}]
                   for race in ('austrian', 'british', 'belgian', 'hungarian')}
        windows = winner_windows(markets)
        self.assertEqual(windows['british'][1:3], (1782864000, 1783078200))
        self.assertEqual(windows['austrian'][3], {'austrian-yes', 'austrian-no'})
        self.assertEqual(len(windows), 4)


if __name__ == '__main__':
    unittest.main()

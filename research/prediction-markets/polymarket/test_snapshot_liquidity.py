import unittest

from analyze_snapshot_liquidity import snapshot_metrics, summarize


class SnapshotLiquidityTest(unittest.TestCase):
    def test_top_of_book_and_invalid_books(self):
        metrics = snapshot_metrics([["0.2", "10"], ["0.4", "3"]], [["0.7", "8"], ["0.6", "5"]])
        self.assertEqual(metrics["spread"], 0.2)
        self.assertEqual(metrics["bidNotional"], 1.2)
        self.assertEqual(metrics["askNotional"], 3.0)
        self.assertIsNone(snapshot_metrics([], [[0.5, 1]]))
        self.assertIsNone(snapshot_metrics([[0.6, 1]], [[0.5, 1]]))
        with self.assertRaises(ValueError):
            snapshot_metrics([[1.1, 2]], [[0.8, 1]])

    def test_latest_snapshot_is_one_per_market_and_before_cutoff(self):
        conditions = [{"conditionId": "a", "drivers": ["A", "B"]}, {"conditionId": "b", "drivers": ["C", "D"]}]
        rows = [("a", "x", 1, 1, '[["0.3","2"]]', '[["0.7","3"]]'),
                ("a", "y", 8, 7, '[["0.4","4"]]', '[["0.6","6"]]'),
                ("a", "x", 10, 9, '[["0.1","4"]]', '[["0.9","6"]]')]
        result = summarize(rows, conditions, 10)
        self.assertEqual(result["usableMarketCount"], 1)
        self.assertEqual(result["records"][0]["assetId"], "y")
        self.assertEqual(result["medianSpread"], 0.2)
        self.assertEqual(result["records"][0]["secondsBeforeCutoff"], 0.002)
        self.assertEqual(result["excluded"][0]["reason"], "no observed snapshot")

    def test_rejects_invalid_timestamps(self):
        with self.assertRaisesRegex(ValueError, "timestamps"):
            summarize([("a", "x", 2, 3, "[]", "[]")], [{"conditionId": "a", "drivers": ["A", "B"]}], 4)


if __name__ == "__main__":
    unittest.main()

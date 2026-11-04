import unittest

from extract_pmxt import normalize


def row(timestamp, kind, bids=None, asks=None, price=None, size=None, side=None):
    return (timestamp, timestamp - 1, kind, bids, asks, price, size, side)


class NormalizeTest(unittest.TestCase):
    def test_requires_initial_snapshot(self):
        with self.assertRaisesRegex(ValueError, "no initial book"):
            normalize([row(1, "price_change", price=0.4, size=2, side="BUY")],
                      10, 9, "Hamilton", "Verstappen")

    def test_cutoff_is_exclusive_and_coverage_remains_unverified(self):
        events = [row(1, "book", '[["0.3","5"]]', '[["0.7","7"]]'),
                  row(8, "price_change", price=0.3, size=0, side="BUY"),
                  row(9, "last_trade_price", price=0.3, size=1, side="SELL")]
        output = normalize(events, 10, 9, "Hamilton", "Verstappen")
        self.assertEqual([event["type"] for event in output["events"]], ["snapshot", "update"])
        self.assertEqual(output["events"][1]["quantity"], 0)
        self.assertFalse(output["coverage"]["complete"])
        self.assertEqual(output["events"][0]["sourceTimestamp"], 0)

    def test_rejects_unrecognized_side_tick_change_and_late_exit(self):
        initial = row(1, "book", "[]", "[]")
        with self.assertRaisesRegex(ValueError, "invalid PMXT"):
            normalize([initial, row(2, "price_change", price=0.4, size=1, side="UNKNOWN")],
                      10, 9, "Hamilton", "Verstappen")
        with self.assertRaisesRegex(ValueError, "tick size changed"):
            normalize([initial, row(2, "tick_size_change")], 10, 9, "Hamilton", "Verstappen")
        with self.assertRaisesRegex(ValueError, "precede first practice"):
            normalize([initial], 10, 10, "Hamilton", "Verstappen")


if __name__ == "__main__":
    unittest.main()

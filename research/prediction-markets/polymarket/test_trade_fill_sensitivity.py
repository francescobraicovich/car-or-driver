import unittest
import json
from pathlib import Path

from trade_fill_sensitivity import CASES, analyze, one_print_fills
from austrian_trade_sensitivity import CASE as AUSTRIAN_CASE


class FillSensitivityTest(unittest.TestCase):
    def test_queue_scenarios(self):
        self.assertEqual(one_print_fills(10, 10), {"100": 0, "50": 5, "0": 5})
        self.assertEqual(one_print_fills(50, 21.42857), {"100": 0, "50": 0, "0": 5})
        self.assertEqual(one_print_fills(4, 5, 10)["100"], 1)

    def test_rejects_invalid_sizes(self):
        for args in [(-1, 1), (0, 0), (0, 1, 0), (float("nan"), 1)]:
            with self.assertRaises(ValueError):
                one_print_fills(*args)

    def test_recorded_trades_and_future_data_isolation(self):
        root = Path(__file__).parent
        rows = [row for day in ("01", "02") for row in json.loads((root / f"british-2026-july-{day}-matchup-events.json").read_text())["rows"]]
        first, second, third, fourth = (analyze(rows, case) for case in CASES)
        self.assertEqual(first["bidPrice"], 0.5)
        self.assertEqual(first["displayedSharesAhead"], 10)
        self.assertEqual(first["printShares"], 10)
        self.assertEqual(second["bidPrice"], 0.3)
        self.assertEqual(second["displayedSharesAhead"], 50)
        self.assertEqual(second["printShares"], 21.42857)
        self.assertEqual(third["printShares"], 2)
        self.assertEqual(fourth["orderSide"], "sell")
        self.assertEqual(fourth["conditionalGrossProfitPayoutOneByPercent"]["0"], -0.428571)
        self.assertEqual(first, analyze([row for row in rows if row["received"] <= first["tradeReceived"]], CASES[0]))
        changed = rows + [{"condition": CASES[0]["condition"], "asset": CASES[0]["asset"],
                           "type": "price_change", "received": first["snapshotReceived"] + 1000,
                           "side": "BUY", "price": "0.50", "size": "0"}]
        with self.assertRaisesRegex(ValueError, "affects the selected quote"):
            analyze(changed, CASES[0])

    def test_austrian_recorded_trade(self):
        path = Path(__file__).parent / "austrian-2026-june-24-matchup-events.json"
        result = analyze(json.loads(path.read_text())["rows"], AUSTRIAN_CASE)
        self.assertEqual(result["quotedPrice"], 0.37)
        self.assertEqual(result["displayedSharesAhead"], 25.23)
        self.assertEqual(result["printShares"], 1.5873)
        self.assertEqual(result["fillsByPercentOfSnapshotQueueRemainingAhead"], {"100": 0, "50": 0, "0": 1.5873})


if __name__ == "__main__":
    unittest.main()

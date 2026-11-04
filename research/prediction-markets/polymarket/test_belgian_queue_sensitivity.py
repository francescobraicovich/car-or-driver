import json
import unittest
from pathlib import Path

from belgian_queue_sensitivity import analyze, replay_prints


class BelgianQueueSensitivityTest(unittest.TestCase):
    def test_queue_conservation_and_invalid_size(self):
        prints = [{"size": "3", "transactionHash": "a"}, {"size": "4", "transactionHash": "b"}]
        self.assertEqual(replay_prints(5, prints)["filledShares"], 2)
        with self.assertRaises(ValueError):
            replay_prints(1, [{"size": 0, "transactionHash": "a"}])

    def test_preactivation_print_and_cancellation_scenarios(self):
        path = Path(__file__).parent / "belgian-2026-july-16-matchup-events.json"
        document = json.loads(path.read_text())
        result = analyze(document)
        self.assertEqual(result["preactivationPrint"]["shares"], 33.333332)
        self.assertLess(result["preactivationPrint"]["received"], result["activation"])
        self.assertEqual(len(result["postactivationPrints"]), 3)
        self.assertLess(result["recordedBidRemoval"], result["postactivationPrints"][-1]["received"])
        results = {(s["activationQueueAssumption"], s["percentAheadRetained"], s["removalTimingAssumption"]): s["filledShares"] for s in result["scenarios"]}
        self.assertEqual(results[("snapshot_already_reflects_preactivation_print", 100, "cancel_on_received_removal")], 0)
        self.assertEqual(results[("snapshot_already_reflects_preactivation_print", 50, "cancel_on_received_removal")], 5)
        self.assertEqual(results[("preactivation_print_consumes_additional_displayed_queue", 100, "cancel_on_received_removal")], 5)

    def test_rejects_missing_print(self):
        path = Path(__file__).parent / "belgian-2026-july-16-matchup-events.json"
        document = json.loads(path.read_text())
        document["rows"] = [row for row in document["rows"] if row["type"] != "last_trade_price"]
        with self.assertRaisesRegex(ValueError, "four distinct prints"):
            analyze(document)

    def test_rejects_intervening_crossed_quote(self):
        path = Path(__file__).parent / "belgian-2026-july-16-matchup-events.json"
        document = json.loads(path.read_text())
        from belgian_queue_sensitivity import CONDITION, NORRIS
        document["rows"].append({"condition": CONDITION, "asset": NORRIS, "type": "price_change",
                                 "received": 1784200266000, "side": "SELL", "price": "0.40", "size": "1"})
        with self.assertRaisesRegex(ValueError, "unsafe"):
            analyze(document)

    def test_rejects_delayed_print_from_before_activation(self):
        path = Path(__file__).parent / "belgian-2026-july-16-matchup-events.json"
        document = json.loads(path.read_text())
        print_row = next(row for row in document["rows"] if row.get("transactionHash") ==
                         "0x17ba94b0f4dc90ffa2fb74187b686c3b35c25bab6f3d4e3a18f493dee25f087b")
        print_row["source"] = 1784200265243
        with self.assertRaisesRegex(ValueError, "around order activation"):
            analyze(document)

    def test_rejects_crossing_update_before_activation(self):
        path = Path(__file__).parent / "belgian-2026-july-16-matchup-events.json"
        document = json.loads(path.read_text())
        from belgian_queue_sensitivity import CONDITION, NORRIS
        document["rows"].append({"condition": CONDITION, "asset": NORRIS, "type": "price_change",
                                 "received": 1784200265000, "side": "SELL", "price": "0.40", "size": "1"})
        with self.assertRaisesRegex(ValueError, "preactivation book change"):
            analyze(document)


if __name__ == "__main__":
    unittest.main()

"""Synthetic fixtures test engine wiring only; they are not market observations."""
import importlib.util
from pathlib import Path
import unittest

PATH = Path(__file__).resolve().parents[1] / "research/prediction-markets/nautilus/backtest.py"
specification = importlib.util.spec_from_file_location("market_backtest", PATH)
module = importlib.util.module_from_spec(specification)
specification.loader.exec_module(module)


def fixture():
    return {
        "pair": {"driverA": "A", "driverB": "B"},
        "firstPractice": 20000,
        "exitTime": 19000,
        "exitMode": "settlement",
        "settlement": 1,
        "coverage": {"start": 10000, "end": 19000, "complete": True},
        "events": [
            {"type": "snapshot", "timestamp": 10000, "sourceTimestamp": 10000,
             "bids": [[0.45, 3]], "asks": [[0.55, 3]]},
            {"type": "trade", "timestamp": 12000, "sourceTimestamp": 12000, "side": "sell", "price": 0.45, "quantity": 8},
            {"type": "update", "timestamp": 13000, "sourceTimestamp": 13000, "side": "buy", "price": 0.45, "quantity": 3},
            {"type": "trade", "timestamp": 15000, "sourceTimestamp": 15000, "side": "buy", "price": 0.55, "quantity": 8},
        ],
    }


class MarketBacktestTest(unittest.TestCase):
    def test_winner_strategy_limits_quotes_to_model_edge(self):
        data = fixture()
        del data["pair"]
        data["instrument"] = {"type": "race-winner", "driver": "A", "race": "Example Grand Prix"}
        data["fairValue"] = {"probability": 0.4, "asOf": 10000}
        result = module.run_backtest(data, minimum_edge_ticks=10)
        self.assertTrue(result["fills"])
        self.assertTrue(all(fill["side"] == "sell" and fill["price"] >= 0.5 for fill in result["fills"]))

    def test_winner_strategy_rejects_missing_or_future_forecasts(self):
        data = fixture()
        data["instrument"] = {"type": "race-winner", "driver": "A", "race": "Example Grand Prix"}
        with self.assertRaisesRegex(ValueError, "dated fair value"):
            module.convert_events(data)
        data["fairValue"] = {"probability": 0.6, "asOf": 19001}
        with self.assertRaisesRegex(ValueError, "Invalid dated fair value"):
            module.convert_events(data)

    def test_winner_strategy_does_not_quote_before_forecast(self):
        data = fixture()
        data["instrument"] = {"type": "race-winner", "driver": "A", "race": "Example Grand Prix"}
        data["fairValue"] = {"probability": 0.4, "asOf": 16000}
        self.assertEqual(module.run_backtest(data, minimum_edge_ticks=10)["fills"], [])
        with self.assertRaisesRegex(ValueError, "Invalid strategy settings"):
            module.run_backtest(data, minimum_edge_ticks=0.5)

    def test_engine_replays_depth_and_realizes_settlement(self):
        result = module.run_backtest(fixture())
        self.assertTrue(result["fills"])
        self.assertAlmostEqual(result["profit"], result["cash"] + result["inventory"] * result["settlement"])
        self.assertTrue(all(fill["timestamp"] <= 19000 * 1_000_000 for fill in result["fills"]))

    def test_unverified_coverage_fails(self):
        data = fixture()
        data["coverage"]["complete"] = False
        with self.assertRaisesRegex(ValueError, "coverage"):
            module.convert_events(data)

    def test_stale_snapshot_fails(self):
        data = fixture()
        data["events"][0]["sourceTimestamp"] = -60001
        with self.assertRaisesRegex(ValueError, "fresh initial snapshot"):
            module.convert_events(data)

    def test_ambiguous_source_time_fails(self):
        data = fixture()
        del data["events"][0]["sourceTimestamp"]
        with self.assertRaisesRegex(ValueError, "fresh initial snapshot"):
            module.convert_events(data)

    def test_no_recorded_trades_fails(self):
        data = fixture()
        data["events"] = data["events"][:1]
        with self.assertRaisesRegex(ValueError, "recorded trade"):
            module.convert_events(data)

    def test_missing_trade_source_time_fails(self):
        data = fixture()
        del data["events"][1]["sourceTimestamp"]
        with self.assertRaisesRegex(ValueError, "source timestamp"):
            module.convert_events(data)

    def test_crossed_book_fails(self):
        data = fixture()
        data["events"][0]["bids"] = [[0.60, 3]]
        with self.assertRaisesRegex(ValueError, "Crossed recorded book"):
            module.convert_events(data)

    def test_snapshot_differences_do_not_clear_queue(self):
        data = fixture()
        data["events"].insert(2, {"type": "snapshot", "timestamp": 12500, "sourceTimestamp": 12500,
                                  "bids": [[0.45, 4]], "asks": [[0.55, 3]]})
        records = module.convert_events(data)
        book_events = [event for event in records if isinstance(event, module.OrderBookDeltas)]
        self.assertTrue(all(delta.action != module.BookAction.CLEAR for event in book_events for delta in event.deltas))

    def test_price_outside_historical_tick_fails(self):
        data = fixture()
        data["events"][0]["bids"] = [[0.455, 3]]
        with self.assertRaisesRegex(ValueError, "specified tick"):
            module.run_backtest(data, tick_size=0.01)

    def test_first_practice_cutoff_fails(self):
        data = fixture()
        data["exitTime"] = data["firstPractice"]
        with self.assertRaisesRegex(ValueError, "strictly before"):
            module.convert_events(data)


if __name__ == "__main__":
    unittest.main()

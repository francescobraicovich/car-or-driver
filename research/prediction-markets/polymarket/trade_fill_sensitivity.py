"""Conditional single-print queue sensitivity from a filtered PMXT event sample."""

import json
from decimal import Decimal
from pathlib import Path


FIRST_PRACTICE = 1783078200000
ORDER_SIZE = Decimal("5")
LATENCY_MS = 1000
CASES = [
    {"drivers": ["Norris", "Verstappen"], "outcome": "Norris",
     "condition": "0xc681d9adb3ff2259b773f29e492c94da788340ca5bf96f2441c9a4b168d54627",
     "asset": "64675849148377066547031457068862742099033783801249908746379708460180052870193",
     "oppositeAsset": "59328843739920879056187273127935991910188396616533585380591564521607617735681",
     "transaction": "0x885b84634df76268f9a290c36395fbf29c611098270e1fff9d6ab90159caf2cd", "side": "buy"},
    {"drivers": ["Verstappen", "Piastri"], "outcome": "Piastri",
     "condition": "0xbc8f1aed945424d60a4530a7fae0b3e88e301423318ae1f580e2dd3a542c7720",
     "asset": "80595551565276890922993088912235451676307202046130027030767930421691677753306",
     "oppositeAsset": "65705964083848363061314266547064088796436874388751923270212764138017728051390",
     "transaction": "0xfc737d7911b7e13643026f476e48504c5798ef36e9d9c07ca3e58d5e871787f2", "side": "buy"},
    {"drivers": ["Norris", "Piastri"], "outcome": "Norris",
     "condition": "0x187ab0d2c601e1d9f881d817fdfb31817e49b37e22b229e367d7775f43b53876",
     "asset": "9935985870439334783856834513792982376105221888748764082308099364863034154061",
     "oppositeAsset": "7075041477167708224996805966877326105760257129688551295687329827151359580534",
     "transaction": "0x1c1aebb1958bce4e63c6f3a63b7763e5b071252bb4be422d4aaf0529e50e25ac", "side": "buy"},
    {"drivers": ["Norris", "Hamilton"], "outcome": "Hamilton",
     "condition": "0xb4d2525fb9a7a812dc4aa433a4ce747b0b7a631758c0b5f11ed96a6e1fa663a2",
     "asset": "61313360502185469404836813116958564744995221543467802072399511607765824266667",
     "transaction": "0x7e0a3a8fd902f5d5007e8e30d2ff218a2c9190c8339eb1f22f0e3a9beeede6eb", "side": "sell"},
]


def one_print_fills(ahead, trade_size, order_size=ORDER_SIZE):
    """Sizes if 100%, 50%, or 0% of displayed queue remains ahead."""
    ahead, trade_size, order_size = map(lambda value: Decimal(str(value)), (ahead, trade_size, order_size))
    if not all(value.is_finite() for value in (ahead, trade_size, order_size)) or ahead < 0 or trade_size <= 0 or order_size <= 0:
        raise ValueError("invalid queue, trade or order size")
    return {str(percent): float(min(order_size, max(Decimal(0), trade_size - ahead * Decimal(percent) / 100)))
            for percent in (100, 50, 0)}


def analyze(rows, case):
    market = [row for row in rows if row["condition"] == case["condition"]]
    snapshots = sorted((row for row in market if row["asset"] == case["asset"] and row["type"] == "book"),
                       key=lambda row: row["received"])
    print_asset = case["oppositeAsset"] if case["side"] == "buy" else case["asset"]
    prints = [row for row in market if row["asset"] == print_asset and
              row["type"] == "last_trade_price" and row.get("transactionHash") == case["transaction"]]
    if not snapshots or len(prints) != 1:
        raise ValueError("initial book or uniquely identified trade missing")
    book, trade = snapshots[0], prints[0]
    if (not isinstance(book["received"], int) or not isinstance(trade["received"], int)
            or not isinstance(trade["source"], int) or book["received"] + LATENCY_MS >= trade["source"]
            or trade["received"] >= case.get("firstPractice", FIRST_PRACTICE) or trade["source"] > trade["received"]):
        raise ValueError("timing does not support the assumed pre-practice quote")
    bids = [(Decimal(p), Decimal(q)) for p, q in json.loads(book["bids"])]
    asks = [(Decimal(p), Decimal(q)) for p, q in json.loads(book["asks"])]
    if not bids or not asks:
        raise ValueError("initial book is one-sided")
    bid, bid_size = max(bids)
    ask, ask_size = min(asks)
    quote, ahead = (bid, bid_size) if case["side"] == "buy" else (ask, ask_size)
    expected_price = 1 - quote if case["side"] == "buy" else quote
    if not 0 < bid < ask < 1 or ahead <= 0 or trade["side"] != "BUY" or Decimal(trade["price"]) != expected_price:
        raise ValueError("print cannot be mapped to the quoted opposite-token bid")
    intervening = [row for row in market if row["asset"] == case["asset"] and
                   row["type"] in ("book", "price_change") and book["received"] < row["received"] < trade["received"]]
    for row in intervening:
        if row["type"] == "book":
            raise ValueError("an intervening snapshot requires a full replay")
        price, quantity = Decimal(row["price"]), Decimal(row["size"])
        own_side = "BUY" if case["side"] == "buy" else "SELL"
        if row["side"] == own_side:
            better = price > quote if case["side"] == "buy" else price < quote
            if (better and quantity > 0) or (price == quote and quantity != ahead):
                raise ValueError("an intervening change affects the selected quote")
        else:
            crosses = price <= quote if case["side"] == "buy" else price >= quote
            if crosses and quantity > 0:
                raise ValueError("an intervening change crosses the selected quote")
    outcomes = one_print_fills(ahead, trade["size"])
    return {"drivers": case["drivers"], "selectedOutcome": case["outcome"],
            "snapshotReceived": book["received"], "snapshotSource": book["source"],
            "bidPrice": float(bid), "askPrice": float(ask), "orderSide": case["side"],
            "quotedPrice": float(quote), "displayedSharesAhead": float(ahead),
            "tradeSource": trade["source"], "tradeReceived": trade["received"],
            "transaction": case["transaction"], "printShares": float(Decimal(trade["size"])),
            "orderShares": float(ORDER_SIZE), "fillsByPercentOfSnapshotQueueRemainingAhead": outcomes,
            "conditionalGrossProfitPayoutOneByPercent": {key: round(size * (1 - float(quote) if case["side"] == "buy" else float(quote) - 1), 6) for key, size in outcomes.items()}}


def main():
    root = Path("research/prediction-markets/polymarket")
    sources = [json.loads((root / f"british-2026-july-{day}-matchup-events.json").read_text()) for day in ("01", "02")]
    rows = [row for source in sources for row in source["rows"]]
    output = {"classification": "hypothetical single-print sensitivity, not observed fills or a performance backtest",
              "source": sources[0]["source"], "sourceFiles": [item for source in sources for item in source["sources"]],
              "coverageComplete": all(source["coverageComplete"] for source in sources), "orderLatencyMs": LATENCY_MS,
              "assumedOutcomePayout": 1, "assumptions": [
                  "orders placed after the first selected-token snapshot and active after one second",
                  "a complementary BUY can match our bid by minting or a same-token BUY our ask; print reaches our quote",
                  "single-print FIFO sensitivity with specified fraction of snapshot queue remaining ahead",
                  "settlement of one unit per selected share is hypothetical; actual oracle payouts not verified",
                  "maker fees and rebates, funding, capital opportunity cost, and all other trades are ignored",
              ], "cases": [analyze(rows, case) for case in CASES]}
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()

"""Conditional queue scenarios for one pre-practice Belgian matchup."""

import json
from decimal import Decimal
from pathlib import Path

CONDITION = "0x201837def9546e36162485a032d42e122e0fc178e3edd101829f023229c9353b"
NORRIS = "6784244933355452506112630504574148082367864944007584854349339256552320846762"
PIASTRI = "100031167915008007232049004704969861604148356539392820585808617938160568782427"
FIRST_PRACTICE = 1784287800000
LATENCY_MS = 1000
ORDER_SIZE = Decimal("5")


def replay_prints(queue_ahead, prints, order_size=ORDER_SIZE):
    """Reduce a single FIFO queue with prints only; never double-count book updates."""
    ahead, remaining = Decimal(str(queue_ahead)), Decimal(str(order_size))
    if not ahead.is_finite() or not remaining.is_finite() or ahead < 0 or remaining <= 0:
        raise ValueError("invalid queue or order size")
    fills = []
    for trade in prints:
        quantity = Decimal(str(trade["size"]))
        if not quantity.is_finite() or quantity <= 0:
            raise ValueError("invalid print size")
        consumed = min(ahead, quantity)
        ahead -= consumed
        filled = min(remaining, quantity - consumed)
        remaining -= filled
        if filled:
            fills.append({"transaction": trade["transactionHash"], "shares": float(filled)})
    return {"filledShares": float(Decimal(str(order_size)) - remaining), "queueRemaining": float(ahead), "fills": fills}


def analyze(document):
    market = [row for row in document["rows"] if row["condition"] == CONDITION]
    snapshots = sorted((row for row in market if row["asset"] == NORRIS and row["type"] == "book"),
                       key=lambda row: row["received"])
    trades = sorted((row for row in market if row["asset"] == PIASTRI and row["type"] == "last_trade_price"),
                    key=lambda row: row["received"])
    if not snapshots or len(trades) != 4 or len({row["transactionHash"] for row in trades}) != 4:
        raise ValueError("expected initial snapshot and four distinct prints")
    book = snapshots[0]
    bids = [(Decimal(price), Decimal(quantity)) for price, quantity in json.loads(book["bids"])]
    asks = [(Decimal(price), Decimal(quantity)) for price, quantity in json.loads(book["asks"])]
    if not bids or not asks:
        raise ValueError("initial book is one-sided")
    bid, displayed = max(bids)
    ask = min(price for price, _ in asks)
    if not 0 < bid < ask < 1 or displayed <= 0:
        raise ValueError("initial book is invalid")
    activation = book["received"] + LATENCY_MS
    if any(t["side"] != "BUY" or Decimal(t["price"]) != 1 - bid or t["source"] > t["received"] for t in trades):
        raise ValueError("print side, price or timestamp mismatch")
    if any(t["received"] >= FIRST_PRACTICE for t in trades):
        raise ValueError("print is not strictly before first practice")
    before_activation = [t for t in trades if t["received"] < activation]
    after_activation = [t for t in trades if t["received"] > activation]
    if len(before_activation) != 1 or len(after_activation) != 3:
        raise ValueError("unexpected trade and activation ordering")
    if any(t["source"] >= activation for t in before_activation) or any(t["source"] <= activation for t in after_activation):
        raise ValueError("ambiguous exchange trade time around order activation")
    for row in market:
        if row["asset"] != NORRIS or not book["received"] < row["received"] <= activation:
            continue
        if row["type"] == "book":
            raise ValueError("intervening snapshot makes activation queue ambiguous")
        if row["type"] == "price_change":
            price, quantity = Decimal(row["price"]), Decimal(row["size"])
            if (row["side"] == "BUY" and price >= bid) or (row["side"] == "SELL" and price <= bid and quantity > 0):
                raise ValueError("preactivation book change makes hypothetical quote unsafe")
    price_changes = [row for row in market if row["asset"] == NORRIS and row["type"] == "price_change"
                     and row["side"] == "BUY" and Decimal(row["price"]) == bid and row["received"] > activation]
    removals = sorted((row for row in price_changes if Decimal(row["size"]) == 0), key=lambda row: row["received"])
    if not removals:
        raise ValueError("recorded removal of quote not found")
    removal_time = removals[0]["received"]
    # The hypothetical order remains post-only at the recorded touch until the
    # removal. These checks do not prove the unobserved book was complete.
    for row in market:
        if row["asset"] != NORRIS or not activation < row["received"] < removal_time:
            continue
        if row["type"] == "price_change":
            price, quantity = Decimal(row["price"]), Decimal(row["size"])
            if quantity > 0 and ((row["side"] == "BUY" and price > bid) or (row["side"] == "SELL" and price <= bid)):
                raise ValueError("recorded book makes the hypothetical order unsafe")
        if row["type"] == "book":
            observed_bids = [Decimal(price) for price, quantity in json.loads(row["bids"]) if Decimal(quantity) > 0]
            observed_asks = [Decimal(price) for price, quantity in json.loads(row["asks"]) if Decimal(quantity) > 0]
            if not observed_bids or max(observed_bids) != bid or not observed_asks or min(observed_asks) <= bid:
                raise ValueError("recorded book makes the hypothetical order unsafe")
    if any(t["received"] == removal_time for t in after_activation):
        raise ValueError("unknown event ordering at cancellation")
    if sum(t["received"] < removal_time for t in after_activation) != 2:
        raise ValueError("unexpected number of prints before recorded removal")
    queue_hypotheses = {
        "snapshot_already_reflects_preactivation_print": displayed,
        "preactivation_print_consumes_additional_displayed_queue": max(Decimal(0), displayed - Decimal(before_activation[0]["size"])),
    }
    scenarios = []
    for hypothesis, queue in queue_hypotheses.items():
        for retained in (100, 50, 0):
            for timing in ("cancel_on_received_removal", "last_trade_reaches_before_cancel"):
                selected = [t for t in after_activation if timing != "cancel_on_received_removal" or t["received"] < removal_time]
                result = replay_prints(queue * retained / 100, selected)
                scenarios.append({"activationQueueAssumption": hypothesis, "percentAheadRetained": retained,
                                  "removalTimingAssumption": timing, **result,
                                  "conditionalGrossProfitAssumingZeroPayout": round(-float(bid) * result["filledShares"], 6)})
    return {"classification": "hypothetical queue and event-order sensitivity; no actual fill observed",
            "coverageComplete": document["coverageComplete"], "source": document["source"],
            "sourceFiles": document["sources"], "pair": ["Norris", "Piastri"], "selectedOutcome": "Norris",
            "snapshotReceived": book["received"], "snapshotSource": book["source"], "activation": activation,
            "quotedBid": float(bid), "initialAsk": float(ask), "displayedSharesInSnapshot": float(displayed),
            "preactivationPrint": {"source": before_activation[0]["source"], "received": before_activation[0]["received"],
                                   "shares": float(Decimal(before_activation[0]["size"])),
                                   "transaction": before_activation[0]["transactionHash"]},
            "recordedBidRemoval": removal_time,
            "postactivationPrints": [{"source": t["source"], "received": t["received"],
                                      "shares": float(Decimal(t["size"])), "transaction": t["transactionHash"]}
                                     for t in after_activation],
            "assumedSettlementPayout": 0, "scenarios": scenarios}


def main():
    path = Path("research/prediction-markets/polymarket/belgian-2026-july-16-matchup-events.json")
    print(json.dumps(analyze(json.loads(path.read_text())), indent=2))


if __name__ == "__main__":
    main()

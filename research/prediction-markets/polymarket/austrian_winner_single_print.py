"""Two selected single-print sensitivities, not historical simulated fills."""

import json
from decimal import Decimal
from pathlib import Path

AS_OF = 1782396000000
EDGE = Decimal("0.01")
SIZE = Decimal("5")
MICRO = Decimal("1000000")

CASES = [
    {
        "driver": "Norris", "driverId": "846", "condition": "0x4660332081e4aca6fe2456ceb6370f49366257ee43ed138cdb14ced55158a3b5",
        "yes": "24216312900714616454605626938457375146268588031086210672731405048715498030153",
        "no": "34796736142026392511185687667807746522769353124596851711940302139688791509909",
        "side": "buy",
        "transaction": "0x1eb338278faa3506334b3e2eff4204df98612d57c25c6f6b2b8e0929dd0fa931",
    },
    {
        "driver": "Hamilton", "driverId": "1", "condition": "0xecb91145f7ed41128c538bd4828072c8e3f47f11253f80b252123c6890a3a94f",
        "yes": "82236222753757094269178031193182750388049025367439430202758328328253193544474",
        "no": "99765331245255195052701441582397349317632998386742131434607264656398211524175",
        "side": "sell",
        "transaction": "0x024d44b559d8df60dd7635a9d0dc93664f45faf48a2304cfc11bdae020cd1730",
    },
]


def levels(snapshot):
    return {"BUY": {Decimal(p): Decimal(q) for p, q in json.loads(snapshot["bids"])},
            "SELL": {Decimal(p): Decimal(q) for p, q in json.loads(snapshot["asks"])}}


def best(book, side):
    return (max if side == "BUY" else min)(book[side])


def apply_update(book, event):
    side, price, quantity = event["side"], Decimal(event["price"]), Decimal(event["size"])
    if quantity:
        book[side][price] = quantity
    else:
        book[side].pop(price, None)


def reported_yes_payout(case, resolution):
    """Use the exchange's resolved metadata for reporting, never quote decisions."""
    market = next((m for m in resolution["markets"] if m["conditionId"] == case["condition"]), None)
    if not market or not market["closed"] or market["umaResolutionStatus"] != "resolved" or market["outcomes"] != ["Yes", "No"]:
        raise ValueError("Expected closed, resolved YES/NO market metadata")
    yes, no = map(Decimal, market["outcomePrices"])
    if yes not in (0, 1) or no != 1 - yes:
        raise ValueError("Expected complementary binary reported settlement prices")
    return yes


def scenario(case, archive, chain, baseline, resolution):
    forecast = next(r for r in baseline["results"] if r["raceId"] == "1176")
    if forecast["decisionTime"] != "2026-06-25T14:00:00.000Z":
        raise ValueError("Unexpected forecast decision time")
    fair = Decimal(str(next(r["probability"] for r in forecast["roster"] if r["driverId"] == case["driverId"])))
    rows = [r for r in archive["rows"] if r["condition"] == case["condition"]]
    snapshot = next(r for r in rows if r["asset"] == case["yes"] and r["type"] == "book" and r["received"] >= AS_OF)
    activation = snapshot["received"] + 1000
    selected = [r for r in rows if r["type"] == "last_trade_price" and r["transactionHash"] == case["transaction"]]
    if len(selected) != 1 or selected[0]["received"] <= activation or selected[0]["source"] <= activation:
        raise ValueError("Selected transaction must have one later observed print")
    trade = selected[0]
    book = levels(snapshot)
    side = "BUY" if case["side"] == "buy" else "SELL"
    opposing = "SELL" if side == "BUY" else "BUY"
    # Fix the submitted limit from the observed snapshot; using the book at
    # activation to choose it would look one second into the future.
    quote = best(book, side)
    if (side == "BUY" and quote > fair - EDGE) or (side == "SELL" and quote < fair + EDGE):
        raise ValueError("Quote does not satisfy the dated proxy edge")
    for event in rows:
        if not snapshot["received"] < event["received"] < activation:
            continue
        if event["type"] == "last_trade_price":
            raise ValueError("A print during submission leaves activation queue uncertain")
        if event["asset"] != case["yes"]:
            continue
        if event["type"] == "price_change":
            apply_update(book, event)
        elif event["type"] == "book":
            book = levels(event)
    if not book[opposing] or ((side == "BUY" and best(book, opposing) <= quote) or (side == "SELL" and best(book, opposing) >= quote)):
        raise ValueError("The submitted post-only quote crosses the activation book")
    queue = book[side].get(quote, Decimal("0"))
    if any(r["type"] == "last_trade_price" and r["received"] == trade["received"] and r["transactionHash"] != trade["transactionHash"] for r in rows):
        raise ValueError("Multiple prints at the same receipt time have uncertain ordering")

    # Reject any known earlier marketable print or crossing observation. Same-receipt
    # messages at the selected print are excluded because their order is unknown.
    for event in rows:
        if not activation < event["received"] < trade["received"]:
            continue
        if event["type"] == "last_trade_price":
            price = Decimal(event["price"])
            is_yes = event["asset"] == case["yes"]
            economic_side = event["side"] if is_yes else {"BUY": "SELL", "SELL": "BUY"}[event["side"]]
            economic_price = price if is_yes else Decimal("1") - price
            if (side == "BUY" and economic_side == "SELL" and economic_price <= quote) or (
                side == "SELL" and economic_side == "BUY" and economic_price >= quote
            ):
                raise ValueError("An earlier observed print could affect the order")
        if event["asset"] != case["yes"]:
            continue
        if event["type"] == "price_change":
            apply_update(book, event)
        elif event["type"] == "book":
            book = levels(event)
        if book[opposing] and ((side == "BUY" and best(book, opposing) <= quote) or (side == "SELL" and best(book, opposing) >= quote)):
            raise ValueError("An earlier observed book could cross the order")

    price = Decimal(trade["price"])
    expected_asset = case["no"] if side == "BUY" else case["yes"]
    if trade["asset"] != expected_asset or trade["side"] != "BUY" or (Decimal("1") - price if side == "BUY" else price) != quote:
        raise ValueError("Selected print is not at the quoted price and opposite side")
    maker_token = case["yes"] if side == "BUY" else case["no"]
    legs = [r for r in chain if r["transactionHash"] == case["transaction"] and not r["takerIsExchange"] and r["tokenId"] == maker_token]
    eligible = Decimal("0")
    for leg in legs:
        if leg["side"] != 0:
            raise ValueError("Unexpected on-chain maker side")
        quantity = Decimal(leg["takerAmountFilled"]) / MICRO
        maker_price = Decimal(leg["makerAmountFilled"]) / Decimal(leg["takerAmountFilled"])
        if (maker_price if side == "BUY" else Decimal("1") - maker_price) == quote:
            eligible += quantity
    if not legs or eligible > Decimal(trade["size"]):
        raise ValueError("No matching maker legs or inconsistent print size")
    conservative = min(SIZE, max(Decimal("0"), eligible - queue))
    optimistic = min(SIZE, eligible)
    # The exchange's resolved metadata is read only after quote and fill decisions.
    # This is not an independent on-chain oracle verification.
    payout = reported_yes_payout(case, resolution)
    profit_per_share = payout - quote if side == "BUY" else quote - payout
    return {
        "driver": case["driver"], "quoteSide": case["side"], "quotePrice": str(quote),
        "proxy": str(fair), "forecastAsOf": AS_OF, "snapshotReceived": snapshot["received"], "orderSubmission": snapshot["received"],
        "snapshotSource": snapshot["source"], "orderActivation": activation, "printReceived": trade["received"],
        "printSource": trade["source"], "transaction": case["transaction"], "displayedAheadAtActivation": str(queue),
        "printReportedShares": trade["size"], "onchainSharesAtQuote": str(eligible),
        "allAheadShares": str(conservative), "zeroAheadShares": str(optimistic),
        "reportedYesPayout": str(payout),
        "allAheadPnlAtReportedSettlement": str(conservative * profit_per_share),
        "zeroAheadPnlAtReportedSettlement": str(optimistic * profit_per_share),
    }


def paired_payoff(norris_payout, hamilton_payout):
    """Payoff change against retaining 5 Hamilton complete sets and $0.25 cash."""
    if norris_payout not in (0, 1) or hamilton_payout not in (0, 1) or norris_payout + hamilton_payout > 1:
        raise ValueError("Only mutually exclusive binary race-winner payouts are supported; check void or other rules separately")
    return Decimal("0.90") + SIZE * Decimal(norris_payout) - SIZE * Decimal(hamilton_payout)


def main():
    root = Path('research/prediction-markets/polymarket')
    archive = json.loads((root / 'austrian-2026-june-25-winner-events.json').read_text())
    chain = json.loads((root / 'onchain/winner/winner-onchain-events.json').read_text())
    baseline = json.loads((root.parent / 'forecast/austrian-2026-baseline.json').read_text())
    resolution = json.loads((root / 'austrian-2026-official-outcomes.json').read_text())
    results = [scenario(case, archive, chain, baseline, resolution) for case in CASES]
    print(json.dumps({"classification": "hypothetical selected-print sensitivity, not a backtest",
                      "coverageComplete": False,
                      "settlementReportedByExchange": True, "oracleIndependentlyVerified": False,
                      "resolutionSource": resolution["requestUrl"], "resolutionRetrievedAt": resolution["retrievedAt"],
                      "historicalTickVerified": False, "historicalFeeVerified": False,
                      "makerFeeAssumed": 0, "results": results,
                      "pairedIllustration": {
                          "condition": "Both 5-share hypothetical fills, prefunded Hamilton complete sets; no actual fills are claimed",
                          "initialCapital": "5.25",
                          "norrisWins": str(paired_payoff(1, 0)),
                          "hamiltonWins": str(paired_payoff(0, 1)),
                          "anotherDriverWins": str(paired_payoff(0, 0)),
                          "caveat": "Payouts are assumed binary and mutually exclusive; canceled, postponed, other and void rules require separate verification.",
                      }}, indent=2))


if __name__ == '__main__':
    main()

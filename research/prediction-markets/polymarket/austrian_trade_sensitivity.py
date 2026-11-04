"""Conditional queue sensitivity on an Austrian GP pre-practice trade."""

import json
from pathlib import Path

from trade_fill_sensitivity import analyze

CASE = {"drivers": ["Leclerc", "Hamilton"], "outcome": "Leclerc",
        "condition": "0xf8f005ade2a08b66cb628c6830909c6fa8a097bb5579f7b46a4e2a20a8062a7d",
        "asset": "59579997606986792882952173130741180502938164545065581920848082848836639745631",
        "oppositeAsset": "43799393751941094885449163111314762889950104004629668819469183247564550800864",
        "transaction": "0x783c88f6d39044eb2d91e6880e480430c5b2686bcb8b74fbc9df8ecc12ac081b",
        "side": "buy", "firstPractice": 1782473400000}


def main():
    path = Path("research/prediction-markets/polymarket/austrian-2026-june-24-matchup-events.json")
    source = json.loads(path.read_text())
    result = analyze(source["rows"], CASE)
    result.pop("conditionalGrossProfitPayoutOneByPercent")
    result["conditionalGrossProfitAssumingZeroPayoutByPercent"] = {
        key: round(-result["quotedPrice"] * shares, 6)
        for key, shares in result["fillsByPercentOfSnapshotQueueRemainingAhead"].items()}
    print(json.dumps({"classification": "hypothetical single-print sensitivity; no actual fill observed",
                      "coverageComplete": source["coverageComplete"], "source": source["source"],
                      "sourceFiles": source["sources"], "assumedSettlementPayout": 0, "result": result}, indent=2))


if __name__ == "__main__":
    main()

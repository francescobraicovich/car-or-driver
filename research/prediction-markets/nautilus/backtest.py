"""A separate NautilusTrader L2 replay. Inputs are recorded events, never candles."""
import argparse
import json
import math
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR

from nautilus_trader.backtest.engine import BacktestEngine
from nautilus_trader.backtest.models import LatencyModel
from nautilus_trader.config import BacktestEngineConfig, LoggingConfig
from nautilus_trader.model.currencies import USD
from nautilus_trader.model.data import BookOrder, OrderBookDelta, OrderBookDeltas, TradeTick
from nautilus_trader.model.enums import (
    AccountType, AggressorSide, AssetClass, BookAction, BookType, OmsType,
    OrderSide, RecordFlag,
)
from nautilus_trader.model.identifiers import InstrumentId, Symbol, TradeId, Venue
from nautilus_trader.model.instruments import BinaryOption
from nautilus_trader.model.objects import Money, Price, Quantity
from nautilus_trader.trading.strategy import Strategy


VENUE = Venue("RESEARCH")
IDENTIFIER = InstrumentId(Symbol("DRIVER-MATCHUP"), VENUE)
PRICE_PLACES = 4
SIZE_PLACES = 6


def price(value):
    return Price(float(value), PRICE_PLACES)


def size(value):
    return Quantity(float(value), SIZE_PLACES)


def convert_events(document, max_snapshot_age_ms=60000):
    """Convert ordered snapshots, level updates, and prints into native L2 events."""
    coverage = document.get("coverage", {})
    cutoff = document.get("exitTime")
    practice = document.get("firstPractice")
    if not isinstance(cutoff, int) or not isinstance(practice, int) or cutoff >= practice:
        raise ValueError("A verified exitTime strictly before firstPractice is required")
    if coverage.get("complete") is not True or coverage.get("end", -1) < cutoff:
        raise ValueError("Verified coverage through exitTime is required")
    instrument = document.get("instrument", {})
    winner = instrument.get("type") == "race-winner"
    pair = document.get("pair", {})
    if winner:
        if not instrument.get("driver") or not instrument.get("race"):
            raise ValueError("A driver and race are required")
    elif not pair.get("driverA") or not pair.get("driverB") or pair["driverA"] == pair["driverB"]:
        raise ValueError("Two distinct drivers are required")
    fair_value = document.get("fairValue")
    if winner and not isinstance(fair_value, dict):
        raise ValueError("Race winner markets require a dated fair value")
    if fair_value is not None:
        if not isinstance(fair_value, dict):
            raise ValueError("Invalid dated fair value")
        probability = fair_value.get("probability")
        as_of = fair_value.get("asOf")
        if (not isinstance(probability, (int, float)) or isinstance(probability, bool)
                or not math.isfinite(probability) or not 0 <= probability <= 1
                or not isinstance(as_of, int) or isinstance(as_of, bool) or not 0 <= as_of <= cutoff):
            raise ValueError("Invalid dated fair value")
    if document.get("exitMode") != "settlement" or document.get("settlement") not in [0, 0.5, 1]:
        raise ValueError("A known settlement of 0, 0.5, or 1 is required")
    events = document.get("events")
    if not isinstance(events, list) or not events:
        raise ValueError("Recorded L2 events and trades are required")
    if events[0].get("type") != "snapshot" or events[0].get("timestamp", -1) < coverage.get("start", 0):
        raise ValueError("An initial snapshot inside declared coverage is required")
    initial = events[0]
    exchange_timestamp = initial.get("sourceTimestamp")
    receipt_timestamp = initial.get("timestamp")
    if (not isinstance(exchange_timestamp, int) or not isinstance(receipt_timestamp, int)
            or exchange_timestamp < 0 or exchange_timestamp > receipt_timestamp or receipt_timestamp - exchange_timestamp > max_snapshot_age_ms
            or receipt_timestamp > cutoff):
        raise ValueError("A fresh initial snapshot with exchange and receipt timestamps is required")
    levels = {"buy": {}, "sell": {}}
    result = []
    previous = -1
    same_timestamp_index = 0
    trades = 0
    last_book_time = None

    def valid_number(value, lower, upper):
        return isinstance(value, (int, float)) and math.isfinite(value) and lower < value < upper

    for index, event in enumerate(events):
        timestamp = event.get("timestamp")
        if not isinstance(timestamp, int) or timestamp < previous:
            raise ValueError("Event times must be ordered integer milliseconds")
        same_timestamp_index = same_timestamp_index + 1 if timestamp == previous else 0
        if same_timestamp_index >= 1_000_000:
            raise ValueError("Too many events in one millisecond")
        previous = timestamp
        if timestamp > cutoff:
            continue
        source_time = event.get("sourceTimestamp")
        if not isinstance(source_time, int) or source_time < 0 or source_time > timestamp or timestamp - source_time > max_snapshot_age_ms:
            raise ValueError("Event has a missing or stale source timestamp")
        # Preserve the input order for events with the same millisecond.
        nanoseconds = timestamp * 1_000_000 + same_timestamp_index
        if event.get("type") == "trade":
            if last_book_time is None or timestamp - last_book_time > max_snapshot_age_ms:
                raise ValueError("Trade arrived with a stale book")
            side = {"buy": AggressorSide.BUYER, "sell": AggressorSide.SELLER}.get(event.get("side"))
            if side is None or not valid_number(event.get("price"), 0, 1) or not valid_number(event.get("quantity"), 0, math.inf):
                raise ValueError("Invalid recorded trade")
            result.append(TradeTick(IDENTIFIER, price(event["price"]), size(event["quantity"]), side, TradeId(str(index)), nanoseconds, nanoseconds))
            trades += 1
            continue
        if event.get("type") == "snapshot":
            if not isinstance(event.get("bids"), list) or not isinstance(event.get("asks"), list):
                raise ValueError("Invalid recorded snapshot")
            desired = {"buy": dict(event["bids"]), "sell": dict(event["asks"])}
            if len(desired["buy"]) != len(event["bids"]) or len(desired["sell"]) != len(event["asks"]):
                raise ValueError("Duplicate snapshot price levels")
        elif event.get("type") == "update":
            side = event.get("side")
            if side not in levels:
                raise ValueError("Invalid update side")
            desired = {"buy": levels["buy"].copy(), "sell": levels["sell"].copy()}
            desired[side][event.get("price")] = event.get("quantity")
        else:
            raise ValueError("Unknown event or known data gap")
        for side in ["buy", "sell"]:
            if any(not valid_number(p, 0, 1) or not isinstance(q, (int, float)) or not math.isfinite(q) or q < 0 for p, q in desired[side].items()):
                raise ValueError("Invalid recorded book level")
        bids = [p for p, q in desired["buy"].items() if q > 0]
        asks = [p for p, q in desired["sell"].items() if q > 0]
        if bids and asks and max(bids) >= min(asks):
            raise ValueError("Crossed recorded book")
        last_book_time = timestamp
        changes = []
        for side in ["buy", "sell"]:
            for p in levels[side].keys() | desired[side].keys():
                old = levels[side].get(p, 0)
                new = desired[side].get(p, 0)
                if old == new:
                    continue
                action = BookAction.DELETE if new == 0 else BookAction.UPDATE if old else BookAction.ADD
                order = BookOrder(OrderSide.BUY if side == "buy" else OrderSide.SELL, price(p), size(new), 0)
                changes.append((action, order))
            levels[side] = {p: q for p, q in desired[side].items() if q}
        if changes:
            deltas = [OrderBookDelta(IDENTIFIER, action, order, int(RecordFlag.F_LAST) if i == len(changes) - 1 else 0, 0, nanoseconds, nanoseconds) for i, (action, order) in enumerate(changes)]
            result.append(OrderBookDeltas(IDENTIFIER, deltas))
    if last_book_time is None or cutoff - last_book_time > max_snapshot_age_ms:
        raise ValueError("Book is stale at exitTime")
    if not trades:
        raise ValueError("At least one recorded trade before exitTime is required")
    return result


class MarketMaker(Strategy):
    def __init__(self, order_size, max_inventory, tick_size, fair_value=None, minimum_edge_ticks=1):
        super().__init__()
        self.order_size = order_size
        self.max_inventory = max_inventory
        self.inventory = 0.0
        self.cash = 0.0
        self.fills = []
        self.orders = {}
        self.tick_size = Decimal(str(tick_size))
        self.fair_value = fair_value
        self.minimum_edge_ticks = minimum_edge_ticks

    def on_start(self):
        self.subscribe_order_book_deltas(IDENTIFIER, book_type=BookType.L2_MBP)

    def on_order_book_deltas(self, _deltas):
        if self.fair_value and _deltas.ts_event < self.fair_value['asOf'] * 1_000_000:
            return
        book = self.cache.order_book(IDENTIFIER)
        bid = book.best_bid_price()
        ask = book.best_ask_price()
        if bid is None or ask is None or bid.as_double() >= ask.as_double():
            return
        for side, best in [(OrderSide.BUY, bid), (OrderSide.SELL, ask)]:
            if self.fair_value:
                probability = Decimal(str(self.fair_value['probability']))
                edge = self.tick_size * Decimal(str(self.minimum_edge_ticks))
                bound = (probability - edge if side == OrderSide.BUY else probability + edge) / self.tick_size
                bound = bound.to_integral_value(rounding=ROUND_FLOOR if side == OrderSide.BUY else ROUND_CEILING) * self.tick_size
                desired = min(Decimal(str(bid.as_double())), bound) if side == OrderSide.BUY else max(Decimal(str(ask.as_double())), bound)
                if not 0 < desired < 1:
                    current = self.orders.get(side)
                    if current and not current.is_closed:
                        self.cancel_order(current)
                    continue
                best = price(desired)
            current = self.orders.get(side)
            limit = self.max_inventory - self.inventory if side == OrderSide.BUY else self.max_inventory + self.inventory
            quantity = min(self.order_size, max(0, limit))
            if current and not current.is_closed:
                if current.price != best or current.leaves_qty.as_double() > quantity:
                    self.cancel_order(current)
                continue
            if quantity > 0:
                order = self.order_factory.limit(IDENTIFIER, side, size(quantity), best, post_only=True)
                self.orders[side] = order
                self.submit_order(order)

    def on_order_filled(self, event):
        quantity = event.last_qty.as_double()
        execution_price = event.last_px.as_double()
        sign = 1 if event.order_side == OrderSide.BUY else -1
        self.inventory += sign * quantity
        self.cash -= sign * quantity * execution_price
        self.cash -= event.commission.as_double()
        self.fills.append({"timestamp": event.ts_event, "side": "buy" if sign == 1 else "sell", "price": execution_price, "quantity": quantity, "commission": event.commission.as_double()})

    def on_stop(self):
        self.cancel_all_orders(IDENTIFIER)


def run_backtest(document, tick_size=0.01, order_size=5.0, max_inventory=10.0, latency_ms=1000, minimum_edge_ticks=1):
    if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in [tick_size, order_size, max_inventory, latency_ms, minimum_edge_ticks]):
        raise ValueError("Invalid strategy settings")
    if not 0 < tick_size < 1 or order_size <= 0 or max_inventory <= 0 or latency_ms < 0 or int(latency_ms) != latency_ms or minimum_edge_ticks < 0 or int(minimum_edge_ticks) != minimum_edge_ticks:
        raise ValueError("Invalid strategy settings")
    if Decimal(str(tick_size)) != Decimal(str(tick_size)).quantize(Decimal("0.0001")):
        raise ValueError("Tick size exceeds supported precision")
    data = convert_events(document)
    for event in document["events"]:
        if event["timestamp"] > document["exitTime"]:
            continue
        if event["type"] == "snapshot":
            prices_and_sizes = event["bids"] + event["asks"]
        else:
            prices_and_sizes = [(event["price"], event["quantity"])]
        for recorded_price, recorded_size in prices_and_sizes:
            p = Decimal(str(recorded_price))
            q = Decimal(str(recorded_size))
            if p != p.quantize(Decimal("0.0001")) or p % Decimal(str(tick_size)) != 0 or q != q.quantize(Decimal("0.000001")):
                raise ValueError("Recorded price or quantity is incompatible with the specified tick and precision")
    tick = Price(tick_size, PRICE_PLACES)
    instrument = BinaryOption(
        instrument_id=IDENTIFIER, raw_symbol=IDENTIFIER.symbol, asset_class=AssetClass.ALTERNATIVE,
        currency=USD, price_precision=PRICE_PLACES, size_precision=SIZE_PLACES,
        price_increment=tick, size_increment=size(0.000001), activation_ns=0,
        expiration_ns=(document["firstPractice"] + 365 * 86400000) * 1_000_000,
        ts_event=0, ts_init=0, maker_fee=Decimal(0), taker_fee=Decimal(0), outcome="Yes",
    )
    strategy = MarketMaker(order_size, max_inventory, tick_size, document.get('fairValue'), minimum_edge_ticks)
    engine = BacktestEngine(config=BacktestEngineConfig(logging=LoggingConfig(log_level="ERROR")))
    try:
        engine.add_venue(
            venue=VENUE, oms_type=OmsType.NETTING, account_type=AccountType.MARGIN,
            starting_balances=[Money(100000, USD)], base_currency=USD,
            book_type=BookType.L2_MBP, queue_position=True, trade_execution=True,
            liquidity_consumption=True, latency_model=LatencyModel(base_latency_nanos=latency_ms * 1_000_000),
        )
        engine.add_instrument(instrument)
        engine.add_data(data)
        engine.add_strategy(strategy)
        engine.run()
        identity = {"instrument": document["instrument"]} if document.get("instrument", {}).get("type") == "race-winner" else {"pair": document["pair"]}
        return {**identity, "fairValue": document.get("fairValue"), "fills": strategy.fills, "inventory": strategy.inventory,
                "cash": strategy.cash, "settlement": document["settlement"],
                "profit": strategy.cash + strategy.inventory * document["settlement"],
                "engine": "nautilus_trader 1.231.0", "mode": "settlement",
                "assumptions": ["zero maker fees and rebates", "margin account used as a signed position approximation", "queue clears on level deletion", "no forced liquidation"]}
    finally:
        engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="Normalized, verified L2 replay JSON")
    parser.add_argument("--tick-size", type=float, required=True, help="Historical contract tick size")
    parser.add_argument("--minimum-edge-ticks", type=float, default=1, help="Minimum distance between a quote and its dated fair value")
    arguments = parser.parse_args()
    with open(arguments.input, encoding="utf8") as source:
        document = json.load(source)
    print(json.dumps(run_backtest(document, tick_size=arguments.tick_size, minimum_edge_ticks=arguments.minimum_edge_ticks), indent=2))


if __name__ == "__main__":
    main()

"""Selected-print execution sensitivity with pm-hftbacktest, not a portfolio replay."""

from importlib.metadata import version
from pathlib import Path

import pandas as pd
from hftbacktest import (
    GTC,
    LIMIT,
    BacktestAssetPoly,
    ROIVectorMarketDepthBacktest,
    polymarket_to_hbt,
)

ROOT = Path(__file__).resolve().parents[3]
PREFIX = ROOT / 'tmp/pmdata/british-2026-07-02-hamilton'
TRANSACTION = '0xe7422009f94e5cd3f14f6cd7d8a196eeabd4cf5a516b482b7fc12069906e6de6'


def ns(value):
    return int(pd.Timestamp(value).value)


def advance(hbt, target, step=1_000_000_000):
    while hbt.current_timestamp < target:
        if hbt.elapse(min(step, target - hbt.current_timestamp)) != 0:
            raise RuntimeError('Market data ended before the requested observation')


def main():
    if version('pm-hftbacktest') != '1.0.12':
        raise ValueError('This diagnostic requires pm-hftbacktest==1.0.12')
    l2 = pd.read_parquet(f'{PREFIX}-l2.parquet')
    trades = pd.read_parquet(f'{PREFIX}-trades.parquet')
    left, right = pd.Timestamp('2026-07-02 14:04:00'), pd.Timestamp('2026-07-02 15:02:00')
    l2 = l2[(l2.local_timestamp >= left) & (l2.local_timestamp < right)].copy()
    trades = trades[(trades.local_timestamp >= left) & (trades.local_timestamp < right)].copy()
    if set(l2.event_type) != {'book', 'price_change'} or not set(l2.pc_side.dropna()).issubset({'BUY', 'SELL'}):
        raise ValueError('Unsupported book event or side')
    if (set(trades.outcome.str.lower()) != {'yes'} or set(trades.side) != {'BUY'} or
            trades.trade_id.isna().any() or trades.trade_id.duplicated().any()):
        raise ValueError('Unexpected trade identity, outcome or side')
    target = trades[trades.trade_id == TRANSACTION]
    if len(target) != 1 or abs(target.iloc[0]['price'] - .16) > 1e-9 or abs(target.iloc[0]['size'] - 62.5) > 1e-9:
        raise ValueError('The selected trade does not match the checked execution record')
    data = polymarket_to_hbt(l2, trades)
    asset = (BacktestAssetPoly().data(data).constant_order_latency(1_000_000_000, 1_000_000_000)
             .risk_adverse_queue_model().tick_size(.01).lot_size(.01)
             .partial_fill_exchange().binary_fee_model(0, .03))
    backtest = ROIVectorMarketDepthBacktest([asset])
    if backtest.elapse(1_000_000) != 0:
        raise RuntimeError('Unable to initialize the recorded feed')
    advance(backtest, ns('2026-07-02 14:04:16.737'))
    depth = backtest.depth(0)
    bid, ask, ahead = depth.best_bid, depth.best_ask, depth.ask_qty_at_tick(16)
    if abs(bid - .14) > 1e-9 or abs(ask - .16) > 1e-9 or abs(ahead - 30.92) > 1e-8:
        raise ValueError('The initial visible book differs from the scoped diagnostic')
    if backtest.submit_sell_order(0, 1, .16, 5., GTC, LIMIT, False) != 0:
        raise RuntimeError('Order submission failed')
    advance(backtest, ns('2026-07-02 15:01:16'))
    position = backtest.position(0)
    if abs(position + 5) > 1e-8:
        raise ValueError('Diagnostic no longer reproduces a five-share sell')
    print('pm-hftbacktest 1.0.12: selected British Hamilton diagnostic')
    print('2026-07-02 14:04:16.737 UTC: submit 5 YES at 0.16; best bid/ask 0.14/0.16; displayed ask ahead 30.92')
    print('One-second order and response latency; no cancellation; risk-averse queue model.')
    print('By 15:01:16 UTC simulated position is -5 YES. This is a selected-print sensitivity, not strategy validation.')
    print('Warning: depth changes precede the selected print; converter ordering can double-count queue advancement.')


if __name__ == '__main__':
    main()

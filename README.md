# tradingview-api-adapter
📊 API Adapter for real-time market data as quoted prices and symbol ticker details from Tradingview 📈

♻︎ In developing

## Installation

Stable version:

```ruby
npm i tradingview-api-adapter
```


## Examples

```ruby
import {TvApiAdapter} from 'tradingview-api-adapter'


const adapter = new TvApiAdapter();

adapter.Quote('BTCUSD', 'BINANCE', ['lp', 'ch']).listen(data => {
    console.log(data)
})

```


## Fields

### Fields for Price

```ruby
'ch', 'chp', 'lp', 
'volume', 'ask', 'bid', 
'high_price', 'low_price', 'open_price', 'prev_close_price'
```

### Fields for Info
```ruby
    'currency_code', 'current_session', 'description',
    'exchange', 'format', 'fractional', 'is_tradable',
    'language', 'local_description', 'logoid',
    'lp_time', 'minmov', 'minmove2', 'original_name',
    'pricescale', 'pro_name', 'short_name', 'type',
    'update_mode', 'fundamentals',
    'rch', 'rchp', 'rtc', 'rtc_time', 'status', 'industry',
    'basic_eps_net_income', 'beta_1_year', 'market_cap_basic',
    'earnings_per_share_basic_ttm', 'price_earnings_ttm',
    'sector', 'dividends_yield', 'timezone', 'country_code',
    'provider_id'
```


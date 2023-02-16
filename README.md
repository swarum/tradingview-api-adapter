# tradingview-api-adapter
📊 API Adapter for real-time market data as quoted prices and symbol ticker details from Tradingview 📈

♻︎ In developing

✅ Current Test Version: 1.2.0 [16.02.2023]

👨🏻‍💻I need your feedback. Help improve the library for our general benefit

## Installation

Stable version:

```ruby
npm i tradingview-api-adapter
```


## Examples

### Quote [Class]: Obtaining quoted data in real time

#### Fields
```ruby  
  minmov, minmove2, circulating_supply, popularity
  average_volume, total_supply, total_shares_outstanding,   
  
  ask, bid,
  
  lp, low_price, open_price, high_price, prev_close_price, 
  open_time, chp, ch, volume, total_shares_diluted, total_value_traded,
  pricescale, pointvalue,
  
  first_bar_time_1s, first_bar_time_1m, first_bar_time_1d,
  all_time_high, all_time_open, all_time_low,
  price_52_week_low, price_percent_change_52_week, price_52_week_high, price_percent_change_1_week
  price_percent_change_1_week,
  
  'trade', 'minute-bar', 'daily-bar', 'prev-daily-bar'
```

#### Usage
```ruby
import {TvApiAdapter} from 'tradingview-api-adapter'


const adapter = new TvApiAdapter();

adapter.Quote('BTCUSD', 'BINANCE', ['lp', 'ch', 'chp']).listen(data => {
    console.log('Last price: ', data.lp);
    console.log('Price change: ', data.ch);
    console.log('Price change in percent: ', data.ch);
})
```

#### Result for all fields
```ruby
  minmove2: 0,
  minmov: 1,

  circulating_supply: 19289550,
  popularity: 6559928,
  average_volume: 1722.622664,
  total_supply: 19289550,
  total_shares_outstanding: 19289550,


  lp: 21666.54,
  low_price: 21431.41,
  open_price: 21793.12,
  high_price: 21899.36,
  prev_close_price: 21792.89,
  open_time: 1676246400,
  chp: -0.58,
  ch: -126.35,
  volume: 1113.41904,
  total_shares_diluted: 21000000,
  total_value_traded: 22323876304.39608,

  pricescale: 100,
  pointvalue: 1,

  first_bar_time_1s: 1660694401,
  first_bar_time_1m: 1578038400,
  first_bar_time_1d: 1578009600,
  all_time_high: 69275.4705132,
  all_time_open: 6976.1030327,
  all_time_low: 3717.974312,
  price_52_week_low: 15479.25,
  price_percent_change_52_week: -48.97188345,
  price_52_week_high: 48240.33,
  price_percent_change_1_week: -6.03974829,
  
  trade: {
    'data-update-time': '1676290514.699386',
    price: '21641.98',
    size: '0.01892',
    time: '1676290505'
  },
  'minute-bar': {
    close: '21641.98',
    'data-update-time': '1676290514.699386',
    high: '21641.98',
    low: '21641.17',
    open: '21641.37',
    time: '1676290500',
    'update-time': '1676290505.0',
    volume: '0.02528'
  },
  'daily-bar': {
    close: '21641.98',
    'data-update-time': '1676290514.699387',
    high: '21899.36',
    low: '21431.41',
    open: '21793.12',
    time: '1676246400',
    'update-time': '1676290505.0',
    volume: '1067.39197'
  },
  'prev-daily-bar': {
    close: '21792.89',
    'data-update-time': '1676246400.609871',
    high: '22092.14',
    low: '21640.57',
    open: '21851.81',
    time: '1676160000',
    'update-time': '1676246396.0',
    volume: '1171.77258'
  }
}
```

### QuoteChannel [💎NEW Class]: Obtaining multi-quoted data in real time

#### Usage
```ruby
import {TvApiAdapter} from 'tradingview-api-adapter'


const adapter = new TvApiAdapter();

adapter.QuoteChannel({
    'MUN': ['APC'],
    'Binance': ['BTCUSDT', 'DOGEUSDT']
}, ['lp', 'ask', 'bid'])
.listen(data => {
    console.log(data)
})
```

#### The result of the console
```ruby
{
  BINANCE: {
    DOGEUSDT: { lp: 0.08892, bid: 0.08892, ask: 0.08893 },
    BTCUSDT: { bid: 24597.31, ask: 24597.32, lp: 24597.23 }
  },
  MUN: { 
    APC: { lp: 145.24, bid: 144.86, ask: 144.92 } 
  }
}
```

### TickerDetails [Class]: Allows you to get additional info about Ticker Symbol

#### Usage
```ruby
import {TvApiAdapter} from 'tradingview-api-adapter'

const adapter = new TvApiAdapter();

const DogeInfo = adapter.TickerDetails('DOGEUSD', 'Binance');

DogeInfo.ready(tm => {
    console.log(tm)
})

```

#### The result of the console

```ruby
{
    seriesKey: 'BINANCE:DOGEUSD',
    baseName: [ 'BINANCE:DOGEUSD' ],
    symbol: 'DOGEUSD',
    symbolFullname: 'BINANCE:DOGEUSD',
    feedTicker: 'DOGEUSD',
    exchangeListedSymbol: 'DOGEUSD',
    sessionId: 'crypto',
    sessionRegularDisplay: '24x7',
    sessionExtendedDisplay: '24x7',
    sessionExtended: '24x7',
    sessionDisplay: '24x7',
    sessionRegular: '24x7',
    subsessions: [
        {
            description: 'Regular Trading Hours',
            id: 'regular',
            private: false,
            session: '24x7',
            'session-display': '24x7'
        }
    ],
    subsessionId: 'regular',
    group: 'binance_spreads_runner2',
    perms: { rt: { prefix: 'BINANCE' } },
    marketStatus: { phase: 'regular', tradingday: '20230215' },
    internalStudyId: 'CurrencyConverter@tv-basicstudies-132!',
    internalStudyInputs: { rate: 'INDEX:BTCUSD', symbol: 'BINANCE:DOGEBTC', useRTRate: true },
    exchange: 'BINANCE',
    exchangeTraded: 'BINANCE',
    listedExchange: 'BINANCE',
    providerId: 'binance',
    description: 'Dogecoin / US Dollar (calculated by TradingView)',
    shortDescription: 'Dogecoin / US Dollar (calculated by TradingView)',
    type: 'crypto',
    currencyCode: 'USD',
    currencyId: 'USD',
    baseCurrency: 'DOGE',
    baseCurrencyId: 'XTVCDOGE',
    symbolPrimaryName: 'BINANCE:DOGEUSD',
    symbolProname: 'BINANCE:DOGEUSD',
    proName: 'BINANCE:DOGEUSD',
    shortName: 'DOGEUSD',
    originalName: 'BINANCE:DOGEUSD',
    maxPrecision: 8,
    isTradable: false,
    hasDepth: false,
    fundamentalData: true,
    fractional: false,
    popularityRank: 3.5793118736554446,
    proPerm: '',
    variableTickSize: '',
    historyTag: '',
    rtLag: '9.069304',
    rtUpdateTime: '1676465374.0',
    timezone: 'Etc/UTC',
    currentSession: 'market',
    feedHasIntraday: true,
    hasIntraday: true,
    isReplayable: true,
    hasPriceSnapshot: false,
    feed: 'runner-intraday',
    feedHasDwm: false,
    hasNoBbo: false,
    hasNoVolume: false,
    hasDwm: true,
    localPopularity: {
        AE: 790,
        BR: 4642,
        CN: 5611,
        DE: 13065,
        ES: 13891,
        FR: 15763,
        ID: 2634,
        IL: 318,
        IN: 13750,
        IT: 5159,
        JP: 6325,
        KR: 5983,
        PL: 5440,
        RU: 29302,
        SE: 645,
        TH: 7900,
        TR: 20474,
        TW: 3793,
        US: 539550,
        VN: 2443
    },
    localPopularityRank: {
        AE: 4.2420188926631495,
        BR: 3.8731514888536487,
        CN: 3.8369531543119244,
        DE: 3.5775828338723796,
        ES: 3.8642349392929574,
        FR: 3.5099721819085126,
        ID: 3.634900014607327,
        IL: 3.946343180230935,
        IN: 4.3838522732435745,
        IT: 3.65965996833445,
        JP: 4.086705608977654,
        KR: 3.7368189724535967,
        PL: 3.5024902792902957,
        RU: 3.7239316911388682,
        SE: 3.8583321674815934,
        TH: 3.512627747031323,
        TR: 3.629837049479071,
        TW: 3.74280732258542,
        US: 3.463184155816383,
        VN: 4.052303315748319
    },
    visiblePlotsSet: 'ohlcv',
    prefixes: [ 'RUNNER_BINANCE2' ],
    brokerNames: {},
    currencyLogoId: 'country/US',
    baseCurrencyLogoId: 'crypto/XTVCDOGE',
    volumeType: 'base',
    typespecs: [ 'synthetic' ]
}
```



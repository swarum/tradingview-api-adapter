import {TvApiAdapter} from "../src";

const tvApiAdapter = new TvApiAdapter();

const PriceFields = tvApiAdapter.Quote('BTCUSDT', 'BINANCE', [
    'ch', 'chp', 'lp', 'volume',
    'ask', 'bid',
    'high_price', 'low_price', 'open_price', 'prev_close_price'
])

PriceFields.listen(data => {
    console.log('PriceFields', data)
})


const OtherFields = tvApiAdapter.Quote('BTCUSDT', 'BINANCE', [
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
])

OtherFields.listen(data => {
    console.log('OtherFields', data)
})

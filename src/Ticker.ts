import {QuoteSession} from "./Client";
import {QuoteSessionAdapter} from "./adapters/QuoteSessionAdapter";

export class Ticker {

    public readonly pair: string;
    private readonly $adapter: QuoteSessionAdapter;
    private $tickerData = [];

    // private rawFieldBuffer: Array<string> = [];



    constructor(
        quoteSessionBridge: QuoteSession,
        ticker: string,
        market: string,
    ) {
        this.$adapter = new QuoteSessionAdapter(quoteSessionBridge);
        this.$adapter.on('shaped_session_data', data => this.sessionStreamHandler(data));

        // this.$adapter.setFields(new Set(['currency_code', 'current_session', 'description',
        //     'exchange', 'format', 'fractional', 'is_tradable',
        //     'language', 'local_description', 'logoid',
        //     'lp_time', 'minmov', 'minmove2', 'original_name',
        //     'pricescale', 'pro_name', 'short_name', 'type',
        //     'update_mode', 'fundamentals',
        //     'rch', 'rchp', 'rtc', 'rtc_time', 'status', 'industry',
        //     'basic_eps_net_income', 'beta_1_year', 'market_cap_basic',
        //     'earnings_per_share_basic_ttm', 'price_earnings_ttm',
        //     'sector', 'dividends_yield', 'timezone', 'country_code',
        //     'provider_id']));

        this.pair = `${market}:${ticker}`;
        this.$adapter.addPairs(this.pair);
    }



    public ready(ticker: (tickerModel: this) => void): void {

    }






    get name(): string{
        console.log(this.$tickerData);
        // this.$adapter.setFields(this.fi);
        // this.$adapter.removePairs(this.pair);
        return '';
    }


    private sessionStreamHandler(data: any): void{
        this.$tickerData = data;
        this.$adapter.removePairs(this.pair);
    }
}

import {QuoteSession} from "./Client";
import {QuoteSessionAdapter} from "./adapters/QuoteSessionAdapter";
import {EventEmitter} from "events";


export interface TickerModel {
    seriesKey: string,
    baseName: string,
    symbol: string,
    symbolFullname: string,
    feedTicker: string,
    exchangeListedSymbol: string,
    sessionId: string,
    sessionRegularDisplay: string,
    sessionExtendedDisplay: string,
    sessionExtended: string,
    sessionDisplay: string,
    sessionRegular: string,
    subsessions: object,
    subsessionId: string,
    group: string,

    perms: object,
    marketStatus: {
        phase: string,
        tradingday: string
    },

    internalStudyId: string,
    internalStudyInputs: object,
    exchange: string,
    exchangeTraded: string,
    listedExchange: string,
    providerId: string,
    description: string,
    shortDescription: string,
    type: string,
    currencyCode: string,
    currencyId: string
    baseCurrency: string,
    baseCurrencyId: string,
    symbolPrimaryName: string,
    symbolProname: string,
    proName: string,
    shortName: string,
    originalName: string,

    maxPrecision: number,

    isTradable: boolean,
    hasDepth: boolean,
    fundamentalData: boolean,
    fractional: boolean,

    popularityRank: number,
    proPerm: string,
    variableTickSize: string,
    historyTag: string,

    rtLag: string, //number,
    rtUpdateTime: string // Time

    timezone: string,
    currentSession: string,


    feedHasIntraday: boolean,
    hasIntraday: boolean,
    isReplayable: boolean,
    hasPriceSnapshot: boolean,
    feed: string,
    feedHasDwm: boolean,
    hasNoBbo: boolean,
    hasNoVolume: boolean,
    hasDwm: boolean,

    localPopularity: object,
    localPopularityRank: object,

    visiblePlotsSet: string,
    prefixes: Array<string>,
    brokerNames: object,
    currencyLogoId: string,
    baseCurrencyLogoId: string,
    volumeType: string,

    typespecs: Array<string>,

}

export class TickerDetails {

    public readonly pair: string;
    private readonly $adapter: QuoteSessionAdapter;
    private readonly $eventBus: EventEmitter;

    private $tickerData: any = null;



    constructor(
        quoteSessionBridge: QuoteSession,
        ticker: string,
        market: string,
    ) {
        this.$eventBus = new EventEmitter();
        this.$adapter = new QuoteSessionAdapter(quoteSessionBridge);
        this.$adapter.on('shaped_session_data', data => this.sessionStreamHandler(data));

        this.pair = `${market}:${ticker}`;
        this.$adapter.addPairs(this.pair);
    }


    public ready(callback: (tickerModel: TickerModel) => void): void {
        if(this.$tickerData === null){
            this.$eventBus.on('ready', () => callback(this.renderTickerModel))
        } else {
            callback(this.renderTickerModel);
        }
    }


    protected get renderTickerModel(): TickerModel {
        return {
            seriesKey: this.$tickerData['series-key'],
            baseName: this.$tickerData['base_name'],
            symbol: this.$tickerData['symbol'],
            symbolFullname: this.$tickerData['symbol-fullname'],
            feedTicker: this.$tickerData['feed-ticker'],
            exchangeListedSymbol: this.$tickerData['exchange-listed-symbol'],
            sessionId: this.$tickerData['session-id'],
            sessionRegularDisplay: this.$tickerData['session-regular-display'],
            sessionExtendedDisplay: this.$tickerData['session-extended-display'],
            sessionExtended: this.$tickerData['session-extended'],
            sessionDisplay: this.$tickerData['session-display'],
            sessionRegular: this.$tickerData['session-regular'],
            subsessions: this.$tickerData.subsessions,
            subsessionId: this.$tickerData['subsession-id'],
            group: this.$tickerData.group,

            perms: this.$tickerData.perms,
            marketStatus: this.$tickerData['market-status'],

            internalStudyId: this.$tickerData['internal-study-id'],
            internalStudyInputs: this.$tickerData['internal-study-inputs'],
            exchange: this.$tickerData.exchange,
            exchangeTraded: this.$tickerData['exchange-traded'],
            listedExchange: this.$tickerData['listed_exchange'],
            providerId: this.$tickerData['provider_id'],
            description: this.$tickerData.description,
            shortDescription: this.$tickerData['short_description'],
            type: this.$tickerData.type,
            currencyCode: this.$tickerData['currency_code'],
            currencyId: this.$tickerData['currency_id'],
            baseCurrency: this.$tickerData['base_currency'],
            baseCurrencyId: this.$tickerData['base_currency_id'],
            symbolPrimaryName: this.$tickerData['symbol-primaryname'],
            symbolProname: this.$tickerData['symbol-proname'],
            proName: this.$tickerData['pro_name'],
            shortName: this.$tickerData['short_name'],
            originalName: this.$tickerData['original_name'],

            maxPrecision: this.$tickerData['max-precision'],

            isTradable: this.$tickerData['is_tradable'],
            hasDepth: this.$tickerData['has-depth'],

            fundamentalData: this.$tickerData['fundamental_data'],
            fractional: this.$tickerData['fractional'],

            popularityRank: this.$tickerData['popularity_rank'],
            proPerm: this.$tickerData['pro-perm'],
            variableTickSize: this.$tickerData['variable-tick-size'],
            historyTag: this.$tickerData['history-tag'],

            rtLag: this.$tickerData['rt-lag'],
            rtUpdateTime: this.$tickerData['rt-update-time'],

            timezone: this.$tickerData['timezone'],
            currentSession: this.$tickerData['current_session'],


            feedHasIntraday: this.$tickerData['feed-has-intraday'],
            hasIntraday: this.$tickerData['has-intraday'],
            isReplayable: this.$tickerData['is-replayable'],
            hasPriceSnapshot: this.$tickerData['has-price-snapshot'],
            feed: this.$tickerData.feed,
            feedHasDwm: this.$tickerData['feed-has-dwm'],
            hasNoBbo: this.$tickerData['has-no-bbo'],
            hasNoVolume: this.$tickerData['has-no-volume'],
            hasDwm: this.$tickerData['has-dwm'],

            localPopularity: this.$tickerData['local_popularity'],
            localPopularityRank: this.$tickerData['local_popularity_rank'],

            visiblePlotsSet: this.$tickerData['visible-plots-set'],
            prefixes: this.$tickerData.prefixes,
            brokerNames: this.$tickerData['broker_names'],
            currencyLogoId: this.$tickerData['currency-logoid'],
            baseCurrencyLogoId: this.$tickerData['base-currency-logoid'],
            volumeType: this.$tickerData['volume-type'],

            typespecs: this.$tickerData.typespecs
        }
    }




    private sessionStreamHandler(data: any): void{
        this.$tickerData = data;
        this.$adapter.removePairs(this.pair);
        this.$eventBus.emit('ready');
    }
}

import {Client} from "./Client";
import {Quote} from "./Quote";
import {TickerDetails} from "./TickerDetails";
import {QuoteChannel} from "./QuoteChannel";
import {Field, KeyTo} from "./types";

export class TvApiAdapter {

    private readonly $client: Client;

    constructor() {
        this.$client = new Client();
    }

    public Quote(ticker: string, market: string, fields: Array<string>): Quote {
        return new Quote(this.$client.createQuoteSession(), ticker, market, fields);
    }

    public QuoteChannel(pairGroups: KeyTo<string[]>, fields: Array<Field>): QuoteChannel {
        return new QuoteChannel(this.$client.createQuoteSession(), pairGroups, fields);
    }

    public TickerDetails(ticker: string, market: string): TickerDetails {
        return new TickerDetails(this.$client.createQuoteSession(), ticker, market);
    }
}

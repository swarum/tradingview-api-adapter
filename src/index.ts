import {Client} from "./Client";
import {Quote} from "./Quote";
import {Ticker} from "./Ticker";

export class TvApiAdapter {

    private readonly $client: Client;

    constructor() {
        this.$client = new Client();
    }

    public Quote(ticker: string, market: string, fields: Array<string>): Quote {
        return new Quote(this.$client.createQuoteSession(), ticker, market, fields);
    }

    public Ticker(ticker: string, market: string): Ticker {
        return new Ticker(this.$client.createQuoteSession(), ticker, market);
    }
}

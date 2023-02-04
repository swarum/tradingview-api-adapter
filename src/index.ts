import {Client} from "./Client";
import {Quote} from "./Quote";

export class TvApiAdapter {

    private readonly $client: Client;

    constructor() {
        this.$client = new Client();
    }

    public Quote(ticker: string, market: string, fields: Array<string>): Quote {
        return new Quote(this.$client.createQuoteSession(), ticker, market, fields);
    }
}

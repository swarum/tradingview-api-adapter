import { Quote } from "./Quote";
import { TickerDetails } from "./TickerDetails";
export declare class TvApiAdapter {
    private readonly $client;
    constructor();
    Quote(ticker: string, market: string, fields: Array<string>): Quote;
    TickerDetails(ticker: string, market: string): TickerDetails;
}

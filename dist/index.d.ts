import { Quote } from "./Quote";
export declare class TvApiAdapter {
    private readonly $client;
    constructor();
    Quote(ticker: string, market: string, fields: Array<string>): Quote;
}

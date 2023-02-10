import { QuoteSession } from "./Client";
export declare class Quote {
    readonly pair: string;
    private readonly $adapter;
    private fieldList;
    constructor(quoteSessionBridge: QuoteSession, ticker: string, market: string, fields?: Array<string>);
    addFields(field: string): this;
    removeFields(field: string): this;
    listen(callback: (data: any) => void): void;
}

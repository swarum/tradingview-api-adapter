import {QuoteSession} from "./Client";
import {QuoteSessionAdapter} from "./adapters/QuoteSessionAdapter";

interface QuoteInterface {
    symbolTicker: string
    symbolName: string,
    symbolMarket: string,

    fieldList: Set<string>,

    addField: (field: string) => this,
    removeField: (field: string) => this,

    listen: (stream: (data: object) => void) => void;

    pause: () => void,
    resume: () => void
}


export class Quote {

    // public readonly symbolTicker!: string;
    // public readonly symbolName!: string;
    // public readonly symbolMarket!: string;

    public readonly pair: string;
    private readonly $adapter: QuoteSessionAdapter;
    private fieldList: Set<string>;



    constructor(
        quoteSessionBridge: QuoteSession,
        ticker: string,
        market: string,
        fields: Array<string> = []
    ) {
        this.$adapter = new QuoteSessionAdapter(quoteSessionBridge);


        this.fieldList = new Set<string>(fields);

        // this.pair = `${ticker}:${market}`; example for debugging error throw
        this.pair = `${market}:${ticker}`;


        this.$adapter.setFields(this.fieldList);
        this.$adapter.addPairs([this.pair, 'BINANCE:BTCUSDT']);
    }


    public addFields(field: string): this;
    public addFields(fields: Array<string> | string): this {
        if(typeof fields === 'string'){
            this.fieldList.add(fields);
        } else {
            fields.forEach(field => this.fieldList.add(field));
        }

        return this;
    }

    public removeFields(field: string): this;
    public removeFields(fields: Array<string> | string): this {
        if(typeof fields === 'string'){
            this.fieldList.delete(fields)
        } else {
            fields.forEach(field => this.fieldList.delete(field));
        }

        return this;
    }



    public listen(callback: (data: any) => void): void{
        this.$adapter.on('shaped_session_data', callback);
    }


}

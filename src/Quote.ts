import {QuoteSession} from "./Client";
import {QuoteSessionAdapter} from "./adapters/QuoteSessionAdapter";
import {QuotedData, Field, MainField} from "./types";

export class Quote {
    public readonly pair: string;
    private readonly $adapter: QuoteSessionAdapter;
    private fieldList: Set<string>;
    private isChannelActive = false;


    constructor(
        quoteSessionBridge: QuoteSession,
        ticker: string,
        market: string,
        fields: Array<Field> = []
    ) {
        this.$adapter = new QuoteSessionAdapter(quoteSessionBridge);

        this.fieldList = new Set<Field>(fields);
        this.pair = `${market}:${ticker}`; // this.pair = `${ticker}:${market}`; example for debugging error throw

        this.resume();
    }

    public resume(): void {
        if(this.isChannelActive) return;

        this.isChannelActive = true;
        this.$adapter.setFields(this.fieldList);
        this.$adapter.addPairs(this.pair);
    }

    public pause(): void {
        if(!this.isChannelActive) return;

        this.isChannelActive = false;
        this.$adapter.removePairs(this.pair);
    }

    //here we only add real time fields that look like (chp, ch, lp, volume, etc.)    public addFields(field: MainField): void;
    public addFields(field: MainField): void;
    public addFields(fields: Array<MainField>): void;
    public addFields(fields: Array<MainField> | MainField): void {
        if(typeof fields === 'string'){
            this.fieldList.add(fields);
        } else {
            fields.forEach(field => this.fieldList.add(field));
        }

        this.$adapter.setFields(this.fieldList);
    }

    public removeFields(field: MainField): void;
    public removeFields(fields: Array<MainField>): void;
    public removeFields(fields: Array<MainField> | MainField): void {
        if(typeof fields === 'string'){
            this.fieldList.delete(fields)
        } else {
            fields.forEach(field => this.fieldList.delete(field));
        }

        this.$adapter.setFields(this.fieldList);
    }

    public setFields(fields: Array<Field>): void {
        this.pause();
        this.fieldList = new Set<Field>(fields);
        this.resume();
    }


    public listen(callback: (data: QuotedData, flags: {firstLoad: boolean, reload: boolean}) => void): void{
        this.$adapter.on('shaped_session_data', callback);
    }
}

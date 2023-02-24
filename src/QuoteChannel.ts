import {QuoteSession} from "./Client";
import {QuoteSessionAdapter} from "./adapters/QuoteSessionAdapter";
import {KeyTo, KeyMayTo, QuotedData, Field, MainField} from './types'

export class QuoteChannel {

    private readonly $adapter: QuoteSessionAdapter;
    private fieldList: Set<Field>;

    private isChannelActive = false;
    private pairList = new Set<string>();

    constructor(
        quoteSessionBridge: QuoteSession,
        pairGroups: string[] | KeyTo<string[]>,
        fields: Array<Field> = []
    ) {
        this.$adapter = new QuoteSessionAdapter(quoteSessionBridge, true);

        this.pairGroupSerializer(pairGroups);
        this.fieldList = new Set<Field>(fields);

        this.resume();
    }


    public resume(): void {
        if(this.isChannelActive) return;

        this.isChannelActive = true;
        this.$adapter.setFields(this.fieldList);
        this.$adapter.addPairs(this.pairList);
    }

    public pause(): void {
        if(!this.isChannelActive) return;

        this.isChannelActive = false;
        this.$adapter.removePairs(this.pairList);
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


    public listen(callback: (data: KeyMayTo<KeyTo<QuotedData>>, flags: {firstLoad: boolean, reload: boolean}) => void): void{
        this.$adapter.on('shaped_session_data', callback);
    }



    private pairGroupSerializer(pairGroups: KeyTo<string[]> | string[]): void {
        if(Array.isArray(pairGroups)) {
            this.pairList = new Set(pairGroups);
        } else {
            Object.keys(pairGroups).forEach((market) => {
                pairGroups[market].forEach(ticker => {
                    this.pairList.add(`${market.toUpperCase()}:${ticker.toUpperCase()}`)
                })
            })
        }
    }
}

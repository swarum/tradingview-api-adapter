import {QuoteSession} from "./Client";
import {QuoteSessionAdapter} from "./adapters/QuoteSessionAdapter";

export type PairGroups = { [k: string]: Array<string> }

export class QuoteChannel {

    private readonly $adapter: QuoteSessionAdapter;
    private fieldList: Set<string>;

    private pairList = new Set<string>();

    constructor(
        quoteSessionBridge: QuoteSession,
        pairGroups: PairGroups,
        fields: Array<string> = []
    ) {
        this.$adapter = new QuoteSessionAdapter(quoteSessionBridge, true);

        this.pairGroupSerializer(pairGroups);
        this.fieldList = new Set<string>(fields);

        this.$adapter.setFields(this.fieldList);
        this.$adapter.addPairs(this.pairList);
    }

    private pairGroupSerializer(pairGroups: PairGroups): void {
        Object.keys(pairGroups).forEach((market) => {
            pairGroups[market].forEach(ticker => {
                this.pairList.add(`${market.toUpperCase()}:${ticker.toUpperCase()}`)
            })
        })
    }


    public listen(callback: (data: any) => void): void{
        this.$adapter.on('shaped_session_data', callback);
    }
}

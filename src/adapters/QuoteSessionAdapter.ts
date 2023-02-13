import {QuoteSession} from "../Client";
import {EventEmitter} from "events";

interface ParameterFields {
    n: string,
    s: string,
    errmsg?: string,
    v: object
}

export class QuoteSessionAdapter extends EventEmitter{

    private firstBoot = true;

    constructor(private readonly $bridge: QuoteSession) {
        super();
        this.$bridge.listener(params => this.handleSessionListener(params));

        this.launchSession();
    }

    /** Section of the protected code **/

    public setFields(field: string): void;
    public setFields(fieldList: Set<string>): void;
    public setFields(fieldList: string | Set<string>): void {
        if(typeof fieldList === 'string'){
            this.$bridge.send("quote_set_fields", [fieldList]);
        } else {
            this.$bridge.send("quote_set_fields", Array.from(fieldList))
        }
    }

    public addPairs(pair: string): void;
    public addPairs(pairList: Array<string>): void;
    public addPairs(pairList: string | Array<string>): void {
        if(typeof pairList === 'string'){
            pairList = [pairList]
        }

        this.$bridge.send('quote_add_symbols', pairList)
        // this.$bridge.send('quote_add_symbols', [`={"adjustment":"splits","symbol":"${(pairList[0])}"}`])
        // this.$client.send("quote_fast_symbols", [this.sessionID, `={"adjustment":"splits","symbol":"${(pairs[0])}"}`])

    }

    public removePairs(pair: string): void;
    public removePairs(pairList: Array<string>): void;
    public removePairs(pairList: string | Array<string>): void {
        if(typeof pairList === 'string'){
            pairList = [pairList]
        }

        this.$bridge.send('quote_remove_symbols', pairList);
    }

    /** End section of the protected code **/


    /** Section of the system code **/

    private launchSession(): void {
        this.$bridge.send("quote_create_session", [])
    }

    private handleSessionListener(sessionData: {params: Array<ParameterFields>, uploaded?: boolean}): void {
        if(this.firstBoot && sessionData.uploaded) this.firstBoot = false;

        const quotedData = {};
        /*!!!!currently implemented check for a session with a single quote*/

        sessionData.params.forEach(param => {
            switch (param.s) {
                case 'error':
                    console.error("Error", param.errmsg); //here I will need to add an error throw event
                    break;
                case 'ok':
                    Object.assign(quotedData, param.v);
                    break;
                default:
                    console.log('From default', param)
            }
        })

        this.emit('shaped_session_data', quotedData);
    }


    /** End section of the system code **/




}

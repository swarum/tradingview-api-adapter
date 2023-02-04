import {WsProtocol} from "./WsProtocol";
import {generateRandomString} from "./utilities";

export interface QuoteSession {
    send: (methodName: string, args: Array<any>) => void,
    listener: (callback: (params: any) => void) => void
}

export class Client extends WsProtocol{

    private quoteUSIDList = new Set<string>();
    private quoteSessions = new Map<string, any>();

    constructor() {
        super();

        this.on("message", this.handleIncomeMessage);
    }

    /** Section of the public code **/

    public createQuoteSession(): QuoteSession {
        const quoteUSID = this.generateUniqueSessionId();

        const quoteSession: QuoteSession = {
            send: (methodName, args) => this.emit("send", {
                "m": methodName, "p": [quoteUSID, ...args]
            }),
            listener: (callback) => this.on(quoteUSID, callback)
        }

        this.quoteSessions.set(quoteUSID, quoteSession);

        return quoteSession;
    }

    /** End section of the public code **/


    /** Section of the system code **/

    private handleIncomeMessage(messageData: Array<any>): void {

        // const SessionData = {} as {[k:string]: any};

        const SessionDataMap = new Map<string, { params: Array<any>, uploaded?: boolean}>();
        /*!!!!currently implemented check for a session with a single quote*/

        messageData.forEach(data => {
            let USID: string, params: any;

            switch (data.m){
                case 'qsd':
                    USID = data.p[0];
                    params = data.p[1];

                    if(!SessionDataMap.has(USID)){
                        SessionDataMap.set(USID, {params: [params]});
                    } else {
                        SessionDataMap.get(USID)!.params.push(params)
                    }

                    break;
                case 'quote_completed':
                    USID = data.p[0];
                    // params = data.p[1];

                    if(SessionDataMap.has(USID))  SessionDataMap.get(USID)!.uploaded = true;
                    break;
                default:
                    console.log("Default Client", data);
            }
        })

        SessionDataMap.forEach((value, key) => this.emit(key, value));
    }

    /** End section of the system code **/


    /** Section of the utilities function code **/

    private generateUniqueSessionId(type: string = 'qs'){
        //в дальнейшем учесть разновидность сессий и выбор Map type
        let USID: string;

        do USID = `${type}_` + generateRandomString(12)
        while(this.quoteUSIDList.has(USID));

        return USID
    }

    /** End section of the utilities function code **/

}

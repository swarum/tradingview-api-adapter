import {WsProtocol} from "./WsProtocol";
import {generateRandomString} from "./utilities";

export interface QuoteSession {
    send: (methodName: string, args: Array<any>) => void,
    listener: (callback: (data: any) => void) => void
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
            send: (methodName, args) => this.emit("message", {
                "m": methodName, "p": [quoteUSID, ...args]
            }),
            listener: (callback) => this.on(quoteUSID, callback)
        }

        this.quoteSessions.set(quoteUSID, quoteSession);

        return quoteSession;
    }

    /** End section of the public code **/


    /** Section of the system code **/

    private handleIncomeMessage(data: any): void {

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

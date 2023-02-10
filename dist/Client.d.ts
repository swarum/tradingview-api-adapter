import { WsProtocol } from "./WsProtocol";
export interface QuoteSession {
    send: (methodName: string, args: Array<any>) => void;
    listener: (callback: (params: any) => void) => void;
}
export declare class Client extends WsProtocol {
    private quoteUSIDList;
    private quoteSessions;
    constructor();
    /** Section of the public code **/
    createQuoteSession(): QuoteSession;
    /** End section of the public code **/
    /** Section of the system code **/
    private handleIncomeMessage;
    /** End section of the system code **/
    /** Section of the utilities function code **/
    private generateUniqueSessionId;
}

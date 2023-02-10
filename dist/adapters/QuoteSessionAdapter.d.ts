/// <reference types="node" />
import { QuoteSession } from "../Client";
import { EventEmitter } from "events";
export declare class QuoteSessionAdapter extends EventEmitter {
    private readonly $bridge;
    private firstBoot;
    constructor($bridge: QuoteSession);
    /** Section of the protected code **/
    setFields(fieldList: Set<string>): void;
    addPairs(pair: string): void;
    addPairs(pairList: Array<string>): void;
    protected removePairs(pair: string): void;
    /** End section of the protected code **/
    /** Section of the system code **/
    private launchSession;
    private handleSessionListener;
}

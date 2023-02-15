/// <reference types="node" />
import { QuoteSession } from "../Client";
import { EventEmitter } from "events";
export declare class QuoteSessionAdapter extends EventEmitter {
    private readonly $bridge;
    private firstBoot;
    constructor($bridge: QuoteSession);
    /** Section of the protected code **/
    setFields(field: string): void;
    setFields(fieldList: Set<string>): void;
    addPairs(pair: string): void;
    addPairs(pairList: Array<string>): void;
    removePairs(pair: string): void;
    removePairs(pairList: Array<string>): void;
    /** End section of the protected code **/
    /** Section of the system code **/
    private launchSession;
    private handleSessionListener;
}

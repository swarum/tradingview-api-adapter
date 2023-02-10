"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Client = void 0;
const WsProtocol_1 = require("./WsProtocol");
const utilities_1 = require("./utilities");
class Client extends WsProtocol_1.WsProtocol {
    constructor() {
        super();
        this.quoteUSIDList = new Set();
        this.quoteSessions = new Map();
        this.on("message", this.handleIncomeMessage);
    }
    /** Section of the public code **/
    createQuoteSession() {
        const quoteUSID = this.generateUniqueSessionId();
        const quoteSession = {
            send: (methodName, args) => this.emit("send", {
                "m": methodName, "p": [quoteUSID, ...args]
            }),
            listener: (callback) => this.on(quoteUSID, callback)
        };
        this.quoteSessions.set(quoteUSID, quoteSession);
        return quoteSession;
    }
    /** End section of the public code **/
    /** Section of the system code **/
    handleIncomeMessage(messageData) {
        // const SessionData = {} as {[k:string]: any};
        const SessionDataMap = new Map();
        /*!!!!currently implemented check for a session with a single quote*/
        messageData.forEach(data => {
            let USID, params;
            switch (data.m) {
                case 'qsd':
                    USID = data.p[0];
                    params = data.p[1];
                    if (!SessionDataMap.has(USID)) {
                        SessionDataMap.set(USID, { params: [params] });
                    }
                    else {
                        SessionDataMap.get(USID).params.push(params);
                    }
                    break;
                case 'quote_completed':
                    USID = data.p[0];
                    // params = data.p[1];
                    if (SessionDataMap.has(USID))
                        SessionDataMap.get(USID).uploaded = true;
                    break;
                default:
                    console.log("Default Client", data);
            }
        });
        SessionDataMap.forEach((value, key) => this.emit(key, value));
    }
    /** End section of the system code **/
    /** Section of the utilities function code **/
    generateUniqueSessionId(type = 'qs') {
        //в дальнейшем учесть разновидность сессий и выбор Map type
        let USID;
        do
            USID = `${type}_` + (0, utilities_1.generateRandomString)(12);
        while (this.quoteUSIDList.has(USID));
        return USID;
    }
}
exports.Client = Client;
//# sourceMappingURL=Client.js.map
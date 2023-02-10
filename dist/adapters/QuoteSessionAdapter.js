"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuoteSessionAdapter = void 0;
const events_1 = require("events");
class QuoteSessionAdapter extends events_1.EventEmitter {
    constructor($bridge) {
        super();
        this.$bridge = $bridge;
        this.firstBoot = true;
        this.$bridge.listener(params => this.handleSessionListener(params));
        this.launchSession();
    }
    /** Section of the protected code **/
    setFields(fieldList) {
        this.$bridge.send("quote_set_fields", Array.from(fieldList));
    }
    addPairs(pairList) {
        if (typeof pairList === 'string') {
            pairList = [pairList];
        }
        this.$bridge.send('quote_add_symbols', pairList);
    }
    removePairs(pairList) {
        if (typeof pairList === 'string') {
            pairList = [pairList];
        }
        this.$bridge.send('quote_remove_symbols', pairList);
    }
    /** End section of the protected code **/
    /** Section of the system code **/
    launchSession() {
        this.$bridge.send("quote_create_session", []);
    }
    handleSessionListener(sessionData) {
        if (this.firstBoot && sessionData.uploaded)
            this.firstBoot = false;
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
            }
        });
        this.emit('shaped_session_data', quotedData);
    }
}
exports.QuoteSessionAdapter = QuoteSessionAdapter;
//# sourceMappingURL=QuoteSessionAdapter.js.map
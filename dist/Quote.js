"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Quote = void 0;
const QuoteSessionAdapter_1 = require("./adapters/QuoteSessionAdapter");
class Quote {
    constructor(quoteSessionBridge, ticker, market, fields = []) {
        this.$adapter = new QuoteSessionAdapter_1.QuoteSessionAdapter(quoteSessionBridge);
        this.fieldList = new Set(fields);
        // this.pair = `${ticker}:${market}`; example for debugging error throw
        this.pair = `${market}:${ticker}`;
        this.$adapter.setFields(this.fieldList);
        this.$adapter.addPairs(this.pair);
    }
    addFields(fields) {
        if (typeof fields === 'string') {
            this.fieldList.add(fields);
        }
        else {
            fields.forEach(field => this.fieldList.add(field));
        }
        return this;
    }
    removeFields(fields) {
        if (typeof fields === 'string') {
            this.fieldList.delete(fields);
        }
        else {
            fields.forEach(field => this.fieldList.delete(field));
        }
        return this;
    }
    listen(callback) {
        this.$adapter.on('shaped_session_data', callback);
    }
}
exports.Quote = Quote;
//# sourceMappingURL=Quote.js.map
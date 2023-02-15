"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TvApiAdapter = void 0;
const Client_1 = require("./Client");
const Quote_1 = require("./Quote");
const TickerDetails_1 = require("./TickerDetails");
class TvApiAdapter {
    constructor() {
        this.$client = new Client_1.Client();
    }
    Quote(ticker, market, fields) {
        return new Quote_1.Quote(this.$client.createQuoteSession(), ticker, market, fields);
    }
    TickerDetails(ticker, market) {
        return new TickerDetails_1.TickerDetails(this.$client.createQuoteSession(), ticker, market);
    }
}
exports.TvApiAdapter = TvApiAdapter;
//# sourceMappingURL=index.js.map
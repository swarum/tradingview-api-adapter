"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TvApiAdapter = void 0;
const Client_1 = require("./Client");
const Quote_1 = require("./Quote");
class TvApiAdapter {
    constructor() {
        this.$client = new Client_1.Client();
    }
    Quote(ticker, market, fields) {
        return new Quote_1.Quote(this.$client.createQuoteSession(), ticker, market, fields);
    }
}
exports.TvApiAdapter = TvApiAdapter;
//# sourceMappingURL=index.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsProtocol = exports.ProtocolStatus = void 0;
const ws_1 = require("ws");
const events_1 = require("events");
var ProtocolStatus;
(function (ProtocolStatus) {
    ProtocolStatus[ProtocolStatus["Constructor"] = 0] = "Constructor";
    ProtocolStatus[ProtocolStatus["Connecting"] = 1] = "Connecting";
    ProtocolStatus[ProtocolStatus["Open"] = 2] = "Open";
    ProtocolStatus[ProtocolStatus["SessionOpen"] = 3] = "SessionOpen";
    ProtocolStatus[ProtocolStatus["Close"] = 4] = "Close";
})(ProtocolStatus = exports.ProtocolStatus || (exports.ProtocolStatus = {}));
class WsProtocol {
    constructor() {
        this.protocolInfo = {};
        this.messageBuffer = [];
        this.bufferClearing = false;
        this.$eventBus = new events_1.EventEmitter();
        this.$data = this.setupReactiveData();
        this.createConnection();
    }
    on(eventName, listener) {
        if (eventName === "message") {
            this.$eventBus.on('message', listener);
        }
        else {
            this.$eventBus.on(eventName, listener);
        }
    }
    emit(eventName, data) {
        if (eventName === "send") {
            this.send(WsProtocol.CollectMessagePacket(data));
        }
        else {
            this.$eventBus.emit(eventName, data);
        }
    }
    /** End section of the protected code **/
    /** Section of the system code **/
    createConnection() {
        this.webSocket = WsProtocol.Driver('wss://widgetdata.tradingview.com/socket.io/websocket', 'https://s.tradingview.com');
        this.$data.readyState = ProtocolStatus.Connecting;
        this.webSocket.onerror = this.handleErrorEvent.bind(this);
        this.webSocket.onclose = this.handleCloseEvent.bind(this);
        this.webSocket.onmessage = this.handleMessageEvent.bind(this);
        this.webSocket.onopen = this.handleOpenEvent.bind(this);
    }
    handleCloseEvent(ev) {
        this.$data.readyState = ProtocolStatus.Close;
    }
    handleErrorEvent(ev) {
    }
    handleMessageEvent(ev) {
        const parsedMessageData = WsProtocol.ParseMessagePacket(ev.data);
        if (!parsedMessageData.length)
            return;
        if (typeof parsedMessageData[0] === "number") {
            this.PingPong(parsedMessageData[0]);
        }
        else if (this.$data.readyState === ProtocolStatus.SessionOpen) { // тут нужно учесть момент с выпаданием с сокета
            this.emit('message', parsedMessageData);
        }
        else {
            this.protocolInfo = parsedMessageData[0];
            this.$data.readyState = ProtocolStatus.SessionOpen;
        }
    }
    handleOpenEvent(ev) {
        this.$data.readyState = ProtocolStatus.Open;
    }
    send(packet) {
        if (this.bufferClearing || this.$data.readyState != ProtocolStatus.SessionOpen) {
            this.messageBuffer.push(packet);
            return false;
        }
        this.webSocket.send(packet);
        return true;
    }
    sendBufferedMessages() {
        this.bufferClearing = true;
        while (this.messageBuffer.length !== 0) {
            if (this.$data.readyState === ProtocolStatus.SessionOpen) {
                const packet = this.messageBuffer.shift();
                this.webSocket.send(packet);
            }
            else {
                break;
            }
        }
        this.bufferClearing = false;
    }
    PingPong(pingCount) {
        this.emit("send", `~h~${pingCount}`);
    }
    /** End section of the system code **/
    /** Section of the adjusters function code **/
    setupReactiveData() {
        const observableData = {
            readyState: ProtocolStatus.Constructor
        };
        return new Proxy(observableData, {
            set: (target, key, value) => {
                const previousValue = target[key];
                target[key] = value;
                if (key === 'readyState')
                    this.readyStateInterceptor(value, previousValue);
                return true;
            },
        });
    }
    readyStateInterceptor(to, from) {
        if (from === ProtocolStatus.Open && to === ProtocolStatus.SessionOpen) {
            this.sendBufferedMessages();
        }
    }
    /** End section of the adjusters function code **/
    /** Section of the utilities function code **/
    static Driver(URL, originURL) {
        if (typeof window === 'undefined') {
            return new ws_1.WebSocket(URL, { origin: originURL });
        }
        else {
            return new WebSocket(URL);
        }
    }
    static ParseMessagePacket(packet) {
        return packet
            .replace(/~h~/g, '')
            .split(/~m~[0-9]{1,}~m~/g)
            .map((p) => !p ? false : JSON.parse(p))
            .filter((p) => p);
    }
    static CollectMessagePacket(messageData) {
        const collectedPacket = typeof messageData === 'object' ?
            JSON.stringify(messageData) : messageData;
        return `~m~${collectedPacket.length}~m~${collectedPacket}`;
    }
}
exports.WsProtocol = WsProtocol;
//# sourceMappingURL=WsProtocol.js.map
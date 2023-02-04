import {WebSocket as NodeWebSocket} from 'ws'
import {EventEmitter} from "events";

export enum ProtocolStatus {
    Constructor,
    Connecting,
    Open,
    SessionOpen,
    Close
}

type SocketDriver = WebSocket | NodeWebSocket;

interface ReactData {
    readyState: ProtocolStatus
}


export class WsProtocol {

    private readonly $eventBus: EventEmitter;
    private $data: ReactData;

    private webSocket!: SocketDriver;

    private protocolInfo = {};
    private messageBuffer: Array<string> = [];
    private bufferClearing = false;

    constructor() {
        this.$eventBus = new EventEmitter();
        this.$data = this.setupReactiveData();

        this.createConnection();
    }

    /** Section of the public code **/

    public on(eventName: "message", listener: (data: any) => void): void;
    public on(eventName: string, listener: (data: any) => void): void {

        if(eventName === "message"){
            this.$eventBus.on('message', listener);
        }
    }


    public emit(eventName: string, data: any): void {
        if(eventName === "message") {
            this.send(WsProtocol.CollectMessagePacket(data));
        } else {
            this.$eventBus.emit(eventName, data);
        }
    }

    /** End section of the public code **/


    /** Section of the system code **/

    private createConnection(): void{
        this.webSocket = WsProtocol.Driver(
            'wss://widgetdata.tradingview.com/socket.io/websocket',
            'https://s.tradingview.com'
        );

        this.$data.readyState = ProtocolStatus.Connecting;

        this.webSocket.onerror = this.handleErrorEvent.bind(this);
        this.webSocket.onclose = this.handleCloseEvent.bind(this);
        this.webSocket.onmessage = this.handleMessageEvent.bind(this);
        this.webSocket.onopen = this.handleOpenEvent.bind(this);
    }


    private handleCloseEvent(ev: CloseEvent): void {

    }

    private handleErrorEvent(ev: Event): void {

    }

    private handleMessageEvent(ev: MessageEvent): void {
        const parsedMessageData = WsProtocol.ParseMessagePacket(ev.data);

        if(!parsedMessageData.length) return;

        if(typeof parsedMessageData[0] === "number") {
            this.PingPong(parsedMessageData[0])
        }
        else if(this.$data.readyState === ProtocolStatus.SessionOpen) { // тут нужно учесть момент с выпаданием с сокета
            this.emit('message', parsedMessageData)
        }
        else {
            this.protocolInfo = parsedMessageData[0];
            this.$data.readyState = ProtocolStatus.SessionOpen;
        }
    }


    private handleOpenEvent(ev: Event): void {

    }

    private send(packet: string): boolean {
        if(this.bufferClearing || this.$data.readyState != ProtocolStatus.SessionOpen) {
            this.messageBuffer.push(packet)
            return false;
        }

        this.webSocket.send(packet);
        return true;
    }

    private sendBufferedMessages(): void { //перепроверить написание функции (возможно я тут ошибся)
        this.bufferClearing = true;

        while(this.messageBuffer.length !== 0) {
            if(this.$data.readyState === ProtocolStatus.SessionOpen){

                const packet = this.messageBuffer.shift() as string;

                this.webSocket.send(packet);
            } else {
                break;
            }
        }

        this.bufferClearing = false;
    }

    private PingPong(pingCount: number): void {
        this.emit("message", `~h~${pingCount}`)
    }

    /** End section of the system code **/


    /** Section of the adjusters function code **/

    private setupReactiveData(): ReactData {
        const observableData = {
            readyState: ProtocolStatus.Constructor
        };

        return new Proxy(observableData, {
            set: (target, key: "readyState" , value) => {
                const previousValue = target[key];

                target[key] = value;

                if(key === 'readyState') this.readyStateInterceptor(value, previousValue);
                return true;
            },
        })
    }

    private readyStateInterceptor(to: ProtocolStatus, from: ProtocolStatus): void {

        if(from === ProtocolStatus.Open && to === ProtocolStatus.SessionOpen) {
            this.sendBufferedMessages();
        }
    }

    /** End section of the adjusters function code **/


    /** Section of the utilities function code **/

    private static Driver(URL: string, originURL: string): SocketDriver {
        if(typeof window === 'undefined'){
            return new NodeWebSocket(URL, {origin: originURL});
        } else {
            return new WebSocket(URL)
        }
    }

    private static ParseMessagePacket(packet: string): Array<string | object> {
        return packet
            .replace(/~h~/g, '')
            .split(/~m~[0-9]{1,}~m~/g)
            .map((p: string) => !p ? false : JSON.parse(p))
            .filter((p: string | object) => p);
    }

    private static CollectMessagePacket(messageData: string | object): string {
        const collectedPacket =
            typeof messageData === 'object' ?
                JSON.stringify(messageData) : messageData;

        return `~m~${collectedPacket.length}~m~${collectedPacket}`
    }

    /** End section of the utilities function code **/
}

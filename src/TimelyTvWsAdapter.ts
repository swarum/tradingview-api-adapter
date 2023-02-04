import {EventEmitter} from 'events';
import {WebSocket as NodeWebSocket} from 'ws';

type SocketDriver = WebSocket | NodeWebSocket;

enum ProtocolStatus {
    Constructor,
    Connecting,
    Open,
    SessionOpen,
    Close
}

export class TvWsAdapter extends EventEmitter {

    private webSocket!: SocketDriver;
    private messageBuffer: Array<string> = [];
    private bufferClearing = false;

    public protocolInfo = {};

    private observableData = {
        readyState: ProtocolStatus.Constructor
    }

    private $data = new Proxy(this.observableData, {
        set: (target, key: "readyState" , value) => {
            const previousValue = target[key];

            target[key] = value;

            if(key === 'readyState') this.readyStateInterceptor(value, previousValue);
            return true;
        },
    })


    constructor() {
        super();
        this.$data.readyState = ProtocolStatus.Connecting;

        this.init();
    }



    protected sendMessage(messageData: any): boolean {
        const packet = TvWsAdapter.collectPacket(messageData);

        return this.sendPacket(packet);
    }

    private sendPacket(packet: string): boolean {
        if(this.bufferClearing || this.$data.readyState != ProtocolStatus.SessionOpen) {
            this.messageBuffer.push(packet)
            return false;
        }

        this.webSocket.send(packet);
        return true;
    }


    private init() {

        this.webSocket = TvWsAdapter.getSocketDriver(
            'wss://widgetdata.tradingview.com/socket.io/websocket',
            'https://s.tradingview.com'
        );

        this.webSocket.onerror = this.handleErrorEvent.bind(this);
        this.webSocket.onclose = this.handleCloseEvent.bind(this);
        this.webSocket.onmessage = this.handleMessageEvent.bind(this);
        this.webSocket.onopen = this.handleOpenEvent.bind(this);
    }

    private handleCloseEvent(ev: CloseEvent): void {

        // console.log(ev)
        this.$data.readyState = ProtocolStatus.Close;
    }

    private handleErrorEvent(ev: Event): void {
        console.log('close', ev)
    }

    private handleMessageEvent(ev: MessageEvent): void {
        const parsedMessageData = TvWsAdapter.parsePacket(ev.data);

        if(!parsedMessageData.length) return;


        if(typeof parsedMessageData[0] === "number") {
            this.pongAnswer(parsedMessageData[0])
        }
        else if(this.$data.readyState === ProtocolStatus.SessionOpen) {
            this.emit('messageDataStream', parsedMessageData)
        }
        else {
            this.protocolInfo = parsedMessageData[0];
            this.$data.readyState = ProtocolStatus.SessionOpen;
        }
    }


    private handleOpenEvent(ev: Event): void {
        this.$data.readyState = ProtocolStatus.Open;
        // console.log('t', this.$data.readyState)

        // this.readyState
    }

    private pongAnswer(pingID: number): void {
        this.sendMessage(`~h~${pingID}`);
    }

    private readyStateInterceptor(to: ProtocolStatus, from: ProtocolStatus): void {

        if(from === ProtocolStatus.Open && to === ProtocolStatus.SessionOpen) {
            this.sendBufferedMessages();
        }
    }

    private sendBufferedMessages(): void{
        this.bufferClearing = true


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

    private static collectPacket(packet: string | object): string {
        const collectedPacket =
            typeof packet === 'object' ?
                JSON.stringify(packet) : packet;

        return `~m~${collectedPacket.length}~m~${collectedPacket}`
    }

    private static parsePacket(packet: string): Array<string | object> {
        return packet
            .replace(/~h~/g, '')
            .split(/~m~[0-9]{1,}~m~/g)
            .map((p: string) => !p ? false : JSON.parse(p))
            .filter((p: string | object) => p);
    }

    private static getSocketDriver(URL: string, originURL: string): SocketDriver {
        if(typeof window === 'undefined'){
            return new NodeWebSocket(URL, {origin: originURL});
        } else {
            return new WebSocket(URL)
        }
    }
}

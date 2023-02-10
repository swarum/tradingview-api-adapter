export declare enum ProtocolStatus {
    Constructor = 0,
    Connecting = 1,
    Open = 2,
    SessionOpen = 3,
    Close = 4
}
export declare class WsProtocol {
    private readonly $eventBus;
    private $data;
    private webSocket;
    private protocolInfo;
    private messageBuffer;
    private bufferClearing;
    constructor();
    /** Section of the protected code **/
    on(eventName: "message", listener: (data: any) => void): void;
    on(eventName: string, listener: (data: any) => void): void;
    emit(eventName: string, data: any): void;
    /** End section of the protected code **/
    /** Section of the system code **/
    private createConnection;
    private handleCloseEvent;
    private handleErrorEvent;
    private handleMessageEvent;
    private handleOpenEvent;
    private send;
    private sendBufferedMessages;
    private PingPong;
    /** End section of the system code **/
    /** Section of the adjusters function code **/
    private setupReactiveData;
    private readyStateInterceptor;
    /** End section of the adjusters function code **/
    /** Section of the utilities function code **/
    private static Driver;
    private static ParseMessagePacket;
    private static CollectMessagePacket;
}

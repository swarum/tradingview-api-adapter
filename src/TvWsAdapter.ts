import {EventEmitter} from 'events';


export class TvWsAdapter {

    private _bus!: EventEmitter;

    constructor() {
        this._bus = new EventEmitter();
    }


    public on(event: "message", listener: (data: object) => void): void;
    public on(event: string, listener: (cb: this) => void): void{

    }

}

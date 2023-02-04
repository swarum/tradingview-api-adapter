interface QuoteInterface {
    symbolTicker: string
    symbolName: string,
    symbolMarket: string,

    fieldList: Set<string>,

    addField: (field: string) => this,
    removeField: (field: string) => this,

    listen: (stream: (data: object) => void) => void;

    pause: () => void,
    resume: () => void
}


export class Quote {

    public readonly symbolTicker!: string;
    public readonly symbolName!: string;
    public readonly symbolMarket!: string;

    private fieldList: Set<string>;


    constructor(ticker: string, market: string, fields: Array<string> = []) {
        this.fieldList = new Set<string>(fields)
    }


    public addFields(field: string): this;
    public addFields(fields: Array<string> | string): this {
        if(typeof fields === 'string'){
            this.fieldList.add(fields);
        } else {
            fields.forEach(field => this.fieldList.add(field));
        }

        return this;
    }

    public removeFields(field: string): this;
    public removeFields(fields: Array<string> | string): this {
        if(typeof fields === 'string'){
            this.fieldList.delete(fields)
        } else {
            fields.forEach(field => this.fieldList.delete(field));
        }

        return this;
    }



    public listen(): void{

    }


}

export interface KeyTo<T>{ [k: string]: T }
export interface KeyMayTo<T>{ [k: string]: T | undefined }

export type MainField = 'minmov' | 'minmove2' | 'circulating_supply' | 'popularity' | 'average_volume' | 'total_supply' | 'total_shares_outstanding'
    | 'ask' | 'bid' | 'lp' | 'low_price' | 'open_price' | 'high_price' | 'prev_close_price' | 'open_time' | 'chp' | 'ch' | 'volume' | 'total_shares_diluted'
    | 'total_value_traded' | 'pricescale' | 'pointvalue';

export type Field = MainField | string;

export type QuotedData = {
    [k in Field]: any;
};


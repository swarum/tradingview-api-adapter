/**
 * Stable TradingView protocol constants.
 *
 * These values come from reverse-engineering the public TradingView
 * widget WebSocket — they may change without notice if TradingView
 * updates its infrastructure.
 */

/** WebSocket endpoint for quote/chart sessions. */
export const TV_WS_URL = 'wss://widgetdata.tradingview.com/socket.io/websocket'

/** Origin header required by TradingView when connecting from Node. */
export const TV_ORIGIN = 'https://s.tradingview.com'

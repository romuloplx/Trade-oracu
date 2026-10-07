import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

export class BinanceClient {
    constructor(opts = {}) {
        this.apiKey = opts.apiKey || process.env.BINANCE_API_KEY || process.env.API_KEY || "";
        this.apiSecret = opts.apiSecret || process.env.BINANCE_API_SECRET || process.env.SECRET_KEY || "";
        this.testnet = opts.testnet || process.env.USE_TESTNET === "true";
        this.apiUrl = this.testnet ? "https://testnet.binancefuture.com/fapi" : (opts.apiUrl || process.env.API_URL || "https://fapi.binance.com/fapi");
    }

    assinar(params) {
        const timestamp = Date.now();
        const recvWindow = 60000;
        const data = { ...params, timestamp, recvWindow };
        const query = new URLSearchParams(data).toString();
        const signature = crypto.createHmac("sha256", this.apiSecret).update(query).digest("hex");
        return `${query}&signature=${signature}`;
    }

    async request(method, path, data = {}, isSigned = true) {
        const url = isSigned 
            ? `${this.apiUrl}${path}?${this.assinar(data)}`
            : `${this.apiUrl}${path}${Object.keys(data).length ? "?" + new URLSearchParams(data).toString() : ""}`;

        const headers = {
            "Content-Type": "application/x-www-form-urlencoded"
        };
        if (this.apiKey) {
            headers["X-MBX-APIKEY"] = this.apiKey;
        }

        const res = await axios({
            method,
            url,
            headers,
            timeout: 8000
        });
        return res.data;
    }

    async getKlines(symbol, interval = "15m", limit = 100) {
        try {
            return await this.request("GET", "/v1/klines", { symbol: symbol.toUpperCase(), interval, limit }, false);
        } catch (_) {
            const fallbackUrl = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
            const res = await axios.get(fallbackUrl, { timeout: 8000 });
            return res.data;
        }
    }

    async getCurrentPrice(symbol) {
        try {
            const data = await this.request("GET", "/v1/ticker/price", { symbol: symbol.toUpperCase() }, false);
            return parseFloat(data.price);
        } catch (_) {
            return 0;
        }
    }

    async getBalance() {
        try {
            const account = await this.request("GET", "/v2/account", {}, true);
            const usdt = (account.assets || []).find(a => a.asset === "USDT");
            return parseFloat(usdt?.availableBalance || usdt?.walletBalance || 0);
        } catch (e) {
            return 1000; // Valor seguro de contingência
        }
    }

    async getOpenPosition(symbol) {
        try {
            const pos = await this.request("GET", "/v2/positionRisk", { symbol: symbol.toUpperCase() }, true);
            const active = (pos || []).find(p => parseFloat(p.positionAmt) !== 0);
            return active || null;
        } catch (_) {
            return null;
        }
    }

    async setLeverage(symbol, leverage = 3) {
        try {
            return await this.request("POST", "/v1/leverage", { symbol: symbol.toUpperCase(), leverage }, true);
        } catch (_) {
            return null;
        }
    }

    async setMarginType(symbol, marginType = "ISOLATED") {
        try {
            return await this.request("POST", "/v1/marginType", { symbol: symbol.toUpperCase(), marginType }, true);
        } catch (_) {
            return null;
        }
    }

    async createMarketOrder(symbol, side, quantity) {
        const qtyFormatted = parseFloat(quantity).toFixed(3);
        return await this.request("POST", "/v1/order", {
            symbol: symbol.toUpperCase(),
            side: side.toUpperCase(),
            type: "MARKET",
            quantity: qtyFormatted
        }, true);
    }

    async createOrderProtection(symbol, closeSide, slPrice, tpPrice) {
        const results = { sl: null, tp: null };
        const sym = symbol.toUpperCase();
        const side = closeSide.toUpperCase();

        if (slPrice) {
            try {
                results.sl = await this.request("POST", "/v1/order", {
                    symbol: sym,
                    side,
                    type: "STOP_MARKET",
                    stopPrice: parseFloat(slPrice).toFixed(2),
                    closePosition: "true",
                    workingType: "MARK_PRICE"
                }, true);
            } catch (_) {}
        }

        if (tpPrice) {
            try {
                results.tp = await this.request("POST", "/v1/order", {
                    symbol: sym,
                    side,
                    type: "TAKE_PROFIT_MARKET",
                    stopPrice: parseFloat(tpPrice).toFixed(2),
                    closePosition: "true",
                    workingType: "MARK_PRICE"
                }, true);
            } catch (_) {}
        }

        return results;
    }

    async cancelAllOpenOrders(symbol) {
        try {
            return await this.request("DELETE", "/v1/allOpenOrders", { symbol: symbol.toUpperCase() }, true);
        } catch (_) {
            return null;
        }
    }
}

export const defaultClient = new BinanceClient();
export default defaultClient;

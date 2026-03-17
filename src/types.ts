export interface PricePoint {
  time: string;
  price: number;
  volume: number;
}

export interface Trade {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  price: number;
  amount: number;
  timestamp: number;
  status: 'OPEN' | 'CLOSED';
  profit?: number;
  takeProfit?: number;
  stopLoss?: number;
}

export interface Portfolio {
  balance: number;
  positions: Trade[];
}

export interface MarketSignal {
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  rationale: string;
  confidence: number;
  timestamp: number;
}
